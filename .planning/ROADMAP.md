# DP_orchestra – Roadmap (Milestone 1)

## Overview

**Project:** DP_orchestra – Цифровой завод  
**Milestone:** v1 – Plant Simulation integration + pipeline control + observability  
**Granularity:** standard  
**Coverage:** 10/10 requirements mapped  

## Phases

- [x] **Phase 1: Настройки и конфигурация** – Пользователь задаёт пути к файлам и параметры систем через панель настроек
- [x] **Phase 2: Управление пайплайном** – Пользователь запускает, останавливает отдельные этапы и видит их статус и логи в реальном времени
- [x] **Phase 3: Интеграция Plant Simulation** – Пользователь запускает симуляцию Plant Simulation и видит результаты (загрузка, пропускная способность, время цикла) в UI
- [ ] **Phase 4: Данные Plant Simulation** – Сквозная отладка реального запуска: формат results.txt согласован с SimTalk-макросом, числа из реальной симуляции отображаются в UI → milestone v1 закрыт

## Phase Details

### Phase 1: Настройки и конфигурация
**Goal:** Пользователь может задать пути к файлам и параметры систем через панель настроек, и эти значения сохраняются между запусками приложения
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** UI-02, INT-03
**Success Criteria:**
1. Пользователь открывает панель настроек кликом из главного UI
2. Пользователь вводит путь к файлу модели Plant Simulation (.spp) и сохраняет – значение остаётся после перезапуска .exe
3. Пользователь вводит пути к другим конфигурируемым ресурсам (рабочий каталог, скрипты) и сохраняет
4. Введённые пути валидируются: несуществующий путь отображает предупреждение прямо в панели настроек
**Plans:** 2 plans
Plans:
- [x] 01-01-PLAN.md – Кнопка ⚙ в хедере + анимированная боковая панель настроек
- [x] 01-02-PLAN.md – Три поля выбора путей + валидация + settings.json load/save
**UI hint:** yes

### Phase 2: Управление пайплайном
**Goal:** Пользователь управляет выполнением отдельных этапов пайплайна (запуск/остановка) и видит их текущий статус и лог в реальном времени
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** PIPE-01, PIPE-02, PIPE-03, UI-01, UI-03
**Success Criteria:**
1. Каждый этап пайплайна отображает актуальный статус: Ожидает / Запущен / Завершён / Ошибка – состояние меняется в реальном времени без перезапуска UI
2. Пользователь нажимает кнопку запуска конкретного этапа – этап стартует и статус переходит в "Запущен"
3. Пользователь нажимает кнопку остановки работающего этапа – процесс завершается и статус переходит в "Остановлен"
4. При запуске этапа в панели логов построчно появляются сообщения о ходе выполнения в реальном времени
5. При завершении или ошибке этапа появляется уведомление в UI (toast или статусная строка) без какого-либо дополнительного действия со стороны пользователя
**Plans:** 3 plans
Plans:
- [x] 02-01-PLAN.md – Rust backend: ProcessMap State, async run_stage, stop_stage, stage-status/stage-log события
- [x] 02-02-PLAN.md – JS frontend: event listeners, toggle логика, updatePill(), appendLog(), showToast(), лог-панель HTML
- [x] 02-03-PLAN.md – CSS: pill-running/done/error, stage-running hover, лог-панель, toast анимации
**UI hint:** yes

