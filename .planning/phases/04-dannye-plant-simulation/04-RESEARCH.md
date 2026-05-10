# Phase 4: Данные Plant Simulation — Research

**Researched:** 2026-05-10
**Domain:** Tecnomatix Plant Simulation 16 — SimTalk file I/O, CLI-интерфейс, запуск через .lnk-ярлык, отладка сквозного пайплайна
**Confidence:** MEDIUM (SimTalk-специфика верифицирована через официальную документацию; CLI-синтаксис требует финальной проверки на реальной заводской установке)

---

## Summary

Phase 4 — финальная фаза milestone v1. Вся инфраструктура готова: Rust запускает PlantSim, читает `results.txt`, показывает числа в UI.

**Уточнения от пользователя (2026-05-10):**
- ✅ "Prohibit access to the computer" — **выключена по умолчанию**, не является проблемой. Снимается из списка рисков.
- ✅ SimTalk-макрос пишет **сам пользователь** — Phase 4 не включает написание макроса.

**Реальный скоуп Phase 4 — только на стороне приложения:**
1. Верифицировать, что `Start-Process -Wait '<lnk>'` реально ждёт закрытия PlantSim (а не только Shell-launcher) — это единственный LOW-confidence риск.
2. Верифицировать CLI-синтаксис: `-f` или без него, `/E` с пробелом или без.
3. Убедиться, что Rust корректно читает results.txt, записанный реальным SimTalk (кодировка, line endings).
4. При необходимости — скорректировать run_plantsim в lib.rs под реальное поведение.

**Primary recommendation:** Phase 4 — это в первую очередь **отладочная фаза на реальном железе**, а не разработка нового кода. Большинство задач — запустить, посмотреть, поправить если сломалось.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Запуск PlantSim через .lnk | Rust (backend) + PowerShell | — | `run_plantsim` модифицирует .lnk через WScript.Shell, запускает через `Start-Process -Wait` |
| Запись results.txt | SimTalk-макрос (PlantSim) | — | Внутри PlantSim; Rust только читает после завершения |
| Закрытие PlantSim после симуляции | SimTalk-макрос | — | `exitApplication` в endSim-методе |
| Чтение и парсинг results.txt | Rust (backend) | — | После `child.wait()` в `spawn_blocking` |
| Отображение результатов | JS Frontend | — | `listen('stage-results')` — уже реализован в Phase 3 |
| Отладка — проверка exit code | Rust + PowerShell | — | `$p.ExitCode` после `Start-Process -Wait -PassThru` |
| Передача входных параметров в симуляцию | SimTalk (читает input-файл) | Rust (пишет input-файл) | Только для v2; в v1 параметры хардкодены в .spp |

---

## Что уже реализовано (Phase 3)

Rust-сторона **полностью реализована**. Понимание этого критично: планировщику не нужно перерабатывать Rust-код.

```
run_plantsim (lib.rs):
  ├─ Валидация spp_path (Path::exists)
  ├─ Валидация method (allowlist символов)
  ├─ Modify .lnk через PowerShell WScript.Shell:
  │    $s.Arguments = '-f "<spp_path>" /E <method>'
  ├─ Start-Process -FilePath '<lnk>' -Wait (через PowerShell)
  ├─ spawn_blocking: child.wait()
  ├─ fs::read_to_string(work_dir/results.txt)
  ├─ parse key=value → load/throughput/cycle_time
  └─ emit("stage-results", payload)
```

**Статус:** Phase 3 выполнена, но сквозной тест с реальным PlantSim НЕ проводился. Весь код прошёл только через mock-plantsim.ps1.

---

## SimTalk File I/O — Полная Документация

### FileInterface — Основной механизм

`FileInterface` — встроенный объект Plant Simulation для чтения/записи внешних текстовых файлов. Создаётся как объект в папке `InformationFlow` в модели.

**Ключевые методы:** [CITED: docs.plm.automation.siemens.com/content/plant_sim_help/15/.../fileinterface.html]

| Метод | Описание |
|-------|----------|
| `FileInterface.FileName := path` | Установить путь к файлу (абсолютный Windows-путь) |
| `FileInterface.open` | Явно открыть файл (возвращает false если не открылся) |
| `FileInterface.write(data)` | Записать данные без новой строки. Если файл не открыт — открывает, пишет, закрывает |
| `FileInterface.writeLn(data)` | Записать данные с переносом строки `\n` |
| `FileInterface.readLn` | Читать строку (возвращает string) |
| `FileInterface.close` | Закрыть файл явно (сбрасывает буфер!) |
| `FileInterface.remove` | Удалить файл |
| `FileInterface.EoF` | true если достигнут конец файла |

**Поведение write/writeLn:** [CITED: docs.plm.automation.siemens.com/content/plant_sim_help/15/.../write_fileinterface.html]
- Если файл не существует — создаёт
- Если файл не открыт явно — автоматически открывает, пишет, закрывает (но это атомарная операция, непригодна для множественных записей)
- Если путь невалидный — ошибка выполнения
- **Важно:** для нескольких `writeLn` нужно явно `open` → несколько `writeLn` → `close`

