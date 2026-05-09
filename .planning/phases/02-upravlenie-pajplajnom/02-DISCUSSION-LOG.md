# Phase 2: Управление пайплайном - Discussion Log

> **Audit trail only.** Decisions are in CONTEXT.md.

**Date:** 2026-05-09
**Areas discussed:** Лог выполнения, Уведомления

---

## Лог выполнения — где показывается

| Option | Selected |
|--------|----------|
| Секция под карточками (фиксированная) | ✓ |
| Боковая панель справа | |
| Разворачивается под карточкой | |

**Что показывает когда ничего не запущено:** Панель скрыта, появляется при запуске (CSS transition).

---

## Уведомления — вид и место

| Option | Selected |
|--------|----------|
| Toast в правом нижнем углу | ✓ |
| Строка статуса в футере | |
| И toast, и строка статуса | |

---

## Claude's Discretion

- Запуск/остановка: toggle-паттерн (клик по активной карточке = стоп)
- Механизм real-time: Tauri events (emit из Rust → listen в JS)
- Хранение процессов: Arc<Mutex<HashMap<String, Child>>> в Tauri State
- Остановка: kill (не graceful)
