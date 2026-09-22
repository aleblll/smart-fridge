---
id: "TASK-007"
title: "Автоматизированный контур Post-Build QA: проверка типов, линтинга, тестов и Anti-Slop дизайна"
type: "task"
status: "todo"
tier: "low"
author: "System-Architect-Gemini-3.8-Flash"
assignee: "qa_hygiene_operator"
related_documents:
  - "[[00_Meta/Prompts/QA_Data_Hygiene_Prompt.md]]"
  - "[[01_Architecture/ADR/ADR-006_Agent_Orchestration_Inspo_MCP_and_Post_Build_QA.md]]"
  - "[[03_Design_System/Anti_Slop_Checklist.md]]"
tags:
  - qa
  - testing
  - automation
  - gate
created_at: 2026-09-23T01:30:00Z
updated_at: 2026-09-23T01:30:00Z
---

# TASK-007: Автоматизированный контур Post-Build QA

## 1. Контекст и цель
Чтобы исключить попадание визуальных багов, поломок типов TypeScript и регрессий бизнес-логики пользователю, после каждой сборки запускается специализированный легковесный субагент QA.

---

## 2. Алгоритм проверки QA-субагента

1. **Компиляция TypeScript и бандлинг:**
   - Команда: `npm run build` в `frontend/`.
   - Критерий: 0 ошибок, 0 неразрешенных модулей, размер бандла < 110 КБ gzip.
2. **Статический анализ кода (Линтинг):**
   - Команда: `npm run lint` в `frontend/`.
   - Критерий: 0 warnings, 0 errors.
3. **Регрессионный прогон юнит-тестов:**
   - Команда: `npx vitest run`.
   - Критерий: 25+ тестов зеленые (Edge Gateway HMAC, Food Presets Schema, Notifier Rate Limiter).
4. **Anti-Slop инспекция компонентов:**
   - Проверка CSS-классов на отсутствие дешевых фиолетовых градиентов, размытых цветных теней.
   - Проверка наличия микроанимаций (`transition-all`, `active:scale-[0.985]`, spring-конфигурации).
5. **Формирование отчета:**
   - Вердикт: `VERIFICATION: PASS` или `VERIFICATION: FAIL` с перечнем конкретных строк кода и дефектов.

---

## 3. Критерии приемки (Definition of Done)
- [ ] Субагент отрабатывает контур без ручного вмешательства.
- [ ] Все 4 шага верификации пройдены успешно.
- [ ] Отчет предоставлен Архитектору для фиксации в SSOT.