**Атрибут Encoding:** [CITED: docs.plm.automation.siemens.com/content/plant_sim_help/15.1/.../encoding.html]
- Значения: `ANSI` (8-bit, по умолчанию), `UTF-8`, `Unicode`
- Для русских имён в значениях: использовать `UTF-8`
- Для ASCII-значений (числа с точкой): `ANSI` или `UTF-8` — без разницы

~~**Критическое ограничение безопасности:**~~ ~~СНЯТО~~ — пользователь подтвердил, что "Prohibit access to the computer" **выключена по умолчанию** в используемой конфигурации. Не является риском для данного проекта.
- Это **первый кандидат на причину** если results.txt не создаётся

### Шаблон SimTalk-метода для записи results.txt

```simtalk
-- Метод: .UserObjects.printed
-- Вызывается через /E .UserObjects.printed при запуске из CLI
-- Выполняется ПОСЛЕ того, как модель загружена

-- 1. Запустить симуляцию (если не авто-старт)
EventController.startSim

-- 2. Дождаться завершения — endSim-метод обеспечит это автоматически
--    ИЛИ вся логика в endSim

-- Если вся логика в одном методе:
var fi : object
fi := .InformationFlow.FileInterface

-- Абсолютный путь к work_dir (передаётся через /E-метод или getCommandLineArg)
fi.FileName := "C:\\bratsy_work\\results.txt"
fi.Encoding := "UTF-8"

fi.open
fi.writeLn("load=" + num_to_str(.Models.Frame.Station1.statPercBusy))
fi.writeLn("throughput=" + num_to_str(.Models.Frame.Sink1.statNumExited))
fi.writeLn("cycle_time=" + num_to_str(.Models.Frame.Station1.statTimeProc))
fi.close

exitApplication
```

**Альтернатива — endSim-метод (рекомендуется):**

```simtalk
-- Метод: .Models.Frame.endSim
-- Автоматически вызывается при завершении симуляции (конец времени)

var fi : object
fi := .InformationFlow.FileInterface
fi.FileName := "C:\\bratsy_work\\results.txt"
fi.Encoding := "UTF-8"
fi.open
fi.writeLn("load=" + num_to_str(Station1.statPercBusy))
fi.writeLn("throughput=" + num_to_str(Sink1.statNumExited))
fi.writeLn("cycle_time=" + num_to_str(Station1.statTimeProc))
fi.close
exitApplication
```

[ASSUMED] Точные имена объектов (Station1, Sink1) и атрибутов статистики — определяются структурой конкретной модели. Пример показывает паттерн, не готовый код.

### Альтернатива: getCommandLineArg для передачи пути work_dir

SimTalk поддерживает чтение кастомных аргументов командной строки: [CITED: docs.plm.automation.siemens.com/content/plant_sim_help/15.1/.../getcommandlinearg.html]

```simtalk
var workDir : string
var found : boolean

-- Читаем аргумент --workdir переданный при запуске
found := getCommandLineArg("--workdir", workDir)
if not found
    workDir := getCurrentDirectory
end

fi.FileName := workDir + "\\results.txt"
```

Rust передаёт аргументы через `.lnk`-модификацию:
```powershell
$s.Arguments = '-f "<spp>" /E .UserObjects.printed --workdir "C:\bratsy_work"'
```

[ASSUMED] Синтаксис `--workdir` с двумя дефисами — кастомный; Plant Simulation игнорирует неизвестные флаги и делает их доступными через `getCommandLineArg`. Требует проверки.

---

## CLI-интерфейс PlantSimulation.exe — Документированные флаги

**Источник:** Siemens официальная документация "Entering Start Options" [CITED: docs.plm.automation.siemens.com/content/plant_sim_help/15.1/.../entering_start_options.html]

### Флаги запуска (Plant Simulation 15.x, применимо к 16)

| Флаг | Синоним | Описание |
|------|---------|----------|
| `/f <path>` | `-f <path>` | Открыть файл модели (.spp) при запуске |
| `/E <method>` | `-E <method>` | Выполнить SimTalk-метод после загрузки модели |
| (кастомные) | — | Любые другие аргументы → `getCommandLineArg` в SimTalk |

**Важные свойства:**
- Флаги **чувствительны к регистру** (`/E` — правильно, `/e` — нет) [CITED: entering_start_options.html]
- Вместо `/` можно использовать `-`: `/E` и `-E` эквивалентны
- `/E` принимает **один метод** (путь SimTalk к методу, например `.UserObjects.printed`)
- Порядок: флаги до имени файла НЕ требуются — `.spp` указывается через `/f`

**Текущая реализация в lib.rs:**
```rust
// run_plantsim: модифицирует .lnk-ярлык
$s.Arguments = '-f "<spp_escaped>" /E <method>'
```

Это соответствует официальной форме. Проблема может быть в том, что метод передаётся как отдельный токен (`/E` + `method`), а не как `/E:method`. [ASSUMED] Оба варианта документально не разграничены — нужна проверка на реальной установке.

### Почему запуск через .lnk-ярлык, а не напрямую

