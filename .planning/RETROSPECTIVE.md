# RETROSPECTIVE — DP_orchestra

## Milestone: v1.0 — Plant Simulation MVP

**Shipped:** 2026-05-17
**Phases:** 4 | **Plans:** 9 | **Timeline:** 59 дней

### What Was Built

1. Gear-button + sliding settings overlay + settings.json persistence (Phase 1)
2. Rust ProcessMap + async pipeline control + real-time events + pill statuses + toast (Phase 2)
3. mock-plantsim.ps1 dev-stub + PlantSim Rust backend + results.txt parsing (Phase 3)
4. Full PlantSim data pipeline: Arguments, work_dir, history archive, timeout, stop+taskkill (Phase 4)
5. inputSppPath/inputWorkDir fields + SimTalk template documentation (Phase 4 gap closure)

### What Worked

- **Gap closure цикл работает**: VERIFICATION.md → gap plan 04-03 → исправление → re-verify 14/14. Процесс выявил реальную проблему (отсутствующие HTML-поля) которая иначе стала бы runtime-ошибкой.
- **Rust-бэкенд был чистым**: Phase 4 Plan 01 выполнен без gap-ов — все 8 изменений D-03/D-04/D-06/D-07/D-09/D-10/D-11/D-12 прошли с первого раза.
- **Tauri events contract**: stage-status/stage-log/stage-results — чистый контракт, JS-фронтенд подключился без трений.

### What Was Inefficient

- **HTML/JS gap в Phase 4**: Frontend-поля (inputSppPath, inputWorkDir) не были включены в планы Phase 3/4, обнаружились только на верификации. Стоило добавить в PLAN checklist: "все referenced HTML-элементы существуют".
- **STATE.md encoding**: Файл был записан с mojibake (Windows-1252 в UTF-8 контексте). Пришлось перезаписывать целиком.
- **Auto-save hooks**: Все коммиты оказались "Auto-save: filename" вместо semantic messages. Git history нечитаем.

### Patterns Established

- **Arguments format для PlantSim:** `-f "{spp}" /E {method} --workdir "{work_dir}"` — SimTalk читает через `getCommandLineArg("--workdir")`
- **results.txt contract:** `key=value` по одной строке, PlantSim пишет в `work_dir`, Rust читает через `lnk_dir = PathBuf::from(&settings.work_dir)`
- **readonly + нативный диалог:** для file/folder полей — `pick_file`/`pick_folder` через Tauri, `readonly` атрибут, browse-btn с `data-type="file|folder"`
- **step-collapsed класс:** для аккордеона locked-шагов — не `pointer-events:none` (блокирует всё), а toggle-класс по клику на header

### Key Lessons

1. **Верифицировать HTML-элементы в плане**: если main.js ссылается на `getElementById('inputSppPath')`, убедиться что элемент есть в index.html ДО выполнения плана.
2. **STATE.md encoding**: Записывать STATE.md только через Write tool с явной UTF-8 кодировкой — не через терминал.
3. **Auto-save коммиты**: Настроить hook или convention для semantic commit messages — auto-save делает git log бесполезным.
4. **Code review findings CR-01/CR-02**: `if (el && val)` guard и dangling listeners — записаны в tech debt для v1.1.

### Cost Observations

- Sessions: ~5-6 сессий
- Model: claude-sonnet-4-6 (balanced profile)
- Notable: gap closure цикл добавил ~1 сессию, но обнаружил реальный баг

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Gap Closures | Timeline |
|-----------|--------|-------|--------------|----------|
| v1.0 | 4 | 9 | 1 (04-03) | 59 дней |
