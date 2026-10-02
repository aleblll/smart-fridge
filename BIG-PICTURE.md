# Big Picture: Telegram Mini App «Умный Холодильник»

<!-- open-steps:begin -->
## Продукт и текущий статус

Telegram Mini App для учета продуктов и контроля сроков годности.
Архитектурная модель: **Server-Authoritative (Cloudflare Workers + D1) с офлайн-кэшем**.
Инфраструктурный бюджет: **0 руб/мес** (Free Tier Cloudflare + GitHub Pages).

### Карта компонентов и реальный статус (после аудита от 2026-10-03)

| Компонент / Фича | Путь | Стадия | Доказательство готовности / Проблематика |
|---|---|---|---|
| Дизайн Mindora UI-KIT | `frontend/src/` | verified | Палитра Mindora, Hero свежести, карточки еды, frosted glass; чистый билд 2.8с |
| Каркас TMA Frontend | `frontend/` | broken | Баг в `TelegramContext`: `setIsReady(true)` недостижим из-за `return` внутри `if(webApp)`; нет связи с API |
| Cloudflare Worker Gateway | `worker/` | broken | Оторван от фронта; дыры в безопасности (обход CRON_SECRET, нет авторизации на холодильниках, `*` CORS) |
| База данных и синхронизация | `worker/` / `D1` | queued | Требуется переход с KV на D1 (SQL: fridges, members, products); лимит CloudStorage 4 КБ рушит хранение |
| Справочник продуктов | `src/data/foodPresets.json` | in_progress | 122 позиции, но нет яиц, дублируется в 2 местах; `opened_at` и `after_opening_hours` не используются в UI |
| Шторка добавления продукта | `frontend/src/components/AddProductDrawer.tsx` | in_progress | Работает локально, но нет дробных значений (0.5 кг), рассинхрон UTC/локального времени |
| Семейный доступ и инвайты | `frontend/src/components/ShareModal.tsx` | broken | Ссылка генерируется, но `start_param` в клиенте не разбирается; данные изолированы в CloudStorage |
| Утренние push-уведомления | `scripts/notify.mjs` | broken | Падает 10 дней подряд (нет `CLOUDFLARE_WORKER_URL`), ссылка на чужого бота `SmartFridgeBot` |
| Инфраструктура и тесты | Корень / CI | broken | Нет корневого `package.json`, тесты оторваны от воркера/фронта; мусор и дубли (`.js` vs `.mjs`, `inf_base`) |

### Очередь задач (Sprint 3: Капитальный ремонт архитектуры)
- Архитектурный ревью-манифест: `[[Fridge_TMA_SSOT/01_Architecture/ADR/ADR-007_Server_Authoritative_D1_Architecture.md|ADR-007]]`
- `TASK-010` (Инфраструктура & Клининг): Удалить дубли (`cloudflare-worker.js`, `notify.js`), создать корневой `package.json` (workspaces), связать vitest.
- `TASK-011` (Клиентские фиксы): Починить `isReady` в `TelegramContext.tsx`, безопасный `clipboard.writeText`, ввод дробных чисел (0.5 кг), убрать терминал диагностики в скрытый режим.
- `TASK-012` (Единые даты): Вынести калькулятор дней до срока в единую функцию без UTC-сдвигов (`YYYY-MM-DD` + локальная дата) и единый порог `notify_before_days`.
- `TASK-013` (Cloudflare D1 Backend): Схема таблиц (`fridges`, `fridge_members`, `products`), строгая валидация `initData` с `auth_date`, защита CRON-эндпоинта, random UUID.
- `TASK-014` (Сквозное подключение API): Перевод `storage.ts` на серверный D1 с очередью мутаций и локальным кэшем, разбор `start_param` при переходе по семейной ссылке.
- `TASK-015` (Встроенные уведомления): Перенос рассылки в Cron Triggers воркера с учетом часовых поясов пользователей и корректной ссылкой на приложение.
<!-- open-steps:end -->
