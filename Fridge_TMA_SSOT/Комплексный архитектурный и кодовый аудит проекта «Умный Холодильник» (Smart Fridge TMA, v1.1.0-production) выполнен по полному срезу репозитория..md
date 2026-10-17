## 1. Executive Summary

|**Критерий оценки**|**Балл (1–10)**|**Краткое резюме**|
|---|---|---|
|**Архитектура и топология**|**8.5 / 10**|Переход на Server-Authoritative модель (Cloudflare Worker + D1 SQL) с тонким клиентом и очередью мутаций (`ADR-007`) — верное инженерное решение, устранившее лимит в 4 КБ у Telegram CloudStorage.|
|**Безопасность (Zero-Trust)**|**6.5 / 10**|Реализована криптографическая проверка `initData` через Web Crypto API и timing-safe сравнение, но до гейта авторизации оставлены открытыми вебхук-роуты, а whitelist в CORS не применяется.|
|**База данных и консистентность**|**7.5 / 10**|Схема D1 нормализована, внедрен RBAC через `fridge_members` и идемпотентность пушей. Узкие места: отсутствие проверки `meta.changes` при инвайтах, потеря поля `after_opening_hours` в БД и риск гонок при автосоздании холодильника.|
|**Frontend, UX и Offline-Sync**|**7.5 / 10**|Отличный визуальный стиль Mindora UI, грамотный календарный расчет дат в UTC и тактильный отклик. Однако агрессивная миграция `localStorage` в `storage.ts` способна дублировать продукты между холодильниками и «воскрешать» удаленные записи.|
|**Тестирование и CI/CD**|**8.5 / 10**|39 модульных и интеграционных тестов на Vitest с in-memory SQLite (`node:sqlite`) покрывают основные сценарии воркера, крона и пресетов.|
|**ИТОГОВАЯ ОЦЕНКА**|**7.7 / 10**|Зрелое MVP/Production-приложение с чистой кодовой базой, требующее точечного закрытия нескольких критических уязвимостей и багов синхронизации перед масштабированием.|

## 2. Критические уязвимости и баги (P0 / P1)

### 🔴 P0 (Блокеры продакшена и безопасности — исправить немедленно)

1. **Незащищенные эндпоинты `/api/telegram-webhook` и `/api/webhook/setup` (`worker/src/index.ts`, строки 488–587)**:
    
    - Оба роута расположены **выше** Zero-Trust гейта авторизации и не проверяют ни секретный токен, ни заголовки.
        
    - В `POST /api/telegram-webhook` отсутствует проверка заголовка `X-Telegram-Bot-Api-Secret-Token`. Любой внешний злоумышленник может отправлять фейковые JSON-апдейты от лица произвольных `from.id` и `chat.id`, что позволяет:
        
        1. Заспамить таблицу `fridges` и `fridge_members` миллионами записей в D1 (исчерпание лимитов Free Tier D1 за минуты).
            
        2. Использовать воркер как открытый спам-ретранслятор (`sendMessage` вызывается на каждый запрос), что приведет к блокировке токена бота со стороны Telegram.
            
2. **Сломанный список продуктов в тестовом уведомлении `POST /api/notify/test` (`worker/src/index.ts`, строки 649–684)**:
    
    - При сборке истекающих продуктов в `/api/notify/test` объекты пушатся в массив `items` с полем `days_left: daysLeft` (snake_case) и несуществующим типом `ExpiringProductDto`.
        
    - Функция `formatDigestHtml(digest, appUrl)` (строки 298–306) сортирует и фильтрует элементы строго по полю `item.daysDiff` (`item.daysDiff <= 0`, `item.daysDiff === 1`, `item.daysDiff > 1`).
        
    - Поскольку `item.daysDiff` равен `undefined`, все три фильтра возвращают пустые массивы. Если у пользователя есть истекающие продукты, тестовый пуш приходит **пустым** (только заголовок и подвал без единого продукта).
        
3. **Загрязнение семейных холодильников и «воскрешение» удаленных продуктов в `storage.ts` (`frontend/src/lib/storage.ts`, строки 99–144, 229–249)**:
    
    - Метод `getLocalProductsForMigration` сканирует **все** ключи `localStorage` (включая `LEGACY_STORAGE_KEY` и кэши других холодильников `smart_fridge_products_*`), а `loadProducts` отправляет на сервер (`api.addProduct`) любой локальный продукт, чей `id` не найден в текущем ответе сервера.
        
    - **Сценарий 1 (Cross-Fridge Leak):** Пользователь переключается с личного холодильника `A` на семейный `B`. Так как в семейном холодильнике `B` нет продуктов из `A`, `getLocalProductsForMigration` считывает кэш холодильника `A` и `LEGACY_STORAGE_KEY` и заливает все личные продукты пользователя в семейный холодильник.
        
    - **Сценарий 2 (Zombie Resurrection):** Пользователь 1 удаляет продукт (в D1 ставится `deleted_at`). У Пользователя 2 этот продукт еще лежит в локальном кэше. Когда Пользователь 2 открывает приложение, `loadProducts` видит, что продукта нет в списке активных с сервера, считает его «несинхронизированным локальным» и заново создает его в D1 через `POST /products`.
        

### 🟠 P1 (Высокий приоритет — безопасность, гонки данных и дублирование)

