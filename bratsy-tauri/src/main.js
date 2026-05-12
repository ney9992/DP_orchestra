const { invoke } = window.__TAURI__.core;
const { listen }  = window.__TAURI__.event;

// ── Uptime / Error rate ───────────────────────────────────────
const startTime = Date.now();
let totalAttempts = 0;
let failedAttempts = 0;
let lastSyncTime = Date.now();

setInterval(() => {
  const secs = Math.floor((Date.now() - startTime) / 1000);
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  document.getElementById('uptime').textContent = `${h}:${m}:${s}`;

  const elapsed = Math.floor((Date.now() - lastSyncTime) / 1000);
  const syncEl = document.getElementById('syncTime');
  if (elapsed < 60) syncEl.textContent = `${elapsed}s ago`;
  else if (elapsed < 3600) syncEl.textContent = `${Math.floor(elapsed / 60)}m ago`;
  else syncEl.textContent = `${(elapsed / 3600).toFixed(1)}h ago`;

  if (totalAttempts > 0) {
    document.getElementById('errorRate').textContent =
      `${((failedAttempts / totalAttempts) * 100).toFixed(1)}%`;
  }
}, 1000);

// ── Step state machine ────────────────────────────────────────
const IMPORT_STAGES = new Set(['pdm', 'excel', 'autocad']);
const SIM_STAGES    = new Set(['plantsim', 'visual_components']);
const importDone    = new Set();
const simDone       = new Set();

function onStageCompleted(stage) {
  if (IMPORT_STAGES.has(stage)) {
    importDone.add(stage);
    document.getElementById('tagImport').textContent = `${importDone.size} / 3 загружено`;
    if (importDone.size === IMPORT_STAGES.size) activateSimStep();
  } else if (SIM_STAGES.has(stage)) {
    simDone.add(stage);
    document.getElementById('tagSim').textContent = `${simDone.size} / 2 выполнено`;
    if (simDone.size === SIM_STAGES.size) activateReportStep();
  }
}

function activateSimStep() {
  // Шаг 1 → сделан
  const s1 = document.getElementById('stepImport');
  s1.classList.remove('step-active');
  s1.classList.add('step-done');
  document.getElementById('num1').textContent = '✓';
  document.getElementById('num1').classList.add('step-num-done');
  document.getElementById('tagImport').textContent = '✓ Завершено';
  document.getElementById('tagImport').classList.add('step-tag-done');

  // Шаг 2 → активен
  const s2 = document.getElementById('stepSim');
  s2.classList.remove('step-locked');
  s2.classList.add('step-active');
  document.getElementById('num2').classList.remove('step-num-locked');
  document.getElementById('tagSim').textContent = '0 / 2 выполнено';
  document.getElementById('tagSim').classList.remove('step-tag-locked');

  document.getElementById('footerInfo').textContent = 'Шаг 2 из 3 — симуляция производства';
  showToast('Импорт завершён', 'done');
}