Текущая архитектура Phase 3 использует `.lnk`-ярлык как посредника. Это обусловлено заводской средой: путь к PlantSimulation.exe может быть разным, ярлык уже есть на рабочем столе. Минус: требует модификации ярлыка перед каждым запуском через WScript.Shell.

**Альтернатива для Phase 4 (не обязательная):** Если пользователь укажет прямой путь к PlantSimulation.exe в настройках, можно запускать напрямую:
```
PlantSimulation16.exe -f "model.spp" /E .UserObjects.printed
```
Это устраняет необходимость в WScript.Shell, но требует нового поля в Settings.

---

## Функция exitApplication — Закрытие PlantSim из SimTalk

[CITED: docs.plm.automation.siemens.com/content/plant_sim_help/15/.../exitapplication.html]

```simtalk
exitApplication
```

**Поведение:**
- Немедленно завершает Plant Simulation
- Не сохраняет модель (изменения теряются)
- Не вызывает `onCloseModel` для объектов из Basis-папки
- Не задаёт диалог "Сохранить изменения?"

**Связь с PowerShell:**
Когда `exitApplication` выполнен → Plant Simulation закрывается → PowerShell-процесс `Start-Process -Wait` возвращает управление → `child.wait()` в Rust-`spawn_blocking` завершается.

**Exit code PlantSim.exe:** [ASSUMED] Документально не подтверждён. На практике — 0 при нормальном завершении. Rust обрабатывает это через `s.success()` (любой ненулевой exit code → `false`). Требует проверки на реальной установке.

---

## endSim — Специальный метод завершения симуляции

[CITED: docs.plm.automation.siemens.com/content/plant_sim_help/15/.../endsim.html (referenced in search)]

Plant Simulation вызывает все методы с именем `endSim` автоматически в конце симуляции. Это **правильное место** для записи результатов.

**Порядок выполнения:**
1. EventController достигает конца времени (EndTime)
2. Plant Simulation вызывает все `endSim`-методы в обратном порядке создания объектов
3. В endSim: `FileInterface.writeLn(...)` → `FileInterface.close` → `exitApplication`
4. PlantSim закрывается → PowerShell-обёртка завершается → Rust читает results.txt

**Паттерн:**
```simtalk
-- В .Models.Frame.endSim (или аналогичном):
var fi : object
fi := .InformationFlow.FileInterface
fi.FileName := "C:\\bratsy_work\\results.txt"
fi.Encoding := "UTF-8"
fi.open
fi.writeLn("load=87.3")         -- или реальные атрибуты
fi.writeLn("throughput=42")
fi.writeLn("cycle_time=18.5")
fi.close
exitApplication
```

**Важно:** `fi.close` выполняется ДО `exitApplication`. Это гарантирует сброс буфера на диск.

---

## Стандартный стек Phase 4

### Core (уже в проекте — не добавлять новые crate)

| Компонент | Версия | Роль | Статус |
|-----------|--------|------|--------|
| Tauri v2 | 2.11.1 | Runtime | [VERIFIED: Cargo.lock] |
| std::fs | stdlib Rust | read_to_string results.txt | [VERIFIED: lib.rs] |
| PowerShell WScript.Shell | встроен Windows | Модификация .lnk | [VERIFIED: lib.rs строки 336-347] |
| PowerShell Start-Process | встроен Windows | Запуск PlantSim с -Wait | [VERIFIED: lib.rs строки 362-374] |
| Plant Simulation FileInterface | встроен PlantSim | Запись results.txt из SimTalk | [CITED: официальная документация] |
| SimTalk exitApplication | встроен PlantSim | Закрытие PlantSim из кода | [CITED: официальная документация] |

### Новые зависимости

Новых зависимостей нет. Phase 4 — это отладка + SimTalk-шаблон.

---

## Архитектура взаимодействия (конец-в-конец)

```
Пользователь нажимает [Запустить PlantSim] в UI
         │
         ▼
JS: invoke('run_plantsim', { lnkPath, sppPath, method })
         │
         ▼
Rust run_plantsim:
  1. Валидация sppPath (Path::exists)
  2. Валидация method (символы)
  3. PS: WScript.Shell модифицирует .lnk:
         $s.Arguments = '-f "<spp>" /E <method>'
  4. emit("stage-status", "running")
  5. PS: Start-Process '<lnk>' -Wait
              │
              ▼
         PlantSim запускается:
           Загружает .spp модель
           Выполняет /E <method> (.UserObjects.printed)
                │
                ├─► метод запускает симуляцию (EventController.startSim)
                │
                └─► по окончании (endSim):
                      FileInterface.FileName := work_dir\results.txt
                      FileInterface.open
                      FileInterface.writeLn("load=87.3")
                      FileInterface.writeLn("throughput=42")
                      FileInterface.writeLn("cycle_time=18.5")
                      FileInterface.close          ← ВАЖНО: до exitApplication
                      exitApplication              ← PlantSim закрывается
              │
              ▼ PlantSim завершён (exit code 0)
  6. spawn_blocking child.wait() → Ok(ExitStatus(0))
  7. fs::read_to_string(work_dir/results.txt)
  8. parse key=value → load, throughput, cycle_time
  9. emit("stage-results", { load, throughput, cycle_time })
 10. emit("stage-status", "done")
         │
         ▼
JS: updatePill("done") + showResultsPanel() + fillCards()
```