4. **Игнорирование `ALLOWED_ORIGINS` в CORS (`worker/src/index.ts`, строки 241–258)**:
    
    - Константа `ALLOWED_ORIGINS` объявлена, но в `getCorsHeaders` написано `const allowedOrigin = origin || '[https://aleblll.github.io](https://aleblll.github.io)'`. Воркер зеркалирует абсолютно любой `Origin` в заголовок `Access-Control-Allow-Origin`.
        
5. **Обход лимита `max_uses` в инвайтах из-за отсутствия проверки `meta.changes` (`worker/src/index.ts`, строки 757–772)**:
    
    - В `POST /api/invites/:code/claim` выполняется `UPDATE invites SET uses_count = uses_count + 1 WHERE code = ? AND uses_count < max_uses`, но результат выполнения (`res.meta.changes`) не проверяется, и следом безусловно выполняется `INSERT INTO fridge_members`. При параллельных запросах лимит `max_uses` будет превышен.
        
6. **Конфликт двух Cron-систем: Worker Cron vs GitHub Actions (`.github/workflows/notify.yml` и `worker/wrangler.toml`)**:
    
    - Оба планировщика настроены на `0 6 * * *`. При этом `scripts/notify.mjs` скачивает базу через `/api/cron/notify` и рассылает сообщения без проверки и записи в таблицу `user_notifications`. Если в GitHub Secrets задан `TELEGRAM_BOT_TOKEN`, пользователи получат дублирующиеся уведомления.
        
7. **Гонка при создании дефолтного холодильника (`worker/src/index.ts`, строки 702–733, и `frontend/src/App.tsx`, строки 199–285)**:
    
    - При первом запуске TMA у нового пользователя одновременно срабатывают `initializeApp()` и `useEffect` фокуса/видимости, вызывающие `GET /api/fridges/my`. Оба запроса в D1 видят `fridges.length === 0` и создают два разных холодильника «Мой холодильник» с разными UUID.
        
8. **Отсутствие колонки `after_opening_hours` в D1 (`worker/schema.sql`) и ложные срабатывания при поиске пресета (`frontend/src/components/ProductCard.tsx`, строки 36–48)**:
    
    - Поле `after_opening_hours` не сохраняется в таблице `products` на сервере.
        
    - В `ProductCard.tsx` фоллбэк ищет пресет через `clean.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(clean)`. Из-за этого любой продукт с подстрокой (например, «Кокосовое молоко» или «Плавленый сырок») получает срок хранения после вскрытия от обычного пастеризованного молока или твердого сыра
## 3. Архитектурные рекомендации и рефакторинг (Code Diffs)

### 3.1. Исправление `POST /api/notify/test`, CORS и защита Webhook (`worker/src/index.ts`)

Diff

```
--- a/worker/src/index.ts
+++ b/worker/src/index.ts
@@ -5,6 +5,7 @@ export interface Env {
   TELEGRAM_BOT_TOKEN?: string;
+  TELEGRAM_WEBHOOK_SECRET?: string;
   CRON_SECRET?: string;
   ENVIRONMENT?: string;
 }
@@ -250,7 +251,9 @@ const ALLOWED_ORIGINS = new Set([
 export function getCorsHeaders(request?: Request): Record<string, string> {
   const origin = request?.headers?.get('Origin') || '';
-  const allowedOrigin = origin || 'https://aleblll.github.io';
+  const allowedOrigin = ALLOWED_ORIGINS.has(origin)
+    ? origin
+    : 'https://aleblll.github.io';
   return {
     'Access-Control-Allow-Origin': allowedOrigin,
     'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
@@ -500,6 +503,12 @@ export default {
     if (normalizedPath === '/api/webhook/setup' || normalizedPath === '/webhook/setup') {
+      const cronSecret = env.CRON_SECRET;
+      const provided = request.headers.get('X-Cron-Secret');
+      if (!cronSecret || !provided || !timingSafeCompare(provided, cronSecret)) {
+        return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
+      }
       if (!botToken) {
         return jsonResponse({ error: 'Bot token missing on server' }, 500, corsHeaders);
       }
@@ -533,6 +542,13 @@ export default {
     if (request.method === 'POST' && (normalizedPath === '/api/telegram-webhook' || normalizedPath === '/telegram-webhook')) {
+      const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
+      const receivedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
+      if (expectedSecret && (!receivedSecret || !timingSafeCompare(receivedSecret, expectedSecret))) {
+        return jsonResponse({ error: 'Forbidden: invalid webhook secret' }, 403, corsHeaders);
+      }
       try {
         const update = await request.json() as any;
@@ -646,7 +662,7 @@ export default {
       const fridgeIds = (memberFridges.results || []).map((m: any) => m.fridge_id);
 
-      const items: ExpiringProductDto[] = [];
+      const items: ExpiringProductItem[] = [];
       const fridgeNames = new Set<string>();
 
       for (const fid of fridgeIds) {
@@ -661,12 +677,9 @@ export default {
             items.push({
               id: p.id,
               name: p.name,
               expires_at: p.expires_at,
-              days_left: daysLeft,
+              daysDiff: daysLeft,
               quantity: p.quantity,
               unit: p.unit,
-              storage_type: p.storage_type,
-              category: p.category,
-              is_urgent: daysLeft <= 1,
+              fridge_name: fridgeInfo?.name || 'Мой холодильник',
             });
           }
         }
```

### 3.2. Атомарный Claim инвайта и защита от гонки создания холодильника (`worker/src/index.ts`)

Diff

