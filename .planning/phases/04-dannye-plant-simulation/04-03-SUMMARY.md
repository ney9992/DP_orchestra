---
phase: 04-dannye-plant-simulation
plan: "03"
subsystem: settings-ui
tags: [gap-closure, settings, plant-simulation, html, javascript]
dependency_graph:
  requires: [04-01-PLAN.md, 04-02-PLAN.md]
  provides: [inputSppPath-html, inputWorkDir-html, work_dir-persistence]
  affects: [bratsy-tauri/src/index.html, bratsy-tauri/src/main.js]
tech_stack:
  added: []
  patterns: [browse-btn-readonly-pattern, field-group-pattern]
key_files:
  created: []
  modified:
    - bratsy-tauri/src/index.html
    - bratsy-tauri/src/main.js
decisions:
  - Поля inputSppPath и inputWorkDir добавлены без field-error/field-hint (минимальный паттерн — аналогично inputSimMethod, а не inputPlantSimShortcut)
  - inputSppPath использует data-type="file", inputWorkDir использует data-type="folder" — существующие ветки в browse-btn handler
metrics:
  duration: "~10 min"
  completed: "2026-05-15"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 04 Plan 03: Gap Closure — inputSppPath и inputWorkDir Summary

## One-liner

Добавлены HTML-поля inputSppPath и inputWorkDir в секцию PLANT SIMULATION и подключена персистентность work_dir в loadSettings/btnSave — закрыты блокирующие пробелы D-03/D-07.

## What Was Built

### Task 1 — index.html: два новых field-group в секции PLANT SIMULATION

Вставлены два `field-group` блока между `inputSimTimeout` и секцией `VAULT PDM API` (строки 229-247 после правки):

**inputSppPath** (строки ~229-235):
```html
<div class="field-group">
  <label class="field-label">Путь к .spp файлу</label>
  <div class="field-row">
    <input class="field-input" id="inputSppPath" type="text" readonly placeholder="Укажите путь к .spp файлу">
    <button class="browse-btn" data-target="inputSppPath" data-type="file">…</button>
  </div>
</div>
```

**inputWorkDir** (строки ~237-243):
```html
<div class="field-group">
  <label class="field-label">Рабочий каталог</label>
  <div class="field-row">
    <input class="field-input" id="inputWorkDir" type="text" readonly placeholder="Рабочий каталог (куда PlantSim пишет results.txt)">
    <button class="browse-btn" data-target="inputWorkDir" data-type="folder">…</button>
  </div>
</div>
```

### Task 2 — main.js: work_dir в loadSettings и btnSave

**loadSettings** (строка 466):
```javascript
set('inputWorkDir',          s.work_dir);
```

**btnSave** (строка 488):
```javascript
work_dir:            g('inputWorkDir'),
```

## Gaps Closed

| Gap | Описание | Статус |
|-----|----------|--------|
| Gap 1 | inputSppPath отсутствовал в HTML (main.js уже ссылался на строках 465, 481, 503) | CLOSED |
| Gap 2 | inputWorkDir отсутствовал в HTML и в main.js (loadSettings + btnSave) | CLOSED |

## Verification Results

```
grep -c 'id="inputSppPath"' bratsy-tauri/src/index.html  → 1 ✓
grep -c 'id="inputWorkDir"' bratsy-tauri/src/index.html  → 1 ✓
grep -c "set('inputWorkDir'" bratsy-tauri/src/main.js     → 1 ✓
grep -c "work_dir" bratsy-tauri/src/main.js               → 2 ✓ (loadSettings + btnSave)
grep -c "set('inputSppPath'" bratsy-tauri/src/main.js     → 1 ✓ (не изменялось)
grep -c "spp_path:" bratsy-tauri/src/main.js              → 1 ✓ (не изменялось)
```

## Commits

| Task | Коммит | Описание |
|------|--------|----------|
| Task 1 | 7c0e4b7 (auto-save) | Add inputSppPath and inputWorkDir field-groups to index.html |
| Task 2a | 20e35c1 (auto-save) | Add set('inputWorkDir', s.work_dir) to loadSettings |
| Task 2b | 95789e6 (auto-save) | Add work_dir: g('inputWorkDir') to btnSave |

Примечание: изменения были захвачены auto-save хуком до явного коммита — изменения валидны, в HEAD присутствуют.

## Deviations from Plan

None — план выполнен точно как написан. Все изменения сделаны в указанных местах без дополнительных модификаций.

## Known Stubs

None — поля подключены к реальному Rust-бэкенду через `invoke('get_settings')` / `invoke('save_settings')`.

## Threat Flags

None — новые поля используют `readonly` + нативный диалог выбора файла/папки (pick_file / pick_folder), прямой ввод невозможен. Соответствует T-04-03-01 (accept disposition).

## Self-Check: PASSED

- bratsy-tauri/src/index.html: FOUND inputSppPath, FOUND inputWorkDir
- bratsy-tauri/src/main.js: FOUND set('inputWorkDir', s.work_dir), FOUND work_dir: g('inputWorkDir')
- Commits 7c0e4b7, 20e35c1, 95789e6: FOUND in git log