---

## Критические Pitfalls (детальный анализ)

### Pitfall 1: FileInterface заблокирован настройкой безопасности модели

**Что идёт не так:** SimTalk-код выполняется, `fi.writeLn(...)` вызывается, но results.txt не создаётся. `fi.open` возвращает false.

**Почему:** В `.spp` модели включена опция "Prohibit access to the computer" (File → Model Settings → General → Security). При этой опции FileInterface может писать **только в папку модели** (рядом с .spp файлом), не в work_dir.

**Как избежать:**
1. В PlantSim открыть File → Model Settings → General
2. Снять галочку "Prohibit access to the computer"
3. Сохранить модель
4. Или: писать results.txt в ту же папку, где лежит .spp, и читать оттуда

**Warning signs:** results.txt не появляется в work_dir после завершения PlantSim. В консоли PlantSim (если видна) — ошибка "access denied" или write возвращает false.

[CITED: docs.plm.automation.siemens.com/content/plant_sim_help/15/.../prohibit_access_to_the_computer_model_settings.html]

### Pitfall 2: exitApplication вызван до fi.close — файл не сброшен

**Что идёт не так:** results.txt существует, но пуст или частично записан. Rust видит пустой файл, выдаёт warning.

**Почему:** `exitApplication` немедленно убивает процесс. Если файловый буфер не сброшен — данные теряются.

**Как избежать:**
```simtalk
fi.close        -- СНАЧАЛА закрыть файл (сбрасывает буфер)
exitApplication -- ПОТОМ выходить
```

**Warning signs:** results.txt создан, но пуст, или содержит неполные строки (последняя строка обрезана).

### Pitfall 3: Start-Process -Wait не ждёт PlantSim — ждёт ярлык

**Что идёт не так:** `child.wait()` возвращает немедленно (exit 0), хотя PlantSim ещё работает. Rust читает несуществующий results.txt.

**Почему:** `Start-Process -Wait -FilePath '<lnk>'` — ждёт завершения **процесса, запустившего ярлык** (explorer.exe или wscript.exe интерпретатор), а не самого PlantSim. .lnk — это ярлык, открывается через Shell, а не напрямую.

**Текущее решение в lib.rs (Phase 3):** Этот риск закрыт — используется `Start-Process -FilePath '<lnk>' -Wait`. PowerShell на Windows при `-Wait` ждёт основного процесса, запускаемого ярлыком. **Но** если PlantSim запускает дочерний процесс (например, лицензионный сервер), `-Wait` может завершиться раньше.

**Проверка при тестировании:** После запуска убедиться, что `Start-Process` действительно ждёт закрытия PlantSim, а не возвращается немедленно.

**Warning signs:** Лог показывает "Ожидание завершения симуляции..." и сразу "done" — PlantSim ещё открыт.

[ASSUMED] Поведение `-Wait` с `.lnk` зависит от реализации Windows Shell; может потребовать альтернативы.

### Pitfall 4: PowerShell Start-Process -Wait не возвращает exit code PlantSim

**Что идёт не так:** `child.wait().unwrap().success()` возвращает `true` (exit code 0) даже если PlantSim завершился с ошибкой (например, SimTalk-ошибка).

**Почему:** PowerShell-скрипт `Start-Process '<lnk>' -Wait` сам возвращает exit code 0 (PowerShell завершился успешно), независимо от exit code PlantSim. `$LASTEXITCODE` не передаётся через `-Wait` без `-PassThru`.

**Текущее состояние:** lib.rs использует `child.wait().ok().map(|s| s.success())` — это exit code PowerShell-оболочки, не PlantSim. Rust не знает, закончился ли PlantSim с ошибкой или успехом.

**Практическое решение для MVP:** Proxy-критерий — наличие results.txt. Если PlantSim упал — results.txt не создан → Rust выдаёт warning → пустая панель. Это приемлемо для v1.

**Warning signs:** PlantSim упал на SimTalk-ошибке, но в UI показывается "done" (вместо "error"). Файл results.txt отсутствует.

### Pitfall 5: Кодировка results.txt несовместима с Rust

**Что идёт не так:** `fs::read_to_string` возвращает `Err(invalid utf-8 sequence)`. Парсинг проваливается.

**Почему:** `FileInterface.Encoding` по умолчанию — `ANSI` (Windows-1252 или Windows-1251 в зависимости от системной локали). На российских заводских ПК — Windows-1251. Rust `read_to_string` ожидает UTF-8.

**Как избежать:**
1. В SimTalk-макросе явно указать: `fi.Encoding := "UTF-8"` [CITED: encoding doc]
2. В results.txt писать только ASCII-значения (числа, `=`, `\n`) — тогда кодировка не важна
3. Ключи в results.txt — только латиница: `load=`, `throughput=`, `cycle_time=`

**Для проекта:** Контракт D-07 уже предполагает ASCII-только значения (`load=87.3`). Но лучше явно выставить UTF-8 в SimTalk для надёжности.

