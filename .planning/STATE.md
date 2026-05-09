# STATE.md — Bratsy_DP

## Project Reference

**Core Value:** По нажатию кнопки данные из всех подключённых систем проходят через пайплайн симуляции и возвращают экономические решения — оптимальная компоновка, загрузка, логистика, CAPEX.

**Current Milestone:** v1 — Plant Simulation integration + pipeline control + observability  
**Tech Stack:** PowerShell + Windows Forms, compiled via ps2exe  
**Integration Method:** External scripts/macros (not COM API)

## Current Position

**Current Phase:** Phase 1 — Настройки и конфигурация  
**Current Plan:** 01-01 (Wave 1 из 2)  
**Status:** Ready to execute  

```
Progress: [ Phase 1 ] [ Phase 2 ] [ Phase 3 ]
           Planned     Blocked    Blocked
```

**Phase Goals:**
- Phase 1: Settings panel with persistent path configuration
- Phase 2: Live pipeline control (launch/stop stages, real-time log + notifications)
- Phase 3: Real Plant Simulation execution + results display

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 3 |
| Phases complete | 0 |
| Plans complete | 0/? |
| Requirements covered | 10/10 |
| Requirements done | 0/10 |

## Accumulated Context

### Key Decisions
- PowerShell + WinForms: works without dependencies on factory PCs
- Script/macro launch instead of COM: fewer version-dependency issues, easier to maintain
- ps2exe: single .exe, no installer — factory PCs may lack installation rights
- MVP focus: monitoring + pipeline control (team must see status and start/stop stages)

### Existing Prototype
- `app/create_test.ps1` (423 lines): functional UI prototype with simulated pipeline stages
- Has: 5-stage pipeline UI (AutoCAD, Vault, Excel, PlantSim, Report), real-time metrics display, color palette, logo loader
- Does NOT yet have: real process execution, settings persistence, real PlantSim macro call, results parsing

### Constraints
- Windows only (factory environment)
- All integrated systems (AutoCAD, Vault, PlantSim) run on Windows
- Single .exe distribution, no installer
- Russian UI language

### Todos
- [ ] Plan Phase 1 (run /gsd-plan-phase 1)

### Blockers
None

## Session Continuity

**Last session:** 2026-05-09 — Phase 1 context gathered (discuss-phase завершён)  
**Next action:** `/gsd-plan-phase 1`

---
*Last updated: 2026-05-09*
