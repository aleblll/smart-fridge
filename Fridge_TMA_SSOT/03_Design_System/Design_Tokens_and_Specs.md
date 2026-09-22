---
id: "DS-004"
title: "Спецификация дизайн-системы: Minimal Zinc (Anti-Slop Edition)"
type: "design_system"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "accepted"
tags:
  - design_system
  - specs
  - ui
  - anti-slop
  - vaul-drawer
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T22:00:00Z
related_documents:
  - "[[03_Design_System/Tokens.md]]"
  - "[[03_Design_System/Haptics_Map.md]]"
  - "[[03_Design_System/Anti_Slop_Checklist.md]]"
---

# Спецификация дизайн-системы: Minimal Zinc (Anti-Slop Edition)

## 1. Цветовая палитра и интеграция с Telegram Theme Variables
Интерфейс не использует фиксированных серых цветов. Все базовые фоны и границы динамически наследуют тему клиента Telegram, с резервным падением на палитру Zinc.

```css
:root {
  /* Системные переменные Telegram WebApp */
  --bg-primary: var(--tg-theme-bg-color, #09090b);
  --bg-secondary: var(--tg-theme-secondary-bg-color, #18181b);
  --text-primary: var(--tg-theme-text-color, #fafafa);
  --text-muted: var(--tg-theme-hint-color, #a1a1aa);
  --accent-button: var(--tg-theme-button-color, #27272a);
  --accent-button-text: var(--tg-theme-button-text-color, #ffffff);

  /* Семантические статусы свежести (Зарезервированы строго под сроки) */
  --status-fresh: #10b981;          /* emerald-500: > 2 дней */
  --status-fresh-bg: rgba(16, 185, 129, 0.12);

  --status-warning: #f59e0b;        /* amber-500: осталось 1-2 дня */
  --status-warning-bg: rgba(245, 158, 11, 0.12);

  --status-critical: #f43f5e;       /* rose-500: истекает сегодня / просрочено */
  --status-critical-bg: rgba(244, 63, 94, 0.12);

  /* Контурные границы (Отказ от теней в пользу 1px borders) */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-active: rgba(255, 255, 255, 0.16);
}
```

---

## 2. Анатомия карточки продукта
- **Высота строки:** 64px (оптимально под тач-зону большого пальца).
- **Разделители:** `border-b border-[var(--border-subtle)]`.
- **Левый блок:** Иконка категории (20px, монохром, цвет `text-muted`).
- **Центральный блок:**
  - Верхняя линия: Название продукта (`font-medium text-sm text-[var(--text-primary)]`).
  - Нижняя линия: Количество и статус («1 шт. · Открыто вчера») (`text-xs text-[var(--text-muted)]`).
- **Правый блок:**
  - Относительный срок годности («2 дня») крупным числом.
  - Тонкий горизонтальный прогресс-бар высотой 2px под текстом.

---

## 3. Спецификация нижней шторки (Vaul Bottom Sheet)
- **Фокус ввода:** Инпут с `autoFocus` поднимает клавиатуру сразу при открытии.
- **Предиктивные чипы:** Горизонтальный скролл-контейнер над клавиатурой (`flex gap-2 overflow-x-auto no-scrollbar`).
- **Степперы количества:** Дискретные кнопки `[-]` 1 шт. `[+]` с откликом `impactOccurred('light')`.
- **Изоляция скролла:** `touch-action: none` на полоске перетаскивания (Drag Handle) во избежание конфликтов со шторкой Telegram.

---

## 4. Чек-лист проверки чистоты UI (Anti-Slop Gate)
- [ ] Отсутствуют цветные градиенты на карточках и кнопках.
- [ ] Отсутствуют размытые тени (`box-shadow` с радиусом > 4px запрещены; глубина создается границами `border`).
- [ ] Цвет используется **только** для отображения срока годности и иконок удаления/списания.
- [ ] Радиус скругления элементов не превышает 12px (`rounded-xl`), мелкие чипы — 6px (`rounded-md`).
- [ ] Нажатия на интерактивные элементы сопровождаются тактильным откликом соответствующего уровня.
