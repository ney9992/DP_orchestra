# DP_orchestra — Цифровой завод

## What This Is

DP_orchestra — центральный оркестрационный слой цифрового завода: Windows-приложение (Tauri v2 — Rust backend + HTML/CSS/JS frontend, WebView2), которое управляет передачей данных между промышленными системами (PDM, MES, BIM, имитационное моделирование, VR/3D, роботика). Реализует производственную цепочку **PDM → ТРП → MES → симуляция → физический завод**, позволяя команде проектировать завод, проверять гипотезы по продукту и сопровождать внедрение новых линий.

Используется производственной командой (~несколько человек) для снижения рисков по CAPEX и ускорения старта реализации проекта.

## Core Value

По нажатию кнопки данные из всех подключённых систем проходят через пайплайн симуляции и возвращают экономические решения — оптимальная компоновка, загрузка, логистика, CAPEX.

## Current State

**Shipped:** v1.0 Plant Simulation MVP (2026-05-17)

Работающее Tauri v2-приложение с полной интеграцией Tecnomatix Plant Simulation:
- Панель настроек с 6 полями (shortcut, spp_path, work_dir, sim_method, timeout, vault credentials)
- Pipeline control: 4 этапа (PDM, Excel, AutoCAD — заглушки; PlantSim — реальный)
- Real-time лог + pill-статусы через Tauri events
- Запуск PlantSim с Arguments `-f "{spp}" /E {method} --workdir "{work_dir}"`
- Результаты симуляции (3 числа) в UI + history-архив + таймаут + stop с taskkill
- SimTalk-шаблон для разработчиков макросов

## Architecture

**Tech Stack:** Tauri v2 (Rust `src-tauri/src/lib.rs` + HTML/CSS/JS `src/`)  
**Integration Method:** `std::process::Command` → ярлык PlantSim (.lnk) → PowerShell scripts  
**Distribution:** `.exe` без зависимостей (WebView2 встроен в Windows 11+)  
**Settings:** `settings.json` в директории приложения (flat JSON, serde)

## Архитектура системы

Центральный узел ("Цифровой завод") соединяет 6 контуров:

| Контур | ПО | Статус |
|--------|----|--------|
| Имитационного моделирования | Tecnomatix Plant Simulation | ✅ v1.0 — работает |
| Детализированных роботических операций | Visual Components | 📋 v2+ |
| MES | (TBD) | 📋 v2+ |
| VR и 3D-рендеров | Plant Simulation, Visual Components | 📋 v2+ |
| Данные изделий | Vault PDM | 📋 v2 |
| ТРП | Excel | 📋 v2 |

## Requirements

### Validated (v1.0)

- ✓ **UI-02**: Панель настроек — пути к файлам и параметры систем — v1.0
- ✓ **INT-03**: Путь к .spp файлу задаётся через настройки — v1.0
- ✓ **PIPE-01**: Статус каждого этапа в реальном времени — v1.0
- ✓ **PIPE-02**: Запуск отдельного этапа пайплайна — v1.0
- ✓ **PIPE-03**: Остановка выполняющегося этапа — v1.0
- ✓ **UI-01**: Уведомление при завершении/ошибке этапа — v1.0
- ✓ **UI-03**: Лог выполнения в реальном времени — v1.0
- ✓ **INT-01**: Запуск симуляции Plant Simulation из UI — v1.0
- ✓ **INT-02**: Получение результатов симуляции после завершения — v1.0
- ✓ **PIPE-04**: Отображение результатов симуляции в UI — v1.0

### Active (v2 targets)

- [ ] Vault PDM интеграция — извлечение данных изделий (Изделие, Состав, Ревизия, Чертежи)
- [ ] AutoCAD интеграция — обработка чертежей через AutoLISP-скрипты
- [ ] Excel / ТРП интеграция — Маршрут, Операции, Ресурсы, Нормы
- [ ] Запуск полного пайплайна одной кнопкой (PDM → симуляция → отчёт)
- [ ] История запусков — N последних запусков с результатами
- [ ] fix CR-01: set(id, val) guard data-loss на пустых значениях

### Out of Scope

- MES-интеграция — контур не определён, откладывается
- BIM контур (Navisworks, Revit, Solidworks) — следующий milestone
- VR/3D-рендеры и Visual Components — дальнейшее развитие (карточка в UI уже есть)
- LLM AI / внутренняя нейросеть проекта — долгосрочная цель
- Anylogic — рассматривается как альтернатива Plant Simulation
- Веб-интерфейс / мобильная версия — Windows-only по требованиям среды

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tauri v2 (Rust + HTML/CSS/JS) | Лучший UI через WebView2, Windows-only среда | ✓ Работает, хорошая производительность |
| std::process::Command вместо COM | Меньше зависимостей от версий ПО | ✓ Стабильно, легко поддерживать |
| work_dir отдельно от exe-директории | PlantSim пишет в настраиваемое место | ✓ D-04 выполнен |
| Arguments: -f spp /E method --workdir dir | SimTalk читает через getCommandLineArg | ✓ Контракт согласован |
| readonly fields + нативные диалоги | Безопасный ввод путей, no injection | ✓ T-04-03-01 mitigated |
| step-collapsed вместо pointer-events:none | Locked шаги разворачиваемы пользователем | ✓ UX улучшен |
| history/ архив в work_dir | Трассируемость запусков без отдельного хранилища | ✓ Работает |

## Constraints

- **Tech stack**: Tauri v2 (Rust + HTML/CSS/JS) — работает в заводской среде
- **Platform**: Windows only — все интегрируемые системы требуют Windows
- **Integration**: запуск процессов — не COM/API, проще поддерживать при обновлениях ПО
- **Distribution**: .exe без зависимостей — заводские ПК могут не иметь прав на установку пакетов

## Evolution

Этот документ эволюционирует на каждом milestone.

**После каждого milestone** (`/gsd-complete-milestone`):
1. Требования подтверждены → Validated с версией
2. Новые требования → Active для следующего milestone
3. "What This Is" обновляется при расхождении с реальностью
4. Key Decisions: добавить результат с outcome

---
*Last updated: 2026-05-17 after v1.0 milestone — Tauri v2 Plant Simulation MVP shipped*
