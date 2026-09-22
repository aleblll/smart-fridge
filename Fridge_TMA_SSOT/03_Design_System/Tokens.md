---
id: "DS-001"
title: "Дизайн-токены, типографика и переменные Telegram WebApp"
type: "design_system"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "accepted"
tags:
  - design_system
  - tokens
  - anti-slop
  - telegram-css
  - tailwind
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T22:00:00Z
related_documents:
  - "[[00_Meta/System_Invariants.md]]"
  - "[[03_Design_System/Haptics_Map.md]]"
  - "[[03_Design_System/Anti_Slop_Checklist.md]]"
---

# Дизайн-токены, типографика и переменные Telegram WebApp

Интерфейс строится по стандартам инструментального утилитаризма (Linear, Apple Health). Полный отказ от декоративных градиентов и тяжелых теней. Ощущение глубины формируется субпиксельными микрогранями (Hairline borders) и ступенями нейтральной шкалы яркости Zinc.

---

## 1. Системные переменные и мост с Telegram WebApp

```css
:root {
  /* Системные переменные Telegram WebApp с безопасными fallback-значениями */
  --tg-bg: var(--tg-theme-bg-color, #09090b);
  --tg-secondary-bg: var(--tg-theme-secondary-bg-color, #121215);
  --tg-section-bg: var(--tg-theme-section-bg-color, #18181b);
  --tg-text: var(--tg-theme-text-color, #f4f4f5);
  --tg-hint: var(--tg-theme-hint-color, #71717a);
  --tg-button: var(--tg-theme-button-color, #fafafa);
  --tg-button-text: var(--tg-theme-button-text-color, #09090b);

  /* Семантические токены поверхностей */
  --surface-ground: var(--tg-bg);
  --surface-card: var(--tg-secondary-bg);
  --surface-subtle: var(--tg-section-bg);
  
  /* Токены текста */
  --text-primary: var(--tg-text);
  --text-muted: var(--tg-hint);
  
  /* Токены границ (Hairline micro-borders) */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
}

@media (prefers-color-scheme: light) {
  :root {
    --tg-bg: var(--tg-theme-bg-color, #ffffff);
    --tg-secondary-bg: var(--tg-theme-secondary-bg-color, #f4f4f5);
    --tg-section-bg: var(--tg-theme-section-bg-color, #e4e4e7);
    --tg-text: var(--tg-theme-text-color, #09090b);
    --tg-hint: var(--tg-theme-hint-color, #71717a);
    --tg-button: var(--tg-theme-button-color, #18181b);
    --tg-button-text: var(--tg-theme-button-text-color, #ffffff);

    --border-subtle: rgba(0, 0, 0, 0.06);
    --border-strong: rgba(0, 0, 0, 0.12);
  }
}
```

---

## 2. Семантическая палитра статусов годности

Яркий цвет в интерфейсе зарезервирован **исключительно** за состоянием свежести продукта.

| Статус | Критерий | Цвет (Dark / Light) | Hex-значение | Визуальное проявление в карточке |
|---|---|---|---|---|
| **Fresh** | Срок > 3 дней | `zinc-500` / `zinc-400` | `#71717A` / `#A1A1AA` | Нейтральный тон. Прогресс-бар заполнен слабо, не отвлекает внимание. |
| **Expiring Soon** | Срок 1–3 дня | `amber-400` / `amber-600` | `#FBBF24` / `#D97706` | Акцентный предупреждающий цвет. Прогресс-бар заполнен на 75%+. |
| **Expired Today / Critical** | Срок <= 0 дней | `rose-500` / `rose-600` | `#F43F5E` / `#E11D48` | Критический статус. 100% трека прогресса, бейдж «Истекает сегодня» или «Просрочено». |
| **Consumed / Discarded** | Списан | `zinc-600` / `zinc-400` (50% alpha) | `#52525B` | Приглушенный зачеркнутый текст, компактная высота строки. |

---

## 3. Математика относительного прогресс-бара

Вместо статичной даты («Годен до 14.10») в карточке отображается заполняющийся прогресс-бар:

$$R = \max\left(0, \min\left(1, \frac{T_{\text{exp}} - T_{\text{current}}}{T_{\text{exp}} - T_{\text{start}}}\right)\right)$$

- $T_{\text{start}}$ — дата добавления продукта в инвентарь.
- $T_{\text{exp}}$ — расчетная дата истечения пригодности.
- $T_{\text{current}}$ — текущее системное время.
- Доля истекшего ресурса: $P_{\text{spent}} = 1 - R$. При $P_{\text{spent}} \ge 0.75$ цвет прогресс-бара переключается на Amber; при $P_{\text{spent}} = 1.0$ — на Rose.

---

## 4. Типографика и плотность сетки
- **Шрифт:** Системный нативный стек `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif`. Сторонние веб-шрифты не загружаются (экономия 150+ КБ бандла).
- **Сетка и отступы:**
  - `px-4` (16px) — горизонтальные поля основного экрана.
  - `space-y-2` (8px) — плотные межстрочные интервалы списка продуктов.
  - `p-3` (12px) — внутренний отступ карточки продукта.
  - `rounded-lg` (8px) — радиус скругления кнопок и карточек (никаких избыточных `rounded-3xl`).
- **Микросостояния нажатия:**
  - `active:scale-[0.985]` с `transition-transform duration-100 ease-out`.
  - Отсутствие фоновых всплывающих теней (`shadow-none`).
