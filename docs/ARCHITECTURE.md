<!-- generated-by: gsd-doc-writer -->
# Архитектура — Digital Factory (DP_orchestra)

## Обзор системы

Digital Factory — это Windows-приложение на базе Tauri v2, реализующее оркестрационный слой промышленного предприятия. Приложение принимает данные из нескольких источников (Vault PDM, Excel, AutoCAD) и прогоняет их через пайплайн дискретно-событийной симуляции (Tecnomatix Plant Simulation), возвращая команде набор производственных метрик в виде динамически формируемых карточек отчёта. Архитектурный стиль — событийно-ориентированный конечный автомат (3-шаговый пайплайн) поверх модели «Rust-backend / WebView2-frontend» без промежуточного HTTP-сервера.

---

## Компонентная диаграмма

```
┌──────────────────────────────────────────────────────────────────┐
│               WebView2 (Vanilla JS/HTML)                          │
│                                                                   │
│  ┌─левая панель (50%)────────────────┐  ┌─правая панель (flex:1)─┐│
│  │  Аккордеон шагов                  │  │  [Console] [Report]    ││
│  │  ┌─Step 1──┐ ┌─Step 2──┐ ┌─Step 3┐│  │   stage-log lines     ││
│  │  │ PDM     │ │PlantSim │ │ Отчёт ││  │   rpt-card-dyn cards  ││
│  │  │ Excel   │ └────┬────┘ └───────┘│  └────────────┬──────────┘│
│  │  │ AutoCAD │      │  invoke()     │               │            │
│  └──┴─────────┴──────┼───────────────┘  stage-results│            │
│     [== resize ==]   │  invoke()                     │            │
│  [▶ Запуск Цифрового завода ]                        │            │
└──────────────────────┼──────────────────────────────┼────────────┘
                       │ Tauri IPC                    │ stage-results / stage-log / stage-status
┌──────────────────────▼──────────────────────────────▼────────────┐
│            Rust (lib.rs) — Tauri Commands                         │
│                                                                   │
│  vault_get_bom()    run_plantsim()    run_stage()                  │
│  vault_download_file()               stop_stage()                  │
│  bom_to_xml()       find_plantsim_shortcut()                       │
│  pick_file() / pick_folder()         get/save_settings             │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  ProcessMap  │  │ settings.json│  │  bom.json /  │            │
│  │ (Arc<Mutex>) │  │ (next to exe)│  │  bom.xml     │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
└────────────────┬──────────────────────────────────────────────────┘
                 │ std::process::Command (PowerShell)
    ┌────────────▼───────────────────────────────────┐
    │  External Processes (запуск через PowerShell)   │
    │                                                │
    │  Vault PDM API  PlantSim .lnk  WinForms dialogs│
    │  (reqwest HTTP) (Start-Process -Wait)  (Add-Type│
    └────────────────────────────────────────────────┘
```

Стрелки IPC: `invoke()` — вызов команды JS → Rust; `emit()` / `listen()` — события Rust → JS (`stage-status`, `stage-log`, `stage-results`, `vault-bom`).

---

## Поток данных

1. **Пользователь кликает «Запуск Цифрового завода»** (кнопка в подвале). JS последовательно проходит по `PIPELINE = ['pdm', 'excel', 'autocad', 'plantsim']`.
2. **PDM-этап (реальный режим):** JS вызывает `invoke('vault_get_bom', { partNumber })`. Rust выполняет HTTP GET к Vault API с заголовком `Authorization: token <token>` и query-параметрами `useHierarchy=true&includeImages=true`, парсит ответ `{"value":[...], "Count": N}` через `flatten_vault_value` / `flatten_vault_item` (рекурсивно обходит `Childrens`), сохраняет сырой JSON в `writable_dir/bom.json`. Затем JS вызывает `invoke('bom_to_xml')` — Rust читает `bom.json`, строит XML через `item_to_xml` / `xml_escape`, сохраняет `bom.xml` в той же директории и возвращает путь.
3. **Excel / AutoCAD (реальный режим):** JS вызывает `invoke('run_stage', { stage })`, Rust запускает PowerShell-заглушку, читает stdout построчно и эмитирует `stage-log`. После завершения процесса — `stage-status: done`.
4. **Rust эмитирует события** в WebView2:
   - `stage-status` (`running` / `done` / `error`) → JS обновляет цвет pill-а на карточке.
   - `stage-log` (одна строка) → JS добавляет строку в консоль правой панели.
   - `vault-bom` (дерево BOM) → JS логирует количество позиций в консоль.
