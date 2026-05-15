---
phase: 4
slug: dannye-plant-simulation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Ручное тестирование (нет unit-test фреймворка) |
| **Config file** | none |
| **Quick run command** | `npm run tauri dev` (из bratsy-tauri/) |
| **Full suite command** | Все 4 Success Criteria из ROADMAP.md Phase 4 |
| **Estimated runtime** | ~5 минут (ручной smoke-тест) |

---

## Sampling Rate

- **После каждой задачи:** `cargo build` — убедиться что Rust компилируется
- **После каждого плана:** `npm run tauri dev` + ручная проверка UI
- **Перед `/gsd-verify-work`:** Полный сквозной тест с mock-plantsim.ps1
- **Max feedback latency:** build + ручной тест ~2 минуты

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | (Phase 4 goal) | T-4-01 / — | method allowlist сохранён | manual | `cargo build` | ✅ | ⬜ pending |
| 4-01-02 | 01 | 1 | (Phase 4 goal) | — | work_dir валидируется до запуска | manual | `npm run tauri dev` | ✅ | ⬜ pending |
| 4-01-03 | 01 | 1 | (Phase 4 goal) | — | spp_path валидируется до запуска | manual | `npm run tauri dev` | ✅ | ⬜ pending |
| 4-02-01 | 02 | 1 | (Phase 4 goal) | — | таймаут завершает PlantSim | manual | `npm run tauri dev` | ✅ | ⬜ pending |
| 4-02-02 | 02 | 1 | (Phase 4 goal) | — | архив создаётся в work_dir/history/ | manual | `cargo build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Существующая инфраструктура покрывает все требования Phase 4.

- mock-plantsim.ps1 уже есть в `bratsy-tauri/dev-tools/` — использовать для тестирования без реального PlantSim
- `cargo build` — проверка компиляции Rust после каждого изменения lib.rs

*Новых тестовых файлов создавать не нужно.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| results.txt читается из work_dir (не writable_dir) | Phase 4 goal | Нет unit-тестов | Запустить с mock, проверить что файл создаётся в work_dir |
| --workdir передаётся в Arguments ярлыка | Phase 4 goal | Нет unit-тестов | Открыть .lnk в PS и проверить Arguments после модификации |
| Таймаут 2 мин → taskkill PlantSim | Phase 4 goal | Требует реального/зависшего PlantSim | Зависнуть mock, проверить таймаут |
| Архив создаётся в work_dir/history/ | Phase 4 goal | Файловая система | После запуска проверить наличие файла в history/ |
| Stop убивает и PowerShell, и PlantSim | Phase 4 goal | Требует работающего PlantSim | Нажать Stop во время симуляции |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
