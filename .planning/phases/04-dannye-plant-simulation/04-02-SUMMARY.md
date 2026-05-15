---
phase: 04-dannye-plant-simulation
plan: 02
subsystem: bratsy-tauri/src
completed: 2026-05-15
status: done
tags: [javascript, html, plantsim, simtalk, config-error-handling]
dependency_graph:
  requires: [04-01-PLAN.md]
  provides: [plantsim-pipeline-frontend]
  affects:
    - bratsy-tauri/src/index.html
    - bratsy-tauri/src/main.js
    - bratsy-tauri/docs/simtalk-template.md
tech_stack:
  added: []
  patterns: [config-error-dialog-pattern, showConfigError-D13, inputSimTimeout-number-field]
key_files:
  created:
    - bratsy-tauri/docs/simtalk-template.md
  modified:
    - bratsy-tauri/src/index.html
    - bratsy-tauri/src/main.js
decisions:
  - D-09: поле inputSimTimeout (type=number, placeholder=2) в панели настроек PLANT SIMULATION
  - D-13: showConfigError(msg) — confirm-диалог + «Открыть настройки» (паттерн из Phase 3)
  - D-03/D-07: перехват config:-ошибок в runReal plantsim из find_plantsim_shortcut и run_plantsim
  - D-08: invoke run_plantsim вызывается только с {lnkPath, method} — Rust читает spp_path/work_dir из get_settings()
metrics:
  duration: ~15 min
  completed: 2026-05-15
  tasks_total: 2
  tasks_completed: 2
  files_modified: 2
  files_created: 1
---

# Phase 04 Plan 02: Frontend + SimTalk документация Phase 4

**One-liner:** Поле таймаута симуляции в настройках, showConfigError() с confirm-диалогом, перехват config:-ошибок в runReal plantsim, SimTalk-шаблон с 3 вариантами и диагностикой.

## Выполнено

### Задача 1: index.html + main.js

- `index.html`: поле `inputSimTimeout` добавлено в секцию PLANT SIMULATION между `inputSimMethod` и `VAULT PDM API` (D-09, type=number, min=1, max=999, placeholder=2)
- `main.js`: `showConfigError(msg)` — confirm-диалог с текстом ошибки, при подтверждении открывает панель настроек через `settingsOverlay.classList.add('open')` + `loadSettings()` (паттерн D-13 Phase 3)
- `main.js`: `loadSettings()` заполняет `inputSimTimeout` из `s.sim_timeout_minutes > 0 ? String(...) : ''`
- `main.js`: `btnSave` сохраняет `sim_timeout_minutes: parseInt(g('inputSimTimeout'), 10) || 0`
- `main.js`: `runReal('plantsim')` — два try/catch блока: для `find_plantsim_shortcut` и `run_plantsim`, каждый перехватывает `msg.startsWith('config:')` и вызывает `showConfigError(msg)`, иначе — `clog(msg, 'err', 'plantsim')`
- `invoke('run_plantsim')` вызывается с `{ lnkPath, method }` — без sppPath/workDir (Rust читает их сам через get_settings())

### Задача 2: bratsy-tauri/docs/simtalk-template.md

- Создана директория `bratsy-tauri/docs/`
- Файл содержит 3 рабочих варианта SimTalk-кода:
  - Вариант 1: `getCommandLineArg("--workdir", workDir)` — рекомендуется
  - Вариант 2: хардкод пути — быстрее для отладки
  - Вариант 3: `endSim` hook — для длинных симуляций
- Контракт results.txt: ключи `load`, `throughput`, `cycle_time`
- `fi.close` ПЕРЕД `exitApplication` во всех вариантах
- Секция диагностики: Prohibit access, fi.open проверка, кодировка, метод не выполняется, симуляция не останавливается
- Ручная проверка: cmd-команда для тестирования вне DP_orchestra

## Файлы изменены

- `bratsy-tauri/src/index.html` — поле inputSimTimeout в секции PLANT SIMULATION
- `bratsy-tauri/src/main.js` — showConfigError(), loadSettings, btnSave, runReal plantsim

## Файлы созданы

- `bratsy-tauri/docs/simtalk-template.md` — SimTalk-шаблон (3 варианта + диагностика)

## Milestone v1 статус

После планов 04-01 и 04-02 все технические изменения Phase 4 выполнены.
Сквозной тест на реальном PlantSim — следующий шаг (заводской ПК).

## Верификация

- `grep -c "inputSimTimeout" bratsy-tauri/src/index.html` = 1
- `grep -c "inputSimTimeout" bratsy-tauri/src/main.js` = 2 (loadSettings + btnSave)
- `grep -c "showConfigError" bratsy-tauri/src/main.js` = 3 (объявление + 2 вызова)
- `grep -c "sim_timeout_minutes" bratsy-tauri/src/main.js` = 2 (loadSettings + btnSave)
- `bratsy-tauri/docs/simtalk-template.md` существует, содержит getCommandLineArg (3 раза), exitApplication (6 раз)
- `cargo build` в bratsy-tauri/src-tauri/ завершён без ошибок (Rust не изменялся)

## Deviations from Plan

None — план выполнен точно как написан.

## Known Stubs

None — все поля подключены к реальным данным (Settings.sim_timeout_minutes уже реализован в Rust в Plan 01).

## Threat Flags

None — T-4-06 и T-4-07 из threat_model плана закрыты реализацией (type="number" + parseInt, путь показывается только локальному пользователю).

## Self-Check: PASSED

- bratsy-tauri/src/index.html: содержит inputSimTimeout с type="number", placeholder="2", label "Таймаут симуляции (мин)"
- bratsy-tauri/src/main.js: содержит showConfigError(), inputSimTimeout в loadSettings и btnSave, config: проверки в runReal
- bratsy-tauri/docs/simtalk-template.md: существует, содержит все 3 варианта SimTalk-кода
- cargo build: Finished без ошибок