5. **Аккордеон JS** (`activateSimStep`): когда все три импорт-этапа завершены, Step 2 разблокируется.
6. **Пользователь запускает Plant Simulation** (Step 2 / `plantsim` в пайплайне): `find_plantsim_shortcut()` проверяет настройки → `run_plantsim(lnkPath, sppPath, method)` модифицирует `.lnk` через `WScript.Shell` и запускает `Start-Process -Wait`.
7. **PlantSim-макрос** пишет `results.txt` (формат `key=value`, UTF-8) в `writable_dir()`. После завершения процесса Rust читает файл, формирует `Vec<ResultEntry>` из всех пар `key=value` и эмитирует `stage-results`.
8. **JS получает `stage-results`** → динамически строит карточки `rpt-card-dyn` в Report-вкладке (одна карточка на каждую строку `results.txt`), автоматически переключается на вкладку «ОТЧЁТ»; Step 3 разблокируется.

---

## Ключевые абстракции

| Имя | Тип | Файл | Назначение |
|-----|-----|------|------------|
| `Settings` | `struct` (serde) | `src-tauri/src/lib.rs:11` | Конфигурация приложения: пути к .lnk, .spp, рабочей папке, vault URL/token/part_number, SimTalk-метод |
| `ProcessMap` | `struct (Arc<Mutex<HashMap<String, u32>>>)` | `lib.rs:26` | Реестр PID запущенных этапов; sentinel-паттерн (PID=0) предотвращает TOCTOU |
| `StageStatusPayload` | `struct` | `lib.rs:28` | Событие IPC: stage + status (`running`/`done`/`error`) |
| `StageLogPayload` | `struct` | `lib.rs:34` | Событие IPC: stage + одна строка лога |
| `ResultEntry` | `struct` | `lib.rs:41` | Одна запись результата симуляции: `{key: String, value: String}` |
| `StageResultsPayload` | `struct` | `lib.rs:46` | Результаты симуляции: `stage` + `entries: Vec<ResultEntry>` — все пары key=value из results.txt |
| `VaultItem` / `VaultFile` / `VaultProperty` | `struct` | `lib.rs:54–88` | Типы BOM-дерева Vault PDM (serde rename → JSON API) |
| `writable_dir()` | `fn` | `lib.rs:301` | Поиск первой записываемой директории: exe → `%APPDATA%\Digital Factory\` → `%LOCALAPPDATA%\Digital Factory\` |
| `flatten_vault_value` / `flatten_vault_item` | `fn` | `lib.rs:702–736` | Парсинг ответа Vault API `{"value":[...], "Count": N}` с рекурсивным обходом `Childrens` |
| `xml_escape` / `item_to_xml` | `fn` | `lib.rs:740–782` | Генерация XML из BOM-дерева: экранирование спецсимволов, `ErpInfo`-атрибуты, рекурсивные `Children` |
| `bom_to_xml` | `tauri command` | `lib.rs:784` | Читает `bom.json` из `writable_dir`, строит XML, сохраняет `bom.xml`, возвращает путь |
| `run_plantsim` | `async tauri command` | `lib.rs:334` | Весь цикл Plant Simulation: модификация .lnk → запуск → чтение results.txt → emit `stage-results` |
| `PIPELINE` / `IMPORT_STAGES` / `SIM_STAGES` | `const` (JS) | `src/main.js:46–48` | Определяют порядок и категории этапов пайплайна |
| `showTab(tab)` | `fn` (JS) | `src/main.js:96` | Переключение между вкладками Console/Report правой панели |

---

## Структура директорий

```
DP_orchestra/
├── bratsy-tauri/                  # Tauri-проект (основное приложение)
│   ├── src/                       # Frontend: HTML + CSS + JS (без шага сборки)
│   │   ├── index.html             # Единственная страница: двухпанельный pipeline UI
│   │   ├── main.js                # Вся логика JS: state machine, IPC, DOM, resize
│   │   └── styles.css             # Стили компонентов
│   ├── src-tauri/                 # Rust backend (Tauri)
│   │   ├── src/
│   │   │   ├── lib.rs             # Все Tauri-команды и типы данных
│   │   │   └── main.rs            # Точка входа (вызывает lib::run())
│   │   ├── Cargo.toml             # Зависимости: tauri 2, reqwest 0.12, serde, serde_json
│   │   ├── tauri.conf.json        # Конфиг сборки: productName, version 0.3.0, окно 1400×860, maximized, NSIS
│   │   └── icons/                 # Иконки приложения
│   ├── dev-tools/
│   │   └── mock-plantsim.ps1      # Заглушка PlantSim.exe для разработки без реального ПО
│   └── node_modules/              # Tauri CLI (npm)
├── docs/                          # Документация проекта
├── make-release.ps1               # Сборка → NSIS installer → ZIP для дистрибуции
└── release/                       # Артефакты сборки (gitignored)
```

---

## UI: двухпанельный макет

Интерфейс разделён на две панели через flex-контейнер `.content-grid`:

- **Левая панель** (`.left-panel`, начальный размер 50%) — аккордеон трёх шагов пайплайна с карточками этапов, переключателями тест/реал и pill-индикаторами статуса.
- **Resize handle** (`#resizeHandle`, ширина 5px) — перетаскивается мышью (`mousedown/mousemove/mouseup`). Текущее соотношение сохраняется в `localStorage` (`panelLeftPct`). Диапазон ограничен 20–80%.
- **Правая панель** (`flex:1`) — содержит две вкладки:
  - **Console** — потоковый лог событий `stage-log` с временными метками и тегами этапов.
  - **Report** — динамические карточки `rpt-card-dyn` из `stage-results.entries`; автоматически активируется после завершения Plant Simulation.
