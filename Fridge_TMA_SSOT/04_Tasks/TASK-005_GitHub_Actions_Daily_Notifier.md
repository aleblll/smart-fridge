---
id: "TASK-005"
title: "Реализация скрипта утренних уведомлений и workflow в GitHub Actions"
type: "task"
status: "completed"
assigned_tier: "medium"
assigned_agent: "Cloud & Integrations Engineer"
architecture_ref: "[[01_Architecture/ADR/ADR-003_GitHub_Actions_Push_Cron.md]]"
contract_ref: "[[02_Contracts/Database_Schema.json]]"
branch: "feature/TASK-005-github-actions-notifier"
tests_required: true
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-23T00:48:00Z
---

# TASK-005: Реализация скрипта утренних уведомлений и workflow в GitHub Actions

## Для агента-исполнителя (Cloud & Integrations Engineer)
Создать автономный контур ежедневных утренних уведомлений по расписанию 06:00 UTC. Написать Node.js скрипт `scripts/notify.mjs` / `scripts/notify.js`, выполняющий опрос Cloudflare Worker Edge API (`/api/sync/pull` или эндпоинт нотификаций с `CRON_SECRET`) и отправку персонализированных дайджестов пользователям через Telegram Bot API с соблюдением платформенных лимитов скорости.

## Критерии приемки (Definition of Done)
- [x] Создан файл рабочего процесса `.github/workflows/notify.yml` с триггером по расписанию `cron: '0 6 * * *'` и возможностью ручного запуска `workflow_dispatch`.
- [x] Скрипт `scripts/notify.js` безопасно считывает секреты `CLOUDFLARE_WORKER_URL`, `CRON_SECRET` и `TELEGRAM_BOT_TOKEN` из переменных окружения.
- [x] Скрипт корректно вычисляет разницу дат между текущим днем (с учетом таймзоны пользователя) и `expires_at`:
  - Продукты со статусом `active`, у которых `expires_at <= today + notify_before_days`.
- [x] Формируется лаконичный дайджест в формате HTML:
  - 🔴 *Истекает сегодня / просрочено:* Продукт (кол-во).
  - 🟡 *Истекает завтра:* Продукт (кол-во).
  - Инлайн-кнопка открытия Mini App с прямым переходом в холодильник.
- [x] Встроен ограничитель скорости отправки: не более 25 сообщений в секунду суммарно, не более 1 сообщения в секунду в один чат.
- [x] Реализован перехват HTTP 429 (`Too Many Requests`) с ожиданием указанного в ответе числа секунд `parameters.retry_after`.
- [x] Написаны юнит-тесты агрегатора сообщений и логики форматирования на Vitest/Jest.