```
--- a/worker/src/index.ts
+++ b/worker/src/index.ts
@@ -711,16 +711,16 @@ export default {
       let fridges = myFridgesRes.results || [];
       if (fridges.length === 0) {
-        const newId = crypto.randomUUID();
+        // Детерминированный ID для дефолтного холодильника предотвращает дубли при параллельных запросах
+        const newId = `default-${authUserId}`;
         const now = new Date().toISOString();
-        await db.prepare('INSERT INTO fridges (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(
-          newId,
-          'Мой холодильник',
-          now,
-          now
-        ).run();
-        await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind(
-          newId,
-          authUserId,
-          'owner',
-          now
-        ).run();
+        await db.batch([
+          db.prepare('INSERT OR IGNORE INTO fridges (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
+            .bind(newId, 'Мой холодильник', now, now),
+          db.prepare('INSERT OR IGNORE INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
+            .bind(newId, authUserId, 'owner', now),
+        ]);
@@ -762,12 +762,18 @@ export default {
       if (!existingMember) {
-        await db.prepare('UPDATE invites SET uses_count = uses_count + 1 WHERE code = ? AND uses_count < max_uses').bind(inviteCode).run();
+        const updateRes = await db.prepare(
+          'UPDATE invites SET uses_count = uses_count + 1 WHERE code = ? AND uses_count < max_uses AND expires_at > ?'
+        ).bind(inviteCode, new Date().toISOString()).run();
+
+        if (!updateRes.meta?.changes || updateRes.meta.changes === 0) {
+          return jsonResponse({ error: 'Invite limit reached or expired', code: 'INVITE_LIMIT' }, 400, corsHeaders);
+        }
+
         const now = new Date().toISOString();
-        await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind(
+        await db.prepare('INSERT OR IGNORE INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind(
           invite.fridge_id,
           authUserId,
           'member',
           now
         ).run();
       }
```

### 3.3. Устранение «зомби-продуктов» и кросс-холодильниковой миграции (`frontend/src/lib/storage.ts`)

Миграция из legacy-ключей должна выполняться **один раз** (с выставлением флага `smart_fridge_legacy_migrated_v1` и удалением `LEGACY_STORAGE_KEY`), а не при каждой загрузке любого холодильника:

Diff

```
--- a/frontend/src/lib/storage.ts
+++ b/frontend/src/lib/storage.ts
@@ -6,6 +6,7 @@ const STORAGE_FRIDGES_LIST_KEY = 'smart_fridge_list_v2';
 const STORAGE_MUTATION_QUEUE_KEY = 'smart_fridge_mutation_queue';
 const LEGACY_STORAGE_KEY = 'smart_fridge_products_v2';
 const LEGACY_FALLBACK_KEY = 'smart_fridge_inventory';
+const LEGACY_MIGRATED_FLAG = 'smart_fridge_legacy_migrated_v1';
 
@@ -99,45 +100,25 @@ export const storage = {
   /**
-   * Collect any products found in local storage (legacy or cache) for migration
+   * One-time collection of legacy products for initial cloud migration
    */
-  getLocalProductsForMigration(activeFridgeId?: string): ProductItem[] {
+  consumeLegacyProductsForMigration(): ProductItem[] {
     if (typeof window === 'undefined') return [];
     try {
+      if (localStorage.getItem(LEGACY_MIGRATED_FLAG) === 'true') return [];
       const candidates: ProductItem[] = [];
       const seen = new Set<string>();
       const addItems = (raw: string | null) => {
         if (!raw) return;
         try {
           const list = JSON.parse(raw);
           if (Array.isArray(list)) {
             for (const item of list) {
               if (item && item.id && item.name && !seen.has(item.id) && !String(item.id).startsWith('demo-')) {
                 seen.add(item.id);
                 candidates.push(item);
               }
             }
           }
         } catch {}
       };
-      if (activeFridgeId) {
-        addItems(localStorage.getItem(getProductsCacheKey(activeFridgeId)));
-      }
       addItems(localStorage.getItem(LEGACY_STORAGE_KEY));
       addItems(localStorage.getItem(LEGACY_FALLBACK_KEY));
+      localStorage.setItem(LEGACY_MIGRATED_FLAG, 'true');
+      localStorage.removeItem(LEGACY_STORAGE_KEY);
+      localStorage.removeItem(LEGACY_FALLBACK_KEY);
       return candidates;
     } catch {
       return [];
     }
   },
```

## 4. Ответы на вопросы аудита (Блоки A–F)

### Блок A: Архитектура, Надежность и Local-First

#### 1. Оценка модели данных, очереди мутаций и конкурентных правок

- **Текущее поведение:** Очередь `smart_fridge_mutation_queue` в `frontend/src/lib/storage.ts` реализует паттерн _Client-Side Mutation Log_ поверх стратегии _Last-Write-Wins (LWW)_. В `loadProducts` вызов `this.processMutationQueue()` запускается асинхронно **без `await`** перед `api.getFridgeProducts(fridgeId)` (строки 211–221).
    
- **Краевые случаи потери данных:**
    
    1. **Гонка чтения и очереди при выходе из офлайна:** Так как `processMutationQueue()` не ожидается (`await`) перед `getFridgeProducts`, `GET`-запрос может завершиться раньше, чем проиграется очередь мутаций, и временно перезаписать локальный стейт старыми данными с сервера.
        
    2. **Конфликт параллельного списания количества:** В базе 2 литра молока. Муж и жена в магазине/метро офлайн уменьшают количество на 1 л. Оба клиента отправляют `PATCH { quantity: 1 }` вместо атомарного декремента `delta: -1`. Итог: вместо `0` на сервере остается `1`.
        
    3. **Удаление поверх редактирования:** Один участник перенес продукт в `consumed`, другой офлайн изменил его `opened_at`. Последний дошедший `PATCH` перезапишет только переданные поля, оставив продукт в неконсистентном состоянии.
        
