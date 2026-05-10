---
phase: 03-integraciya-plant-simulation
plan: "02"
subsystem: frontend
tags: [html, css, javascript, tauri, plant-simulation, results-panel, settings]

requires:
  - phase: 03-integraciya-plant-simulation
    plan: "01"
    provides: "Settings struct с plant_sim_exe/plant_sim_macro, stage-results event с payload {load, throughput, cycle_time}"

provides:
  - "2 новых поля в панели настроек: #inputPlantSimExe, #inputPlantSimMacro"
  - "Панель результатов #resultsPanel с 3 metric-card карточками (#resLoad, #resThroughput, #resCycleTime)"
  - "listen('stage-results') обновляющий DOM и показывающий панель результатов"
  - "showConfigError(message) — диалог с кнопкой 'Открыть настройки' через confirm()"
  - "showResultsPanel(visible) — управление видимостью через CSS class .visible"
  - "CSS .results-panel с max-height transition (0 -> 160px)"

affects: [03-03-smoke-test]

tech-stack:
  added: []
  patterns:
    - "CSS max-height transition (0 -> 160px) для show/hide панели — не height:auto (anti-pattern)"
    - "config: error prefix discrimination in catch: config: -> showConfigError, иначе -> toast"
    - "listen('stage-results') pattern аналогичен listen('stage-log') из Phase 2"
    - "showResultsPanel по паттерну showLogPanel — add/remove class .visible"

key-files:
  created: []
  modified:
    - bratsy-tauri/src/index.html
    - bratsy-tauri/src/main.js
    - bratsy-tauri/src/styles.css

key-decisions:
  - "max-height: 160px (не auto) в .results-panel.visible — CSS transition не работает с auto"
  - "showConfigError использует confirm() для диалога — нативный, без зависимостей, вызывает openSettings()"
  - "Повторный listen('stage-results') idempotent — showResultsPanel(true) на уже видимой панели только добавляет класс повторно"
  - "Валидация plantSimExe и plantSimMacro добавлена в массив — те же пустые-строки условия что и у других полей"

duration: 3min
completed: 2026-05-10
---

# Phase 03 Plan 02: PlantSim Frontend Integration Summary

**Frontend панель результатов с 3 числовыми карточками, 2 новых поля настроек и JS-обработчик stage-results с диалогом ошибки конфигурации**

## Performance

- **Duration:** ~3 мин
- **Started:** 2026-05-10
- **Completed:** 2026-05-10
- **Tasks completed:** 3/4 (Task 4 — checkpoint:human-verify, ожидает пользователя)
- **Files modified:** 3

## Accomplishments

### Task 1: index.html
- Добавлены 2 новых `field-group` в панель настроек: `#inputPlantSimExe` (Путь к PlantSimulation.exe) и `#inputPlantSimMacro` (Путь к макросу SimTalk .spm)
- Добавлены соответствующие поля ошибок: `#errPlantSimExe`, `#errPlantSimMacro`
- Добавлена панель результатов `#resultsPanel` с 3 metric-card карточками: `#resLoad` (%), `#resThroughput` (ед./ч), `#resCycleTime` (сек)
- Панель скрыта по умолчанию (без класса `.visible`), управляется CSS max-height transition

### Task 2: main.js
- Разветвлённый catch в invoke('run_stage'): `e.startsWith('config:')` → `showConfigError()`, иначе стандартный Phase 2 механизм (D-13 vs D-14)
- Добавлена функция `showResultsPanel(visible)` по паттерну `showLogPanel`
- Добавлена функция `showConfigError(message)`: `confirm()` диалог с кнопкой «Открыть настройки» → `openSettings()` (D-15)
- Расширен save_settings: переменные `plantSimExe`, `plantSimMacro`; добавлены в массив валидации и в объект `invoke('save_settings')` как `plant_sim_exe`, `plant_sim_macro`
- Расширена загрузка настроек: `s.plant_sim_exe` → `#inputPlantSimExe`, `s.plant_sim_macro` → `#inputPlantSimMacro`
- Добавлен `listen('stage-results')` обновляющий `resLoad`/`resThroughput`/`resCycleTime` и вызывающий `showResultsPanel(true)` (D-12)

### Task 3: styles.css
- Добавлен `.results-panel` с `max-height: 0`, `opacity: 0`, `transition: max-height 0.35s` — скрытое состояние
- Добавлен `.results-panel.visible` с `max-height: 160px` (не auto — anti-pattern), `opacity: 1` — видимое состояние
- Добавлен `.results-header`: uppercase label стиль (аналог log-header)
- Добавлен `.results-body`: flex layout с gap 12px и padding
- Добавлен `.metric-unit`: 11px, `var(--text-sec)` для единиц измерения под числами

## Task Commits

1. **Task 1: HTML — 2 новых поля настроек + панель результатов** — `df41db5` (feat)
2. **Task 2: JS — listen stage-results, showResultsPanel, showConfigError** — `4d8af93` (feat)
3. **Task 3: CSS — .results-panel с max-height transition + .metric-unit** — `1fda099` (feat)

## Files Created/Modified

- `bratsy-tauri/src/index.html` — 2 field-group + #resultsPanel с 3 metric-card (59 строк добавлено)
- `bratsy-tauri/src/main.js` — 6 изменений: catch, showResultsPanel, showConfigError, save/load расширение, listen (60 строк добавлено, 16 удалено)
- `bratsy-tauri/src/styles.css` — .results-panel, .results-panel.visible, .results-header, .results-body, .metric-unit (42 строки добавлено)

## Decisions Made

- `max-height: 160px` вместо `auto` в `.results-panel.visible` — CSS transition не работает с `auto` (Pitfall #4 из RESEARCH.md)
- `showConfigError` использует нативный `confirm()` без дополнительных зависимостей — соответствует D-15
- Валидация новых полей (`plantSimExe`, `plantSimMacro`) добавлена в тот же массив `[[val, inputId, errId]]` — единый механизм валидации
- `background: var(--gray-light)` для `.results-panel` — переменная объявлена в :root и используется в существующих компонентах

## Deviations from Plan

None — план выполнен точно в соответствии с указаниями.

## Known Stubs

None — все функции полностью реализованы. Числа в карточках (`#resLoad`, `#resThroughput`, `#resCycleTime`) обновляются реальными данными из события `stage-results`, которое Rust отправляет после парсинга `results.txt`.

## Threat Flags

- **T-02-04 (mitigate):** `.metric-unit` объявлен как глобальный класс в конце styles.css. Конфликтов с существующими стилями не обнаружено — класс ранее не использовался в файле. Если в будущем потребуется уточнение — использовать `.results-body .metric-unit`.

## Checkpoint Status

**Task 4 (checkpoint:human-verify)** — НЕ выполнена (smoke-тест с mock-plantsim). Ожидает подтверждения от пользователя.

## Self-Check: PASSED

- Files: index.html FOUND, main.js FOUND, styles.css FOUND
- Commits: df41db5 FOUND, 4d8af93 FOUND, 1fda099 FOUND
- All 15 success criteria: PASSED

---
*Phase: 03-integraciya-plant-simulation*
*Completed: 2026-05-10*
