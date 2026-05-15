# Phase 4: Данные Plant Simulation — Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Rust-сторона и UI реализованы в Phase 3. Phase 4 — сквозная отладка и финальная состыковка данных: согласовать формат results.txt между Rust и SimTalk-макросом, добавить передачу пути к .spp и work_dir через Arguments ярлыка, реализовать таймаут с taskkill и архивирование истории запусков. После Phase 4 milestone v1 закрыт.

Входит в скоуп: изменения в lib.rs (аргументы, таймаут, stop, путь к results.txt, архивирование), новое поле таймаута в Settings/панели настроек, документация SimTalk-шаблона.
Не входит: UI для сравнения исторических запусков (v2), написание самого SimTalk-макроса (делается командой отдельно).

</domain>

<decisions>
## Implementation Decisions

### Путь к results.txt

- **D-01:** SimTalk-макрос читает путь к рабочей директории через `getCommandLineArg("--workdir", workDir)`, пишет в `{workDir}\results.txt`.
- **D-02:** Rust передаёт `work_dir` из Settings как `--workdir "{work_dir}"` в Arguments ярлыка (часть строки аргументов при модификации .lnk через WScript.Shell).
- **D-03:** Если `work_dir` пуст — блокировать запуск до WScript.Shell и показать диалог ошибки с кнопкой «Открыть настройки» (паттерн D-13 из Phase 3). Проверяется через `settings.work_dir.is_empty()`.
- **D-04:** Rust читает results.txt из `settings.work_dir` (а не `writable_dir()`). Изменить: `lnk_dir = PathBuf::from(&settings.work_dir)`.
- **D-05:** При повторном запуске Rust **не удаляет** results.txt перед запуском. После чтения результатов — создаёт архивный файл `work_dir/history/YYYY-MM-DD_HH-MM-SS.txt` с метаданными (timestamp, версия приложения из константы, spp_path, method, work_dir) + все строки из results.txt. SimTalk перезаписывает results.txt при каждом запуске.

### Аргументы запуска PlantSim

- **D-06:** Полная строка Arguments в .lnk: `-f "{spp_path}" /E {method} --workdir "{work_dir}"`. Формируется в Rust при модификации ярлыка через WScript.Shell. Пример:
  ```
  $s.Arguments='-f "C:\models\factory.spp" /E .UserObjects.printed --workdir "C:\bratsy_work"'
  ```
- **D-07:** Если `spp_path` пуст или `Path::exists()` возвращает false — блокировать запуск и показать диалог ошибки с кнопкой «Открыть настройки» (аналогично D-13 Phase 3). Проверяется до WScript.Shell.
- **D-08:** Поле `spp_path` уже есть в Settings. Передаётся в `run_plantsim` как параметр или берётся из `get_settings()` внутри функции (согласовать с существующим паттерном — `lnk_path` уже передаётся из JS).

### Таймаут и принудительное завершение

- **D-09:** Таймаут настраивается через новое поле `sim_timeout_minutes: u32` в Settings (панель настроек — новое поле рядом с sim_method). По умолчанию: 2 минуты. Если поле пустое или 0 — использовать 2.
- **D-10:** Реализация таймаута в `spawn_blocking`: вместо `child.wait()` — `child.wait_timeout(Duration::from_secs(timeout_secs))` или через `wait_with_output` с параллельным timer-потоком. При срабатывании таймаута: `taskkill /F /IM PlantSimulation*.exe /T` + лог-сообщение «Таймаут истёк — Plant Simulation принудительно завершён».
- **D-11:** Кнопка Stop: убивает PowerShell-процесс (существующий механизм через PID) И дополнительно выполняет `taskkill /F /IM PlantSimulation*.exe /T`. Лог: «Остановлено принудительно — Plant Simulation завершён».

### Архивирование результатов

- **D-12:** После успешного чтения results.txt Rust создаёт `{work_dir}/history/{YYYY-MM-DD}_{HH-MM-SS}.txt` с заголовком:
  ```
  # DP_orchestra run {YYYY-MM-DD HH:MM:SS}
  # version={APP_VERSION}
  # spp={spp_path}
  # method={method}
  # work_dir={work_dir}
  # ---
  {содержимое results.txt}
  ```
  Папка `history/` создаётся автоматически (`std::fs::create_dir_all`).
- **D-13:** Если results.txt отсутствует после завершения PlantSim — архивный файл не создаётся, только лог-предупреждение (существующее поведение).

### Claude's Discretion