- **Нужны ли векторные часы или CRDT?** Для домашнего холодильника (семья из 2–5 человек, < 300 активных позиций) **полноценные CRDT или векторные часы избыточны** и неоправданно усложнят бандл и схему D1. Вместо этого достаточно:
    
    1. Сделать `await this.processMutationQueue()` строго **до** `api.getFridgeProducts(fridgeId)`.
        
    2. Дедуплицировать очередь мутаций (схлопывать последовательные `UPDATE` одного `productId` в один элемент очереди, а при `DELETE` — удалять предшествующие `ADD`/`UPDATE` этого продукта из очереди).
        
    3. Добавить оптимистическую блокировку по `base_updated_at` (или монотонному счетчику `version INTEGER DEFAULT 1` в таблице `products`).
        

#### 2. Cloudflare D1 vs KV: лимиты и узкие места при 10 000 пользователей

- **Архитектурные лимиты D1:** Каждая база Cloudflare D1 работает поверх одного активного инстанса SQLite в Durable Object (однопоточный цикл обработки запросов). Пропускная способность одной БД D1 для легких точечных запросов (`SELECT`/`UPDATE` по индексу ~0.5–1.5 мс CPU) составляет **~500–1 500 RPS**.
    
- **Сценарий 10 000 одновременных пользователей утром:** Если 10 000 человек откроют TMA после утреннего пуша в течение 1–2 минут (~150–300 RPS), D1 справится штатно, при условии наличия составных индексов и отсутствия тяжелых `COUNT(*)` / `JOIN` без индекса. Если же все 10 000 ударят в одну секунду, очередь запросов к Durable Object превысит лимит и часть запросов получит `D1_OVERLOAD` / 503.
    
- **Роль KV:** Полный отказ от хранения JSON-блобов инвентаря в KV (`ADR-007`) абсолютно правильный. KV имеет смысл использовать только как Edge-кэш чтения (с TTL 30–60 с) или для распределенного рейтлимитинга, если нагрузка вырастет за пределы 1 000 RPS.
    

#### 3. Dual-Gateway Fallback и мутация `activeBaseUrl`

- В `frontend/src/lib/api.ts` (строки 55–127) переменная модуля `activeBaseUrl` мутируется внутри `executeFetch`.
    
- **Скрытые риски:**
    
    1. **Отсутствие `AbortController` (таймаута):** Если основной поддомен (`aghaskdbbb.workers.dev`) блокируется ТСПУ/провайдером методом _blackhole_ (пакеты дропаются без TCP RST), браузерный `fetch` будет висеть **от 30 до 90 секунд** до срабатывания системного таймаута сокета, прежде чем управление перейдет в `catch` и переключится на `FALLBACK_WORKER_API`.
        
    2. **Лавина дублирующих запросов при старте:** При инициализации параллельно стартуют несколько запросов (`claimInvite`, `getMyFridges`, `getFridgeProducts`). Пока первый запрос ждет таймаута на `PRIMARY_WORKER_API`, остальные параллельные промисы также бьют в недоступный `PRIMARY_WORKER_API`.
        
    3. **Фоллбэк не срабатывает на HTTP 5xx / 522 / 530 Cloudflare:** Сейчас `catch` ловит только сетевые исключения (`TypeError: Failed to fetch`). Если воркер на основном аккаунте превысил дневной лимит Free Tier (100 000 req/day) и Cloudflare отдает HTTP 500/503/1027, `executeFetch` вернет `{ success: false }`, **не переключаясь** на резервный шлюз.
        
- **Решение:** Добавить `AbortSignal.timeout(4000)` в `fetch` и вызывать фоллбэк также при `response.status >= 500`.

### Блок B: Безопасность и Zero-Trust Авторизация

#### 4. Валидация HMAC и поддержка Telegram Bot API 8.0 (`signature`)

- **Корректность работы с `signature`:** В Bot API 8.0 Telegram добавил поле `signature` (Ed25519 подпись для сторонней валидации без токена бота), при этом стандартный `hash` (HMAC-SHA256 от `WebAppData`) по документации Telegram вычисляется по всем полям, **кроме `hash`** (то есть **включая** `signature` в `data_check_string`). В `worker/src/index.ts` (строки 177–202) сначала проверяется строка _без_ `signature`, а затем (при неудаче) — _с_ `signature`. Это обеспечивает полную совместимость, но меняет порядок: на современных клиентах Telegram (API 8.0+) функция каждый раз делает двойное вычисление HMAC. Рекомендуется поменять ветки местами: сначала проверять стандартный алгоритм (исключая только `hash`), а при неудаче — фоллбэк без `signature`.
    
- **Нюанс `timingSafeCompare`:** Текущая реализация (строки 100–111) посимвольно сравнивает строки, но в строке `let mismatch = aLen ^ bLen; const maxLen = Math.max(aLen, bLen);` время цикла зависит от длины входной строки `b`. Для SHA-256 hex-хэшей проще сначала проверить `if (a.length !== 64 || b.length !== 64) return false;` или использовать нативный `crypto.subtle.timingSafeEqual(encoder.encode(a), encoder.encode(b))`, доступный в среде Cloudflare Workers.
    

#### 5. Жизненный цикл сессии (`maxAuthAge = 7 дней`)

