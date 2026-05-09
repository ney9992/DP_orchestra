---
phase: 02-upravlenie-pajplajnom
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - bratsy-tauri/src-tauri/src/lib.rs
  - bratsy-tauri/src/main.js
  - bratsy-tauri/src/index.html
  - bratsy-tauri/src/styles.css
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-09  
**Depth:** standard  
**Files Reviewed:** 4  
**Status:** issues_found

## Summary

Ревью охватывает бэкенд Tauri (Rust) и фронтенд (HTML/CSS/JS) для Phase 2 пайплайна цифрового завода. Основная логика реализована корректно: allowlist для stage ID присутствует (T-02-01), `escapeHtml()` применяется в `appendLog()` (T-02-04), лимит `LOG_MAX_LINES = 200` задан (T-02-05). Однако обнаружены два критических дефекта: блокирующий дедлок при переполнении stderr-буфера дочернего процесса и гонка данных (TOCTOU) в защите от двойного запуска, которая делает T-02-02 неэффективной при конкурентных вызовах. Дополнительно выявлены четыре предупреждения, включая инвертированную логику валидации настроек и внешний CDN-импорт, критичный для заводской среды без доступа к интернету.

---

## Critical Issues

### CR-01: Дедлок при заполненном stderr-буфере (блокировка дочернего процесса)

**File:** `bratsy-tauri/src-tauri/src/lib.rs:88-120`  
**Issue:** `stderr` дочернего процесса пайплайн в `piped()` режим (`Stdio::piped()`), но нигде не читается. Когда PowerShell пишет в stderr достаточно данных, чтобы заполнить буфер OS-пайпа (~4–64 КБ), дочерний процесс блокируется на записи в stderr и не завершается. `reader.lines()` в свою очередь ждёт завершения stdout, `child.wait()` ждёт завершения дочернего процесса — классический взаимный дедлок. В Phase 3, когда вместо заглушки придут реальные скрипты (AutoCAD, Plant Simulation), это условие будет воспроизводиться регулярно.

**Fix:**
```rust
// Вариант A (минимальный): сбросить stderr в /dev/null
let mut child = Command::new("powershell")
    .args(["-ExecutionPolicy", "Bypass", "-Command", &script])
    .stdout(Stdio::piped())
    .stderr(Stdio::null())   // <-- вместо Stdio::piped()
    .spawn()
    .map_err(|e| e.to_string())?;

// Вариант B (рекомендуемый): читать stderr параллельно и пробрасывать как log-события
// Запустить второй spawn_blocking для stderr до вызова child.wait()
let stderr_handle = if let Some(stderr) = child.stderr.take() {
    let app2 = app_clone.clone();
    let stage2 = stage_clone.clone();
    Some(std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let _ = app2.emit("stage-log", StageLogPayload { stage: stage2.clone(), line });
        }
    }))
} else { None };
// ... читаем stdout, затем:
if let Some(h) = stderr_handle { let _ = h.join(); }
let status_ok = child.wait().map(|s| s.success()).unwrap_or(false);
```

---

### CR-02: TOCTOU — защита от двойного запуска (T-02-02) не атомарна

**File:** `bratsy-tauri/src-tauri/src/lib.rs:70-99`  
**Issue:** Проверка на существующий PID и вставка нового PID выполняются в двух отдельных блоках с разными захватами мьютекса. Между строкой 75 (`map` разблокируется после проверки) и строкой 98 (`map.insert(...)`) другой поток может пройти ту же проверку и также запустить процесс. В результате для одного `stage` будет запущено два дочерних процесса, второй из которых станет «призраком» — его PID не сохранён и он не может быть остановлен через `stop_stage`.

```
Thread A: lock → check (absent) → unlock
Thread B: lock → check (absent) → unlock  ← проходит, т.к. A ещё не вставил
Thread A: spawn → lock → insert PID_A → unlock
Thread B: spawn → lock → insert PID_B → unlock  ← перезаписывает PID_A
```

**Fix:**
```rust
// Объединить проверку и вставку в один захват мьютекса (placeholder PID = 0):
{
    let mut map = state.0.lock().unwrap();
    if map.contains_key(&stage) {
        return Err("already running".into());
    }
    map.insert(stage.clone(), 0); // резервируем слот до spawn
}

// spawn...
let pid = child.id();
{
    let mut map = state.0.lock().unwrap();
    *map.get_mut(&stage).unwrap() = pid; // обновляем реальным PID
}

// В spawn_blocking в случае ошибки spawn (до этого блока) — удалить ключ:
// Если spawn вернул Err, удалить stage из map перед возвратом ошибки.
```
Либо объединить все три операции (check + spawn + insert) в один критический раздел через канал или `tokio::sync::Mutex`.

---

## Warnings

### WR-01: Инвертированная валидация настроек — пустой путь проходит проверку

