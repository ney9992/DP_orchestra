const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ── Uptime ────────────────────────────────────────────────────
const startTime = Date.now();
let totalAttempts = 0;
let failedAttempts = 0;
let lastSyncTime = Date.now();

setInterval(() => {
  // Uptime
  const secs = Math.floor((Date.now() - startTime) / 1000);
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  document.getElementById('uptime').textContent = `${h}:${m}:${s}`;

  // Last sync
  const elapsed = Math.floor((Date.now() - lastSyncTime) / 1000);
  const syncEl = document.getElementById('syncTime');
  if (elapsed < 60) syncEl.textContent = `${elapsed} sec ago`;
  else if (elapsed < 3600) syncEl.textContent = `${Math.floor(elapsed / 60)} min ago`;
  else syncEl.textContent = `${(elapsed / 3600).toFixed(1)} h ago`;

  // Error rate
  if (totalAttempts > 0) {
    const pct = ((failedAttempts / totalAttempts) * 100).toFixed(1);
    document.getElementById('errorRate').textContent = `${pct}%`;
  }
}, 1000);

// ── Stage control (toggle: click = run, click again = stop) ──────
const activeStages = new Set(); // stage IDs которые сейчас running

const STAGE_LABELS = {
  autocad:  'AutoCAD',
  pdm:      'Vault PDM',
  excel:    'Excel',
  plantsim: 'Plant Simulation',
  report:   'Report',
};

// ── Vault PDM ────────────────────────────────────────────────────

const LIFECYCLE_LABELS = {
  '-1': 'Новый', 1: 'Доработка', 2: 'Пров. BIM',
  3: 'Пров. качества', 4: 'Пров. КО', 5: 'Утверждено', 6: 'Архив',
};

function showBomPanel(visible) {
  const panel = document.getElementById('bomPanel');
  if (!panel) return;
  if (visible) panel.classList.add('visible');
  else panel.classList.remove('visible');
}

document.getElementById('bomClose')?.addEventListener('click', () => showBomPanel(false));

function renderBomTree(items) {
  const tree = document.getElementById('bomTree');
  if (!tree) return;
  tree.innerHTML = '';

  const byId = new Map(items.map(it => [it.Id, it]));
  const children = new Map();
  items.forEach(it => {
    const pid = it.ParentId ?? null;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid).push(it);
  });

  function buildNode(item, depth) {
    const kids = children.get(item.Id) || [];
    const hasKids = kids.length > 0;
    const isApproved = item.LfCycStateId === 5;
    const stateLabel = LIFECYCLE_LABELS[item.LfCycStateId] ?? `Стадия ${item.LfCycStateId ?? '?'}`;

    const filesHtml = (item.Files || []).map(f => {
      const ext = f.FileName.split('.').pop().toUpperCase();
      return `<button class="bom-file-btn" data-id="${f.Id}" data-name="${escapeHtml(f.FileName)}" title="${escapeHtml(f.FileName)}">${ext}</button>`;
    }).join('');

    const qtyText = item.Quant != null
      ? `${item.Quant}&nbsp;${escapeHtml(item.Units || 'шт')}`
      : '';

    const node = document.createElement('div');
    node.className = 'bom-node';

    const row = document.createElement('div');
    row.className = 'bom-row';
    row.style.paddingLeft = `${8 + depth * 18}px`;
    row.innerHTML = `
      <span class="bom-chevron${hasKids ? '' : ' bom-chevron-leaf'}">▶</span>
      <span class="bom-col-pn bom-pn">${escapeHtml(item.PartNumber)}</span>
      <span class="bom-col-title bom-title">${escapeHtml(item.Title)}</span>
      <span class="bom-col-qty bom-qty">${qtyText}</span>
      <span class="bom-col-cat bom-cat">${escapeHtml(item.CatName || '')}</span>
      <span class="bom-col-state bom-state${isApproved ? ' bom-state-ok' : ''}">${stateLabel}</span>
      <span class="bom-col-files bom-files">${filesHtml}</span>`;

    node.appendChild(row);

    if (hasKids) {
      const childWrap = document.createElement('div');
      childWrap.className = 'bom-children';
      kids.forEach(child => childWrap.appendChild(buildNode(child, depth + 1)));
      node.appendChild(childWrap);

      row.addEventListener('click', e => {
        if (e.target.closest('.bom-file-btn')) return;
        node.classList.toggle('collapsed');
      });
    }

    return node;
  }

  const roots = children.get(null) || [];
  roots.forEach(root => tree.appendChild(buildNode(root, 0)));
}