- В `worker/src/index.ts` (строки 607, 636) установлено `const maxAuthAge = env.ENVIRONMENT === 'test' ? 3600 : 86400 * 7;` (7 суток). В то же время в `frontend/src/lib/api.ts` (строки 38–49) `initData` сохраняется в `localStorage` навсегда и переиспользуется, если `window.Telegram.WebApp.initData` пуст.
    
- **Стандарты индустрии:**
    
    - **Банковские, крипто- и финтех TMA:** `initData` живет **15–60 минут** (`900–3600` сек) и используется только один раз на эндпоинте `/auth/validate` для выпуска короткоживущего JWT (`access_token` 15 мин + `HttpOnly` refresh).
        
    - **E-commerce и бытовые утилиты (FoodTech / Inventory):** Допустимо окно `auth_date` **24 часа (`86400` сек)**, чтобы пользователь, оставивший открытым TMA в фоне телефона на ночь, мог утром продолжить работу без перезапуска мини-аппа.
        
- **Рекомендация:** Сократить `maxAuthAge` в продакшене с 7 дней до **24 часов (`86400` сек)**, а в `frontend/src/lib/api.ts` убрать сохранение `initData` в постоянный `localStorage` (оставить только `sessionStorage`), так как закэшированный в `localStorage` протухший `initData` может конфликтовать при обновлении сессии.
    

#### 6. Безопасность семейных инвайтов и защита от DoS

- **Уязвимости текущей реализации (`worker/src/index.ts`, строки 738–812):**
    
    1. **Любой участник (`member`) может бесконечно плодить инвайты:** Роут `POST /api/fridges/:id/invites` проверяет только наличие записи в `fridge_members`, не проверяя роль (`owner`) и не ограничивая число активных инвайтов на холодильник.
        
    2. **Параметр `max_uses` из тела запроса не ограничен сверху в legacy-роуте:** В строке 788 `if (body?.max_uses) maxUses = Number(body.max_uses) || 10;` пользователь может передать `max_uses: 999999999` или отрицательное число.
        
    3. **Отсутствие лимита участников холодильника:** В отличие от лимита в 300 продуктов, на количество участников в `fridge_members` лимита нет.
        
- **Рекомендация:** Ограничить количество участников холодильника (например, `MAX_MEMBERS = 15`), разрешить генерацию инвайтов только `owner` (или возвращать уже существующий активный инвайт вместо `INSERT` нового при каждом открытии `ShareModal.tsx`), а также добавить отдельный рейтлимит по `authUserId` на создание и claim инвайтов (не более 5 попыток в минуту).
    

#### 7. CORS и CSP заголовки

- Как отмечено в разделе P1 (п. 4), сейчас `getCorsHeaders` возвращает любой присланный `Origin`.
    
- Поскольку авторизация передается через кастомные заголовки (`Authorization` и `X-Telegram-Init-Data`), браузер перед любым запросом с чужого сайта выполняет preflight `OPTIONS`. Если вернуть строгую проверку `ALLOWED_ORIGINS.has(origin)`, браузер заблокирует кросс-доменные запросы с вредоносных сайтов еще на этапе preflight.
    
- Дополнительно в `frontend/index.html` рекомендуется добавить мета-тег Content Security Policy: `default-src 'self'; script-src 'self' [https://telegram.org](https://telegram.org); connect-src 'self' https://*.workers.dev; style-src 'self' 'unsafe-inline';`.
    

### Блок C: База данных D1, SQL и Масштабируемость

#### 8. Анализ индексов в `worker/schema.sql`

- Сейчас созданы 4 одиночных индекса: `idx_products_fridge`, `idx_products_expires`, `idx_members_user`, `idx_user_notifications_date`.
    
- **Как выполняются реальные запросы воркера в SQLite:**
    
    1. `SELECT ... FROM products WHERE fridge_id = ? AND deleted_at IS NULL ORDER BY expires_at ASC` (основной запрос загрузки инвентаря, строка 844) — сейчас использует `idx_products_fridge`, после чего читает все исторические (включая `deleted_at IS NOT NULL`) строки холодильника и делает `USE TEMP B-TREE FOR ORDER BY`.
        
    2. `SELECT ... FROM products p JOIN ... WHERE p.status = 'active' AND p.deleted_at IS NULL AND p.expires_at <= date(...)` (утренний крон, строка 435).
        
- **Рекомендуемые составные и частичные (partial) индексы для SQLite / D1:**
    
    SQL
    
    ```
    -- Покрывает и загрузку продуктов холодильника (с сортировкой без TEMP B-TREE), и подсчет лимита в 300 позиций:
    CREATE INDEX IF NOT EXISTS idx_products_fridge_active_exp
      ON products(fridge_id, expires_at ASC)
      WHERE deleted_at IS NULL;
    
    -- Ускоряет утренний Cron-запрос, индексируя только реально активные продукты:
    CREATE INDEX IF NOT EXISTS idx_products_cron_active
      ON products(status, expires_at)
      WHERE deleted_at IS NULL AND status = 'active';
    ```
    
    Замена одиночных `idx_products_fridge` и `idx_products_expires` на эти два partial-индекса сократит число читаемых строк (`Rows Read` — главная тарифицируемая метрика Cloudflare D1) в 3–10 раз по мере накопления истории.
    

#### 9. Накопление Soft-Delete (`deleted_at`) и архивных записей (`consumed` / `discarded`)

