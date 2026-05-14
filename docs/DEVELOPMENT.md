<!-- generated-by: gsd-doc-writer -->
# Разработка — Digital Factory (Bratsy_DP)

## Локальная настройка среды

### Зависимости

| Инструмент | Версия | Назначение |
|---|---|---|
| Rust toolchain (`rustup`, `cargo`) | stable | Компиляция Rust-бэкенда |
| Node.js + npm | любая LTS | Tauri CLI и сборка |
| Tauri CLI v2 | `^2` (из `node_modules`) | Запуск dev-сборки и release |
| Windows 10 / 11 | 64-bit | Единственная поддерживаемая ОС |
| Tecnomatix Plant Simulation 16 | опционально | Реальная симуляция; есть mock |

### Шаги установки

```
# 1. Клонировать репозиторий
git clone https://github.com/ney9992/Bratsy_DP.git
cd Bratsy_DP

# 2. Установить npm-зависимости (Tauri CLI)
cd bratsy-tauri
npm install

# 3. Скомпилировать Rust-бэкенд в режиме debug
cd src-tauri
cargo build
```

### Первый запуск

После успешного `cargo build` запустите собранный исполняемый файл напрямую:

```
bratsy-tauri\src-tauri\target\debug\bratsy-tauri.exe
```

Приложение открывается максимизированным (базовые размеры 1400×860). Файл `settings.json` создаётся автоматически рядом с exe при первом запуске.

---

## Команды сборки

| Команда | Описание |
|---|---|
| `npm run tauri build` | Production-сборка + NSIS-инсталлятор в `src-tauri/target/release/bundle/nsis/` |
| `cargo build` | Debug-компиляция Rust-бэкенда |
| `cargo build --release` | Release-компиляция Rust-бэкенда без упаковки |

Единственный скрипт в `bratsy-tauri/package.json`:

```json
"tauri": "tauri"
```

Tauri CLI находится в `bratsy-tauri/node_modules/.bin/tauri.cmd`.

---

## Скрипт релизной сборки

Для создания дистрибутива используется `make-release.ps1` в корне проекта:

```powershell
powershell -ExecutionPolicy Bypass -File make-release.ps1
```

Скрипт выполняет следующие шаги:

1. **Очищает кэш сборки** (`target/release/build/bratsy-tauri-*`, `.fingerprint/bratsy-tauri-*`, `bratsy-tauri.exe`) — обязательно, иначе фронтенд не перевстраивается в бандл.
2. Запускает `tauri build` через `node_modules/.bin/tauri.cmd`.
3. Находит инсталлятор по маске `*${version}*-setup.exe` (версия берётся из `tauri.conf.json`) — фильтр по версии предотвращает захват старого инсталлятора.
4. Собирает папку `release/Digital Factory vX.Y.Z/` с `setup.exe` и `README.txt`.
5. Пакует в `release/Digital_Factory_vX.Y.Z.zip`.
6. Создаёт source-архив через `git archive HEAD`.

Итоговые артефакты:

```
release/
  Digital_Factory_vX.Y.Z.zip       # дистрибутив
  Digital_Factory_vX.Y.Z_source.zip  # исходники (без target/ и node_modules/)
```

---

## Управление версией

При выходе нового релиза нужно обновить **два места**:

1. **`bratsy-tauri/src-tauri/tauri.conf.json`** — поле `version`:
   ```json
   { "version": "0.3.0" }
   ```

2. **`bratsy-tauri/src/index.html`** — теги cache-busting в `<link>` и `<script>`:
   ```html
   <link rel="stylesheet" href="styles.css?v=0.3.0" />
   ```

Без обновления `?v=` в `index.html` WebView2 может отдавать старый CSS/JS из кэша.

---

## Структура кода

