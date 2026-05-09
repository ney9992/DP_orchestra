# Phase 3: Интеграция Plant Simulation — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Пользователь запускает реальную симуляцию Tecnomatix Plant Simulation через кнопку в UI и видит числовые результаты (загрузка линии, пропускная способность, время цикла) сразу после завершения.

Входит в скоуп: запуск PlantSim.exe с .spp и .spm файлами, чтение results.txt из work_dir, отображение 3 числовых показателей в новой панели, диалог ошибки с кнопкой «Открыть настройки», 2 новых поля в панели настроек.
Не входит: написание SimTalk-макроса (делается отдельно командой), AutoCAD/Vault/Excel интеграции.

</domain>

<decisions>
## Implementation Decisions

### Запуск Plant Simulation

- **D-01:** Метод запуска — прямой вызов exe: `"<plant_sim_exe>" /S:"<plant_sim_macro>" "<plant_sim_path>"`. Не через COM, не через PowerShell-обёртку.
- **D-02:** Путь к PlantSimulation.exe — хранится в настройках приложения (новое 4-е поле в settings.json и панели настроек).
- **D-03:** Путь к .spm макросу — хранится в настройках приложения (новое 5-е поле в settings.json и панели настроек). Вместе с plant_sim_path (.spp) — итого 3 поля связанных с PlantSim.
- **D-04:** Rust запускает exe через `Command::new(&plant_sim_exe).args(["/S", &plant_sim_macro, &plant_sim_path])` — аналогично паттерну Phase 2, но без PowerShell-обёртки.
- **D-05:** Stdout/stderr процесса PlantSim стримится в stage-log события (существующий механизм Phase 2). Stderr — `Stdio::null()` (по CR-01 из Phase 2).

### Источник результатов

- **D-06:** Макрос (SimTalk) записывает результаты в файл `work_dir/results.txt` после завершения симуляции.
- **D-07:** Формат файла — `key=value` построчно (контракт между макросом и приложением):
  ```
  load=87.3
  throughput=42
  cycle_time=18.5
  ```
  Rust парсит файл стандартными средствами (нет новых crate — только `std::fs::read_to_string` + split).
- **D-08:** Rust читает results.txt после завершения процесса (в `spawn_blocking`, после `child.wait()`). Если файл отсутствует после успешного завершения — результаты считаются отсутствующими (пустая панель, предупреждение в логе).
- **D-09:** Rust отправляет числа в JS через новое Tauri-событие `stage-results` с payload `{ stage: "plantsim", load: f32, throughput: f32, cycle_time: f32 }`.

### Отображение результатов

- **D-10:** Новая панель результатов под секцией `.stages` (аналогично лог-панели из Phase 2). Появляется сразу после завершения этапа PlantSim с CSS transition (height: 0 → auto).
- **D-11:** Внутри панели — 3 карточки с большими числами, аналогичные `.metric-card` из верхней панели метрик:
  - Загрузка линии — значение `load` + единица %
  - Пропускная способность — значение `throughput` + единица ед./ч
  - Время цикла — значение `cycle_time` + единица сек
- **D-12:** Панель скрыта по умолчанию. Показывается только после получения `stage-results` события от Rust.

### Обработка ошибок

- **D-13:** Ошибки конфигурации (exe не найден, .spp не найден, .spm не найден) → диалог с текстом описания проблемы + кнопка «Открыть настройки» (открывает settings panel). Проверяется в Rust до запуска процесса через `std::path::Path::exists()`.
- **D-14:** Ошибки выполнения (процесс завершился с ошибкой, results.txt не создан) → стандартный механизм Phase 2: stage-status: error + toast «Plant Simulation — ошибка». Без диалога.
- **D-15:** Диалог ошибки реализуется как JS-нативный `confirm()/alert()` или кастомный modal. При нажатии «Открыть настройки» — вызов `openSettings()` из Phase 1.

### Claude's Discretion