function activateReportStep() {
  // Шаг 2 → сделан
  const s2 = document.getElementById('stepSim');
  s2.classList.remove('step-active');
  s2.classList.add('step-done');
  document.getElementById('num2').textContent = '✓';
  document.getElementById('num2').classList.add('step-num-done');
  document.getElementById('tagSim').textContent = '✓ Завершено';
  document.getElementById('tagSim').classList.add('step-tag-done');

  // Шаг 3 → активен
  const s3 = document.getElementById('stepReport');
  s3.classList.remove('step-locked');
  s3.classList.add('step-active');
  document.getElementById('num3').classList.remove('step-num-locked');

  const ts = new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  document.getElementById('reportTs').textContent = `Рассчитано: ${ts}`;
  document.getElementById('footerInfo').textContent = 'Шаг 3 из 3 — результаты расчёта';

  // Прокрутить к отчёту
  setTimeout(() => {
    document.getElementById('stepReport').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);

  showToast('Симуляция завершена', 'done');
}

function resetPipeline() {
  importDone.clear();
  simDone.clear();

  // Шаг 1 → снова активен
  const s1 = document.getElementById('stepImport');
  s1.className = 'step step-active';
  document.getElementById('num1').textContent = '1';
  document.getElementById('num1').className = 'step-num';
  document.getElementById('tagImport').textContent = '0 / 3 загружено';
  document.getElementById('tagImport').className = 'step-tag';

  // Шаг 2 → заблокирован
  const s2 = document.getElementById('stepSim');
  s2.className = 'step step-locked';
  document.getElementById('num2').textContent = '2';
  document.getElementById('num2').className = 'step-num step-num-locked';
  document.getElementById('tagSim').textContent = 'Ожидает импорта';
  document.getElementById('tagSim').className = 'step-tag step-tag-locked';

  // Шаг 3 → заблокирован
  const s3 = document.getElementById('stepReport');
  s3.className = 'step step-locked step-report';
  document.getElementById('num3').textContent = '3';
  document.getElementById('num3').className = 'step-num step-num-report';

  // Сброс pill-ов всех карточек
  document.querySelectorAll('.stage-card').forEach(c => {
    const stage = c.dataset.stage;
    const inSim = SIM_STAGES.has(stage);
    updatePill(stage, inSim ? 'idle' : 'waiting');
    c.classList.remove('stage-running', 'stage-finished');
    const wrap = c.querySelector('.stage-icon-wrap');
    if (wrap?.dataset.origHtml) { wrap.innerHTML = wrap.dataset.origHtml; delete wrap.dataset.origHtml; }
  });

  // Сброс отчёта
  ['rptLoad','rptThroughput','rptCycleTime','rptOee','rptWip','rptLeadTime','rptBottleneck']
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });

  activeStages.clear();
  document.getElementById('footerInfo').textContent = 'Шаг 1 из 3 — импорт данных';
  showLogPanel(false);
  showBomPanel(false);
}

document.getElementById('btnNewRun')?.addEventListener('click', resetPipeline);

// ── Stage card click (toggle run/stop) ───────────────────────
const activeStages = new Set();

const STAGE_LABELS = {
  pdm:               'Vault PDM',
  excel:             'Excel',
  autocad:           'AutoCAD',
  plantsim:          'Tecnomatix',
  visual_components: 'Visual Components',
};

document.querySelectorAll('.stage-card').forEach(card => {
  card.addEventListener('click', async () => {
    const stage = card.dataset.stage;
    if (activeStages.has(stage)) {
      try { await invoke('stop_stage', { stage }); }
      catch (e) { console.error('stop_stage:', e); }
      return;
    }

    if (stage === 'pdm') { await runVaultPdm(); return; }
    if (stage === 'plantsim') { await runPlantSim(); return; }

    // Общий run через mock
    totalAttempts++;
    clearLog();
    setLogTitle(STAGE_LABELS[stage] || stage);
    showLogPanel(true);
    try {
      await invoke('run_stage', { stage });
      lastSyncTime = Date.now();
    } catch (e) {
      failedAttempts++;
      updatePill(stage, 'error');
      showToast(STAGE_LABELS[stage] || stage, 'error');
    }
  });
});

// ── Vault PDM ────────────────────────────────────────────────
const LIFECYCLE_LABELS = {
  '-1': 'Новый', 1: 'Доработка', 2: 'Пров. BIM',
  3: 'Пров. качества', 4: 'Пров. КО', 5: 'Утверждено', 6: 'Архив',
};

function showBomPanel(visible) {
  const p = document.getElementById('bomPanel');
  if (p) { if (visible) p.classList.add('visible'); else p.classList.remove('visible'); }
}
document.getElementById('bomClose')?.addEventListener('click', () => showBomPanel(false));

