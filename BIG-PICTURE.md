# Big Picture: Telegram Mini App «Умный Холодильник»

<!-- open-steps:begin -->
## Продукт и текущий статус

Telegram Mini App для учета продуктов и контроля сроков годности по СанПиН/USDA в архитектуре Zero-VPS ($0/мес, без выделенных серверов).

### Карта компонентов и стадия готовности

| Компонент / Фича | Путь | Стадия | Доказательство готовности |
|---|---|---|---|
| Каркас TMA Frontend | `frontend/` | verified | React 19 + Tailwind v4 + Telegram SDK; билд 88.56 КБ gzip, ESLint clean |
| Дизайн Mindora UI-KIT (TASK-006A) | `frontend/src/` | verified | Палитра Mindora, Hero свежести, асимметричные карточки еды, блок «Идея на вечер»; билд 2.94с |
| Cloudflare Worker Edge Gateway | `worker/` | verified | HMAC SHA-256 валидация `initData`, whitelist DTO санитизация; 11/11 тестов пройдены |
| Справочник продуктов SanPiN/USDA | `src/data/foodPresets.json` | verified | 122 позиции по 11 категориям, 76.35 КБ; 4/4 теста пройдены, 0 ошибок схемы |
| Шторка быстрого добавления (Vaul Drawer) | `frontend/src/components/AddProductDrawer.tsx` | verified | Выбор произвольной даты (+2д..+1мес, степперы, календарь), sticky-кнопка, пресеты без закрытия; билд 2.74с |
| Экран диагностики и логов | `frontend/src/components/DiagnosticsDrawer.tsx` | verified | Логи в реальном времени, системные метаданные (платформа, ID, CloudStorage), экспорт в буфер |
| Семейный доступ и шаринг | `frontend/src/components/ShareModal.tsx` | verified | Инвайт-ссылки `startapp=fridge_<ID>`, нативный шеринг в Telegram, копирование в буфер |
| Утренние push-уведомления (Cron) | `.github/workflows/notify.yml` | verified | GitHub Actions cron `0 6 * * *`, скрипт `notify.mjs`, рейт-лимитер 25 msg/s; 10/10 тестов пройдены |

### Очередь задач (Sprint 2: Premium UI & Family Edge Sync)
- Архитектурный стандарт: `[[Fridge_TMA_SSOT/01_Architecture/ADR/ADR-006_Agent_Orchestration_Inspo_MCP_and_Post_Build_QA.md|ADR-006]]`
- Визуальный закон: `[[frontend/DESIGN-DIRECTION.md|DESIGN-DIRECTION.md]]`
- Подробная дорожная карта: `[[Fridge_TMA_SSOT/04_Tasks/Sprint_02_Roadmap.md|Sprint_02_Roadmap.md]]`
- `TASK-006A` (Frontend Lead): Редизайн эталонного главного экрана (Mindora UI-KIT) — ЗАВЕРШЕНО ✅.
- `TASK-007` (QA Subagent): Автоматический контур верификации сборки (билд, линтер, 25+ Vitest тестов, Anti-Slop аудит) — ЗАВЕРШЕНО ✅.
- `TASK-008` (Cloud Integrations): Развертывание Cloudflare Edge KV/D1 для семейной синхронизации между разными Telegram-аккаунтами (`startapp=fridge_<ID>`).
<!-- open-steps:end -->
