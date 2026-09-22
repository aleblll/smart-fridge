---
id: "META-001"
title: "Master Project Context: Telegram Mini App «Умный Холодильник» (Cloudflare Edge Edition)"
type: "context"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "active"
tags:
  - meta
  - context
  - architecture
  - ssot
  - zero-vps
  - cloudflare-worker
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T23:50:00Z
related_documents:
  - "[[00_Meta/System_Invariants.md]]"
  - "[[00_Meta/Model_Matrix.md]]"
  - "[[01_Architecture/System_Topology.md]]"
  - "[[01_Architecture/Cloudflare_Worker_Spec.md]]"
  - "[[02_Contracts/Database_Schema.json]]"
  - "[[02_Contracts/Food_Presets_Schema.json]]"
  - "[[03_Design_System/Tokens.md]]"
---

# Master Project Context: Telegram Mini App «Умный Холодильник» (Cloudflare Edge Edition)

## 1. Концепция и границы системы
- **Форм-фактор:** Telegram Mini App (SPA), запускаемое внутри мобильного WebView (iOS WKWebView / Android WebView).
- **Главная ценность:** Совместный контроль сроков годности продуктов в семье/квартире, автоподстановка нормативных сроков хранения по СанПиН и утренние напоминания в Telegram.
- **Инфраструктурный инвариант (Zero-VPS v2 — Стек samgtu-schedule):** Полный отказ от арендуемых VPS, Docker-контейнеров, а также от Firebase (снятие жесткого лимита в 100 одновременных сокетов и рисков блокировок Google IP).
  - **Фронтенд:** GitHub Pages / Cloudflare Pages (Vite + React 19 + TypeScript + Tailwind CSS).
  - **Серверлесс-шлюз (Edge Gateway):** Cloudflare Worker (`cloudflare-worker.js` / TypeScript) — 100,000 бесплатных запросов в сутки, глобальный CDN, сокрытие токенов Telegram Bot API, CORS, защита от инъекций и строгая санитизация DTO.
  - **База данных и синхронизация:** Cloudflare D1 (Serverless SQLite: 5 млн чтений, 100 тыс записей в сутки бесплатно) или Cloudflare KV / изолированные JSON-хранилища групп (по аналогии с samgtu-schedule).
  - **Фоновый планировщик (Cron):** Cloudflare Cron Triggers / GitHub Actions workflow (`.github/workflows/notify.yml`), запускаемый раз в сутки в 06:00 UTC (09:00 МСК).
  - **Транспорт пушей:** Прямые HTTP-запросы из Cloudflare Worker / GitHub Actions в Telegram Bot API (`sendMessage`).

## 2. Модель данных (Relational / JSON Schema)
- `users`:
  - `telegram_id` (PK, int64): Уникальный ID пользователя в Telegram.
  - `first_name` (string): Имя пользователя.
  - `username` (string, nullable): Юзернейм.
  - `timezone` (string): Временная зона IANA (по умолчанию `Europe/Moscow`).
  - `active_fridge_id` (string, FK): Текущий выбранный холодильник.
  - `created_at` (datetime): Время регистрации.
- `fridges`:
  - `id` (PK, string/UUID): Уникальный идентификатор пространства.
  - `name` (string): Название («Дом», «Дача»).
  - `owner_id` (FK, int64): Telegram ID создателя.
  - `created_at` (datetime).
- `fridge_members`:
  - `fridge_id` (FK), `telegram_id` (FK), `role` (`owner` | `editor` | `viewer`), `joined_at`.
- `products`:
  - `id` (PK, string/UUID): Уникальный ID продукта.
  - `fridge_id` (FK, string): Привязка к пространству.
  - `name` (string): Название продукта.
  - `category` (string): Категория из СанПиН-справочника.
  - `storage_type` (enum: `fridge` | `freezer` | `pantry`).
  - `quantity` (float/int).
  - `unit` (enum: `pcs` | `kg` | `g` | `l` | `pack`).
  - `opened_at` (datetime, nullable): Метка вскрытия упаковки.
  - `expires_at` (date, YYYY-MM-DD): Расчетная дата порчи.
  - `notify_before_days` (int, дефолт: 2).
  - `status` (enum: `active` | `consumed` | `discarded`).
  - `added_by` (int64, Telegram ID).
  - `created_at`, `updated_at`.
- `invites`:
  - `token` (PK, string): Криптостойкий токен инвайта.
  - `fridge_id` (FK), `created_by` (int64), `expires_at`, `max_uses`, `uses_count`.

## 3. База знаний по продуктам (Local Dataset)
- **Источник:** СанПиН 2.3.2.1324-03 и нормы USDA FoodKeeper.
- **Расположение:** `src/data/foodPresets.json` в статическом клиентском бандле.
- **Функции:** Мгновенный локальный поиск (0 мс), предиктивные чипы, вторичные сроки после вскрытия (`after_opening_hours`), подсказки по товарному соседству.

## 4. UI/UX и стандарты Anti-Slop
- Строгий функциональный минимализм (Linear, Cron, Apple Health).
- Палитра Zinc, интеграция системных CSS-переменных Telegram (`--tg-theme-*`).
- Цвет используется только как статус годности (Zinc -> Amber -> Rose).
- Нижняя шторка Vaul Drawer, блокировка системных свайпов Telegram через `Telegram.WebApp.disableVerticalSwipes()`.
- Тактильный отклик Telegram HapticFeedback (`light`, `medium`, `success`, `error`).
