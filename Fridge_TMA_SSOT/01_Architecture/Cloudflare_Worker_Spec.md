---
id: "ARCH-003"
title: "Cloudflare Worker Edge Gateway & DTO Sanitizer Specification"
type: "architecture_spec"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "accepted"
tags:
  - architecture
  - cloudflare
  - edge
  - gateway
  - security
  - dto-sanitizer
created_at: 2026-09-22T23:50:00Z
updated_at: 2026-09-22T23:50:00Z
related_documents:
  - "[[00_Meta/Project_Context.md]]"
  - "[[00_Meta/System_Invariants.md]]"
  - "[[01_Architecture/System_Topology.md]]"
  - "[[02_Contracts/Database_Schema.json]]"
---

# Cloudflare Worker Edge Gateway & DTO Sanitizer Specification

Архитектура шлюза спроектирована по образцу проверенного решения `samgtu-schedule/cloudflare-worker.js`. Шлюз развертывается в бессерверной среде Cloudflare Workers, выполняя функции сокрытия секретов, валидации криптографической подписи Telegram, строгой санитизации DTO (Whitelist) и защиты от флуда.

---

## 1. Лимиты и преимущества перед Firebase
| Параметр | Firebase RTDB (Spark) | Cloudflare Worker + D1 / KV (Стек samgtu-schedule) |
|---|---|---|
| **Одновременные соединения** | **100 сокетов максимум** (101-й клиент отваливается) | **Без ограничений** (Stateless Edge в 300+ датацентрах) |
| **Бесплатные запросы в сутки** | Лимит по трафику (10 ГБ/мес) | **100,000 запросов к Worker/день** + **5,000,000 чтений D1/день** |
| **Доступность в РФ** | Риски блокировок IP-диапазонов Google | Надежная маршрутизация через глобальный Anycast CDN |
| **Хранение секретов** | Ограничено правилами базы | Защищенные `wrangler secrets` (токен бота не виден клиенту) |
| **Стоимость** | $0/мес | **$0/мес навсегда** |

---

## 2. API-маршруты Cloudflare Worker

```text
/api/
├── POST /auth/validate          # Проверка HMAC-SHA256 initData, выдача сессионного токена
├── GET  /fridges/:id            # Получение инвентаря продуктов холодильника
├── POST /fridges/:id/products   # Добавление продукта (с DTO-санитизатором)
├── PATCH /fridges/:id/products/:productId  # Списание / изменение количества
├── DELETE /fridges/:id/products/:productId # Удаление продукта
├── POST /invites/create         # Генерация ссылки-приглашения (только owner)
├── POST /invites/claim          # Присоединение к семейному пространству
└── POST /cron/notify            # Запуск утренней рассылки (триггер по cron-секрету)
```

---

## 3. Модуль санитизации DTO (Strict Whitelist по образцу samgtu-schedule)

```javascript
// DTO Sanitizer: защита от Mass Assignment и внедрения вредоносных полей
export function sanitizeProductItem(item, userId) {
  if (!item || typeof item !== 'object') return null;
  
  const validStorageTypes = ['fridge', 'freezer', 'pantry'];
  const validUnits = ['pcs', 'kg', 'g', 'l', 'pack'];
  const validStatuses = ['active', 'consumed', 'discarded'];

  const storageType = validStorageTypes.includes(item.storage_type) ? item.storage_type : 'fridge';
  const unit = validUnits.includes(item.unit) ? item.unit : 'pcs';
  const status = validStatuses.includes(item.status) ? item.status : 'active';
  const quantity = typeof item.quantity === 'number' && item.quantity >= 0 ? item.quantity : 1;

  // Регулярное выражение для формата даты YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const expiresAt = typeof item.expires_at === 'string' && dateRegex.test(item.expires_at) 
    ? item.expires_at 
    : new Date().toISOString().slice(0, 10);

  return {
    id: String(item.id || crypto.randomUUID()),
    name: String(item.name || '').trim().slice(0, 128),
    category: String(item.category || 'Другое').slice(0, 64),
    storage_type: storageType,
    quantity: Number(quantity),
    unit: unit,
    opened_at: item.opened_at ? String(item.opened_at).slice(0, 30) : null,
    expires_at: expiresAt,
    notify_before_days: Number(item.notify_before_days) || 2,
    status: status,
    added_by: Number(userId),
    updated_at: new Date().toISOString()
  };
}
```

---

## 4. Верификация Telegram initData на Edge (Web Crypto API)

```javascript
export async function verifyTelegramInitData(initDataRaw, botToken) {
  const urlParams = new URLSearchParams(initDataRaw);
  const hash = urlParams.get('hash');
  if (!hash) return null;

  urlParams.delete('hash');
  urlParams.delete('signature'); // Совместимость с Bot API 8.0

  const params = [];
  for (const [key, value] of urlParams.entries()) {
    params.push(`${key}=${value}`);
  }
  params.sort();
  const dataCheckString = params.join('\n');

  // K_secret = HMAC_SHA256("WebAppData", botToken)
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const secretKeySignature = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));

  // Final HMAC
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKeySignature,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(dataCheckString));
  const hexHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (hexHash !== hash) return null;

  // Извлекаем объект user
  const userJson = urlParams.get('user');
  return userJson ? JSON.parse(userJson) : null;
}
```

---

## 5. Защита от флуда и CORS
- **CORS:** Воркер возвращает заголовки `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization`.
- **In-Memory Rate Limiting:** Ограничение частоты запросов от одного пользователя (не более 30 запросов в минуту per IP/User).