**Warning signs:** В логе Rust — ошибка "invalid utf-8", panel results не появляется.

[CITED: encoding attribute docs] для SimTalk; [VERIFIED: lib.rs] для Rust-парсинга.

### Pitfall 6: Путь work_dir в SimTalk — разделители и пробелы

**Что идёт не так:** `fi.FileName := "C:\bratsy work\results.txt"` — SimTalk не обрабатывает пробелы в пути; или `\` нужно экранировать как `\\`.

**Почему:** SimTalk-строки используют `\` как разделитель и `\\` как экранированный backslash. Пробелы в пути требуют кавычек (зависит от контекста).

**Как избежать:**
```simtalk
fi.FileName := "C:\\bratsy_work\\results.txt"  -- двойной backslash
-- или без пробелов в пути работы
```

**Praktическое решение:** Убедиться, что `work_dir` в настройках не содержит пробелов. Либо передавать путь через `getCommandLineArg`.

**Warning signs:** FileInterface не открывает файл, `fi.open` возвращает false.

[ASSUMED] Поведение SimTalk со спецсимволами в строках — стандарт языка, аналогичный Pascal/Basic.

### Pitfall 7: Method-путь для /E — точный синтаксис

**Что идёт не так:** PlantSim запускается, но метод не выполняется. Симуляция не запускается.

**Почему:** `/E .UserObjects.printed` — путь зависит от структуры модели. Если метод называется иначе или находится в другой папке — ошибка тихая (PlantSim может открыться и зависнуть на UI).

**Текущий контракт:** Phase 3 закрепила метод `.UserObjects.printed` как контракт между приложением и SimTalk-разработчиком. **Это нужно зафиксировать документально для пользователя**.

**Warning signs:** PlantSim открывается, но ничего не происходит. results.txt не создаётся. PlantSim не закрывается автоматически.

---

## Передача входных параметров в симуляцию

> **Статус v1:** Не требуется — параметры хардкодены в .spp модели. Описан путь для v2.

### Механизм 1: Файл входных параметров (рекомендуется для v2)

Rust пишет `work_dir/params.txt` перед запуском PlantSim:
```
batch_size=100
line_speed=0.8
shift_hours=8
```

SimTalk читает в `init`-методе (выполняется при старте симуляции):
```simtalk
var fi : object
var line : string
fi := .InformationFlow.FileInterface
fi.FileName := "C:\\bratsy_work\\params.txt"
fi.open
while not fi.EoF
    line := fi.readLn
    -- parse key=value, установить параметры модели
end
fi.close
```

[CITED: FileInterface EoF attribute; readLn method — docs.plm.automation.siemens.com/content/plant_sim_help/15/.../eof.html]

### Механизм 2: getCommandLineArg (альтернатива)

Rust добавляет аргументы в `.lnk`:
```
-f "model.spp" /E .UserObjects.printed --batch_size 100 --line_speed 0.8
```

SimTalk читает:
```simtalk
var batchSize : integer
getCommandLineArg("--batch_size", batchSize)
```

Ограничение: Plant Simulation парсит аргументы как строки → нужна конвертация типов.

[CITED: getCommandLineArg — docs.plm.automation.siemens.com/content/plant_sim_help/15.1/.../getcommandlinearg.html]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Запись файла из SimTalk | Свой парсер/сериализатор | `FileInterface` встроен в PlantSim | Единственный официальный механизм file I/O в SimTalk |
| Закрытие PlantSim из макроса | OS-сигналы, taskkill из SimTalk | `exitApplication` | Единственная официальная функция завершения приложения из SimTalk |
| Ожидание завершения PlantSim | Polling файловой системы, sleep-loop | `Start-Process -Wait` (PowerShell) | Уже реализовано в Phase 3, надёжно для одиночного запуска |
| Модификация .lnk | Прямая работа с бинарным форматом .lnk | WScript.Shell COM-объект (PowerShell) | Официальный API Windows для .lnk |
| Парсинг key=value в Rust | serde, regex | `split_once('=')` | Контракт D-07; для ASCII-чисел split_once достаточно |

---

## Работающий SimTalk-шаблон (рекомендуемый контракт)

Пользователь должен создать в модели метод `.UserObjects.printed` со следующим кодом:

```simtalk
-- .UserObjects.printed
-- Запускается через: PlantSimulation.exe -f "model.spp" /E .UserObjects.printed
-- Требования к модели:
--   1. File > Model Settings > General > Security: "Prohibit access to the computer" = OFF
--   2. FileInterface-объект в папке InformationFlow модели

var fi : object
var workDir : string

-- Получить рабочую директорию (или хардкодить)
workDir := "C:\\bratsy_work"  -- ЗАМЕНИТЬ на реальный путь

-- Запустить симуляцию
EventController.startSim
-- EventController.startSim блокирует до завершения

