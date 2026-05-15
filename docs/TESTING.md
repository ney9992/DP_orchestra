<!-- generated-by: gsd-doc-writer -->
# TESTING.md — DP_orchestra (Цифровой завод)

## Test framework and setup

The project has **no automated test suite**. There are no unit, integration, or end-to-end test files in the codebase, and no test framework (`jest`, `vitest`, `pytest`, etc.) is installed. All validation is done through manual exploratory testing and a mock tool for the simulation pipeline.

Required before testing:

1. Build the dev server:
   ```bash
   cd bratsy-tauri
   npx tauri dev
   ```
2. Or build and install the production artifact:
   ```powershell
   powershell -ExecutionPolicy Bypass -File make-release.ps1
   ```

## Running tests

### Development build (manual testing entry point)

```bash
cd bratsy-tauri
npx tauri dev
```

This launches the Tauri window in dev mode with hot-reload. The window opens maximized (`"maximized": true` in `tauri.conf.json`). Use it to exercise the full UI manually.

### Mock PlantSimulation

`bratsy-tauri/dev-tools/mock-plantsim.ps1` replaces `PlantSimulation16.exe` for development without the real Siemens software installed.

**Setup:**

1. Create a `.lnk` shortcut whose target is `powershell -File "<absolute-path>\mock-plantsim.ps1"`.
2. Open Settings (gear icon) in the app and point `plant_sim_shortcut` to that `.lnk` file.
3. Also set `spp_path` (path to a `.spp` model file) and optionally `sim_method` in Settings.
4. Click "Запуск Цифрового завода" in the footer to start the full pipeline. The Tecnomatix stage runs automatically as part of the pipeline.

**What the mock does:**

- Accepts `/S <macro>` and a positional `.spp` path argument (same calling convention as real Plant Simulation).
- Writes `results.txt` to the directory of the `.spp` file (or current directory if the file path does not resolve) with `key=value` lines (UTF-8, no BOM):
  ```
  load=87.3
  throughput=42
  cycle_time=18.5
  oee=78.5
  wip=12
  lead_time=24.5
  bottleneck=Сварочная_станция
  ```
- Exits with code 0 after approximately 2 seconds.

The app backend reads `results.txt` after the process exits and emits a `stage-results` Tauri event. Each `key=value` line becomes one card in the **ОТЧЁТ** tab of the right panel. The number and names of keys are dynamic — any `key=value` line in `results.txt` is parsed and displayed, not only the seven shown above.

**Extending the mock for realistic testing:**

To test with additional or different result keys (e.g., `Production rate`, `Loading station_1`, etc.), edit the `$content` heredoc in `mock-plantsim.ps1` and add any `key=value` lines. The report will render a card per line automatically.

## Manual test checklist

Run these scenarios manually after every significant change to `src/main.js`, `src-tauri/src/lib.rs`, or `src/index.html`.

### Pipeline launch flow

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Click "Запуск Цифрового завода" button in the footer | Button changes to "Остановить" (pause icon); Step 1 tag starts counting `1 / 3 загружено` as each import stage completes |
| 2 | All three import stages (PDM, Excel, AutoCAD) complete in test mode | Step 1 accordion collapses to `step-done` with a ✓ badge; Step 2 (Симуляция) unlocks and becomes active |
| 3 | Tecnomatix stage completes in test mode | Step 2 collapses to `step-done`; Step 3 (Отчёт) unlocks and becomes active with tag "Результаты получены" |
| 4 | Inspect Step 3 accordion body | Shows hint text only: "Результаты доступны на вкладке ОТЧЁТ в правой панели" — no report grid in the accordion body |
| 5 | Right panel switches automatically to ОТЧЁТ tab after plantsim completes | Report cards appear in the right panel; each card shows a key and its value |
| 6 | Click "↺ Новый расчёт" (or click "Запуск" again) | All pipeline state resets; accordion returns to Step 1 active, report grid clears, КОНСОЛЬ tab becomes active |

### Mode toggles

| # | Action | Expected result |
|---|--------|-----------------|
| 7 | Toggle any stage card from "Тест" to "Реал" and close the app | `localStorage.mode_<stage>` set to `"real"`; toggle state persists on next open |
| 8 | Toggle all stages to "Тест", launch pipeline | All stages run JS mock (`runTest`): three 500 ms log steps per stage; no Rust backend calls |
| 9 | Toggle Tecnomatix to "Реал", launch pipeline with valid `spp_path` and `plant_sim_shortcut` set | Backend `run_plantsim` is invoked; after Plant Simulation exits, `results.txt` is read and cards appear in ОТЧЁТ tab |

### Visual Components card

| # | Action | Expected result |
|---|--------|-----------------|
| 10 | Inspect Visual Components card in Step 2 | Card has `card-disabled` class; appears grayed out and is not clickable; pipeline skips it |

### Panel resize handle

| # | Action | Expected result |
|---|--------|-----------------|
| 11 | Drag the vertical resize handle between left and right panels | Left panel width changes; clamped to 20–80% of the content grid |
| 12 | Release drag and reload or reopen the app | Left panel restores to the saved width (`panelLeftPct` key in `localStorage`) |