### Phase 3: Интеграция Plant Simulation
**Goal:** Пользователь запускает реальную симуляцию Tecnomatix Plant Simulation через кнопку в UI и видит числовые результаты (загрузка линии, пропускная способность, время цикла) после её завершения
**Mode:** mvp
**Depends on:** Phase 1, Phase 2
**Requirements:** INT-01, INT-02, PIPE-04
**Success Criteria:**
1. Пользователь нажимает кнопку запуска этапа PlantSim – приложение запускает макрос/скрипт Plant Simulation с файлом .spp, заданным в настройках
2. Пока симуляция выполняется, этап отображает статус "Запущен" и лог выдаёт сообщения от процесса
3. После завершения симуляции в UI появляются числовые результаты: загрузка линии (%), пропускная способность (ед./ч), время цикла (сек)
4. Если PlantSim не найден или файл .spp не существует, пользователь получает понятное сообщение об ошибке (не падение приложения)
**Plans:** 3 plans
Plans:
- [x] 03-00-PLAN.md – Wave 0: mock-plantsim.ps1 (PowerShell-заглушка PlantSim для разработки)
- [x] 03-01-PLAN.md – Rust backend: find_plantsim_shortcut, run_plantsim, results.txt parsing, stage-results event
- [x] 03-02-PLAN.md – Frontend: панель результатов (3 карточки), listen stage-results, showConfigError, нативный file picker
**UI hint:** yes

### Phase 4: Данные Plant Simulation
**Goal:** Сквозная отладка реального запуска: формат results.txt согласован с SimTalk-макросом, числа из реальной симуляции отображаются в UI → milestone v1 закрыт
**Mode:** mvp
**Depends on:** Phase 1, Phase 2, Phase 3
**Requirements:** INT-01, INT-02, INT-03
**Success Criteria:**
1. Arguments ярлыка PlantSim содержат: `-f "{spp_path}" /E {method} --workdir "{work_dir}"` – SimTalk читает work_dir через getCommandLineArg("--workdir")
2. results.txt читается из settings.work_dir (не из директории exe), числа появляются в UI после завершения
3. Если work_dir или spp_path не заданы – пользователь видит диалог с кнопкой «Открыть настройки» (не падение)
4. После симуляции создаётся архивный файл work_dir/history/YYYY-MM-DD_HH-MM-SS.txt с заголовком метаданных и содержимым results.txt
5. Таймаут N минут → taskkill PlantSimulation*.exe + лог (не вечное ожидание)
**Plans:** 3 plans
Plans:
- [ ] 04-01-PLAN.md – Rust backend: Arguments D-06, валидация D-03/D-07, results.txt из work_dir D-04, архив D-12, таймаут D-10, stop+taskkill D-11
- [ ] 04-02-PLAN.md – Frontend: поле таймаута в настройках, showConfigError(), SimTalk-шаблон docs/simtalk-template.md
- [ ] 04-03-PLAN.md – Gap closure: поля inputSppPath и inputWorkDir в index.html + work_dir в loadSettings/btnSave
**UI hint:** yes

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Настройки и конфигурация | 2/2 | Complete | 2026-05-09 |
| 2. Управление пайплайном | 3/3 | Complete | 2026-05-09 |
| 3. Интеграция Plant Simulation | 3/3 | Complete | 2026-05-10 |
| 4. Данные Plant Simulation | 0/3 | In Progress | - |

## Coverage Map

| REQ-ID | Phase | Requirement |
|--------|-------|-------------|
| UI-02 | Phase 1 | Панель настроек – пути и параметры систем |
| INT-03 | Phase 1 | Путь к .spp файлу задаётся через настройки |
| PIPE-01 | Phase 2 | Статус каждого этапа в реальном времени |
| PIPE-02 | Phase 2 | Запуск отдельного этапа пайплайна |
| PIPE-03 | Phase 2 | Остановка выполняющегося этапа |
| UI-01 | Phase 2 | Уведомление при завершении/ошибке этапа |
| UI-03 | Phase 2 | Лог выполнения в реальном времени |
| INT-01 | Phase 3 | Запуск симуляции Plant Simulation из UI |
| INT-02 | Phase 3 | Получение результатов симуляции |
| PIPE-04 | Phase 3 | Отображение результатов симуляции в UI |

**Mapped: 10/10 – 100% coverage**

---
*Last updated: 2026-05-15 – Phase 4 gap closure plan 04-03 added (inputSppPath + inputWorkDir)*