-- Записать результаты (после окончания симуляции)
fi := .InformationFlow.FileInterface
fi.FileName := workDir + "\\results.txt"
fi.Encoding := "UTF-8"
fi.open
-- ЗАМЕНИТЬ на реальные атрибуты объектов модели:
fi.writeLn("load=" + num_to_str(Station.statPercBusy))
fi.writeLn("throughput=" + num_to_str(Sink.statNumExited))
fi.writeLn("cycle_time=" + num_to_str(Station.statTimeProc))
fi.close

-- Закрыть PlantSim
exitApplication
```

**Или альтернативная структура через endSim** (предпочтительна при длинных симуляциях):

1. `.UserObjects.printed` — только запускает `EventController.startSim` (или не делает ничего, если модель сама стартует)
2. `.Models.Frame.endSim` — записывает results.txt и вызывает `exitApplication`

[ASSUMED] Синтаксис `EventController.startSim` — стандартный вызов объекта EventController. Точное имя зависит от модели.

---

## Диагностический план для реального запуска

Когда Phase 4 выполняется на заводском ПК, нужно последовательно проверить:

### Шаг 1: PlantSim запускается с правильными аргументами

Проверить: открыть `cmd.exe`, запустить вручную:
```
"C:\path\PlantSimulation16.exe" -f "C:\path\model.spp" /E .UserObjects.printed
```
Ожидание: PlantSim открывается, метод выполняется, PlantSim закрывается.

### Шаг 2: results.txt создаётся

Проверить: после запуска Шага 1 → файл `work_dir\results.txt` существует, содержит:
```
load=87.3
throughput=42
cycle_time=18.5
```
Если нет → проверить настройку "Prohibit access" в Model Settings.

### Шаг 3: Кодировка

Открыть results.txt в Notepad → убедиться, что нет кракозябр. Если есть → проверить `fi.Encoding := "UTF-8"` в SimTalk.

### Шаг 4: PowerShell-обёртка ждёт

Запустить через PowerShell:
```powershell
$p = Start-Process -FilePath "C:\path\PlantSim.lnk" -Wait -PassThru
Write-Output "Exit code: $($p.ExitCode)"
```
Ожидание: команда ждёт закрытия PlantSim (не возвращается мгновенно).

### Шаг 5: Сквозной тест через приложение

Запустить приложение → нажать "PlantSim" → дождаться "Завершён" → проверить числа в UI.

---

## Текущее состояние кода и что нужно изменить

### В Rust (lib.rs) — минимальные изменения

| Файл | Изменение | Приоритет |
|------|-----------|-----------|
| lib.rs `run_plantsim` | Возможно: добавить логирование exit code из PowerShell для диагностики | LOW |
| lib.rs `run_plantsim` | Возможно: добавить retry если results.txt отсутствует сразу (sleep + re-read) | LOW |

**Основная Rust-логика уже реализована и правильна.** [VERIFIED: lib.rs]

### В SimTalk — основная работа

| Действие | Ответственный | Приоритет |
|----------|---------------|-----------|
| Создать метод `.UserObjects.printed` в .spp модели | Пользователь | HIGH |
| Отключить "Prohibit access to the computer" в модели | Пользователь | HIGH |
| Написать код FileInterface.writeLn в endSim или в .printed | Пользователь | HIGH |
| Добавить `exitApplication` в конце | Пользователь | HIGH |
| Проверить кодировку: `fi.Encoding := "UTF-8"` | Пользователь | MEDIUM |

### Опционально: прямой запуск без .lnk

Если пользователь хочет упростить — добавить поле "Путь к PlantSimulation.exe" в Settings и запускать напрямую:
```rust
Command::new(&plant_sim_exe)
    .args(["-f", &spp_path, "/E", &method])
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn()
```
Это устраняет WScript.Shell-модификацию. [ASSUMED] — требует проверки, что PlantSim принимает аргументы при прямом запуске, не через ярлык.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `exitApplication` возвращает exit code 0 процессу PlantSim.exe | Pitfall 4 | Если возвращает ненулевой — `child.wait().success()` = false → статус "error" при успешном запуске. Обход: ignore exit code, полагаться только на results.txt |
| A2 | `Start-Process -Wait` с .lnk-файлом ждёт завершения PlantSim, а не запускающего процесса | Pitfall 3 | Если ждёт только Shell-процесс → Rust читает results.txt до его создания. Обход: переход на прямой запуск exe |
| A3 | Флаг `/E` принимает метод как отдельный аргумент (`/E .UserObjects.printed`), не как `/E:.UserObjects.printed` | CLI-интерфейс | Если неверный формат — PlantSim игнорирует флаг, симуляция не запускается. Определяется при первом тесте |
| A4 | `EventController.startSim` блокирует выполнение метода до конца симуляции | SimTalk шаблон | Если не блокирует — метод завершится немедленно, results.txt не будет записан. Альтернатива: использовать endSim-метод |
| A5 | FileInterface.writeLn использует `\n` (LF) как разделитель строк | Кодировка | Если CRLF → Rust `split_once('=')` работает корректно т.к. `.trim()` убирает пробельные символы. Риск низкий |
| A6 | Синтаксис `fi.FileName := "C:\\path\\file.txt"` с двойным backslash корректен в SimTalk | SimTalk шаблон | Если нужен одинарный `\` — строки не будут работать. Уточнить при написании макроса |

**Итого:** 6 assumptions. Все разрешаются при первом реальном тесте на заводском ПК.

---

## Open Questions

1. **Прямой запуск vs. через .lnk**
   - Что знаем: текущая реализация через .lnk работает в Phase 3 с mock
   - Что неясно: ждёт ли `Start-Process -Wait '<lnk>'` именно PlantSim, а не launcher
   - Рекомендация: если проблема обнаружится → добавить поле "Путь к PlantSimulation.exe" в Settings и переключиться на прямой запуск exe

2. **Путь work_dir в SimTalk**
   - Что знаем: Rust знает work_dir из Settings; SimTalk должен знать тот же путь
   - Что неясно: как передать work_dir из Rust в SimTalk без хардкода в .spp
   - Рекомендация: для v1 — хардкодить путь в SimTalk-методе (пользователь делает сам). Для v2 — передавать через getCommandLineArg

3. **Точные имена SimTalk-атрибутов для load/throughput/cycle_time**
   - Что знаем: `statPercBusy`, `statNumExited`, `statTimeProc` — стандартные атрибуты объектов PlantSim
   - Что неясно: точные имена объектов в конкретной модели пользователя
   - Рекомендация: это ответственность пользователя, не приложения. В документации описать контракт (формат results.txt), а не привязку к конкретным атрибутам

4. **Что если PlantSim не закрывается сам**
   - Что знаем: `exitApplication` закрывает PlantSim программно
   - Что неясно: что если SimTalk-ошибка предотвращает вызов `exitApplication`
   - Рекомендация: таймаут. Rust может добавить таймаут в `spawn_blocking` (после N минут — `taskkill PlantSim`). Для v1 — не блокер, т.к. пользователь присутствует рядом

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PlantSimulation16.exe | Запуск симуляции | Только на заводском ПК | 16.x | Mock: mock-plantsim.ps1 (уже реализован) |
| PowerShell | Запуск + WScript.Shell | ✓ | Встроен Windows 10 | — |
| WScript.Shell COM | Модификация .lnk | ✓ | Встроен Windows | — |
| Node.js | Tauri CLI | ✓ | v24.14.1 | — |
| Rust/Cargo | Компиляция | [ASSUMED: установлен] | — | — |

**Missing dependencies с fallback:**
- PlantSimulation.exe — mock-plantsim.ps1 для разработки без реального PlantSim (уже существует в bratsy-tauri/dev-tools/)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Ручное тестирование (нет unit-test фреймворка) |
| Config file | Нет |
| Quick run command | `npm run tauri dev` (из bratsy-tauri/) |
| Full suite command | Все 4 Success Criteria из ROADMAP.md Phase 4 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Command / Action | File Exists? |
|--------|----------|-----------|-----------------|-------------|
| (Phase 4 goal) | Формат results.txt согласован с SimTalk | manual | Запуск с mock + проверка файла | ✅ mock-plantsim.ps1 |
| (Phase 4 goal) | Реальный PlantSim → числа в UI | smoke (manual) | Сквозной тест на заводском ПК | ❌ только на производственном ПК |
| (Phase 4 goal) | PlantSim закрывается сам | smoke (manual) | Наблюдение: PlantSim исчезает после симуляции | ❌ |
| (Phase 4 goal) | results.txt записывается до выхода | smoke (manual) | Проверить файл после run | ❌ |

### Специфический тестовый кейс для Phase 4

```powershell
# Тест 1: mock-plantsim проходит (уже должен работать из Phase 3)
# Запустить через UI → mock создаёт results.txt → числа отображаются