// Делегированный обработчик скачивания файлов из BOM
document.addEventListener('click', async e => {
  const btn = e.target.closest('.bom-file-btn');
  if (!btn) return;
  const fileId = parseInt(btn.dataset.id, 10);
  const fileName = btn.dataset.name;
  btn.disabled = true;
  try {
    const savedPath = await invoke('vault_download_file', { fileId, fileName });
    showToast(`Сохранено: ${fileName}`, 'done');
  } catch (err) {
    showToast(`Ошибка скачивания: ${fileName}`, 'error');
    console.error('vault_download_file:', err);
  } finally {
    btn.disabled = false;
  }
});

async function runVaultPdm() {
  totalAttempts++;
  clearLog();
  setLogTitle(STAGE_LABELS.pdm);
  showLogPanel(true);
  showBomPanel(false);

  // Получить обозначение: из настроек или спросить
  let partNumber;
  try {
    const s = await invoke('get_settings');
    partNumber = s.vault_part_number || '';
  } catch { partNumber = ''; }

  if (!partNumber.trim()) {
    partNumber = prompt('Введите обозначение изделия для запроса BOM:', 'МЧД-001');
    if (!partNumber || !partNumber.trim()) return;
    partNumber = partNumber.trim();
  }

  try {
    await invoke('vault_get_bom', { partNumber });
    lastSyncTime = Date.now();
  } catch (e) {
    failedAttempts++;
    console.error('vault_get_bom error:', e);
    updatePill('pdm', 'error');
    showToast(STAGE_LABELS.pdm, 'error');
  }
}

// ── Plant Simulation: диалоговый запуск через .lnk-ярлык ─────────
async function runPlantSim() {
  totalAttempts++;
  clearLog();
  setLogTitle(STAGE_LABELS.plantsim);
  showLogPanel(true);

  try {
    // Шаг 1: найти ярлык (из настроек или автопоиском)
    const lnkPath = await invoke('find_plantsim_shortcut');

    // Запомнить найденный путь в настройках на будущее
    try {
      const s = await invoke('get_settings');
      if (!s.plant_sim_shortcut) {
        await invoke('save_settings', { settings: { ...s, plant_sim_shortcut: lnkPath } });
        document.getElementById('inputPlantSimShortcut').value = lnkPath;
      }
    } catch (e) { console.warn('Shortcut save skipped:', e); }

    // Шаг 2: выбрать .spp файл модели через нативный Windows-диалог
    const saved = await invoke('get_settings').catch(() => ({}));
    const sppPath = await invoke('pick_file', {
      title: 'Выберите модель Plant Simulation (.spp)',
      filter: 'Plant Simulation Model (*.spp)|*.spp|Все файлы (*.*)|*.*',
      defaultPath: saved.plant_sim_path || '',
    });
    if (!sppPath) return;

    // Сохранить выбранный путь в настройках
    try {
      const s = await invoke('get_settings');
      await invoke('save_settings', { settings: { ...s, plant_sim_path: sppPath } });
    } catch (e) { console.warn('Path save skipped:', e); }

    // Шаг 3: ввести метод SimTalk
    const method = prompt(
      'Введите метод SimTalk для запуска:\n(например: .UserObjects.printed)',
      '.UserObjects.printed'
    );
    if (!method || !method.trim()) return;

    // Шаг 4: запустить
    await invoke('run_plantsim', { lnkPath, sppPath, method: method.trim() });
    lastSyncTime = Date.now();

  } catch (e) {
    if (typeof e === 'string' && e.startsWith('config:')) {
      showConfigError(e.replace('config: ', ''));
    } else {
      failedAttempts++;
      console.error('run_plantsim error:', e);
      updatePill('plantsim', 'error');
      showToast(STAGE_LABELS.plantsim, 'error');
    }
  }
}

document.querySelectorAll('.stage-card').forEach(card => {
  card.addEventListener('click', async () => {
    const stage = card.dataset.stage;

    if (activeStages.has(stage)) {
      try { await invoke('stop_stage', { stage }); }
      catch (e) { console.error('stop_stage error:', e); }
    } else if (stage === 'pdm') {
      await runVaultPdm();
    } else if (stage === 'plantsim') {
      await runPlantSim();
    } else {
      totalAttempts++;
      clearLog();
      setLogTitle(STAGE_LABELS[stage] || stage);
      showLogPanel(true);
      try {
        await invoke('run_stage', { stage });
        lastSyncTime = Date.now();
      } catch (e) {
        failedAttempts++;
        console.error('run_stage error:', e);
        updatePill(stage, 'error');
        showToast(STAGE_LABELS[stage] || stage, 'error');
      }
    }
  });
});

// ── Pill & card state update ──────────────────────────────────────
const PILL_MAP = {
  waiting: { cls: 'pill-ready',   dot: 'dot-green', text: 'Ready' },
  running: { cls: 'pill-running', dot: 'dot-blue',  text: 'Запущен' },
  done:    { cls: 'pill-done',    dot: 'dot-green', text: 'Завершён' },
  error:   { cls: 'pill-error',   dot: 'dot-red',   text: 'Ошибка' },
};

