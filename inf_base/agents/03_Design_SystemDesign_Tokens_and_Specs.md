# Спецификация дизайн-системы: Minimal Zinc (Anti-Slop Edition)

## 1. Цветовая палитра и интеграция с Telegram Theme Variables
Интерфейс не использует фиксированных серых цветов. Все базовые фоны и границы динамически наследуют тему клиента Telegram, с резервным падением на палитру Zinc[cite: 2, 6].

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