- **Проблема:** Помимо `deleted_at IS NOT NULL`, в таблице `products` копятся продукты со статусами `consumed` («Съедено») и `discarded` («Утиль»), для которых `deleted_at IS NULL`. Более того, в `POST /api/fridges/:id/products` (строка 884) проверка лимита: `SELECT COUNT(*) as count FROM products WHERE fridge_id = ? AND deleted_at IS NULL` считает **все съеденные и выброшенные продукты за все время**! Как только семья суммарно съест 300 продуктов (даже если в холодильнике сейчас лежит 5 актуальных позиций), приложение заблокирует добавление новых продуктов с ошибкой `PRODUCT_LIMIT_EXCEEDED`!
    
- **Решение:**
    
    1. В проверке лимита 300 продуктов добавить условие `AND status = 'active'`.
        
    2. Внутри метода `scheduled` (утренний крон) добавить легкий ежедневный шаг очистки (Data Retention Policy):
        
        SQL
        
        ```
        DELETE FROM products
        WHERE (deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days'))
           OR (status IN ('consumed', 'discarded') AND updated_at < datetime('now', '-60 days'));
        DELETE FROM invites WHERE expires_at < datetime('now', '-7 days');
        ```
        
        Это полностью избавит таблицу от бесконечного пухтения без необходимости ручного `VACUUM`.
        

#### 10. Атомарность операций и D1 Batch транзакции

- В Cloudflare D1 метод `db.batch([stmt1, stmt2, ...])` выполняет массив подготовленных запросов внутри единой неявной транзакции SQLite (если падает один запрос, откатываются все).
    
- Кроме того, в `SqliteD1Database.batch` (in-memory мок для тестов, `worker/src/index.ts`, строка 215) сейчас вызывается `await s.all<T>()` вместо `run()`. При рефакторинге на `db.batch` убедитесь, что для модифицирующих запросов используется атомарный `UPDATE ... WHERE uses_count < max_uses RETURNING *` или условная вставка через SQL, чтобы исключить TOCTOU (Time-of-Check to Time-of-Use):
    
    SQL
    
    ```
    -- Атомарное добавление участника только если инвайт валиден и не исчерпан:
    INSERT OR IGNORE INTO fridge_members (fridge_id, user_id, role, joined_at)
    SELECT fridge_id, ?1, 'member', ?2
    FROM invites
    WHERE code = ?3 AND uses_count < max_uses AND expires_at > ?2;
    ```
    

### Блок D: Frontend, React 19, UI/UX и Рендеринг

#### 11. Очередь рендеринга и React 19

- **Статус React Compiler:** В `frontend/package.json` установлен `react: ^19.0.0`, но плагин `babel-plugin-react-compiler` в `vite.config.ts` **не подключен**. Это значит, что автоматическая мемоизация React 19 сейчас не активна, и работа дерева зависит от ручных `useMemo` / `useCallback`.
    
- **Узкие места ре-рендеринга в `App.tsx`:**
    
    1. В `App.tsx` (строки 493–503) внутри `displayedProducts.map` в `ProductCard` передаются инлайновые стрелочные функции: `onConsume={() => setProductStatus(product.id, 'consumed')}`. А сам `ProductCard` не обернут в `React.memo`. При вводе каждой буквы в поле поиска `searchQuery` или открытии любого дровера все карточки продуктов рендерятся заново вместе с вызовом `getFoodVisual` и `getProductAfterOpeningHours` (который линейно пробегает по массиву `ALL_PRESETS` из 120+ элементов на каждую карточку).
        
    2. В `showToast` (строки 116–121) `setTimeout` не очищается при повторном вызове: если показать два тоста с интервалом в 2 секунды, таймер первого тоста скроет второй тост через 1.5 секунды.
        

#### 12. Размер бандла и чанкинг Vite

- В `frontend/vite.config.ts` разделение на `vendor-react`, `vendor-telegram`, `vendor-vaul` и `data-presets` настроено грамотно.
    
- **Как еще сильнее ускорить Cold Start на бюджетных Android-смартфонах:**
    
    1. **Ленивая загрузка модалок и дроверов (`React.lazy`):** При первом рендере главного экрана пользователю не нужны ни `AddProductDrawer`, ни `ShareModal`, ни `DiagnosticsDrawer`, ни чанк `vendor-vaul`, ни `data-presets` (`foodPresets.json` весит ~65 КБ в сыром виде и синхронно импортируется в `ProductCard.tsx` через `ALL_PRESETS`).
        
    2. Если сохранять `after_opening_hours` напрямую в объекте продукта в D1, `ProductCard.tsx` перестанет импортировать `ALL_PRESETS`, а `AddProductDrawer`, `ShareModal` и `DiagnosticsDrawer` можно обернуть в `React.lazy(() => import(...))`. Это уберет `vendor-vaul` и `data-presets` из критического пути загрузки (`index.html` загрузит только ядро UI), сократив стартовый JS-пакет примерно на **35–40%**.
        

#### 13. Отказоустойчивость кэша в Telegram WebView

- Мета-теги `Cache-Control: no-cache` в `frontend/index.html` (строки 6–8) работают только частично: мобильные WebView (особенно на iOS и старых Android) ориентируются на HTTP-заголовки ответа сервера GitHub Pages (где `max-age=600`).
    
- Если в момент деплоя новой версии пользователь открывает закэшированный `index.html`, а старые хэшированные чанки (`index-oldhash.js`) уже удалены с GitHub Pages ветки `gh-pages`, при ленивой подгрузке чанка возникает `ChunkLoadError` / `Failed to fetch dynamically imported module`.
    