- Точное имя процесса для taskkill — уточнить на реальном заводском ПК: `PlantSimulation16.exe` или иное. Использовать wildcard `PlantSimulation*.exe` как fallback.
- Константа версии приложения — добавить `const APP_VERSION: &str = env!("CARGO_PKG_VERSION")` в lib.rs.
- Реализация wait_timeout — если `std::process::Child::wait_timeout` недоступен (нет в stdlib), использовать `std::thread::spawn` + `child.wait()` в потоке + `receiver.recv_timeout(Duration::...)`.
- UI-метка для поля таймаута в панели настроек — «Таймаут симуляции (мин)», placeholder «2».

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Существующий код (изменения вносятся сюда)
- `bratsy-tauri/src-tauri/src/lib.rs` — `run_plantsim`, `find_plantsim_shortcut`, `writable_dir`, `Settings` struct, `stop_stage` (PID-kill логика). Все изменения Phase 4 идут в этот файл.
- `bratsy-tauri/src-tauri/Cargo.toml` — зависимости; новых crate не добавлять.
- `bratsy-tauri/src/main.js` — JS-сторона `invoke('run_plantsim', ...)` и `listen('stage-results')`. Возможно потребуется обновить параметры вызова.
- `bratsy-tauri/src/index.html` — панель настроек (field-group паттерн для нового поля таймаута).

### Phase контекст
- `.planning/phases/03-integraciya-plant-simulation/03-CONTEXT.md` — D-13 (паттерн диалога ошибки + «Открыть настройки»), D-06/D-07 (контракт results.txt), код run_plantsim Phase 3.
- `.planning/phases/04-dannye-plant-simulation/04-RESEARCH.md` — Pitfalls 1-7 (SimTalk gotchas), CLI-синтаксис PlantSim, SimTalk-шаблон, диагностический план для реального запуска.

### Требования
- `.planning/REQUIREMENTS.md` — (все требования v1 покрыты в Phase 1-3; Phase 4 закрывает milestone)
- `.planning/ROADMAP.md` — Phase 4 Success Criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`run_plantsim` в lib.rs (строки 334-453)** — основа Phase 4. Изменить: Arguments-строку (добавить `-f` и `--workdir`), путь чтения results.txt (work_dir вместо writable_dir), добавить архивирование и таймаут.
- **`stop_stage` в lib.rs** — убивает процесс по PID; дополнить вызовом taskkill PlantSim.
- **`Settings` struct (строки 11-21)** — добавить `sim_timeout_minutes: u32` с `#[serde(default)]`.
- **Паттерн диалога D-13 (Phase 3)** — `showConfigError(msg)` в main.js; переиспользовать для валидации spp_path и work_dir.
- **`.field-group` HTML паттерн в index.html** — переиспользовать для нового поля таймаута в панели настроек.
- **`find_plantsim_shortcut` (строка 323)** — паттерн валидации поля настроек с диалогом ошибки.

### Established Patterns
- **WScript.Shell Arguments** (строка 363-365): строка Arguments формируется в `format!()`, экранируется через `.replace('"', "\`\"")`.
- **spawn_blocking** (строка 417): `child.wait()` блокирует поток. Таймаут нужно реализовать вокруг этого вызова.
- **Emit stage-log** (строки 381-388): информационные сообщения в лог пишутся до запуска процесса.

### Integration Points
- `run_plantsim` получает `lnk_path` и `method` из JS; нужно добавить `spp_path` как параметр или читать из `get_settings()` внутри функции.
- Архивный файл создаётся после `spawn_blocking` завершился (уже в async-контексте).

</code_context>

<specifics>
## Specific Ideas

- Формат архивного файла: строки-комментарии с `#` как заголовок, затем содержимое results.txt — удобно для ручного просмотра и парсинга.
- Передача пути work_dir в SimTalk: `--workdir "C:\\bratsy_work"` — двойной backslash в Python-строке Rust передаётся как один в PowerShell, а SimTalk нужен двойной. Rust должен передавать с двойным backslash в фактическом значении Arguments.
- SimTalk-шаблон из 04-RESEARCH.md (строки 493-525) — документировать как файл `bratsy-tauri/docs/simtalk-template.md` или в README для пользователя.

</specifics>

<deferred>
## Deferred Ideas

- **UI сравнения запусков** — просматривать и сравнивать файлы из `work_dir/history/` в UI. Это v2-требование «История запусков». Phase 4 только создаёт архивные файлы.

</deferred>

---

*Phase: 04-dannye-plant-simulation*
*Context gathered: 2026-05-15*
