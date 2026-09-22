---
id: "ADR-004"
title: "Безопасность Zero-Trust: Валидация initData и DTO Whitelisting в Cloudflare Worker"
type: "adr"
status: "accepted"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
supersedes: null
related_contracts:
  - "[[00_Meta/System_Invariants.md]]"
  - "[[01_Architecture/Cloudflare_Worker_Spec.md]]"
tags:
  - architecture
  - adr
  - security
  - cloudflare
  - hmac-sha256
  - dto-sanitizer
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T23:50:00Z
---

# ADR-004: Безопасность Zero-Trust: Валидация initData и DTO Whitelisting в Cloudflare Worker

## Контекст и проблематика
При отказе от традиционного бэкенда критически важно предотвратить уязвимости BOLA/IDOR (доступ к чужим холодильникам), подмену идентификатора пользователя и атаки Mass Assignment (внедрение лишних или вредоносных полей в базу).

## Решение
Использовать паттерн шлюза безопасности из `samgtu-schedule/cloudflare-worker.js`:
1. **Криптографическая проверка на Edge:** Cloudflare Worker нативно вычисляет HMAC-SHA256 подпись Telegram `initData` через стандартный Web Crypto API. Недостоверные запросы отсекаются с HTTP 401.
2. **Изоляция пространств (BOLA Protection):** При выполнении любой операции с холодильником воркер проверяет, что `telegram_id` из верифицированного `initData` входит в список участников (`members`) данного пространства.
3. **Строгая санитизация DTO (Whitelist):** Вся входящая полезная нагрузка проходит фильтр функции `sanitizeProductItem()` — лишние ключи отсекаются, типы приводятся, строковые поля обрезаются по длине, форматы дат валидируются регулярными выражениями.
4. **Сокрытие токена бота:** Клиент никогда не знает `TELEGRAM_BOT_TOKEN`. Токен хранится исключительно в переменных воркера (`env.TELEGRAM_BOT_TOKEN`).