- **Кнопка «Запуск Цифрового завода»** (`#btnLaunch`) — закреплена в подвале по центру; при активном пайплайне переключается в «Остановить».

**Step 3** аккордеона содержит только текстовую подсказку «Результаты на вкладке ОТЧЁТ» — данные отображаются в Report-вкладке правой панели, не в теле шага.

---

## Механизм .lnk и запуск Plant Simulation

Прямой вызов `PlantSimulation16.exe` с аргументами не всегда работает в корпоративных средах. Выбранная стратегия:

1. `find_plantsim_shortcut()` читает `settings.json`; если путь к `.lnk` не задан — возвращает ошибку `config:` (JS предлагает открыть Настройки).
2. `run_plantsim()` валидирует `method` (только буквы, цифры, `.`, `_`, ` `, `-`), затем модифицирует `.lnk` через `WScript.Shell.CreateShortcut` — вписывает Arguments `-f "path.spp" /E MethodName` и сохраняет.
3. `Start-Process -FilePath 'path.lnk' -Wait` запускает ярлык и блокирует PS-процесс до закрытия PlantSim.
4. PlantSim-макрос пишет `results.txt` (`key=value`, UTF-8) в `writable_dir()`. Rust читает файл после завершения процесса и формирует `Vec<ResultEntry>` из всех непустых строк с символом `=`.

`writable_dir()` пробирает директории в порядке: рядом с exe → `%APPDATA%\Digital Factory\` → `%LOCALAPPDATA%\Digital Factory\`. Используется для хранения `.lnk`, `bom.json`, `bom.xml` и `results.txt`.

---

## Интеграция Vault PDM

- HTTP GET `{vault_url}/api/v1/bom?partNumber=...&useHierarchy=true&includeImages=true` с заголовком `Authorization: token <token>`.
- `reqwest::Client` собран с `danger_accept_invalid_certs(true)` и `rustls-tls` (без системного OpenSSL).
- Ответ API имеет формат `{"value": [...], "Count": N}`. Парсинг выполняется через `flatten_vault_value` → `flatten_vault_item` (рекурсивный обход поля `Childrens`).
- Сырой JSON сохраняется в `writable_dir()/bom.json` как для реального, так и для mock-режима.
- Если `vault_url` пуст или равен `"mock"` — возвращается встроенный mock из 7 элементов (`vault_mock_bom()`), сохраняемый в том же формате `{"value":[...], "Count": N}`.
- Команда `bom_to_xml()` конвертирует `bom.json` → `bom.xml` через `item_to_xml` / `xml_escape`; XML включает атрибуты `ErpInfo` (mass, length, width, height, area, volume) и вложенные `<Children>` рекурсивно.
- Скачивание файла: `vault_download_file(fileId, fileName)` → `Authorization: Bearer <token>` → сохраняет в `{work_dir}/vault/{fileName}`.

---

## Параллелизм и безопасность процессов

- `ProcessMap` (`Arc<Mutex<HashMap<String, u32>>>`) хранит PID активных этапов. Sentinel-паттерн (PID=0 при `spawn`, реальный PID после) предотвращает повторный запуск (TOCTOU).
- `stderr(Stdio::null())` предотвращает deadlock при заполнении pipe-буфера.
- `stop_stage()` выполняет `taskkill /F /PID` только при PID > 0 (защита от sentinel).
- Валидация `method` в `run_plantsim`: только буквы, цифры, `.`, `_`, ` `, `-` — предотвращает инъекцию SimTalk-команд.
- Экранирование кавычек в путях перед вставкой в PowerShell-строки (`"` → `` `" ``).

---

## Конфигурация сборки и дистрибуция

- `tauri.conf.json`: productName `Digital Factory`, версия `0.3.0`, окно 1400×860, `maximized: true`, `resizable: true`, bundle target `nsis`, WebView2 bootstrapper (`downloadBootstrapper`).
- `make-release.ps1`: очищает кэш артефактов → `tauri build` → находит NSIS installer по версии → упаковывает в `Digital_Factory_v{version}.zip` + `_source.zip` (git archive).
- Установка в режиме `currentUser` (не требует прав администратора).
