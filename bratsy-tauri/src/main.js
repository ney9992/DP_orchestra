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

// ── Plant Simulation: диалоговый запуск через .lnk-ярлык ─────────
async function runPlantSim() {
  totalAttempts++;
  clearLog();
  setLogTitle(STAGE_LABELS.plantsim);
  showLogPanel(true);

  try {
    // Шаг 1: найти ярлык
    const lnkPath = await invoke('find_plantsim_shortcut');

    // Шаг 2: выбрать .spp файл модели
    let sppPath;
    try {
      const { open } = await import('https://cdn.jsdelivr.net/npm/@tauri-apps/plugin-dialog@2/index.js');
      const saved = await invoke('get_settings').catch(() => ({}));
      sppPath = await open({
        filters: [{ name: 'Plant Simulation Model', extensions: ['spp'] }],
        defaultPath: saved.plant_sim_path || undefined,
        title: 'Выберите модель Plant Simulation (.spp)',
        multiple: false,
      });
    } catch {
      const saved = await invoke('get_settings').catch(() => ({}));
      sppPath = prompt('Путь к файлу модели Plant Simulation (.spp):', saved.plant_sim_path || '');
    }
    if (!sppPath) return;

    // Сохранить выбранный путь в настройках
    try {
      const s = await invoke('get_settings');
      await invoke('save_settings', { settings: { ...s, plant_sim_path: sppPath } });
    } catch { /* некритично */ }

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

  // Скрыть лог-панель если все этапы остановлены
  if (activeStages.size === 0 && (status === 'done' || status === 'error')) {
    setTimeout(() => {
      if (activeStages.size === 0) showLogPanel(false);
    }, 3000);
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

// ── Browse dialogs (via Tauri dialog plugin or fallback) ──────
document.querySelectorAll('.browse-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const targetId = btn.dataset.target;
    const type     = btn.dataset.type;
    const input    = document.getElementById(targetId);

    try {
      const { open } = await import('https://cdn.jsdelivr.net/npm/@tauri-apps/plugin-dialog@2/index.js').catch(() => ({ open: null }));

      if (open) {
        const selected = await open({ directory: type === 'folder', multiple: false });
        if (selected) { input.value = selected; clearError(targetId); }
      } else {
        const val = prompt(type === 'file' ? 'Введите путь к файлу .spp:' : 'Введите путь к папке:');
        if (val) { input.value = val; clearError(targetId); }
      }
    } catch {
      const val = prompt(type === 'file' ? 'Введите путь к файлу .spp:' : 'Введите путь к папке:');
      if (val) { input.value = val; clearError(targetId); }
    }
  });
});

// ── Save settings ─────────────────────────────────────────────
document.getElementById('btnSave').addEventListener('click', async () => {
  const plantSim      = document.getElementById('inputPlantSim').value;
  const workDir       = document.getElementById('inputWorkDir').value;
  const scripts       = document.getElementById('inputScripts').value;
  const plantSimExe   = document.getElementById('inputPlantSimExe').value;
  const plantSimMacro = document.getElementById('inputPlantSimMacro').value;

  let hasError = false;

  [[plantSim,      'inputPlantSim',      'errPlantSim'],
   [workDir,       'inputWorkDir',       'errWorkDir'],
   [scripts,       'inputScripts',       'errScripts'],
   [plantSimExe,   'inputPlantSimExe',   'errPlantSimExe'],
   [plantSimMacro, 'inputPlantSimMacro', 'errPlantSimMacro']].forEach(([val, inputId, errId]) => {
    if (val && val.trim() === '') {
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
        plant_sim_path:  plantSim,
        work_dir:        workDir,
        scripts_dir:     scripts,
        plant_sim_exe:   plantSimExe,
        plant_sim_macro: plantSimMacro,
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
  document.querySelectorAll('.field-error').forEach(el => {
    if (el.id === 'err' + inputId.replace('input', '')) el.classList.remove('visible');
  });
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
    if (s.plant_sim_path)  document.getElementById('inputPlantSim').value      = s.plant_sim_path;
    if (s.work_dir)        document.getElementById('inputWorkDir').value        = s.work_dir;
    if (s.scripts_dir)     document.getElementById('inputScripts').value        = s.scripts_dir;
    if (s.plant_sim_exe)   document.getElementById('inputPlantSimExe').value    = s.plant_sim_exe;
    if (s.plant_sim_macro) document.getElementById('inputPlantSimMacro').value  = s.plant_sim_macro;
  } catch (e) {
    console.warn('Could not load settings:', e);
  }
});
