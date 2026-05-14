<!-- generated-by: gsd-doc-writer -->
# Архитектура — Digital Factory (Bratsy_DP)

## Обзор системы

Digital Factory — это Windows-приложение на базе Tauri v2, реализующее оркестрационный слой промышленного предприятия. Приложение принимает данные из нескольких источников (Vault PDM, Excel, AutoCAD) и прогоняет их через пайплайн дискретно-событийной симуляции (Tecnomatix Plant Simulation), возвращая команде набор производственных метрик — загрузку оборудования, пропускную способность, OEE, WIP, lead time и узкое место. Архитектурный стиль — событийно-ориентированный конечный автомат (3-шаговый пайплайн) поверх модели «Rust-backend / WebView2-frontend» без промежуточного HTTP-сервера.

---

## Компонентная диаграмма

```
┌─────────────────────────────────────────────────────┐
│               WebView2 (Vanilla JS/HTML)             │
│                                                      │
│  ┌─Step 1──────────┐  ┌─Step 2────────┐  ┌─Step 3─┐│
│  │ PDM │ Excel │ CAD│  │ PlantSim │ VC │  │ Report ││
│  └────────────┬────┘  └──────┬────────┘  └────┬───┘│
│               │  invoke()   │  invoke()        │    │
└───────────────┼─────────────┼──────────────────┼────┘
                │ Tauri IPC   │                  │ stage-results
┌───────────────▼─────────────▼──────────────────▼────┐
│            Rust (lib.rs) — Tauri Commands            │
│                                                      │
│  vault_get_bom()   run_plantsim()   run_stage()      │
│  vault_download_file()              stop_stage()     │
│  find_plantsim_shortcut()           get/save_settings│
│  pick_file() / pick_folder()                         │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │  ProcessMap  │  │ settings.json│                  │
│  │ (Arc<Mutex>) │  │ (next to exe)│                  │
│  └──────────────┘  └──────────────┘                  │
└────────────────┬─────────────────────────────────────┘
                 │ std::process::Command (PowerShell)
    ┌────────────▼──────────────────────────────────┐
    │  External Processes (запуск через PowerShell)  │
    │                                               │
    │  Vault PDM API  PlantSim .lnk  WinForms dialogs│
    │  (reqwest HTTP) (Start-Process -Wait)  (Add-Type│
    └───────────────────────────────────────────────┘
```

Стрелки IPC: `invoke()` — вызов команды JS → Rust; `emit()` / `listen()` — события Rust → JS (stage-status, stage-log, stage-results, vault-bom).

---

## Поток данных

1. **Пользователь кликает на карточку этапа** в Step 1 (PDM / Excel / AutoCAD). JS вызывает `invoke('vault_get_bom', ...)` или `invoke('run_stage', { stage })`.
2. **Rust-команда** выполняет работу: для PDM — HTTP GET к Vault API (reqwest) или возвращает mock-BOM; для Excel и AutoCAD — запускает PowerShell-заглушку, читает stdout построчно.
3. **Rust эмитирует события** в WebView2:
   - `stage-status` (`running` / `done` / `error`) → JS обновляет цвет pill-а на карточке.
   - `stage-log` (одна строка) → JS добавляет строку в лог-панель.
   - `vault-bom` (дерево BOM) → JS рендерит иерархию в `#bomPanel`.
4. **Конечный автомат JS** (`onStageCompleted`): когда все три этапа Step 1 (`importDone.size === 3`) завершены, Step 2 разблокируется.
5. **Пользователь запускает Plant Simulation** (Step 2): `find_plantsim_shortcut()` проверяет настройки → `pick_file` открывает диалог выбора `.spp` → `run_plantsim(lnkPath, sppPath, method)` модифицирует `.lnk` через `WScript.Shell` и запускает `Start-Process -Wait`.
6. **PlantSim макрос** пишет `results.txt` (формат `key=value`, UTF-8) в записываемую директорию. После завершения процесса Rust читает файл и эмитирует `stage-results`.
7. **JS получает `stage-results`** → заполняет 7-метричную сетку в Step 3 (Load, Throughput, CycleTime, OEE, WIP, LeadTime, Bottleneck) и разблокирует раздел отчёта.

---

## Ключевые абстракции

