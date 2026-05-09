# Phase 3: Интеграция Plant Simulation — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 3-integraciya-plant-simulation
**Areas discussed:** Запуск PlantSim, Источник результатов, Отображение результатов, Обработка ошибок

---

## Запуск PlantSim

| Option | Description | Selected |
|--------|-------------|----------|
| Прямой запуск exe | PlantSimulation.exe /nologo /S:"macro.spm" "file.spp" | ✓ |
| PowerShell-скрипт обёртка | scripts/run_plantsim.ps1 — Rust запускает скрипт | |
| Не знаю ещё | Зафиксировать архитектуру с заменяемым скриптом | |

**User's choice:** Прямой запуск exe
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| В настройках приложения | Добавить поле в панель настроек | ✓ |
| Фиксированный путь | C:\Program Files\Siemens\... | |
| PlantSimPath из уже есть | settings.json хранит .spp, exe — отдельно | |

**User's choice:** В настройках (путь к exe)
**Notes:** Нужно 4-е поле в settings.json и панели настроек

| Option | Description | Selected |
|--------|-------------|----------|
| С макросом (.spm) | PlantSimulation.exe /S:"macro.spm" "file.spp" | ✓ |
| Без макроса | PlantSimulation.exe "file.spp" | |
| Макрос встроен в .spp | SimTalk-макрос прописан внутри .spp | |

**User's choice:** С макросом (.spm)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Тоже в настройках | 5-е поле в панели настроек | ✓ |
| Рядом с .spp | macro.spm лежит в той же папке | |
| Фиксированное имя | macro.spm в scripts_dir | |

**User's choice:** Тоже в настройках (путь к .spm)
**Notes:** Итого settings: plant_sim_path, plant_sim_exe, plant_sim_macro, work_dir, scripts_dir

---

## Источник результатов

| Option | Description | Selected |
|--------|-------------|----------|
| Файл на диске | Макрос (SimTalk) записывает результаты в файл | ✓ |
| Макрос ещё не написан | В Phase 3 проектируем механизм вывода | |

**User's choice:** Файл на диске
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| JSON | { "load": 87.3, ... } | |
| CSV | load,throughput,cycle_time | |
| TXT / произвольный | Формат определится при написании макроса | ✓ |

**User's choice:** TXT / произвольный
**Notes:** Пользователь сказал "можно выгрузить XML, Excel или TXT — выбирай что удобнее". Claude выбрал TXT с форматом key=value (load=87.3\nthroughput=42\ncycle_time=18.5) — нет новых зависимостей в Rust.

| Option | Description | Selected |
|--------|-------------|----------|
| Рядом с .spp файлом | results.txt в папке .spp | |
| В work_dir | work_dir/results.txt | ✓ |
| Путь в настройках | Отдельное поле в настройках | |

**User's choice:** В work_dir

---

## Отображение результатов

| Option | Description | Selected |
|--------|-------------|----------|
| Новая панель под пайплайном | Отдельная секция, аналогично лог-панели | ✓ |
| В метриках вверху | Заменить заглушки на реальные данные | |
| Inline в карточке PlantSim | Карточка раскрывается | |

**User's choice:** Новая панель под пайплайном

| Option | Description | Selected |
|--------|-------------|----------|
| 3 карточки с большими числами | Как metric-card в верхней панели | ✓ |
| Таблица | Строка с 3 колонками | |
| Простой текст | Несколько строк в стиле лога | |

**User's choice:** 3 карточки с большими числами

| Option | Description | Selected |
|--------|-------------|----------|
| Сразу после завершения PlantSim | CSS transition при получении stage-results события | ✓ |
| Всегда видна с заглушками | Панель видна всегда, числа — прочерки до запуска | |

**User's choice:** Сразу после завершения PlantSim

---

## Обработка ошибок

| Option | Description | Selected |
|--------|-------------|----------|
| Toast + ошибка в логе | Стандартный механизм Phase 2 | |
| Диалоговое окно | Popup с кнопкой «Открыть настройки» | ✓ |

**User's choice:** Диалоговое окно (для ошибок конфигурации: exe не найден, .spp не найден)

| Option | Description | Selected |
|--------|-------------|----------|
| Тоже диалог | Единая модель для всех ошибок конфигурации | ✓ |
| Toast достаточно | .spp — менее критичная ошибка | |

**User's choice:** Тоже диалог для .spp не найден

| Option | Description | Selected |
|--------|-------------|----------|
| Текст + кнопка «Открыть настройки» | Показывает проблему + переход в настройки | ✓ |
| Только текст + OK | Простой alert | |

**User's choice:** Текст + кнопка «Открыть настройки»

---

## Claude's Discretion

- Точные CSS-размеры панели результатов
- Поведение при повторном запуске PlantSim (обновить числа или скрыть/показать)
- Имена ключей в results.txt — согласовываются при написании макроса

## Deferred Ideas

- Реальные скрипты для AutoCAD, Vault PDM, Excel — следующие фазы
- История запусков (когда, результат, кто)
- Запуск полного пайплайна одной кнопкой