```
bratsy-tauri/
  src/                    # Фронтенд (Vanilla JS + HTML, без шага сборки)
    index.html            # Единственная страница приложения
    main.js               # Вся UI-логика, Tauri IPC, state machine
    styles.css            # Стили панели управления
    assets/               # SVG-иконки
  src-tauri/
    src/
      lib.rs              # Все Tauri-команды и бизнес-логика
      main.rs             # Точка входа (вызывает bratsy_tauri_lib::run())
    tauri.conf.json       # Конфигурация Tauri (productName, version, окно)
    Cargo.toml            # Rust-зависимости
    capabilities/
      default.json        # Разрешения Tauri (capability allowlist)
  dev-tools/
    mock-plantsim.ps1     # Заглушка Plant Simulation для разработки
  package.json            # npm-манифест (только Tauri CLI devDep)
make-release.ps1          # Скрипт релизной сборки (корень проекта)
```

---

## UI-раскладка

Правая панель и левая панель разделены перетаскиваемым разделителем (`.resize-handle`, 5 px). Ширина левой панели персистируется в `localStorage` по ключу `panelLeftPct`.

- **Левая панель** (`left-panel`, начальная ширина 50%) — аккордеон из трёх шагов пайплайна.
- **Правая панель** (`flex: 1`) — содержит вкладки `rp-tabs`: **Console** и **Report**.

Переключение вкладок реализовано функцией `showTab(tab)`. При получении события `stage-results` вкладка автоматически переключается на Report.

Резайз: `mousedown` на `.resize-handle` → отслеживание `mousemove` → обновление `leftPanel.style.width` → сохранение `panelLeftPct` в `localStorage` при `mouseup`.

---

## Mock Plant Simulation

Для разработки без установленного Tecnomatix Plant Simulation используйте заглушку:

```powershell
powershell -ExecutionPolicy Bypass -File bratsy-tauri\dev-tools\mock-plantsim.ps1 /S "macro.spm" "C:\path\to\model.spp"
```

Скрипт имитирует 3-шаговую симуляцию (~2 секунды), затем записывает `results.txt` в директорию `.spp`-файла в формате `key=value`. Rust-команда `run_plantsim()` читает именно этот файл и передаёт содержимое как `Vec<ResultEntry>` через событие `stage-results`.

---

## Стиль кода

В проекте нет настроенных линтеров или форматтеров (`.eslintrc`, `biome.json`, `.prettierrc` отсутствуют). Придерживайтесь паттернов, заложенных в `lib.rs`:

- **Rust:** edition 2021, `serde` для всех публичных структур, `#[serde(default)]` на всех полях `Settings`.
- **JavaScript:** ES-модули (`"type": "module"`), без фреймворков, `window.__TAURI__.core.invoke()` для команд, `window.__TAURI__.event.listen()` для событий.
- **PowerShell:** `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` перед любым выводом, `-ExecutionPolicy Bypass` во всех вызовах.

---

## IPC-контракт фронтенд ↔ бэкенд

### Структуры данных (Rust)

```rust
// Настройки приложения (settings.json)
pub struct Settings {
    pub plant_sim_shortcut: String, // путь к .lnk ярлыку PlantSim
    pub spp_path:           String, // путь к .spp модели
    pub sim_method:         String, // SimTalk метод
    pub vault_url:          String, // "http://host:port" или "" для mock
    pub vault_token:        String, // токен авторизации Vault
    pub vault_part_number:  String, // обозначение по умолчанию
    // legacy-поля (сохраняются в JSON, не отображаются в UI):
    pub plant_sim_path: String,
    pub work_dir:       String,
    pub scripts_dir:    String,
}

// Единица результата симуляции
pub struct ResultEntry { pub key: String, pub value: String }

// Payload события stage-results
pub struct StageResultsPayload {
    pub stage:   String,
    pub entries: Vec<ResultEntry>,
}
```

### Вызовы команд (invoke)

| Команда | Параметры | Описание |
|---|---|---|
| `get_settings` | — | Читает `settings.json` рядом с exe |
| `save_settings` | `settings: Settings` | Сохраняет `settings.json` |
| `find_plantsim_shortcut` | — | Возвращает путь к `.lnk` из настроек |
| `run_plantsim` | `lnk_path, spp_path, method` | Модифицирует ярлык и запускает PlantSim, ждёт завершения |
| `run_stage` | `stage` | Запускает один из этапов: `autocad`, `excel`, `report`, `visual_components` |
| `stop_stage` | `stage` | Убивает процесс этапа через `taskkill /F /PID` |
| `vault_get_bom` | `part_number` | Запрашивает BOM из Vault API или возвращает mock; сохраняет `writable_dir/bom.json` |
| `bom_to_xml` | — | Читает `writable_dir/bom.json`, конвертирует в XML, сохраняет `writable_dir/bom.xml`, возвращает путь |
| `vault_download_file` | `file_id, file_name` | Скачивает файл из Vault в `work_dir/vault/` |
| `pick_file` | `title, filter, default_path` | Открывает WinForms OpenFileDialog через PowerShell |
| `pick_folder` | `title, default_path` | Открывает WinForms FolderBrowserDialog через PowerShell |

