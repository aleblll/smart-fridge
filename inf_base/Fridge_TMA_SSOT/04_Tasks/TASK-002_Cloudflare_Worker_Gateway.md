---
id: "TASK-002"
title: "Разработка Cloudflare Worker Edge Gateway и DTO-санитизаторов"
type: "task"
status: "completed"
assigned_tier: "medium"
assigned_agent: "Cloud & Integrations Engineer"
architecture_ref: "[[01_Architecture/Cloudflare_Worker_Spec.md]]"
contract_ref: "[[02_Contracts/Database_Schema.json]]"
branch: "feature/TASK-002-cloudflare-worker"
tests_required: true
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-23T00:30:00Z
---

# TASK-002: Разработка Cloudflare Worker Edge Gateway и DTO-санитизаторов

## Для агента-исполнителя (Cloud & Integrations Engineer)
Разработать и протестировать код Cloudflare Worker по спецификации [[01_Architecture/Cloudflare_Worker_Spec.md]] и образцу `samgtu-schedule/cloudflare-worker.js`. Реализовать валидацию `initData` через HMAC-SHA256, строгую санитизацию DTO и REST-эндпоинты для работы с инвентарем.

## Критерии приемки (Definition of Done)
- [x] Создана папка `worker/` с конфигурацией `wrangler.toml` и исходным кодом `src/index.ts` (или `cloudflare-worker.js`).
- [x] Реализована функция `verifyTelegramInitData()` с проверкой подписи через Web Crypto API.
- [x] Реализована функция `sanitizeProductItem()` с Whitelist-фильтрацией полей (защита от Mass Assignment).
- [x] Реализованы маршруты:
  - `POST /api/auth/validate`
  - `GET /api/fridges/:id`
  - `POST /api/fridges/:id/products`
  - `PATCH /api/fridges/:id/products/:productId`
- [x] Настроены CORS-заголовки для вызовов из Telegram Mini App.
- [x] Токен бота считывается из `env.TELEGRAM_BOT_TOKEN` и не передается клиенту.
- [x] Написаны unit-тесты санитизатора DTO и валидатора подписи на Vitest/Miniflare.
