---
id: "TASK-REG-004"
title: "Спринт 1: Фундамент Cloudflare Edge, Инвентарь и SDK"
type: "sprint_backlog"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "active"
tags:
  - tasks
  - sprint
  - backlog
  - cloudflare
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T23:50:00Z
related_documents:
  - "[[04_Tasks/Backlog.md]]"
  - "[[00_Meta/Prompts/Frontend_Lead_Prompt.md]]"
  - "[[00_Meta/Prompts/Cloud_Integrations_Prompt.md]]"
  - "[[00_Meta/Prompts/QA_Data_Hygiene_Prompt.md]]"
---

# Спринт 1: Фундамент Cloudflare Edge, Инвентарь и SDK

## Реестр задач Спринта 1 (Стек samgtu-schedule)

### TASK-001: Настройка сборки Vite React 19 и интеграция Telegram SDK
- **ID:** `TASK-001`
- **Исполнитель:** Frontend Lead (Gemini 3.7 Flash)
- **Thinking Tier:** Medium
- **Статус:** `completed`
- **Цель:** Развернуть базовый проект на React 19, TypeScript и Tailwind CSS, подключить `@telegram-apps/sdk-react` и протестировать работу хуков внутри Telegram WebView.
- **DoD:**
  - [x] Проект успешно собирается командой `npm run build` с объемом начального чанка < 110 КБ (88.56 KB gzip).
  - [x] Настроен хук блокировки вертикальных свайпов `useTelegramGestureLock` (`disableVerticalSwipes`).
  - [x] Реализован провайдер темы, считывающий параметры `themeParams` из Telegram SDK.
  - [x] Настроена публикация на GitHub Pages через Action (`peaceiris/actions-gh-pages`).

---

### TASK-002: Разработка Cloudflare Worker Edge Gateway и DTO-санитизаторов
- **ID:** `TASK-002`
- **Исполнитель:** Cloud & Integrations Engineer (Gemini 3.7 Flash)
- **Thinking Tier:** Medium
- **Статус:** `completed`
- **Цель:** Сформировать и протестировать код Cloudflare Worker по образцу `samgtu-schedule/cloudflare-worker.js`.
- **DoD:**
  - [x] Создана папка `worker/` с `wrangler.toml` и `src/index.ts`.
  - [x] Реализована проверка `initData` по HMAC-SHA256 (Web Crypto API).
  - [x] Реализована Whitelist-санитизация DTO (функция `sanitizeProductItem`).
  - [x] Настроены CORS-заголовки.

---

### TASK-003: Справочник продуктов и алгоритм предиктивного сопоставления
- **ID:** `TASK-003`
- **Исполнитель:** QA, Data & Hygiene Operator (Gemini 3.6 Flash)
- **Thinking Tier:** Low
- **Статус:** `completed`
- **Цель:** Собрать датасет сроков годности в `src/data/foodPresets.json` по СанПиН 2.3.2.1324-03 / USDA FoodKeeper и валидировать по схеме `Food_Presets_Schema.json`.
- **DoD:**
  - [x] Датасет содержит не менее 100 базовых продуктов (122 элемента), валидированных по СанПиН / USDA.
  - [x] Покрыты тестами на Vitest: поиск по префиксу, расчет вторичного срока после вскрытия (`after_opening_hours`).
  - [x] Время сопоставления строки на выборке составляет менее 5 мс на мобильном процессоре.

---

### TASK-004: Шторка быстрого добавления на Vaul Drawer и тактильность
- **ID:** `TASK-004`
- **Исполнитель:** Frontend Lead (Gemini 3.7 Flash)
- **Thinking Tier:** Medium
- **Статус:** `completed`
- **Цель:** Создать шторку добавления продукта с немедленным фокусом инпута, предиктивными чипами и тактильным откликом без конфликтов со свайпами Telegram.
- **DoD:**
  - [x] При вызове шторки фокус автоматически выставляется в `input`, открывая экранную клавиатуру.
  - [x] Предиктивные чипы динамически фильтруются при вводе от 2 символов.
  - [x] Одиночный тап по чипу формирует готовую сущность продукта и закрывает шторку с вибрацией `notificationOccurred('success')`.
  - [x] Жест закрытия шторки свайпом вниз не приводит к сворачиванию всего Telegram Mini App.

---

### TASK-005: Workflow утренних оповещений в Telegram на GitHub Actions
- **ID:** `TASK-005`
- **Исполнитель:** Cloud & Integrations Engineer (Gemini 3.7 Flash)
- **Thinking Tier:** Medium
- **Статус:** `completed`
- **Цель:** Написать скрипт `scripts/notify.mjs` и workflow `.github/workflows/notify.yml` для ежедневной рассылки сообщений о продуктах с истекающим сроком.
- **DoD:**
  - [x] Workflow запускается по расписанию в 06:00 UTC через cron-триггер GitHub Actions.
  - [x] Скрипт группирует продукты одного пользователя в единый аккуратный HTML-дайджест (без спама отдельными сообщениями).
  - [x] Внедрен рейт-лимитер вызовов Telegram API (не более 25 сообщений/сек) с обработкой HTTP 429 (`retry_after`).
  - [x] Пользователи, заблокировавшие бота (HTTP 403), автоматически помечаются в базе флагом `is_bot_blocked: true`.