function updatePill(stage, status) {
  const card = document.querySelector(`.stage-card[data-stage="${stage}"]`);
  if (!card) return;

  const pill = card.querySelector('.stage-pill');
  if (!pill) return;

  const cfg = PILL_MAP[status] || PILL_MAP.waiting;

  pill.className = `stage-pill ${cfg.cls}`;
  pill.innerHTML = `<span class="dot ${cfg.dot}"></span>${cfg.text}`;

  if (status === 'running') {
    card.classList.add('stage-running');
    card.classList.remove('stage-active');
    activeStages.add(stage);
    setCardStopIcon(card, true);
  } else {
    card.classList.remove('stage-running');
    card.classList.remove('stage-active');
    activeStages.delete(stage);
    setCardStopIcon(card, false);
  }

}

function setCardStopIcon(card, isStop) {
  const wrap = card.querySelector('.stage-icon-wrap');
  if (!wrap) return;

  if (isStop) {
    wrap.dataset.origHtml = wrap.innerHTML;
    wrap.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="#C0392B"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`;
  } else {
    if (wrap.dataset.origHtml) {
      wrap.innerHTML = wrap.dataset.origHtml;
      delete wrap.dataset.origHtml;
    }
  }
}

// ── Log panel ─────────────────────────────────────────────────────
const LOG_MAX_LINES = 200;
let logLines = [];

function showLogPanel(visible) {
  const panel = document.getElementById('logPanel');
  if (visible) {
    panel.classList.add('visible');
  } else {
    panel.classList.remove('visible');
  }
}

document.getElementById('logClose')?.addEventListener('click', () => showLogPanel(false));

function showResultsPanel(visible) {
  const panel = document.getElementById('resultsPanel');
  if (!panel) return;
  if (visible) {
    panel.classList.add('visible');
  } else {
    panel.classList.remove('visible');
  }
}

function setLogTitle(stageName) {
  const el = document.getElementById('logTitle');
  if (el) el.textContent = `● ${stageName} — лог`;
}

function clearLog() {
  logLines = [];
  const body = document.getElementById('logBody');
  if (body) body.innerHTML = '';
}

function appendLog(stage, line) {
  const body = document.getElementById('logBody');
  if (!body) return;

  const now = new Date();
  const ts = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join(':');

  logLines.push(line);
  if (logLines.length > LOG_MAX_LINES) {
    logLines.shift();
    body.firstChild?.remove();
  }

  const row = document.createElement('div');
  row.className = 'log-line';
  row.innerHTML = `<span class="log-ts">${ts}</span><span class="log-text">${escapeHtml(line)}</span>`;
  body.appendChild(row);

  body.scrollTop = body.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Toast notifications ───────────────────────────────────────────
function showToast(stageName, type) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const isDone = type === 'done';
  toast.className = `toast toast-${isDone ? 'done' : 'error'}`;
  toast.textContent = isDone
    ? `«${stageName}» завершён`
    : `«${stageName}» — ошибка`;

  container.appendChild(toast);

  // Trigger reflow для CSS transition
  toast.getBoundingClientRect();
  toast.classList.add('toast-visible');

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function showConfigError(message) {
  // D-15: confirm() с предложением открыть настройки
  const goSettings = confirm(
    `Ошибка конфигурации Plant Simulation:\n${message}\n\nОткрыть настройки?`
  );
  if (goSettings) openSettings();
}

// ── Settings panel ────────────────────────────────────────────────
const panel    = document.getElementById('settingsPanel');
const overlay  = document.getElementById('settingsOverlay');
const gearBtn  = document.getElementById('gearBtn');

function openSettings() {
  panel.classList.add('open');
  overlay.classList.add('visible');
  gearBtn.classList.add('active');
}

function closeSettings() {
  panel.classList.remove('open');
  overlay.classList.remove('visible');
  gearBtn.classList.remove('active');
}

gearBtn.addEventListener('click', () => {
  panel.classList.contains('open') ? closeSettings() : openSettings();
});
overlay.addEventListener('click', closeSettings);
document.getElementById('btnCancel').addEventListener('click', closeSettings);

// ── Browse dialogs (нативный Windows диалог через Rust) ──────
document.querySelectorAll('.browse-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const targetId = btn.dataset.target;
    const type     = btn.dataset.type;
    const input    = document.getElementById(targetId);

    try {
      let selected;
      if (type === 'folder') {
        selected = await invoke('pick_folder', {
          title: 'Выберите папку',
          defaultPath: input.value || '',
        });
      } else {
        // Определяем фильтр по полю
        const filter = targetId === 'inputPlantSimShortcut'
          ? 'Ярлык Plant Simulation (*.lnk)|*.lnk|Все файлы (*.*)|*.*'
          : targetId === 'inputPlantSim'
            ? 'Plant Simulation Model (*.spp)|*.spp|Все файлы (*.*)|*.*'
            : 'Все файлы (*.*)|*.*';
        selected = await invoke('pick_file', {
          title: 'Выберите файл',
          filter,
          defaultPath: input.value || '',
        });
      }
      if (selected) { input.value = selected; clearError(targetId); }
    } catch (e) {
      console.error('pick dialog error:', e);
    }
  });
});

// ── Save settings ─────────────────────────────────────────────
document.getElementById('btnSave').addEventListener('click', async () => {
  const plantSimShortcut = document.getElementById('inputPlantSimShortcut').value;
  const plantSim         = document.getElementById('inputPlantSim').value;
  const workDir          = document.getElementById('inputWorkDir').value;
  const scripts          = document.getElementById('inputScripts').value;

  let hasError = false;

  // WR-04: val.trim() === '' корректно ловит пустые строки и строки из пробелов
  [[plantSim, 'inputPlantSim', 'errPlantSim'],
   [workDir,  'inputWorkDir',  'errWorkDir'],
   [scripts,  'inputScripts',  'errScripts']].forEach(([val, inputId, errId]) => {
    if (val.trim() === '') {
      showError(inputId, errId);
      hasError = true;
    } else {
      clearError(inputId);
    }
  });

  if (hasError) return;

  try {
    await invoke('save_settings', {
      settings: {
        plant_sim_shortcut: plantSimShortcut,
        plant_sim_path:     plantSim,
        work_dir:           workDir,
        scripts_dir:        scripts,
      }
    });
    closeSettings();
  } catch (e) {
    console.error('Save error:', e);
  }
});

function showError(inputId, errId) {
  document.getElementById(inputId).closest('.field-row').classList.add('error');
  document.getElementById(errId).classList.add('visible');
}
function clearError(inputId) {
  const row = document.getElementById(inputId)?.closest('.field-row');
  if (row) row.classList.remove('error');
  // WR-05: убираем суффикс 'input' только с начала строки
  const errId = 'err' + inputId.replace(/^input/, '');
  document.getElementById(errId)?.classList.remove('visible');
}

// ── Run full pipeline — заглушка до Phase 3 ───────────────────────
document.getElementById('runPipeline')?.addEventListener('click', () => {
  console.info('Full pipeline: будет реализовано в Phase 3');
});

// ── Load settings on start + Tauri event listeners ───────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Tauri event listeners
  await listen('stage-status', (event) => {
    const { stage, status } = event.payload;
    updatePill(stage, status);

    if (status === 'done' || status === 'error') {
      const label = STAGE_LABELS[stage] || stage;
      setLogTitle(`${label} — ${status === 'done' ? 'Завершён' : 'Ошибка'}`);
      showToast(label, status);
      if (status === 'done') lastSyncTime = Date.now();
      else failedAttempts++;
    }
  });

  await listen('stage-log', (event) => {
    const { stage, line } = event.payload;
    appendLog(stage, line);
  });

  // Vault BOM — рендеринг дерева состава изделия
  await listen('vault-bom', (event) => {
    const { part_number, items } = event.payload;
    document.getElementById('bomPartNumber').textContent = part_number;
    document.getElementById('bomCount').textContent = `${items.length} поз.`;
    renderBomTree(items);
    showBomPanel(true);
  });

  // D-12: панель результатов — появляется при получении stage-results
  await listen('stage-results', (event) => {
    const { stage, load, throughput, cycle_time } = event.payload;
    if (stage !== 'plantsim') return;

    document.getElementById('resLoad').textContent = load.toFixed(1);
    document.getElementById('resThroughput').textContent = throughput.toFixed(0);
    document.getElementById('resCycleTime').textContent = cycle_time.toFixed(1);

    showResultsPanel(true);
  });

  // Загрузить настройки
  try {
    const s = await invoke('get_settings');
    if (s.plant_sim_shortcut) document.getElementById('inputPlantSimShortcut').value = s.plant_sim_shortcut;
    if (s.plant_sim_path)     document.getElementById('inputPlantSim').value          = s.plant_sim_path;
    if (s.work_dir)           document.getElementById('inputWorkDir').value            = s.work_dir;
    if (s.scripts_dir)        document.getElementById('inputScripts').value            = s.scripts_dir;
    if (s.vault_url)          document.getElementById('inputVaultUrl').value           = s.vault_url;
    if (s.vault_token)        document.getElementById('inputVaultToken').value         = s.vault_token;
    if (s.vault_part_number)  document.getElementById('inputVaultPartNumber').value    = s.vault_part_number;
  } catch (e) {
    console.warn('Could not load settings:', e);
  }
});