### Settings persistence

| # | Action | Expected result |
|---|--------|-----------------|
| 13 | Save `spp_path` and `sim_method` via Settings panel | Values persisted to `settings.json` next to the executable |
| 14 | Close and reopen the app | `spp_path` and `sim_method` fields pre-filled from saved `settings.json` |
| 15 | Save `plant_sim_shortcut` via Settings panel | Value persisted to `settings.json`; `find_plantsim_shortcut` command resolves path on next launch |
| 16 | Open Settings and set `vault_url` to a non-empty value | Real Vault PDM mode becomes active for `pdm` stage in pipeline |

### PDM real mode and BOM-to-XML

| # | Action | Expected result |
|---|--------|-----------------|
| 17 | Toggle Vault PDM to "Реал" with valid `vault_url` and `vault_token`, launch pipeline | Backend calls `GET {vault_url}/api/v1/bom`; Authorization header sent as `token {vault_token}` (not `Bearer`) |
| 18 | After successful PDM stage in real mode | `bom.json` written to the writable directory; then `bom_to_xml` is called and `bom.xml` written to the same directory; log shows `BOM → XML: <path>` |
| 19 | If `bom_to_xml` fails (e.g., `bom.json` absent) | Log shows `XML конвертация: <error>` as a warning; PDM stage is not marked as failed |

### Vault mock (empty `vault_url`)

| # | Action | Expected result |
|---|--------|-----------------|
| 20 | Open Settings, leave `vault_url` blank, toggle PDM to "Реал", launch pipeline | Log shows `[mock] Vault URL не задан — загружаю тестовые данные`; `bom.json` written with 7-item mock BOM |
| 21 | After mock BOM load | `vault-bom` event fires; log shows `BOM: МЧД-001 — 7 поз.`; `bom.xml` written; step counter increments |

### Encoding and file paths

| # | Action | Expected result |
|---|--------|-----------------|
| 22 | Use a `.spp` file path containing Cyrillic characters (e.g., `C:\Проекты\модель.spp`) | File picker returns the path correctly; `run_plantsim` receives the unmangled path |
| 23 | `results.txt` contains Cyrillic in a value field (e.g., `bottleneck=Сварочная_станция`) | Report card in ОТЧЁТ tab shows the value correctly (UTF-8 decoded) |

### Release artifact

| # | Action | Expected result |
|---|--------|-----------------|
| 24 | Run `make-release.ps1` | Script reads `version` from `bratsy-tauri/src-tauri/tauri.conf.json` and packs the installer matching `*${version}*-setup.exe` |
| 25 | Launch the installed app | App header shows version matching `tauri.conf.json` (currently `0.3.0`) |
| 26 | Inspect `index.html` cache-busting query strings | `styles.css?v=0.3.0` and `main.js?v=0.3.0` match `tauri.conf.json` version |

### Console and report tabs

| # | Action | Expected result |
|---|--------|-----------------|
| 27 | Click the КОНСОЛЬ tab during a pipeline run | Live log lines appear with timestamps and stage tags as `stage-log` events arrive |
| 28 | Click the ОТЧЁТ tab before any simulation has run | Shows empty-state text "Данные появятся после завершения симуляции" |
| 29 | After plantsim completes | ОТЧЁТ tab is automatically focused; dynamic cards appear — one per `key=value` line in `results.txt` |
| 30 | Click "Очистить" button in КОНСОЛЬ tab | Console body is cleared; a single "Консоль очищена." system line appears |

## Coverage requirements

No coverage threshold is configured. There is no automated test runner and no coverage tooling in the project.

## CI integration

No CI/CD pipeline is configured. There are no `.github/workflows/` files in the repository. All builds and releases are produced locally by running `make-release.ps1`.

## Known issues and limitations

- **`stage-results` may not fire if PlantSim closes before writing `results.txt`.** The Rust backend reads `results.txt` only after `Start-Process -Wait` returns with exit code 0. If the real Plant Simulation exits non-zero or crashes before writing the file, the ОТЧЁТ tab will not populate (log shows `[warning] results.txt не найден — результаты недоступны`).
- **`Start-Process -FilePath <lnk> -Wait` reliability.** On some Windows versions, this pattern may return before the launched process actually finishes. When testing with the real Siemens software, verify that `results.txt` is present before the app backend reads it. The mock is not affected because it writes the file synchronously before exiting.
- **Visual Components card is permanently disabled.** The `card-disabled` class is set in `index.html` directly. There is no runtime toggle for it — this integration is not yet implemented.
- **`results.txt` location.** The backend writes and reads `results.txt` from `writable_dir()`: the executable directory first, then `%APPDATA%\Digital Factory\`, then `%LOCALAPPDATA%\Digital Factory\`. The mock script writes to the `.spp` parent directory (or `cwd`), which may differ. For end-to-end testing with the mock in real mode, confirm both paths resolve to the same directory or adjust accordingly.
