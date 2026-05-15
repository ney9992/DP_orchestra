const { invoke } = window.__TAURI__.core;
const { listen }  = window.__TAURI__.event;
const { getVersion } = window.__TAURI__.app;

// ── Версия ─────────────────────────────────────────────────────
getVersion().then(v => {
  const el = document.getElementById('appVersion');
  if (el) el.textContent = 'v' + v;
});

// ── Resize handle ──────────────────────────────────────────────
(function initResize() {
  const handle     = document.getElementById('resizeHandle');
  const leftPanel  = document.querySelector('.left-panel');
  const grid       = document.querySelector('.content-grid');
  const STORAGE_KEY = 'panelLeftPct';

  const saved = parseFloat(localStorage.getItem(STORAGE_KEY));
  if (!isNaN(saved)) leftPanel.style.width = saved + '%';

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    handle.classList.add('dragging');
    const startX    = e.clientX;
    const startW    = leftPanel.getBoundingClientRect().width;
    const totalW    = grid.getBoundingClientRect().width;

    function onMove(e) {
      const delta  = e.clientX - startX;
      const newPct = Math.min(80, Math.max(20, (startW + delta) / totalW * 100));
      leftPanel.style.width = newPct + '%';
    }
    function onUp() {
      handle.classList.remove('dragging');
      const pct = parseFloat(leftPanel.style.width);
      if (!isNaN(pct)) localStorage.setItem(STORAGE_KEY, pct.toFixed(1));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
})();

// ── Метаданные ─────────────────────────────────────────────────
const IMPORT_STAGES = ['pdm', 'excel', 'autocad'];
const SIM_STAGES    = ['plantsim'];
const PIPELINE      = [...IMPORT_STAGES, ...SIM_STAGES];

const STAGE_LABELS = {
  pdm: 'Vault PDM', excel: 'Excel', autocad: 'AutoCAD', plantsim: 'Tecnomatix',
};

// ── Uptime ─────────────────────────────────────────────────────
let failedAttempts = 0;
const startMs = Date.now();
setInterval(() => {
  const s = Math.floor((Date.now() - startMs) / 1000);
  document.getElementById('uptimeEl').textContent =
    `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}, 1000);

// ── Консоль ────────────────────────────────────────────────────
const consoleBody = document.getElementById('consoleBody');

function ts() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function clog(text, type = 'log', stage = null) {
  const line = document.createElement('span');
  line.className = `cline cline-${type}`;
  let html = `<span class="ts">${ts()}</span>`;
  if (stage) html += `<span class="tag tag-${stage}">${esc(STAGE_LABELS[stage] || stage)}</span>`;
  html += esc(text);
  line.innerHTML = html;
  consoleBody.appendChild(line);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}
function csep() {
  const el = document.createElement('span');
  el.className = 'cline cline-sep';
  consoleBody.appendChild(el);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

document.getElementById('btnClearConsole').addEventListener('click', () => {
  consoleBody.innerHTML = '';
  clog('Консоль очищена.', 'sys');
});

// ── Переключение вкладок правой панели ─────────────────────────
function showTab(tab) {
  const isConsole = tab === 'console';
  document.getElementById('tabConsole').classList.toggle('rp-tab-active', isConsole);
  document.getElementById('tabReport').classList.toggle('rp-tab-active', !isConsole);
  consoleBody.style.display = isConsole ? '' : 'none';
  document.getElementById('reportView').classList.toggle('visible', !isConsole);
  document.getElementById('btnClearConsole').style.display = isConsole ? '' : 'none';
}

document.getElementById('tabConsole').addEventListener('click', () => showTab('console'));
document.getElementById('tabReport').addEventListener('click',  () => showTab('report'));

// ── Tauri events → консоль ─────────────────────────────────────
listen('stage-log', (evt) => {
  clog(evt.payload.line, 'log', evt.payload.stage);
});

listen('stage-status', (evt) => {
  const { stage, status } = evt.payload;
  setPill(stage, status);
  if (status === 'done')  clog('✓ Завершён', 'ok', stage);
  if (status === 'error') clog('✗ Ошибка', 'err', stage);
});

listen('stage-results', (evt) => {
  const { entries } = evt.payload;
  const grid  = document.getElementById('reportGridDyn');
  const empty = document.getElementById('rptEmpty');
  grid.innerHTML = '';
  if (entries && entries.length > 0) {
    if (empty) empty.style.display = 'none';
    entries.forEach(({ key, value }) => {
      const card = document.createElement('div');
      card.className = 'rpt-card-dyn';
      card.innerHTML = `<div class="rpt-key">${esc(key)}</div><div class="rpt-val">${esc(value)}</div>`;
      grid.appendChild(card);
    });
  }
  csep();
  clog('══ РЕЗУЛЬТАТЫ СИМУЛЯЦИИ ══════════════', 'header');
  (entries || []).forEach(({ key, value }) => clog(`${key}: ${value}`, 'result'));
  csep();
  showTab('report');
});

listen('vault-bom', (evt) => {
  clog(`BOM: ${evt.payload.part_number} — ${evt.payload.items.length} поз.`, 'ok', 'pdm');
});

// ── Пилюли ─────────────────────────────────────────────────────
function setPill(stage, status) {
  const pill = document.getElementById(`pill-${stage}`);
  if (!pill) return;
  const CONFIG = {
    idle:    ['pill-idle',    'dot-gray',  'Ожидание'],
    running: ['pill-running', 'dot-blue',  'Запущен'],
    done:    ['pill-done',    'dot-green', 'Завершён'],
    error:   ['pill-error',   'dot-red',   'Ошибка'],
  };
  const [pillCls, dotCls, label] = CONFIG[status] || CONFIG.idle;
  pill.className = `stage-pill ${pillCls}`;
  pill.innerHTML = `<span class="dot ${dotCls}"></span>${label}`;
  const card = pill.closest('.stage-card');
  if (card) {
    card.classList.remove('stage-running', 'stage-finished');
    if (status === 'running') card.classList.add('stage-running');
    if (status === 'done')    card.classList.add('stage-finished');
  }
}

function resetPills() {
  PIPELINE.forEach(s => setPill(s, 'idle'));
}

// ── Аккордеон шагов ────────────────────────────────────────────
function activateSimStep() {
  // Шаг 1 → done
  const s1 = document.getElementById('stepImport');
  s1.classList.remove('step-active');
  s1.classList.add('step-done');
  document.getElementById('num1').className = 'step-num step-num-done';
  document.getElementById('num1').textContent = '✓';
  document.getElementById('tagImport').className = 'step-tag step-tag-green';
  document.getElementById('tagImport').textContent = 'Импорт завершён';
  // Шаг 2 → active
  const s2 = document.getElementById('stepSim');
  s2.classList.remove('step-locked');
  s2.classList.add('step-active');
  document.getElementById('num2').className = 'step-num';
  document.getElementById('tagSim').className = 'step-tag';
}

function activateReportStep() {
  // Шаг 2 → done
  const s2 = document.getElementById('stepSim');
  s2.classList.remove('step-active');
  s2.classList.add('step-done');
  document.getElementById('num2').className = 'step-num step-num-done';
  document.getElementById('num2').textContent = '✓';
  document.getElementById('tagSim').className = 'step-tag step-tag-green';
  document.getElementById('tagSim').textContent = 'Симуляция завершена';
  // Шаг 3 → active
  const s3 = document.getElementById('stepReport');
  s3.classList.remove('step-locked');
  s3.classList.add('step-active');
  document.getElementById('num3').className = 'step-num step-num-report';
  document.getElementById('tagReport').textContent = 'Результаты получены';
  // Прокрутка к отчёту
  setTimeout(() => s3.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350);
}

function resetAccordion() {
  // Шаг 1 → active
  const s1 = document.getElementById('stepImport');
  s1.className = 'step step-active';
  document.getElementById('num1').className = 'step-num';
  document.getElementById('num1').textContent = '1';
  document.getElementById('tagImport').className = 'step-tag';
  document.getElementById('tagImport').textContent = '0 / 3 загружено';
  // Шаг 2 → locked
  const s2 = document.getElementById('stepSim');
  s2.className = 'step step-locked';
  document.getElementById('num2').className = 'step-num step-num-locked';
  document.getElementById('num2').textContent = '2';
  document.getElementById('tagSim').className = 'step-tag step-tag-locked';
  document.getElementById('tagSim').textContent = '0 / 1 выполнено';
  // Шаг 3 → locked
  const s3 = document.getElementById('stepReport');
  s3.className = 'step step-locked';
  document.getElementById('num3').className = 'step-num step-num-report';
  document.getElementById('num3').textContent = '3';
  document.getElementById('tagReport').textContent = 'Ожидание данных';
  const grid = document.getElementById('reportGridDyn');
  if (grid) grid.innerHTML = '';
  const empty = document.getElementById('rptEmpty');
  if (empty) empty.style.display = '';
  showTab('console');
}

// ── Переключатели тест / реал ──────────────────────────────────
function getMode(stage) { return localStorage.getItem(`mode_${stage}`) || 'test'; }
function setMode(stage, mode) { localStorage.setItem(`mode_${stage}`, mode); }

document.querySelectorAll('.mode-toggle').forEach(toggle => {
  const stage = toggle.dataset.stage;
  const track = toggle.querySelector('.toggle-track');
  const thumb = toggle.querySelector('.toggle-thumb');
  const testLbl = toggle.querySelector('.m-test');
  const realLbl = toggle.querySelector('.m-real');

  applyToggle(track, thumb, testLbl, realLbl, getMode(stage) === 'real');

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const nowReal = getMode(stage) !== 'real';
    setMode(stage, nowReal ? 'real' : 'test');
    applyToggle(track, thumb, testLbl, realLbl, nowReal);
  });
});

function applyToggle(track, thumb, testLbl, realLbl, isReal) {
  thumb.style.left = isReal ? '18px' : '2px';
  track.classList.toggle('is-real', isReal);
  if (testLbl) testLbl.classList.toggle('active', !isReal);
  if (realLbl) realLbl.classList.toggle('active', isReal);
}

// ── Кнопка запуска ─────────────────────────────────────────────
let pipelineRunning = false;

const btnLaunch   = document.getElementById('btnLaunch');
const launchIcon  = document.getElementById('launchIcon');
const launchText  = document.getElementById('launchText');

const SVG_PLAY = '<polygon points="5 3 19 12 5 21 5 3"/>';
const SVG_STOP = '<rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/>';

btnLaunch.addEventListener('click', () => {
  if (pipelineRunning) stopPipeline();
  else startPipeline();
});

function setLaunchState(state) {
  btnLaunch.className = `launch-btn${state ? ' ' + state : ''}`;
  launchIcon.innerHTML = state === 'running' ? SVG_STOP : SVG_PLAY;
  if (state === 'running') launchText.textContent = 'Остановить';
  else if (state === 'done')  launchText.textContent = 'Запуск Цифрового завода';
  else if (state === 'error') launchText.textContent = 'Запуск Цифрового завода';
  else launchText.textContent = 'Запуск Цифрового завода';
}

// ── Пайплайн ───────────────────────────────────────────────────
async function startPipeline() {
  pipelineRunning = true;
  setLaunchState('running');
  resetPills();
  resetAccordion();
  csep();
  clog('▶ Запуск пайплайна', 'header');

  let importCount = 0;
  let success = true;

  for (const stage of PIPELINE) {
    if (!pipelineRunning) { success = false; break; }
    const mode = getMode(stage);
    clog(`Этап: ${STAGE_LABELS[stage]} [${mode === 'real' ? 'реальный' : 'тест'}]`, 'sys');
    setPill(stage, 'running');

    try {
      if (mode === 'test') await runTest(stage);
      else await runReal(stage);
      setPill(stage, 'done');

      // Обновляем аккордеон
      if (IMPORT_STAGES.includes(stage)) {
        importCount++;
        document.getElementById('tagImport').textContent = `${importCount} / 3 загружено`;
        if (importCount === IMPORT_STAGES.length) {
          await sleep(300);
          activateSimStep();
        }
      } else if (SIM_STAGES.includes(stage)) {
        await sleep(300);
        activateReportStep();
      }

    } catch (e) {
      setPill(stage, 'error');
      clog(String(e.message || e), 'err', stage);
      failedAttempts++;
      document.getElementById('errRate').textContent = failedAttempts;
      success = false;
      break;
    }
  }

  pipelineRunning = false;
  if (success) {
    setLaunchState('done');
    clog('✓ Пайплайн завершён', 'ok');
    setTimeout(() => setLaunchState(''), 5000);
  } else {
    setLaunchState('error');
    setTimeout(() => setLaunchState(''), 5000);
  }
}

function stopPipeline() {
  pipelineRunning = false;
  setLaunchState('');
  clog('⏹ Остановлено пользователем', 'warn');
  PIPELINE.forEach(s => {
    const p = document.getElementById(`pill-${s}`);
    if (p?.className.includes('pill-running')) setPill(s, 'idle');
  });
  PIPELINE.forEach(s => invoke('stop_stage', { stage: s }).catch(() => {}));
}

// ── Тест-мок ───────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTest(stage) {
  for (let i = 1; i <= 3; i++) {
    if (!pipelineRunning) throw new Error('Остановлено');
    clog(`шаг ${i}/3`, 'log', stage);
    await sleep(500);
  }
}

// ── Рабочий режим ──────────────────────────────────────────────
function waitForStage(stage) {
  return new Promise(async (resolve, reject) => {
    const guard = setInterval(() => {
      if (!pipelineRunning) { clearInterval(guard); reject(new Error('Остановлено')); }
    }, 300);
    const unlisten = await listen('stage-status', (evt) => {
      if (evt.payload.stage !== stage) return;
      const s = evt.payload.status;
      if (s === 'done' || s === 'error') {
        clearInterval(guard);
        unlisten();
        s === 'done' ? resolve() : reject(new Error(`Ошибка: ${stage}`));
      }
    });
  });
}

async function runReal(stage) {
  switch (stage) {
    case 'pdm': {
      const s = await invoke('get_settings');
      await invoke('vault_get_bom', { partNumber: s.vault_part_number || '' });
      try {
        const xmlPath = await invoke('bom_to_xml');
        clog(`BOM → XML: ${xmlPath}`, 'ok', 'pdm');
      } catch (e) {
        clog(`XML конвертация: ${e}`, 'warn', 'pdm');
      }
      break;
    }
    case 'excel':
    case 'autocad': {
      const waiter = waitForStage(stage);
      await invoke('run_stage', { stage });
      await waiter;
      break;
    }
    case 'plantsim': {
      const s = await invoke('get_settings');
      // D-07/D-03: find_plantsim_shortcut проверяет lnk — если ошибка config: — показать диалог
      let lnkPath;
      try {
        lnkPath = await invoke('find_plantsim_shortcut');
      } catch (e) {
        const msg = String(e.message || e);
        if (msg.startsWith('config:')) { showConfigError(msg); }
        else { clog(msg, 'err', 'plantsim'); }
        throw new Error(msg);
      }
      const method = s.sim_method || '';
      const waiter = waitForStage('plantsim');
      try {
        await invoke('run_plantsim', { lnkPath, method });
      } catch (e) {
        const msg = String(e.message || e);
        if (msg.startsWith('config:')) { showConfigError(msg); }
        else { clog(msg, 'err', 'plantsim'); }
        throw new Error(msg);
      }
      await waiter;
      break;
    }
    default:
      throw new Error(`Неизвестный этап: ${stage}`);
  }
}

// ── Настройки ──────────────────────────────────────────────────
const settingsOverlay = document.getElementById('settingsOverlay');

// Показывает ошибку конфигурации (паттерн D-13 Phase 3)
// msg — строка ошибки от Rust (начинается с "config: ...")
function showConfigError(msg) {
  // Убрать префикс "config: " для отображения
  const display = msg.startsWith('config: ') ? msg.slice(8) : msg;
  const confirmed = confirm(display + '\n\nОткрыть настройки?');
  if (confirmed) {
    settingsOverlay.classList.add('open');
    loadSettings();
  }
}

document.getElementById('btnSettings').addEventListener('click', () => {
  settingsOverlay.classList.add('open');
  loadSettings();
});
document.getElementById('btnCloseSettings').addEventListener('click', () => {
  settingsOverlay.classList.remove('open');
});
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
});

async function loadSettings() {
  try {
    const s = await invoke('get_settings');
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set('inputPlantSimShortcut', s.plant_sim_shortcut);
    set('inputSppPath',          s.spp_path);
    set('inputWorkDir',          s.work_dir);
    set('inputSimMethod',        s.sim_method);
    set('inputVaultUrl',         s.vault_url);
    set('inputVaultToken',       s.vault_token);
    set('inputVaultPartNumber',  s.vault_part_number);
    set('inputSimTimeout', s.sim_timeout_minutes > 0 ? String(s.sim_timeout_minutes) : '');
  } catch (e) { console.error(e); }
}

document.getElementById('btnSave').addEventListener('click', async () => {
  try {
    const s = await invoke('get_settings');
    const g = id => document.getElementById(id)?.value || '';
    await invoke('save_settings', { settings: {
      ...s,
      plant_sim_shortcut:  g('inputPlantSimShortcut'),
      spp_path:            g('inputSppPath'),
      sim_method:          g('inputSimMethod'),
      vault_url:           g('inputVaultUrl'),
      vault_token:         g('inputVaultToken'),
      vault_part_number:   g('inputVaultPartNumber'),
      sim_timeout_minutes: parseInt(g('inputSimTimeout'), 10) || 0,
      work_dir:            g('inputWorkDir'),
    }});
    showToast('Настройки сохранены', 'success');
    settingsOverlay.classList.remove('open');
  } catch { showToast('Ошибка сохранения', 'error'); }
});

document.querySelectorAll('.browse-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const targetId = btn.dataset.target;
    try {
      let selected;
      if (btn.dataset.type === 'folder') {
        selected = await invoke('pick_folder', { title: 'Выберите папку', defaultPath: '' });
      } else {
        const filter =
          targetId === 'inputPlantSimShortcut' ? 'Ярлык (*.lnk)|*.lnk|Все файлы (*.*)|*.*' :
          targetId === 'inputSppPath'           ? 'Plant Simulation Model (*.spp)|*.spp|Все файлы (*.*)|*.*' :
                                                  'Все файлы (*.*)|*.*';
        selected = await invoke('pick_file', { title: 'Выберите файл', filter, defaultPath: '' });
      }
      if (selected) document.getElementById(targetId).value = selected;
    } catch (e) { console.error(e); }
  });
});

// ── Toasts ─────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast${type ? ' ' + type : ''}`;
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
