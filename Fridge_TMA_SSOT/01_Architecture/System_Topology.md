---
id: "ARCH-001"
title: "System Topology & Data Flow (Cloudflare Edge Zero-VPS)"
type: "architecture"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "accepted"
tags:
  - architecture
  - topology
  - data-flow
  - cloudflare-worker
  - zero-vps
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T23:50:00Z
related_documents:
  - "[[00_Meta/Project_Context.md]]"
  - "[[00_Meta/System_Invariants.md]]"
  - "[[01_Architecture/Cloudflare_Worker_Spec.md]]"
  - "[[01_Architecture/ADR/ADR-001_Zero_VPS_Architecture.md]]"
  - "[[02_Contracts/Database_Schema.json]]"
---

# System Topology & Data Flow (Cloudflare Edge Zero-VPS)

Архитектурная модель объединяет статический фронтенд, бессерверный шлюз Cloudflare Worker и хранилище данных без единого арендуемого VPS по проверенному образцу `samgtu-schedule`.

---

## 1. Топология системы (C4 Container Level)

```mermaid
flowchart TD
    subgraph Client_Env["Клиентская среда (Смартфон пользователя)"]
        TG_Host["Telegram Messenger App (iOS / Android / Desktop)"]
        subgraph Webview_Container["WebView Sandbox"]
            TMA["React 19 SPA (Vite + Tailwind)<br>GitHub / Cloudflare Pages"]
            StateStore["Zustand State Store + LocalStorage Cache<br>(Offline-First по образцу samgtu-schedule)"]
            Presets["foodPresets.json (СанПиН / USDA)"]
        end
        TG_Host -->|Инжекция initData, Haptics, SDK| TMA
        TMA <--> StateStore
        TMA <--> Presets
    end

    subgraph Edge_Cloud["Бессерверное облако Cloudflare (100% Free)"]
        CF_Worker["Cloudflare Worker (cloudflare-worker.js)<br>100k req/day free, глобальный Anycast CDN"]
        HMAC_Auth["Web Crypto HMAC-SHA256 Auth"]
        DTO_Sanitizer["Strict Whitelist DTO Sanitizer"]
        RateLimit["In-Memory Rate Limiter"]
        
        CF_Worker --- HMAC_Auth
        CF_Worker --- DTO_Sanitizer
        CF_Worker --- RateLimit

        EdgeStorage[("Cloudflare D1 Database / KV<br>(Serverless SQLite / JSON Storage)")]
        CF_Worker <--> EdgeStorage
    end

    subgraph Automation_Env["Фоновая среда автоматизации (GitHub Actions / Worker Cron)"]
        CronTrigger["Scheduled Cron (06:00 UTC)"]
        Notifier["Morning Digest Notifier Script"]
        CronTrigger --> Notifier
    end

    subgraph Telegram_Infrastructure["Платформа Telegram"]
        BotAPI["Telegram Bot API (https://api.telegram.org)"]
        BotUser["Пользовательский чат с ботом"]
        BotAPI -->|Push-дайджест утренних сроков| BotUser
    end

    %% Потоки данных
    TMA <==>|HTTPS REST API /sync (CORS Compliant)| CF_Worker
    Notifier -->|Запрос истекающих продуктов| CF_Worker
    Notifier -->|sendMessage (Лимит 25 msg/s)| BotAPI
    BotUser -.->|Открытие TMA по кнопке Menu| TG_Host
```

---

## 2. Сквозные потоки данных

### Поток 1: Первичная загрузка и авторизация (Cold Start < 600 мс)
1. Пользователь открывает Mini App.
2. React SPA немедленно рендерит локальный интерфейс из `localStorage` (Offline-First, как в `samgtu-schedule`).
3. Приложение отправляет `initData` в заголовке `Authorization: tma <raw_init_data>` на `POST /api/auth/validate` в Cloudflare Worker.
4. Cloudflare Worker верифицирует HMAC-SHA256 подпись через Web Crypto API и возвращает профиль пользователя и актуальный инвентарь холодильника.
5. Интерфейс синхронизирует локальный стейт с облаком.

### Поток 2: Добавление продукта (3 секунды)
1. Пользователь открывает шторку Vaul Drawer.
2. Локальный поиск по `foodPresets.json` мгновенно выдает подсказку и сроки годности по СанПиН.
3. Пользователь нажимает на чип продукта:
   - Срабатывает виброотклик `notificationOccurred('success')`.
   - Продукт оптимистично появляется в списке инвентаря.
   - SPA отправляет `POST /api/fridges/:id/products` на Cloudflare Worker.
   - Воркер пропускает объект через `sanitizeProductItem()` (Whitelist полей) и сохраняет в базу данных.

### Поток 3: Утренний дайджест уведомлений
1. Раз в сутки в 06:00 UTC срабатывает расписание.
2. Скрипт рассылки обращается к Cloudflare Worker за списком истекающих продуктов.
3. Формируется единый аккуратный HTML-дайджест на семью.
4. Сообщения отправляются через Telegram Bot API с контролем рейт-лимитов (до 25 RPS) и обработкой HTTP 429.