# Тест 2: Реальный PlantSim на заводском ПК
# 1. Открыть PlantSim вручную → создать метод .UserObjects.printed
# 2. Запустить вручную из cmd: PlantSim.exe -f model.spp /E .UserObjects.printed
# 3. Убедиться что PlantSim закрылся и results.txt создан
# 4. Запустить через UI приложения → проверить числа
```

### Wave 0 Gaps

- SimTalk-шаблон для пользователя (документация) — не код, а инструкция
- Нет дополнительных тест-файлов, т.к. инфраструктура тестирования из Phase 3 достаточна

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Нет | Локальное приложение, 1 пользователь |
| V3 Session Management | Нет | Нет сессий |
| V4 Access Control | Частично | Валидация method-аргумента в run_plantsim [VERIFIED: lib.rs строки 310-313] |
| V5 Input Validation | Да | method: only alphanumeric + "._ -"; spp_path: Path::exists() |
| V6 Cryptography | Нет | Нет секретов |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Method injection через /E флаг | Tampering | Allowlist символов в method [VERIFIED: lib.rs строки 310-313] |
| Path traversal в spp_path | Tampering | Path::exists() + file dialog (пользователь выбирает через UI) |
| results.txt подмена | Spoofing | Файл в work_dir — доверенная папка на заводском ПК. MVP-риск приемлем |

**Phase 4 специфика:** Модификация .lnk через WScript.Shell добавляет `$s.Arguments` с пользовательским путём. Экранирование реализовано в Phase 3 [VERIFIED: lib.rs строка 332: `lnk_escaped = lnk_path.replace('"', "\`\"")`].

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| WinForms + PowerShell | Tauri v2 + Rust + WebView2 | Уже перешли; не релевантно для Phase 4 |
| Mock PlantSim script | Реальный PlantSim через .lnk | Phase 4 — финальный переход от mock к real |
| Прямой запуск exe | Запуск через .lnk-ярлык | Текущий подход; требует WScript.Shell для модификации |

---

## Sources

### Primary (HIGH confidence — verified via official docs)
- [FileInterface documentation](https://docs.plm.automation.siemens.com/content/plant_sim_help/15/plant_sim_all_in_one_html/en_US/tecnomatix_plant_simulation_help/objects_reference_help/information_flow_objects/fileinterface/fileinterface.html) — FileInterface overview, methods list
- [write method](https://docs.plm.automation.siemens.com/content/plant_sim_help/15/plant_sim_all_in_one_html/en_US/tecnomatix_plant_simulation_help/objects_reference_help/information_flow_objects/fileinterface/methods_of_the_fileinterface/write_fileinterface.html) — file creation, auto-open behavior
- [Encoding attribute](https://docs.plm.automation.siemens.com/content/plant_sim_help/15.1/plant_sim_all_in_one_html/en_US/tecnomatix_plant_simulation_help/objects_reference_help/information_flow_objects/fileinterface/attributes_of_the_fileinterface/encoding.html) — ANSI/UTF-8/Unicode values
- [Prohibit access to the computer](https://docs.plm.automation.siemens.com/content/plant_sim_help/15/plant_sim_all_in_one_html/en_US/tecnomatix_plant_simulation_help/main_program_window/ribbon_bar/file_menu/model_settings/general/prohibit_access_to_the_computer_model_settings.html) — security model, write restrictions
- [exitApplication](https://docs.plm.automation.siemens.com/content/plant_sim_help/15/plant_sim_all_in_one_html/en_US/tecnomatix_plant_simulation_help/simtalk_reference/simtalk_reference_1/predefined_functions/miscellaneous_global_functions/exitapplication.html) — function docs
- [getCommandLineArg](https://docs.plm.automation.siemens.com/content/plant_sim_help/15.1/plant_sim_all_in_one_html/en_US/tecnomatix_plant_simulation_help/simtalk_reference/simtalk_reference_1/predefined_functions/miscellaneous_global_functions/getcommandlinearg.html) — syntax, return type
- [Entering Start Options](https://docs.plm.automation.siemens.com/content/plant_sim_help/15.1/plant_sim_all_in_one_html/en_US/tecnomatix_plant_simulation_help/setting_up_and_starting/starting_plant_simulation/entering_start_options.html) — /f, /E flags, case-sensitivity
- [getCurrentDirectory](https://docs.plm.automation.siemens.com/content/plant_sim_help/15/plant_sim_all_in_one_html/en_US/tecnomatix_plant_simulation_help/simtalk_reference/simtalk_reference_1/predefined_functions/operating_system_functions/getcurrentdirectory.html) — returns working folder
- [getEnv](https://docs.plm.automation.siemens.com/content/plant_sim_help/15/plant_sim_all_in_one_html/en_US/tecnomatix_plant_simulation_help/simtalk_reference/simtalk_reference_1/predefined_functions/operating_system_functions/getenv.html) — reads environment variables
- `bratsy-tauri/src-tauri/src/lib.rs` — [VERIFIED: run_plantsim implementation, строки 302-431]
- `bratsy-tauri/dev-tools/mock-plantsim.ps1` — [VERIFIED: results.txt контракт D-07]

### Secondary (MEDIUM confidence)
- [WScript.Shell shortcut editing](https://theprogrammersfirst.wordpress.com/2020/07/22/editing-shortcut-lnk-properties-with-powershell/) — PowerShell код для Get/Set shortcut
- [Start-Process exit code](https://www.delftstack.com/howto/powershell/powershell-start-process-exit-code/) — -PassThru + ExitCode
- [endSim predefined name](https://docs.plm.automation.siemens.com/content/plant_sim_help/15/.../endsim.html) — automatic execution at simulation end

### Tertiary (LOW confidence / ASSUMED)
- Exit code PlantSim.exe после exitApplication — не документировано, assumed 0
- Синтаксис `/E method` vs `/E:method` — требует проверки на реальной установке
- Поведение Start-Process -Wait с .lnk ярлыком — assumed ждёт PlantSim

---

## Metadata

**Confidence breakdown:**
- SimTalk FileInterface API: HIGH — верифицировано через официальную документацию Siemens
- Защита "Prohibit access": HIGH — критическая находка, верифицирована официально
- CLI-синтаксис /E: MEDIUM — документирован, но точный формат требует проверки
- Start-Process -Wait с .lnk: LOW — assumed behavior, нет прямой официальной документации
- Exit codes: LOW — не задокументированы Siemens

**Research date:** 2026-05-10
**Valid until:** 60 дней — PlantSim API стабилен; Rust/Tauri v2 — стабилен. CLI-синтаксис может отличаться между версиями PlantSim.