function renderBomTree(items) {
  const tree = document.getElementById('bomTree');
  if (!tree) return;
  tree.innerHTML = '';
  const children = new Map();
  items.forEach(it => {
    const pid = it.ParentId ?? null;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid).push(it);
  });

  function buildNode(item, depth) {
    const kids = children.get(item.Id) || [];
    const hasKids = kids.length > 0;
    const isOk = item.LfCycStateId === 5;
    const stateLabel = LIFECYCLE_LABELS[item.LfCycStateId] ?? `#${item.LfCycStateId}`;
    const filesHtml = (item.Files || []).map(f => {
      const ext = f.FileName.split('.').pop().toUpperCase();
      return `<button class="bom-file-btn" data-id="${f.Id}" data-name="${escapeHtml(f.FileName)}" title="${escapeHtml(f.FileName)}">${ext}</button>`;
    }).join('');
    const qtyText = item.Quant != null ? `${item.Quant}&nbsp;${escapeHtml(item.Units || 'шт')}` : '';
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
      <span class="bom-col-state bom-state${isOk ? ' bom-state-ok' : ''}">${stateLabel}</span>
      <span class="bom-col-files bom-files">${filesHtml}</span>`;
    node.appendChild(row);
    if (hasKids) {
      const childWrap = document.createElement('div');
      childWrap.className = 'bom-children';
      kids.forEach(c => childWrap.appendChild(buildNode(c, depth + 1)));
      node.appendChild(childWrap);
      row.addEventListener('click', e => {
        if (e.target.closest('.bom-file-btn')) return;
        node.classList.toggle('collapsed');
      });
    }
    return node;
  }
  (children.get(null) || []).forEach(r => tree.appendChild(buildNode(r, 0)));
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('.bom-file-btn');
  if (!btn) return;
  btn.disabled = true;
  try {
    await invoke('vault_download_file', { fileId: parseInt(btn.dataset.id, 10), fileName: btn.dataset.name });
    showToast(`Сохранено: ${btn.dataset.name}`, 'done');
  } catch (err) {
    showToast(`Ошибка: ${btn.dataset.name}`, 'error');
  } finally { btn.disabled = false; }
});

async function runVaultPdm() {
  totalAttempts++;
  clearLog(); setLogTitle(STAGE_LABELS.pdm); showLogPanel(true);
  showBomPanel(false);
  let partNumber = '';
  try { const s = await invoke('get_settings'); partNumber = s.vault_part_number || ''; } catch {}
  if (!partNumber.trim()) {
    partNumber = prompt('Введите обозначение изделия для запроса BOM:', 'МЧД-001');
    if (!partNumber?.trim()) return;
    partNumber = partNumber.trim();
  }
  try {
    await invoke('vault_get_bom', { partNumber });
    lastSyncTime = Date.now();
  } catch (e) {
    failedAttempts++;
    updatePill('pdm', 'error');
    showToast(STAGE_LABELS.pdm, 'error');
  }
}

// ── Plant Simulation ──────────────────────────────────────────
async function runPlantSim() {
  totalAttempts++;
  clearLog(); setLogTitle(STAGE_LABELS.plantsim); showLogPanel(true);
  try {
    const lnkPath = await invoke('find_plantsim_shortcut');
    try {
      const s = await invoke('get_settings');
      if (!s.plant_sim_shortcut) await invoke('save_settings', { settings: { ...s, plant_sim_shortcut: lnkPath } });
    } catch {}
    const saved = await invoke('get_settings').catch(() => ({}));
    const sppPath = await invoke('pick_file', {
      title: 'Выберите модель Plant Simulation (.spp)',
      filter: 'Plant Simulation Model (*.spp)|*.spp|Все файлы (*.*)|*.*',
      defaultPath: saved.plant_sim_path || '',
    });
    if (!sppPath) return;
    try {
      const s = await invoke('get_settings');
      await invoke('save_settings', { settings: { ...s, plant_sim_path: sppPath } });
    } catch {}
    const method = prompt('Метод SimTalk:', '.UserObjects.printed');
    if (!method?.trim()) return;
    await invoke('run_plantsim', { lnkPath, sppPath, method: method.trim() });
    lastSyncTime = Date.now();
  } catch (e) {
    if (typeof e === 'string' && e.startsWith('config:')) {
      const go = confirm(`Ошибка: ${e.replace('config: ', '')}\n\nОткрыть настройки?`);
      if (go) openSettings();
    } else {
      failedAttempts++;
      updatePill('plantsim', 'error');
      showToast(STAGE_LABELS.plantsim, 'error');
    }
  }
}

// ── Pill & card state ─────────────────────────────────────────
const PILL_MAP = {
  waiting: { cls: 'pill-ready',   dot: 'dot-green', text: 'Ready' },
  idle:    { cls: 'pill-idle',    dot: 'dot-gray',  text: 'Ожидание' },
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
    card.classList.remove('stage-finished');
    activeStages.add(stage);
    setCardStopIcon(card, true);
  } else {
    card.classList.remove('stage-running');
    activeStages.delete(stage);
    setCardStopIcon(card, false);
    if (status === 'done') card.classList.add('stage-finished');
  }
}

function setCardStopIcon(card, isStop) {
  const wrap = card.querySelector('.stage-icon-wrap');
  if (!wrap) return;
  if (isStop) {
    wrap.dataset.origHtml = wrap.innerHTML;
    wrap.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="#C0392B"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`;
  } else if (wrap.dataset.origHtml) {
    wrap.innerHTML = wrap.dataset.origHtml;
    delete wrap.dataset.origHtml;
  }
}