| Имя | Тип | Файл | Назначение |
|-----|-----|------|------------|
| `Settings` | `struct` (serde) | `src-tauri/src/lib.rs:11` | Конфигурация приложения: пути к .lnk и рабочей папке, vault URL/token/part_number |
| `ProcessMap` | `struct (Arc<Mutex<HashMap<String, u32>>>)` | `lib.rs:24` | Реестр PID запущенных этапов; sentinel-паттерн (PID=0) предотвращает TOCTOU |
| `StageStatusPayload` | `struct` | `lib.rs:27` | Событие IPC: stage + status (`running`/`done`/`error`) |
| `StageLogPayload` | `struct` | `lib.rs:32` | Событие IPC: stage + одна строка лога |
| `StageResultsPayload` | `struct` | `lib.rs:39` | Результаты симуляции: 6 числовых метрик + строка bottleneck |
| `VaultItem` / `VaultFile` / `VaultProperty` | `struct` | `lib.rs:52–86` | Типы BOM-дерева Vault PDM (serde rename → JSON API) |
| `writable_dir()` | `fn` | `lib.rs:306` | Поиск первой записываемой директории: exe → `%APPDATA%\Digital Factory\` → `%LOCALAPPDATA%\Digital Factory\` |
| `run_plantsim` | `async tauri command` | `lib.rs:374` | Весь цикл Plant Simulation: модификация .lnk → запуск → чтение results.txt → emit |
| `importDone` / `simDone` | `Set` (JS) | `src/main.js:37–38` | Конечный автомат пайплайна — отслеживает завершённые этапы |

---

## Структура директорий

```
Bratsy_DP/
├── bratsy-tauri/                  # Tauri-проект (основное приложение)
│   ├── src/                       # Frontend: HTML + CSS + JS (без шага сборки)
│   │   ├── index.html             # Единственная страница: pipeline UI
│   │   ├── main.js                # Вся логика JS: state machine, IPC, DOM
│   │   └── styles.css             # Стили компонентов
│   ├── src-tauri/                 # Rust backend (Tauri)
│   │   ├── src/
│   │   │   ├── lib.rs             # Все Tauri-команды и типы данных
│   │   │   └── main.rs            # Точка входа (вызывает lib::run())
│   │   ├── Cargo.toml             # Зависимости: tauri 2, reqwest 0.12, serde, serde_json
│   │   ├── tauri.conf.json        # Конфиг сборки: productName, version, window 1200×660, NSIS
│   │   └── icons/                 # Иконки приложения
│   ├── dev-tools/
│   │   └── mock-plantsim.ps1      # Заглушка PlantSim.exe для разработки без реального ПО
│   └── node_modules/              # Tauri CLI (npm)
├── docs/                          # Документация проекта
├── make-release.ps1               # Сборка → NSIS installer → ZIP для дистрибуции
└── release/                       # Артефакты сборки (gitignored)
```

---

## Механизм .lnk и запуск Plant Simulation

Прямой вызов `PlantSimulation16.exe` с аргументами не всегда работает в корпоративных средах. Выбранная стратегия:

1. `find_plantsim_shortcut()` читает `settings.json`; если путь к `.lnk` не задан — возвращает ошибку `config:` (JS предлагает открыть Настройки).
2. `run_plantsim()` модифицирует `.lnk` через `WScript.Shell.CreateShortcut` — вписывает Arguments `-f "path.spp" /E MethodName` и сохраняет.
3. `Start-Process -FilePath 'path.lnk' -Wait` запускает ярлык и блокирует PS-процесс до закрытия PlantSim.
4. PlantSim-макрос пишет `results.txt` (`key=value`, UTF-8) в `writable_dir()`. Rust читает файл после завершения процесса.

`writable_dir()` пробирует директории в порядке: рядом с exe → `%APPDATA%\Digital Factory\` → `%LOCALAPPDATA%\Digital Factory\`. Используется и для `.lnk`, и для `results.txt`.

---

## Интеграция Vault PDM

- HTTP GET `{vault_url}/api/v1/bom?partNumber=...` с заголовком `Authorization: Bearer <token>`.
- `reqwest::Client` собран с `danger_accept_invalid_certs(true)` и `rustls-tls` (без системного OpenSSL).
- Если `vault_url` пуст или равен `"mock"` — возвращается встроенный mock из 7 элементов (`vault_mock_bom()`).
- Скачивание файла: `vault_download_file(fileId, fileName)` → сохраняет в `{work_dir}/vault/{fileName}`.

---

## Параллелизм и безопасность процессов

- `ProcessMap` (`Arc<Mutex<HashMap<String, u32>>>`) хранит PID активных этапов. Sentinel-паттерн (PID=0 при `spawn`, реальный PID после) предотвращает повторный запуск (TOCTOU).
- `stderr(Stdio::null())` предотвращает deadlock при заполнении pipe-буфера.
- `stop_stage()` выполняет `taskkill /F /PID` только при PID > 0 (защита от sentinel).
- Валидация `method` в `run_plantsim`: только буквы, цифры, `.`, `_`, ` `, `-` — предотвращает инъекцию SimTalk-команд.
- Экранирование кавычек в путях перед вставкой в PowerShell-строки (`"` → `` `" ``).

---

## Конфигурация сборки и дистрибуция

- `tauri.conf.json`: productName `Digital Factory`, версия `0.2.6`, окно 1200×660 (не изменяемое), bundle target `nsis`, WebView2 bootstrapper.
- `make-release.ps1`: очищает кэш артефактов → `tauri build` → находит NSIS installer по версии → упаковывает в `Digital_Factory_v{version}.zip` + `_source.zip` (git archive).
- Установка в режиме `currentUser` (не требует прав администратора).
