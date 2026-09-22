---
id: "ADR-001"
title: "Архитектурный выбор Cloudflare Edge над Firebase RTDB (Zero-VPS v2)"
type: "adr"
status: "accepted"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
supersedes: null
related_contracts:
  - "[[00_Meta/System_Invariants.md]]"
  - "[[01_Architecture/System_Topology.md]]"
  - "[[01_Architecture/Cloudflare_Worker_Spec.md]]"
tags:
  - architecture
  - adr
  - zero-vps
  - cloudflare
  - samgtu-pattern
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T23:50:00Z
---

# ADR-001: Архитектурный выбор Cloudflare Edge над Firebase RTDB (Zero-VPS v2)

## Контекст и проблематика
Первоначальный проект опирался на бесплатный тариф Firebase Realtime Database (Spark). Однако в ходе инженерного анализа выявлены критические ограничения:
1. **Жесткий лимит 100 одновременных сокетов:** Firebase Spark блокирует 101-е подключение. При одновременном открытии приложения сотней пользователей система полностью ложится.
2. **Сетевые риски Google Cloud в РФ:** WebSocket-соединения к серверам Google регулярно подвергаются замедлению и сбоям у провайдеров.
3. **Успешный прецедент проекта samgtu-schedule:** В существующем проекте `samgtu-schedule` показана стабильная работа без VPS и без Firebase — на базе **Cloudflare Worker** и граничного хранилища.

## Рассмотренные альтернативы
1. **Firebase Realtime Database (Spark):**
   - *Минусы:* Лимит 100 сокетов, нестабильность сокетов в мобильном WebView при сворачивании, сложность декларативных JSON-правил безопасности.
2. **Аренда VPS (FastAPI + PostgreSQL):**
   - *Минусы:* Платная инфраструктура ($5–15/мес), необходимость администрирования.
3. **Cloudflare Worker + Cloudflare D1/KV (Стек samgtu-schedule):**
   - *Плюсы:* 100,000 запросов в день бесплатно, **нет лимита на одновременные соединения** (Stateless Edge), 5 млн чтений D1 в сутки, сокрытие токена Telegram-бота, строгая санитизация DTO, идеальная работа с CORS в Telegram WebView.

## Решение
Утвердить миграцию на **Cloudflare Worker Edge Architecture (по образцу samgtu-schedule)**:
- **Шлюз:** Cloudflare Worker (`cloudflare-worker.js` / TypeScript) обрабатывает REST API, верифицирует `initData`, проводит Whitelist-санитизацию данных и скрывает секреты.
- **Хранилище:** Cloudflare D1 (Serverless SQLite) или Cloudflare KV / изолированные JSON-хранилища.
- **Фронтенд:** React 19 SPA (GitHub Pages / Cloudflare Pages) в режиме Offline-First с кэшем в `localStorage`.

## Последствия
### Положительные:
- Устранен риск отказа системы при превышении 100 одновременных пользователей.
- Бесплатный лимит: 100,000 запросов к воркеру в день (хватит на тысячи активных пользователей).
- Полная сетевая стабильность в РФ через CDN Cloudflare.
- Проверенный в бою паттерн из проекта `samgtu-schedule`.
