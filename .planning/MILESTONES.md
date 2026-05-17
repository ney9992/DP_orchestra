# MILESTONES — DP_orchestra

## v1.0: Plant Simulation MVP

**Status:** ✅ Shipped 2026-05-17
**Phases:** 1-4 | **Plans:** 9 | **Tasks:** ~25
**Timeline:** 2026-03-19 → 2026-05-17 (59 days)
**Git:** 420 commits, 102 files changed, +20 738 lines

### Delivered

Tauri v2 (Rust + WebView2) Windows-приложение: пользователь задаёт пути через панель настроек, запускает Tecnomatix Plant Simulation, видит статус и лог в реальном времени, получает числовые результаты симуляции в UI. Полная цепочка: настройки → запуск → ожидание → результаты.

### Key Accomplishments

1. **Settings panel (Phase 1):** Gear-button + sliding overlay + settings.json persistence. Поля: shortcut (.lnk), spp_path, work_dir, sim_method, timeout, vault credentials
2. **Pipeline control (Phase 2):** Rust ProcessMap + async run_stage/stop_stage + stage-status/stage-log Tauri events + pill статусы + toast уведомления + real-time лог
3. **PlantSim stub (Phase 3):** mock-plantsim.ps1 — dev-заглушка с контрактом results.txt D-07
4. **PlantSim backend (Phase 3+4):** find_plantsim_shortcut, run_plantsim с Arguments `-f "{spp}" /E {method} --workdir "{work_dir}"`, results.txt из work_dir, history/архив, mpsc-таймаут, taskkill при timeout/stop
5. **PlantSim frontend (Phase 3+4):** 3 числовых карточки reportGridDyn, showConfigError() диалог, config:-перехват, inputSppPath/inputWorkDir поля с нативными диалогами
6. **SimTalk документация:** bratsy-tauri/docs/simtalk-template.md с 3 вариантами кода, getCommandLineArg, exitApplication, диагностика Prohibit access

### Requirements

10/10 requirements complete (100%)

### Known Deferred Items

- CR-01: set(id, val) guard data-loss на пустых значениях (advisory, code review)
- CR-02: dangling stage-status listeners в waitForStage (advisory)
- Human UAT: smoke-test на реальном PlantSim + config-error dialog (требует PlantSim runtime)

### Archive

- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
