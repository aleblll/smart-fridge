# Big Picture: Telegram Mini App «Умный Холодильник»

<!-- open-steps:begin -->
## Продукт и текущий статус

Telegram Mini App для учета продуктов и контроля сроков годности.
Архитектурная модель: **Server-Authoritative (Cloudflare Worker + D1 SQL) с офлайн-кэшем и очередью мутаций**.
Инфраструктурный бюджет: **0 руб/мес** (Free Tier Cloudflare Workers + D1 + GitHub Pages).

### Карта компонентов и реальный статус (после выполнения Спринта 3)

| Компонент / Фича | Путь | Стадия | Доказательство готовности |
|---|---|---|---|
| Дизайн Mindora UI-KIT | `frontend/src/` | verified | Палитра Mindora, Hero свежести, карточки еды, frosted glass; чистый билд 3.5с |
| Каркас TMA Frontend | `frontend/` | verified | `isReady` гарантирован, `requestWriteAccess`, безопасный буфер, скрытая отладка по тапу |
| Cloudflare Worker Gateway | `worker/` | verified | Zero-Trust HMAC валидация, `auth_date` < 1ч, constant-time compare, RBAC `fridge_members`, закрытый CRON; 39/39 тестов |
| База данных D1 SQL | `worker/schema.sql` | verified | Таблицы `fridges` (UUID), `fridge_members`, `products` (soft-delete), `invites`, `user_notifications` |
| Подключение API и оффлайн-кэш | `frontend/src/lib/storage.ts` | verified | Полный отказ от CloudStorage; тонкий клиент к D1, локальный кэш, очередь `smart_fridge_mutation_queue` с `online` синхронизатором |
| Семейный доступ и инвайты | `frontend/src/components/ShareModal.tsx` | verified | Генерация 32-символьных криптостойких кодов, авто-claim по `start_param`, переключение на семейный спейс |
| Продуктовая фича «Вскрыто» | `frontend/src/components/ProductCard.tsx` | verified | Кнопка «Вскрыть», пересчет срока по `after_opening_hours`, бейдж «Вскрыто [дата]», PATCH на сервер |
| Утренние push-уведомления | `worker/src/index.ts` | verified | Cloudflare Worker Cron Trigger (`0 6 * * *`), прямая выборка из D1, идемпотентность, антиспам, лимит 10 позиций |
| Инфраструктура монорепозитория | Корень / CI | verified | Корневой `package.json` (workspaces: frontend, worker), `vitest.config.ts`, удалены дубли `.js`, чистые линтер и тесты |

### Очередь задач (Sprint 4: Полировка продуктовой ценности)
- Архитектурный ревью-манифест: `[[Fridge_TMA_SSOT/01_Architecture/ADR/ADR-007_Server_Authoritative_D1_Architecture.md|ADR-007]]`
- `TASK-016` (Каталог продуктов): Добавить яйца и недостающие позиции в базу пресетов, проверить цифры СанПиН/USDA.
- `TASK-017` (Пользовательские настройки): Экран настроек уведомлений в приложении (выбор локального времени дайджеста и таймзоны).
- `TASK-018` (Быстрый ввод из бота): Обработка текстовых команд боту (например, `/add молоко 3д`).
<!-- open-steps:end -->