**File:** `bratsy-tauri/src/main.js:266-270`  
**Issue:** Условие `if (val && val.trim() === '')` никогда не срабатывает для пустой строки: пустая строка `""` является falsy, поэтому `val &&` даёт `false` до вычисления `val.trim()`. Единственный случай, когда ошибка отображается — строка из одних пробелов. При этом пользователь может сохранить пустые пути, что приведёт к некорректным настройкам в `settings.json`.

**Fix:**
```js
// Заменить инвертированное условие:
if (!val || val.trim() === '') {
  showError(inputId, errId);
  hasError = true;
}
```

---

### WR-02: Внешний CDN-импорт в заводском приложении

**File:** `bratsy-tauri/src/main.js:240`  
**Issue:** Диалог выбора файла подгружается через `import('https://cdn.jsdelivr.net/npm/@tauri-apps/plugin-dialog@2/index.js')`. Заводские ПК, как правило, не имеют доступа к интернету. В таком окружении импорт упадёт в `.catch()`, код перейдёт в fallback с `prompt()`, который не даёт нативный диалог и допускает ввод произвольных строк без валидации пути.

**Fix:**
```js
// Использовать локально установленный пакет вместо CDN.
// В package.json добавить: "@tauri-apps/plugin-dialog": "^2"
// В main.js заменить на статический импорт:
import { open } from '@tauri-apps/plugin-dialog';

// Или, если плагин уже доступен через tauri-plugin-dialog,
// использовать window.__TAURI__.dialog если он экспортируется плагином.
```

---

### WR-03: Panic при отравленном мьютексе (`unwrap()` на Mutex lock)

**File:** `bratsy-tauri/src-tauri/src/lib.rs:71, 97, 131, 152`  
**Issue:** Все захваты `state.0.lock().unwrap()` паникуют, если мьютекс «отравлен» (poisoned) — это происходит, когда поток завершился с паникой, удерживая блокировку. Паника в Rust-потоке Tauri приводит к аварийному завершению всего приложения без диагностики для пользователя.

**Fix:**
```rust
// Заменить .unwrap() на обработку отравления:
let mut map = state.0.lock().unwrap_or_else(|e| e.into_inner());
// или вернуть ошибку:
let mut map = state.0.lock().map_err(|e| format!("mutex poisoned: {e}"))?;
```

---

### WR-04: `stop_stage` удаляет PID из карты до завершения `taskkill`

**File:** `bratsy-tauri/src-tauri/src/lib.rs:151-154`  
**Issue:** PID удаляется из `ProcessMap` на строке 152-154, до выполнения `taskkill` (строка 158). Если `taskkill` не завершается (например, из-за прав доступа), UI получает событие `stage-status = "error"` и снимает блокировку двойного запуска — пользователь может повторно запустить тот же этап, пока предыдущий процесс ещё работает. Более серьёзно: если `spawn_blocking` не наблюдает факт убийства (потому что PID удалён), финальный `stage-status` из воркера придёт повторно, переключив пилл в "done" или снова в "error".

**Fix:**
```rust
// Не удалять PID до подтверждения завершения процесса.
// Оставить PID в карте, вызвать taskkill, и позволить spawn_blocking
// самостоятельно удалить PID и отправить финальный статус.
// stop_stage должен только инициировать сигнал завершения, а не управлять состоянием.
let pid = {
    let map = state.0.lock().unwrap_or_else(|e| e.into_inner());
    map.get(&stage).copied()
};
if let Some(pid) = pid {
    let _ = Command::new("taskkill").args(["/F", "/PID", &pid.to_string()]).output();
    // Не emit статус здесь — spawn_blocking это сделает при завершении child.wait()
}
```

---

## Info

### IN-01: Хардкоженные метрики в HTML — «1,284 drawings», «94.2%», «today, 14:32»

**File:** `bratsy-tauri/src/index.html:56, 63, 148`  
**Issue:** Метрики "Drawings processed", "Throughput" и "Last full pipeline run" — статичные заглушки, жёстко прописанные в разметке. При текущем состоянии Phase 2 это приемлемо, но стоит задокументировать, чтобы они не остались в production в Phase 3.

**Fix:** Добавить TODO-комментарии к соответствующим элементам или завести задачу в Phase 3.

---

### IN-02: `console.log` / `console.info` в production-коде

**File:** `bratsy-tauri/src/main.js:52, 65, 305`  
**Issue:** `console.error('stop_stage error:', e)` (строка 52), `console.error('run_stage error:', e)` (строка 65), `console.info('Full pipeline: ...')` (строка 305), `console.warn('Could not load settings:', e)` (строка 336). В Tauri desktop-приложении консоль недоступна конечному пользователю, поэтому ошибки молча теряются. Для пользователя нет индикации о сбое загрузки настроек.

**Fix:** Завести тонкий логгер (или использовать `showToast`) для ошибок, важных пользователю. `console.warn` при ошибке загрузки настроек на старте стоит заменить на видимое уведомление.

---

_Reviewed: 2026-05-09_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
