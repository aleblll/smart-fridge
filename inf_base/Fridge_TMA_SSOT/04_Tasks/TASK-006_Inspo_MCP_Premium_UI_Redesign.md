---
id: "TASK-006"
title: "Редизайн интерфейса TMA: Inspo MCP референсы, fluid-анимации, микроконтрасты и ликвидация нейрослопа"
type: "task"
status: "todo"
tier: "medium"
author: "System-Architect-Gemini-3.8-Flash"
assignee: "frontend_lead"
related_documents:
  - "[[00_Meta/Prompts/Frontend_Lead_Prompt.md]]"
  - "[[01_Architecture/ADR/ADR-006_Agent_Orchestration_Inspo_MCP_and_Post_Build_QA.md]]"
  - "[[03_Design_System/Tokens.md]]"
  - "[[03_Design_System/Anti_Slop_Checklist.md]]"
tags:
  - frontend
  - tma
  - ui
  - inspo-mcp
  - motion
created_at: 2026-09-23T01:30:00Z
updated_at: 2026-09-23T01:30:00Z
---

# TASK-006: Редизайн интерфейса TMA на базе Inspo MCP

## 1. Контекст и цель
Текущий интерфейс страдает от дефектов «нейрослопа» (сухой статический вид, недостаточный микроконтраст темной темы, отсутствие плавной кинематики и жестов).
**Цель:** Превратить приложение в премиальный, живой утилитарный инструмент (уровня Linear, Cron, Apple Health), используя реальные референсы из MCP `inspo`.

---

## 2. Пошаговые требования к Frontend Lead

### Шаг 1: Обязательное извлечение референсов из MCP `inspo`
- Вызвать `call_mcp_tool` к серверу `inspo`:
  - `recommend({ brief: "minimalist dark mobile food tracker with smooth gestures and cards", mode: "dark", device: "mobile" })`
  - `find_components({ query: "mobile card list swipe action dark", category: "card" })`
  - `get_reference_jsx(...)` для копирования эталонных паттернов компоновки.

### Шаг 2: Внедрение плавной кинематики и микро-анимаций
- Добавить в `ProductCard`:
  - Плавный вход при монтировании (fade-in + slide-up 150-200ms).
  - Плавный выход при потреблении/списании (схлопывание высоты и fade-out).
  - Микро-реакция на нажатие: `active:scale-[0.985] transition-transform duration-100`.
- Анимация смены табов («Холодильник» / «Съедено» / «Утиль»): мягкий cross-fade без дергания контента.
- Тактильный отклик Telegram Haptics на все интерактивные переходы.

### Шаг 3: Микроконтрасты и визуальная чистота (Zero-Slop)
- Фон: `#09090b` (Zinc-950).
- Карточки: `#121215` (Zinc-900) с границей 1px `rgba(255, 255, 255, 0.08)`.
- Исключить любые цветные размытые тени и фиолетовые декоративные градиенты.
- Цвета: акценты только функциональные (статус свежести продуктов: Emerald, Amber, Rose).

### Шаг 4: Сборка и передача на аудит
- Выполнить `npm run build` во `frontend/`.
- Убедиться, что бандл < 110 КБ gzipped.
- Передать Архитектору статус готовности для запуска QA-субагента.

---

## 3. Критерии приемки (Definition of Done)
- [ ] Отработан поиск референсов в MCP `inspo` с фиксацией найденных решений.
- [ ] Все карточки анимированы (вход, удаление, клик).
- [ ] Никаких визуальных багов при скролле и открытии шторки.
- [ ] Команда `npm run build` проходит без ошибок TypeScript.
- [ ] Получен вердикт `PASS` от QA-субагента.