### События (listen)

| Событие | Payload | Описание |
|---|---|---|
| `stage-status` | `{ stage, status }` | `status`: `"running"` / `"done"` / `"error"` |
| `stage-log` | `{ stage, line }` | Строка stdout из дочернего процесса |
| `stage-results` | `{ stage, entries: [{key, value}, ...] }` | Результаты симуляции; UI строит карточки `.rpt-card-dyn` и переключает вкладку на Report |
| `vault-bom` | `{ part_number, items[] }` | BOM из Vault PDM |

### Vault API — аутентификация

Заголовок авторизации для BOM-запроса:

```
Authorization: token {vault_token}
```

Формат ответа Vault API:

```json
{ "value": [ { "ParentId": null, "Id": 1001, "Childrens": [...], ... } ], "Count": 7 }
```

Разбор выполняется через `flatten_vault_value()` → `flatten_vault_item()`, которые рекурсивно обходят поле `Childrens`.

### State machine (main.js)

Фронтенд отслеживает прогресс через два массива:

- `IMPORT_STAGES = ['pdm', 'excel', 'autocad']` — завершение всех трёх активирует шаг 2 (симуляция).
- `SIM_STAGES = ['plantsim']` — завершение активирует шаг 3 (отчёт).
- `PIPELINE = [...IMPORT_STAGES, ...SIM_STAGES]` — полный порядок выполнения.

### Пайплайн

`startPipeline()` итерирует `PIPELINE` последовательно. Для каждого этапа:
- если `localStorage.getItem('mode_{stage}') === 'real'` — вызывает `runReal(stage)`;
- иначе — вызывает `runTest(stage)` (локальная анимация без IPC).

Переключатели тест/реал хранят состояние в `localStorage` по ключу `mode_{stage}`.

---

## Соглашения по веткам и PR

Соглашения по именованию веток не задокументированы в репозитории. Основная ветка — `main`.

CI-пайплайн (`.github/workflows/release.yml`) срабатывает только на теги вида `v*.*.*` и публикует GitHub Release с `setup.exe`. В обычных PR автоматической сборки нет.

---

## Известные особенности разработки

- **Очистка кэша перед release-сборкой обязательна.** Tauri кэширует embed фронтенда; без очистки `cargo build` внутри `tauri build` не заметит изменений в `src/`. Скрипт `make-release.ps1` делает это автоматически.
- **Нет шага сборки для фронтенда.** `tauri.conf.json` указывает `"frontendDist": "../src"` — файлы отдаются напрямую из `bratsy-tauri/src/`. Нет webpack/vite/rollup.
- **Диалоги файлов — через PowerShell.** `pick_file` и `pick_folder` запускают PowerShell-скрипт с WinForms — единственный способ получить нативный диалог без COM/WebView2 ограничений. Ожидаемая задержка первого открытия ~500 мс.
- **Plant Simulation запускается через `.lnk`-ярлык.** Прямой запуск exe не поддерживает нужный формат аргументов. Ярлык указывается в настройках (`plant_sim_shortcut`).
- **`bom.json` сохраняется в `writable_dir()`** — как при mock-режиме, так и при реальном запросе Vault. Функция `writable_dir()` выбирает первую доступную для записи директорию из цепочки: рядом с exe → `%APPDATA%\Digital Factory\` → `%LOCALAPPDATA%\Digital Factory\`.
- **legacy-поля Settings.** Поля `plant_sim_path`, `work_dir`, `scripts_dir` сохраняются в `settings.json` для обратной совместимости, но больше не отображаются в UI настроек. Не удалять из структуры `Settings` — иначе существующие конфиги потеряют данные.
