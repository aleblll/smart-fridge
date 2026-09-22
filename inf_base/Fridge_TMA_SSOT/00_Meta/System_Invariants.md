---
id: "META-002"
title: "System Invariants & Architectural Guardrails (Zero-VPS v2)"
type: "invariants"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "accepted"
tags:
  - meta
  - invariants
  - policies
  - zero-vps
  - cloudflare
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T23:50:00Z
related_documents:
  - "[[00_Meta/Project_Context.md]]"
  - "[[00_Meta/Model_Matrix.md]]"
  - "[[01_Architecture/ADR/ADR-001_Zero_VPS_Architecture.md]]"
  - "[[01_Architecture/Cloudflare_Worker_Spec.md]]"
---

# System Invariants & Architectural Guardrails (Zero-VPS v2)

Настоящий документ фиксирует непреложные системные инварианты проекта «Умный холодильник», основанные на проверенном бессерверном стеке `samgtu-schedule`.

---

## 1. Инфраструктурный инвариант (Zero-VPS v2: Cloudflare Edge + GitHub)
> **Правило:** Полный отказ от арендуемых VPS, Docker-контейнеров, а также от Firebase Spark с его жестким лимитом в 100 одновременных сокетов.

- **Запрещено:**
  - Аренда выделенных серверов (VPS/VDS, Dedicated).
  - Постоянно работающие бэкенд-серверы на Node/Python/Go.
  - Использование Firebase Realtime Database (из-за ограничений в 100 соединений и блокировок IP Google в РФ).
  - Внедрение тяжелых брокеров сообщений (RabbitMQ, Celery, Redis кластеры).
- **Разрешенный стек:**
  - **Static Hosting:** GitHub Pages / Cloudflare Pages ($0/мес, глобальный CDN).
  - **Serverless Edge Gateway:** Cloudflare Worker (`cloudflare-worker.js` / TypeScript) — 100,000 запросов в сутки бесплатно, задержка < 15 мс, отсутствие лимитов на одновременные соединения.
  - **Storage:** Cloudflare D1 (Serverless SQLite: 5M чтений, 100k записей в сутки бесплатно) или Cloudflare KV / изолированные JSON-хранилища пространств (по образцу samgtu-schedule).
  - **Cron & Orchestration:** Cloudflare Cron Triggers или GitHub Actions (2000 бесплатных минут/мес).
  - **Push Transport:** Прямые HTTP-запросы из Worker / Actions в Telegram Bot API.

---

## 2. Инвариант безопасности Edge-шлюза
> **Правило:** Клиент Telegram WebView никогда не получает прямой доступ к мастер-секретам базы данных или токену Telegram-бота.

- **Секреты:** `TELEGRAM_BOT_TOKEN`, ключи БД и API-ключи хранятся в защищенных переменных окружения Cloudflare Worker (`wrangler secret put`).
- **Строгая санитизация DTO:** Любые входящие данные проходят обязательный Whitelist полей на уровне Cloudflare Worker (защита от Mass Assignment и инъекций, как в `cloudflare-worker.js`).
- **Валидация Telegram:** Авторизация строится на проверке подписи `initData` по алгоритму HMAC-SHA256.

---

## 3. Эстетический инвариант (Anti-Slop)
- Полный запрет на псевдотехнологичные градиенты, огромные тени и пустые макеты.
- Строгий монохром Zinc, субпиксельные микрограни толщиной 1px, системные CSS-переменные Telegram (`--tg-theme-*`).
- Цвет используется исключительно как семантический индикатор свежести продуктов.