- **Решение (2 уровня защиты):**
    
    1. Добавить глобальный обработчик в `main.tsx`:
        
        TypeScript
        
        ```
        window.addEventListener('vite:preloadError', () => {
          window.location.reload();
        });
        ```
        
    1. При проверке `/api/health` или в ответе `/api/fridges/my` возвращать актуальную версию приложения (`version: '1.1.0'`) и при расхождении с клиентской константой `APP_VERSION` делать однократный `window.location.replace( url + '?v=' + serverVersion )`.
### Блок E: Движок уведомлений и Telegram Bot API

#### 14. Масштабирование утренней рассылки на 50 000 пользователей

- **Расчет таймингов:** При скорости 25 сообщ./сек (лимит Telegram Bot API — 30 msg/sec) рассылка 50 000 сообщений займет $\frac{50\,000}{25} = 2\,000\text{ секунд} \approx 33.3\text{ минуты}$ стендового времени (wall-clock time). В Cloudflare Workers одиночный `scheduled` вызов ограничен по времени жизни (до 15 минут wall-clock на платных тарифах и жестко лимитирован по числу subrequests — 50 на Free Tier и 1 000 на Paid Tier за один вызов воркера!).
    
- **Внимание на лимит Subrequests (50 / 1 000):** Это критический момент! Уже при **50 пользователях на Free Tier** (или **1 000 пользователей на Paid Workers**) цикл `for (const digest of userDigests) { await sendTelegramMessage(...) }` в `runDailyDigestNotifications` упадет с ошибкой `Too many subrequests` от среды Cloudflare Workers, даже не дойдя до лимита CPU time!
    
- **Архитектура масштабирования:**
    
    - **Для Free Tier (0 руб/мес, до 1 000–5 000 пользователей):** Cursor-based chunking по расписанию. Запускать cron каждые 10–15 минут (`*/15 5-7 * * *`) и в SQL-запросе брать только пачку пользователей, которым еще не отправлен дайджест сегодня (`WHERE un.last_digest_date IS NULL OR un.last_digest_date != ?`), ограничивая выборку `LIMIT 40` пользователей за один запуск воркера. Поскольку таблица `user_notifications` отмечает обработанных пользователей, каждый следующий тик крона автоматически возьмет следующие 40 человек, не превышая лимит в 50 subrequests!
        
    - **Для Paid Tier (50 000+ пользователей):** **Cloudflare Queues**. Cron-воркер делает один SQL-запрос, группирует дайджесты и пачками по 100 сообщений пушит их в `env.NOTIFY_QUEUE.sendBatch()`. Consumer-воркеры разбирают очередь с настройкой `max_batch_size = 25`, `max_concurrency = 1` (чтобы держать ровно 25 req/sec к Telegram API), где каждый батч получает собственный изолированный бюджет subrequests и CPU time.
        

#### 15. Логика часовых поясов (индивидуальные 09:00 утра)

- Чтобы житель Владивостока (UTC+10), Самары (UTC+4), Москвы (UTC+3) и Берлина (UTC+1/+2) получал уведомление ровно в свои 09:00 утра:
    
    1. Добавить в таблицу `user_notifications` (или новую таблицу `user_settings`) поля `tz_offset_minutes INTEGER NOT NULL DEFAULT 180` (например, `240` для UTC+4) и `notify_hour INTEGER NOT NULL DEFAULT 9`.
        
    2. На клиенте при каждом вызове `/api/fridges/my` передавать заголовок `X-Timezone-Offset: ${-new Date().getTimezoneOffset()}` (автоматическое определение часового пояса смартфона без лишних кликов со стороны пользователя).
        
    3. Изменить расписание Cron в `wrangler.toml` на ежечасное: `crons = ["0 * * * *"]`.
        
    4. В SQL-запросе выбирать только тех пользователей, у которых сейчас в их локальном часовом поясе наступил час `notify_hour`:
        
        SQL
        
        ```
        WHERE ((strftime('%H', 'now') * 60 + COALESCE(un.tz_offset_minutes, 180)) / 60) % 24 = COALESCE(un.notify_hour, 9)
        ```
        

#### 16. Идемпотентность и таблица `user_notifications`

- Текущая конструкция `INSERT INTO user_notifications ... ON CONFLICT(user_id) DO UPDATE SET last_digest_date = excluded.last_digest_date` выполняется **после** отправки сообщения в Telegram (`worker/src/index.ts`, строки 441–459).
    
- **Риск гонки:** Если два инстанса `scheduled` запустятся параллельно (или если внешний скрипт не отключен), оба прочитают `SELECT` до того, как первый успеет записать `INSERT`, и отправят пользователю два сообщения.
    
- **Как сделать 100% идемпотентный Claim-before-Send:**
    
    Перед вызовом `sendTelegramMessage` выполнять атомарный захват (lock) пользователя на сегодняшнюю дату:
    
    SQL
    
    ```
    INSERT INTO user_notifications (user_id, last_digest_date, updated_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE
      SET last_digest_date = excluded.last_digest_date,
          updated_at = excluded.updated_at
    WHERE user_notifications.last_digest_date != excluded.last_digest_date;
    ```
    
    Если `res.meta.changes === 0`, значит другой воркер уже захватил или отправил дайджест этому пользователю сегодня — пропускаем `sendTelegramMessage`! (Если же отправка упала с сетевой ошибкой 5xx, откатываем `last_digest_date` обратно, чтобы повторить в следующем тике).
    

### Блок F: Продуктовая логика, Рецепты и Анти-Сюрреализм

#### 17. Проектирование движка рецептов без «промывания муки»

