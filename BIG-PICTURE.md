# Big Picture: Telegram Mini App «Умный Холодильник»

<!-- open-steps:begin -->
## Продукт и текущий статус

Telegram Mini App для учета продуктов и контроля сроков годности по СанПиН/USDA в архитектуре Zero-VPS ($0/мес, без выделенных серверов).

### Карта компонентов и стадия готовности

| Компонент / Фича | Путь | Стадия | Доказательство готовности |
|---|---|---|---|
| Каркас TMA Frontend | `frontend/` | verified | React 19 + Tailwind v4 + Telegram SDK; билд 88.56 КБ gzip, ESLint clean |
| Cloudflare Worker Edge Gateway | `worker/` | verified | HMAC SHA-256 валидация `initData`, whitelist DTO санитизация; 11/11 тестов пройдены |
| Справочник продуктов SanPiN/USDA | `src/data/foodPresets.json` | verified | 122 позиции по 11 категориям, 76.35 КБ; 4/4 теста пройдены, 0 ошибок схемы |
| Шторка быстрого добавления (Vaul Drawer) | `frontend/src/components/` | verified | Шторка Vaul Drawer, автофокус, предиктивные чипы, Haptics, шкала свежести; билд 2.74с |
| Утренние push-уведомления (Cron) | `.github/workflows/notify.yml` | verified | GitHub Actions cron `0 6 * * *`, скрипт `notify.mjs`, рейт-лимитер 25 msg/s; 10/10 тестов пройдены |

### Очередь задач (Sprint 2 / Release Wave)
- `RELEASE-001`: Деплой фронтенда на GitHub Pages / Cloudflare Pages и привязка к `@Svezhestt_bot`.
- `RELEASE-002`: Деплой Cloudflare Worker на edge-сеть и установка секрета `TELEGRAM_BOT_TOKEN`.
<!-- open-steps:end -->