// ── Log panel (двойная: logPanel1 для шага 1, logPanel2 для шага 2) ──
const LOG_MAX = 200;
const logLines = { 1: [], 2: [] };
let activeLogId = 1; // текущая активная панель

function logPanelEl() { return document.getElementById(`logPanel${activeLogId}`); }
function logBodyEl()  { return document.getElementById(`logBody${activeLogId}`); }
function logTitleEl() { return document.getElementById(`logTitle${activeLogId}`); }

function showLogPanel(v) {
  const p = logPanelEl();
  if (p) { if (v) p.classList.add('visible'); else p.classList.remove('visible'); }
}
document.getElementById('logClose1')?.addEventListener('click', () => {
  activeLogId = 1; showLogPanel(false);
});
document.getElementById('logClose2')?.addEventListener('click', () => {
  activeLogId = 2; showLogPanel(false);
});

function setLogTitle(t) {
  const el = logTitleEl();
  if (el) el.textContent = `● ${t} — лог`;
}
function clearLog() {
  logLines[activeLogId] = [];
  const b = logBodyEl();
  if (b) b.innerHTML = '';
}
function appendLog(stage, line) {
  const body = logBodyEl();
  if (!body) return;
  const now = new Date();
  const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
  logLines[activeLogId].push(line);
  if (logLines[activeLogId].length > LOG_MAX) {
    logLines[activeLogId].shift(); body.firstChild?.remove();
  }
  const row = document.createElement('div');
  row.className = 'log-line';
  row.innerHTML = `<span class="log-ts">${ts}</span><span class="log-text">${escapeHtml(line)}</span>`;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(name, type) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type === 'done' ? 'done' : 'error'}`;
  toast.textContent = type === 'done' ? `«${name}» завершён` : `«${name}» — ошибка`;
  container.appendChild(toast);
  toast.getBoundingClientRect();
  toast.classList.add('toast-visible');
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ── Settings panel ────────────────────────────────────────────
const panel   = document.getElementById('settingsPanel');
const overlay = document.getElementById('settingsOverlay');
const gearBtn = document.getElementById('gearBtn');

function openSettings() {
  panel.classList.add('open'); overlay.classList.add('visible'); gearBtn.classList.add('active');
}
function closeSettings() {
  panel.classList.remove('open'); overlay.classList.remove('visible'); gearBtn.classList.remove('active');
}
gearBtn.addEventListener('click', () => panel.classList.contains('open') ? closeSettings() : openSettings());
overlay.addEventListener('click', closeSettings);
document.getElementById('btnCancel').addEventListener('click', closeSettings);

document.querySelectorAll('.browse-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const targetId = btn.dataset.target;
    const type     = btn.dataset.type;
    const input    = document.getElementById(targetId);
    try {
      let selected;
      if (type === 'folder') {
        selected = await invoke('pick_folder', { title: 'Выберите папку', defaultPath: input.value || '' });
      } else {
        const filter = targetId === 'inputPlantSimShortcut'
          ? 'Ярлык Plant Simulation (*.lnk)|*.lnk|Все файлы (*.*)|*.*'
          : targetId === 'inputPlantSim'
            ? 'Plant Simulation Model (*.spp)|*.spp|Все файлы (*.*)|*.*'
            : 'Все файлы (*.*)|*.*';
        selected = await invoke('pick_file', { title: 'Выберите файл', filter, defaultPath: input.value || '' });
      }
      if (selected) { input.value = selected; clearError(targetId); }
    } catch (e) { console.error('pick dialog:', e); }
  });
});

document.getElementById('btnSave').addEventListener('click', async () => {
  const ps  = document.getElementById('inputPlantSimShortcut').value;
  const spp = document.getElementById('inputPlantSim').value;
  const wd  = document.getElementById('inputWorkDir').value;
  const sc  = document.getElementById('inputScripts').value;
  const vu  = document.getElementById('inputVaultUrl').value;
  const vt  = document.getElementById('inputVaultToken').value;
  const vpn = document.getElementById('inputVaultPartNumber').value;

  let hasError = false;
  [[spp,'inputPlantSim','errPlantSim'], [wd,'inputWorkDir','errWorkDir'], [sc,'inputScripts','errScripts']]
    .forEach(([val, iid, eid]) => {
      if (val.trim() === '') { showError(iid, eid); hasError = true; }
      else clearError(iid);
    });
  if (hasError) return;

  try {
    await invoke('save_settings', { settings: {
      plant_sim_shortcut: ps, plant_sim_path: spp, work_dir: wd, scripts_dir: sc,
      vault_url: vu, vault_token: vt, vault_part_number: vpn,
    }});
    closeSettings();
  } catch (e) { console.error('Save:', e); }
});

function showError(inputId, errId) {
  document.getElementById(inputId)?.closest('.field-row')?.classList.add('error');
  document.getElementById(errId)?.classList.add('visible');
}
function clearError(inputId) {
  document.getElementById(inputId)?.closest('.field-row')?.classList.remove('error');
  const errId = 'err' + inputId.replace(/^input/, '');
  document.getElementById(errId)?.classList.remove('visible');
}

document.getElementById('runPipeline')?.addEventListener('click', () => {
  // Запустить все не завершённые этапы текущего шага последовательно
  console.info('Run all: TODO');
});

// ── Tauri event listeners ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {

  await listen('stage-status', (event) => {
    const { stage, status } = event.payload;
    updatePill(stage, status);
    if (status === 'done') {
      const label = STAGE_LABELS[stage] || stage;
      setLogTitle(`${label} — Завершён`);
      showToast(label, 'done');
      lastSyncTime = Date.now();
      onStageCompleted(stage);
    } else if (status === 'error') {
      failedAttempts++;
      const label = STAGE_LABELS[stage] || stage;
      setLogTitle(`${label} — Ошибка`);
      showToast(label, 'error');
    }
  });

  await listen('stage-log', (event) => {
    appendLog(event.payload.stage, event.payload.line);
  });

  await listen('vault-bom', (event) => {
    const { part_number, items } = event.payload;
    document.getElementById('bomPartNumber').textContent = part_number;
    document.getElementById('bomCount').textContent = `${items.length} поз.`;
    renderBomTree(items);
    showBomPanel(true);
  });

  await listen('stage-results', (event) => {
    const { stage, load, throughput, cycle_time, oee, wip, lead_time, bottleneck } = event.payload;
    if (stage !== 'plantsim') return;

    appendLog('plantsim', `📊 Загрузка=${(load??0).toFixed(1)}%  Выпуск=${(throughput??0).toFixed(0)}  OEE=${(oee??0).toFixed(1)}%`);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    try {
      set('rptLoad',       (load      ?? 0).toFixed(1));
      set('rptThroughput', (throughput ?? 0).toFixed(0));
      set('rptCycleTime',  (cycle_time ?? 0).toFixed(1));
      set('rptOee',        oee  > 0 ? oee.toFixed(1)  : '—');
      set('rptWip',        wip  > 0 ? wip.toFixed(0)  : '—');
      set('rptLeadTime',   lead_time > 0 ? lead_time.toFixed(1) : '—');
      const bn = document.getElementById('rptBottleneck');
      if (bn) {
        bn.textContent = bottleneck ? bottleneck.replace(/_/g, ' ') : '—';
        bn.classList.toggle('report-value-alert', !!bottleneck);
      }
    } catch (e) { console.error('stage-results DOM:', e); }
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
  } catch (e) { console.warn('Settings load:', e); }
});