- Точные CSS-размеры панели результатов — аналогично log-panel, в стиле существующей схемы
- Поведение панели результатов если PlantSim запустить повторно — обновить числа или скрыть и показать снова
- Имена ключей в results.txt — можно менять при написании макроса, главное соответствие Rust-парсеру

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Существующий код (обязательно прочитать)
- `bratsy-tauri/src-tauri/src/lib.rs` — текущий run_stage (async+spawn_blocking), ProcessMap State, паттерн emit событий, stop_stage
- `bratsy-tauri/src-tauri/Cargo.toml` — зависимости: tauri 2, serde, serde_json
- `bratsy-tauri/src/main.js` — listen() для stage-status/stage-log, updatePill(), activeStages Set, DOMContentLoaded
- `bratsy-tauri/src/index.html` — структура UI: .stages секция, #logPanel, #toastContainer, .metric-card паттерн
- `bratsy-tauri/src/styles.css` — CSS-переменные, .log-panel/.log-panel.visible паттерн, .metric-card стили

### Phase контекст
- `.planning/phases/02-upravlenie-pajplajnom/02-CONTEXT.md` — D-11 (Tauri events), D-12 (ProcessMap State), паттерны Phase 2
- `.planning/phases/01-nastrojki-i-konfiguraciya/01-CONTEXT.md` — структура settings.json, паттерн добавления полей

### Требования
- `.planning/REQUIREMENTS.md` — INT-01, INT-02, PIPE-04
- `.planning/ROADMAP.md` — Phase 3 Success Criteria (4 конкретных критерия)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`run_stage` async pattern** (`lib.rs`) — скопировать структуру для plantsim: spawn_blocking, BufReader stdout, emit events. Добавить чтение results.txt после `child.wait()`.
- **ProcessMap State** — уже управляет PID, stop_stage работает; не нужно переделывать.
- **`listen('stage-status')` в main.js** — уже подписан на события; добавить `listen('stage-results')`.
- **`.log-panel` CSS паттерн** — CSS transition `max-height: 0 → 162px` + `.visible` класс — повторить для `.results-panel`.
- **`.metric-card` HTML/CSS** — уже есть в index.html и styles.css с числами и иконками — переиспользовать для 3 карточек результатов.
- **`openSettings()`** в main.js — вызывается при клике на gear-btn, можно вызвать напрямую из диалога ошибки.
- **`Settings` struct** (`lib.rs`) — добавить `plant_sim_exe: String` и `plant_sim_macro: String` к существующим 3 полям.

### Established Patterns
- **Команды Tauri v2**: `#[tauri::command] async fn` + `tauri::State<'_, ProcessMap>` + `tauri::AppHandle`
- **Emit события**: `app_handle.emit("event-name", Payload { ... })` + `use tauri::Emitter`
- **Настройки**: Settings struct → serde_json в settings.json → `get_settings`/`save_settings` команды
- **Панель настроек**: HTML `.field-group` + browse-btn + field-error — готовый паттерн для 2 новых полей

### Integration Points
- `run_stage("plantsim", ...)` — сейчас запускает mock-скрипт; Phase 3 заменяет на реальный запуск PlantSim.exe
- После `child.wait()` в spawn_blocking — добавить: прочитать work_dir/results.txt → parse key=value → emit "stage-results"
- Настройки (Phase 1): `Settings` struct нужно расширить, панель настроек — добавить 2 поля

</code_context>

<specifics>
## Specific Ideas

- Формат results.txt контракт: `load=87.3\nthroughput=42\ncycle_time=18.5` — Rust парсит, SimTalk пишет
- Команда запуска: `PlantSimulation.exe /S:"macro.spm" "file.spp"` — уточнить флаги при тестировании
- Диалог ошибки с кнопкой «Открыть настройки» — при нажатии вызывает JS `openSettings()`

</specifics>

<deferred>
## Deferred Ideas

- Реальные PowerShell-скрипты для AutoCAD, Vault PDM, Excel — Phase позже
- История запусков (когда, результат, кто) — после Phase 3
- Запуск полного пайплайна одной кнопкой — зависит от Phase 3

</deferred>

---

*Phase: 3-integraciya-plant-simulation*
*Context gathered: 2026-05-10*