В `frontend/src/components/EveningIdeaCard.tsx` (строки 96–116) причина кулинарного сюрреализма видна прямо в коде: когда ни один из 3 шаблонов (паста+сыр, курица+сыр/овощи, яйца+сыр/молоко/овощи) не сработал, срабатывает безусловный фоллбэк на любой самый скоропортящийся продукт (`expiringItem`), подставляющий его название в шаблон: `«Подготовьте продукт "${expiringItem.name}", промыв или отмерив нужную порцию... Доведите до готовности на среднем огне»`. Так мука, сливочное масло, кетчуп или чай превращаются в «горячее блюдо дня».

**Правильная архитектура движка рецептов (Hybrid Deterministic + On-Demand AI):**

1. **Строгая таксономия ролей ингредиентов (`ingredient_role` в `foodPresets.json`):** Каждому пресету присваивается кулинарная роль:
    
    - `base_protein`: курица, говядина, рыба, яйца, творог, тофу.
        
    - `base_carb`: паста, крупы, картофель, хлеб/тортилья.
        
    - `produce`: овощи, зелень, грибы, фрукты.
        
    - `dairy_fat`: сыр, сливки, сметана, молоко.
        
    - `pantry_staple` / `condiment` (вспомогательные): мука, сахар, соль, растительное/сливочное масло, соусы, специи, напитки.
        
2. **Правило минимального состава (Anti-Surrealism Gate):**
    
    - Вспомогательные продукты (`pantry_staple`, `condiment`, `Напитки`) **никогда** не могут выступать триггером рецепта или единственным основным ингредиентом.
        
    - Карточка «Идея на вечер» рендерится **только** если в холодильнике есть минимум **2 совместимых основных ингредиента** (`base_protein`, `base_carb`, `produce`, `dairy_fat`), причем хотя бы один из них истекает в ближайшие 3 дня. Если подходящей пары нет — карточка просто скрывается (`return null`), не выдумывая абсурдных советов.
        
3. **Расширенная матрица детерминированных рецептов + On-Demand LLM:**
    
    - Локальный словарь из 25–30 проверенных рецептов (с тегами обязательных и опциональных ролей) мгновенно и бесплатно закрывает 80% бытовых сценариев.
        
    - **Генерация через LLM (Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` или Gemini 2.5 Flash) строго по клику (On-Demand):** Автоматически вызывать LLM на каждый рендер экрана нельзя (трата квот и задержка UI). Оптимальный UX — кнопка **«✨ Подобрать рецепт по моим продуктам»**, которая отправляет на воркер `POST /api/fridges/:id/recipe-suggest` (с кэшированием ответа в D1/KV по хэшу списка активных продуктов и рейтлимитом 3 запроса в сутки на пользователя).
        

## 5. План дальнейшего развития (Roadmap v1.2 $\rightarrow$ v2.0)

|**Релиз**|**Фокус этапа**|**Ключевые инженерные и продуктовые задачи**|
|---|---|---|
|**v1.1.1 (Hotfix)**|**Безопасность и целостность данных**|1. Закрыть `/api/telegram-webhook` проверкой `X-Telegram-Bot-Api-Secret-Token` и защитить `/api/webhook/setup`.<br><br>  <br><br>2. Исправить поле `daysDiff` в `POST /api/notify/test`.<br><br>  <br><br>3. Включить проверку `ALLOWED_ORIGINS` в `getCorsHeaders`.<br><br>  <br><br>4. Отключить дублирующий cron в `.github/workflows/notify.yml` (оставить только `workflow_dispatch`).<br><br>  <br><br>5. Исправить `getLocalProductsForMigration` в `storage.ts` (однократная миграция legacy-ключей) и добавить `AND status = 'active'` в проверку лимита 300 продуктов.|
|**v1.2.0**|**Надежность синхронизации и схемы D1**|1. Добавить колонку `after_opening_hours INTEGER` в таблицу `products` D1.<br><br>  <br><br>2. Внедрить partial-индексы `idx_products_fridge_active_exp` и автоочистку старых `deleted_at` / `consumed` записей (> 60 дней) в кроне.<br><br>  <br><br>3. Добавить `AbortSignal.timeout(4000)` и фоллбэк на HTTP 5xx в `frontend/src/lib/api.ts`.<br><br>  <br><br>4. Вынести дроверы в `React.lazy` и подключить `babel-plugin-react-compiler`.|
|**v1.3.0**|**Персонализация и быстрый ввод**|1. Поддержка часовых поясов (`tz_offset_minutes`) и ежечасный запуск крона с батчингом по 40 пользователей для соблюдения лимита 50 subrequests Cloudflare Free Tier.<br><br>  <br><br>2. Управление участниками семейного холодильника (просмотр списка членов семьи, удаление участника владельцем, переименование холодильника).<br><br>  <br><br>3. Быстрое добавление продуктов прямо через чат с ботом (`/add молоко 3д` или голосовым сообщением).|
|**v2.0.0**|**AI-Кулинария и Умная корзина**|1. Возврат блока «Идея на вечер» с классификацией ингредиентов (`main` vs `staple`) и On-Demand генерацией рецептов через Cloudflare Workers AI / Gemini Flash.<br><br>  <br><br>2. Сканирование чеков (ФНС QR / фото чека) для пакетного добавления продуктов с автоматическим сопоставлением со справочником СанПиН (`foodPresets.json`).<br><br>  <br><br>3. Автоматический список покупок («Купить снова» из вкладок «Съедено» и «Утиль»).|