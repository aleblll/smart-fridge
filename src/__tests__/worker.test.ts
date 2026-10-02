import { describe, it, expect, beforeEach } from 'vitest';
import worker, {
  verifyTelegramInitData,
  verifyTelegramAuth,
  sanitizeProductItem,
  checkRateLimit,
  timingSafeCompare,
  resetInMemoryD1
} from '../../worker/src/index';

// Helper to generate valid Telegram initData signature using Web Crypto
async function generateValidTelegramInitData(
  userObj: any,
  botToken: string,
  extraParams: Record<string, string> = {}
) {
  const params: Record<string, string> = {
    auth_date: Math.floor(Date.now() / 1000).toString(),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(userObj),
    ...extraParams,
  };

  const sortedKeys = Object.keys(params).sort();
  const dataCheckString = sortedKeys.map((k) => `${k}=${params[k]}`).join('\n');

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const secretKeySignature = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKeySignature,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(dataCheckString));
  const hash = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    searchParams.set(k, v);
  }
  searchParams.set('hash', hash);

  return searchParams.toString();
}

describe('Cloudflare Worker Gateway & DTO Sanitizer', () => {
  const TEST_BOT_TOKEN = '1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ';
  const CRON_SECRET = 'super-secret-cron-token-12345';

  const userA = {
    id: 99887766,
    first_name: 'Pavel',
    username: 'durov',
  };

  const userB = {
    id: 11223344,
    first_name: 'Nikolai',
    username: 'nikolai_d',
  };

  const env = {
    TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
    CRON_SECRET: CRON_SECRET,
    ENVIRONMENT: 'test',
  };

  beforeEach(() => {
    resetInMemoryD1();
  });

  // ========================================================
  // 1. Telegram HMAC & Timing-Safe Crypto Tests
  // ========================================================
  describe('verifyTelegramAuth & verifyTelegramInitData', () => {
    it('should successfully verify valid initData and extract user object', async () => {
      const validInitData = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN);
      const verifiedUser = await verifyTelegramInitData(validInitData, TEST_BOT_TOKEN);

      expect(verifiedUser).not.toBeNull();
      expect(verifiedUser?.id).toBe(userA.id);
      expect(verifiedUser?.first_name).toBe(userA.first_name);
      expect(verifiedUser?.username).toBe(userA.username);
    });

    it('should reject tampered initData with INVALID_SIGNATURE', async () => {
      const validInitData = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN);
      const tamperedInitData = validInitData.replace('Pavel', 'Attacker');

      const result = await verifyTelegramAuth(tamperedInitData, TEST_BOT_TOKEN);
      expect(result.user).toBeNull();
      expect(result.error).toBe('INVALID_SIGNATURE');
    });

    it('should reject expired auth_date (> 3600 seconds) with AUTH_EXPIRED', async () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3700; // 3700s ago
      const expiredInitData = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN, {
        auth_date: expiredTimestamp.toString(),
      });

      const result = await verifyTelegramAuth(expiredInitData, TEST_BOT_TOKEN);
      expect(result.user).toBeNull();
      expect(result.error).toBe('AUTH_EXPIRED');

      // Backward compatible wrapper returns null
      expect(await verifyTelegramInitData(expiredInitData, TEST_BOT_TOKEN)).toBeNull();
    });

    it('should reject when hash is missing or token is wrong', async () => {
      const validInitData = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN);
      const wrongTokenResult = await verifyTelegramInitData(validInitData, 'wrong_token');
      expect(wrongTokenResult).toBeNull();

      const noHashParams = new URLSearchParams(validInitData);
      noHashParams.delete('hash');
      const noHashResult = await verifyTelegramInitData(noHashParams.toString(), TEST_BOT_TOKEN);
      expect(noHashResult).toBeNull();
    });

    it('should handle empty or null values gracefully', async () => {
      expect(await verifyTelegramInitData('', TEST_BOT_TOKEN)).toBeNull();
      expect(await verifyTelegramInitData('random=string', '')).toBeNull();
    });

    it('should perform constant-time comparison via timingSafeCompare', () => {
      expect(timingSafeCompare('a1b2c3d4', 'a1b2c3d4')).toBe(true);
      expect(timingSafeCompare('a1b2c3d4', 'a1b2c3d5')).toBe(false);
      expect(timingSafeCompare('a1b2c3d4', 'a1b2c3')).toBe(false);
      expect(timingSafeCompare('', '')).toBe(true);
    });
  });

  // ========================================================
  // 2. sanitizeProductItem (Strict Whitelist DTO Sanitizer)
  // ========================================================
  describe('sanitizeProductItem (Strict Whitelist DTO Sanitizer)', () => {
    it('should strictly sanitize and filter out unallowed fields (Mass Assignment protection)', () => {
      const rawInput = {
        id: 'prod-001',
        name: '  Молоко Домик в деревне  ',
        category: 'Молочная продукция',
        storage_type: 'fridge',
        quantity: 2,
        unit: 'l',
        expires_at: '2026-10-01',
        notify_before_days: 3,
        status: 'active',
        // Injected fields:
        is_admin: true,
        role: 'owner',
        __proto__: { backdoor: true },
        unknown_field: 'malicious',
      };

      const sanitized = sanitizeProductItem(rawInput, userA.id);
      expect(sanitized).not.toBeNull();
      expect(sanitized?.name).toBe('Молоко Домик в деревне');
      expect(sanitized?.storage_type).toBe('fridge');
      expect(sanitized?.quantity).toBe(2);
      expect(sanitized?.unit).toBe('l');
      expect(sanitized?.expires_at).toBe('2026-10-01');
      expect(sanitized?.added_by).toBe(userA.id);

      expect((sanitized as any).is_admin).toBeUndefined();
      expect((sanitized as any).role).toBeUndefined();
      expect((sanitized as any).unknown_field).toBeUndefined();
    });

    it('should fallback invalid values to safe defaults', () => {
      const badInput = {
        name: 'Сыр',
        storage_type: 'invalid_type',
        quantity: -5,
        unit: 'invalid_unit',
        expires_at: 'not-a-date',
        status: 'invalid_status',
      };

      const sanitized = sanitizeProductItem(badInput, 100);
      expect(sanitized).not.toBeNull();
      expect(sanitized?.storage_type).toBe('fridge');
      expect(sanitized?.unit).toBe('pcs');
      expect(sanitized?.quantity).toBe(1);
      expect(sanitized?.status).toBe('active');
      expect(sanitized?.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return null for non-object inputs', () => {
      expect(sanitizeProductItem(null, 100)).toBeNull();
      expect(sanitizeProductItem(undefined, 100)).toBeNull();
      expect(sanitizeProductItem('string', 100)).toBeNull();
    });
  });

  // ========================================================
  // 3. CORS & Zero-Trust Gate Tests
  // ========================================================
  describe('CORS & Zero-Trust Authentication Gate', () => {
    it('should handle CORS OPTIONS preflight without wildcard *', async () => {
      const request = new Request('https://edge.fridge.tma/api/fridges/my', {
        method: 'OPTIONS',
        headers: { Origin: 'https://aleblll.github.io' },
      });

      const response = await worker.fetch(request, env);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://aleblll.github.io');
      expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should allow local development origin in CORS', async () => {
      const request = new Request('https://edge.fridge.tma/api/fridges/my', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173' },
      });

      const response = await worker.fetch(request, env);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });

    it('1. Запрос без initData → немедленный 401 Unauthorized (MISSING_INIT_DATA)', async () => {
      const endpoints = [
        { path: '/api/fridges/my', method: 'GET' },
        { path: '/api/fridges/fridge-123/products', method: 'GET' },
        { path: '/api/fridges/fridge-123/products', method: 'POST', body: JSON.stringify({ name: 'Хлеб' }) },
        { path: '/api/invites/create', method: 'POST', body: JSON.stringify({ fridge_id: 'fridge-123' }) },
      ];

      for (const ep of endpoints) {
        const req = new Request(`https://edge.fridge.tma${ep.path}`, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json' },
          body: ep.body,
        });

        const res = await worker.fetch(req, env);
        expect(res.status).toBe(401);
        const data = await res.json() as any;
        expect(data.code).toBe('MISSING_INIT_DATA');
      }
    });

    it('2. Запрос с истекшим auth_date (> 1 ч) → 401 Unauthorized (AUTH_EXPIRED)', async () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 4000;
      const expiredInitData = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN, {
        auth_date: expiredTimestamp.toString(),
      });

      // Тест на /api/auth/validate
      const authReq = new Request('https://edge.fridge.tma/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: expiredInitData }),
      });
      const authRes = await worker.fetch(authReq, env);
      expect(authRes.status).toBe(401);
      const authData = await authRes.json() as any;
      expect(authData.code).toBe('AUTH_EXPIRED');

      // Тест на /api/fridges/my
      const fridgesReq = new Request('https://edge.fridge.tma/api/fridges/my', {
        method: 'GET',
        headers: {
          'Authorization': `tma ${expiredInitData}`,
        },
      });
      const fridgesRes = await worker.fetch(fridgesReq, env);
      expect(fridgesRes.status).toBe(401);
      const fridgesData = await fridgesRes.json() as any;
      expect(fridgesData.code).toBe('AUTH_EXPIRED');
    });

    it('should validate Telegram initData on POST /api/auth/validate when valid', async () => {
      const validInitData = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN);

      const request = new Request('https://edge.fridge.tma/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: validInitData }),
      });

      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.valid).toBe(true);
      expect(data.user.id).toBe(userA.id);
    });
  });

  // ========================================================
  // 4. Resource-Level Auth & Product CRUD Tests
  // ========================================================
  describe('Resource-Level Auth & Full CRUD Lifecycle', () => {
    it('should auto-create default fridge on GET /api/fridges/my and support CRUD', async () => {
      const initDataA = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN);

      // 1. GET /api/fridges/my -> auto creates default fridge
      const getMyReq = new Request('https://edge.fridge.tma/api/fridges/my', {
        method: 'GET',
        headers: { 'Authorization': `tma ${initDataA}` },
      });
      const getMyRes = await worker.fetch(getMyReq, env);
      expect(getMyRes.status).toBe(200);
      const myFridgesData = await getMyRes.json() as any;
      expect(myFridgesData.success).toBe(true);
      expect(myFridgesData.fridges.length).toBe(1);

      const fridgeA = myFridgesData.fridges[0];
      expect(fridgeA.role).toBe('owner');
      const fridgeId = fridgeA.id;

      // 2. POST /api/fridges/:id/products (User A adds product)
      const postReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataA}`,
        },
        body: JSON.stringify({
          name: 'Творог 9%',
          category: 'Молочная продукция',
          storage_type: 'fridge',
          quantity: 2,
          unit: 'pack',
          expires_at: '2026-10-15',
          unwanted_injection: 'hack',
          user_id: 99999999, // Should be ignored in favor of HMAC authUserId
        }),
      });

      const postRes = await worker.fetch(postReq, env);
      expect(postRes.status).toBe(201);
      const postData = await postRes.json() as any;
      expect(postData.success).toBe(true);
      expect(postData.product.name).toBe('Творог 9%');
      expect(postData.product.quantity).toBe(2);
      expect(postData.product.added_by).toBe(userA.id); // HMAC authUserId, NOT 99999999
      expect((postData.product as any).unwanted_injection).toBeUndefined();

      const productId = postData.product.id;

      // 3. GET /api/fridges/:id/products
      const listReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'GET',
        headers: { 'Authorization': `tma ${initDataA}` },
      });
      const listRes = await worker.fetch(listReq, env);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json() as any;
      expect(listData.products.length).toBe(1);
      expect(listData.products[0].id).toBe(productId);

      // 4. PATCH /api/fridges/:id/products/:productId
      const patchReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataA}`,
        },
        body: JSON.stringify({
          quantity: 5,
          status: 'consumed',
        }),
      });
      const patchRes = await worker.fetch(patchReq, env);
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json() as any;
      expect(patchData.product.quantity).toBe(5);
      expect(patchData.product.status).toBe('consumed');

      // 5. DELETE /api/fridges/:id/products/:productId (Soft Delete)
      const delReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products/${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `tma ${initDataA}` },
      });
      const delRes = await worker.fetch(delReq, env);
      expect(delRes.status).toBe(200);

      // Verify product is no longer in active products list
      const listAfterDelRes = await worker.fetch(listReq, env);
      const listAfterDelData = await listAfterDelRes.json() as any;
      expect(listAfterDelData.products.length).toBe(0);
    });

    it('3. Доступ к чужому холодильнику без членства → 403 Forbidden (ACCESS_DENIED)', async () => {
      const initDataA = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN);
      const initDataB = await generateValidTelegramInitData(userB, TEST_BOT_TOKEN);

      // User A creates fridge
      const getMyReq = new Request('https://edge.fridge.tma/api/fridges/my', {
        method: 'GET',
        headers: { 'Authorization': `tma ${initDataA}` },
      });
      const getMyRes = await worker.fetch(getMyReq, env);
      const myFridgesData = await getMyRes.json() as any;
      const fridgeId = myFridgesData.fridges[0].id;

      // User B attempts to access User A's fridge products -> 403 Forbidden
      const bAccessReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'GET',
        headers: { 'Authorization': `tma ${initDataB}` },
      });
      const bAccessRes = await worker.fetch(bAccessReq, env);
      expect(bAccessRes.status).toBe(403);
      const bAccessData = await bAccessRes.json() as any;
      expect(bAccessData.code).toBe('ACCESS_DENIED');

      // User B attempts to add product to User A's fridge -> 403 Forbidden
      const bPostReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataB}`,
        },
        body: JSON.stringify({
          name: 'Чужой сыр',
          expires_at: '2026-10-20',
          quantity: 1,
        }),
      });
      const bPostRes = await worker.fetch(bPostReq, env);
      expect(bPostRes.status).toBe(403);

      // User B attempts to generate invite for User A's fridge -> 403 Forbidden
      const bInviteReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/invites`, {
        method: 'POST',
        headers: { 'Authorization': `tma ${initDataB}` },
      });
      const bInviteRes = await worker.fetch(bInviteReq, env);
      expect(bInviteRes.status).toBe(403);
    });

    it('5. Создание и claim инвайта: User B присоединяется к холодильнику User A', async () => {
      const initDataA = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN);
      const initDataB = await generateValidTelegramInitData(userB, TEST_BOT_TOKEN);

      // 1. User A retrieves/creates their fridge
      const getMyRes = await worker.fetch(new Request('https://edge.fridge.tma/api/fridges/my', {
        headers: { 'Authorization': `tma ${initDataA}` },
      }), env);
      const myFridges = await getMyRes.json() as any;
      const fridgeId = myFridges.fridges[0].id;

      // 2. User A creates invite
      const inviteReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/invites`, {
        method: 'POST',
        headers: { 'Authorization': `tma ${initDataA}` },
      });
      const inviteRes = await worker.fetch(inviteReq, env);
      expect(inviteRes.status).toBe(201);
      const inviteData = await inviteRes.json() as any;
      expect(inviteData.success).toBe(true);
      expect(typeof inviteData.code).toBe('string');
      expect(inviteData.code.length).toBeGreaterThanOrEqual(16);

      const inviteCode = inviteData.code;

      // 3. User B claims invite
      const claimReq = new Request(`https://edge.fridge.tma/api/invites/${inviteCode}/claim`, {
        method: 'POST',
        headers: { 'Authorization': `tma ${initDataB}` },
      });
      const claimRes = await worker.fetch(claimReq, env);
      expect(claimRes.status).toBe(200);
      const claimData = await claimRes.json() as any;
      expect(claimData.success).toBe(true);
      expect(claimData.fridge_id).toBe(fridgeId);

      // 4. User B now HAS ACCESS to the fridge!
      const bGetProductsRes = await worker.fetch(new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        headers: { 'Authorization': `tma ${initDataB}` },
      }), env);
      expect(bGetProductsRes.status).toBe(200);

      // 5. User B can now add products to the shared fridge
      const bAddProductRes = await worker.fetch(new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataB}`,
        },
        body: JSON.stringify({
          name: 'Яблоки',
          quantity: 1.5,
          unit: 'kg',
          expires_at: '2026-10-30',
        }),
      }), env);
      expect(bAddProductRes.status).toBe(201);
      const bAddData = await bAddProductRes.json() as any;
      expect(bAddData.product.added_by).toBe(userB.id);
    });

    it('should reject invalid product payloads (DTO strict validation)', async () => {
      const initDataA = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN);
      const getMyRes = await worker.fetch(new Request('https://edge.fridge.tma/api/fridges/my', {
        headers: { 'Authorization': `tma ${initDataA}` },
      }), env);
      const myFridges = await getMyRes.json() as any;
      const fridgeId = myFridges.fridges[0].id;

      // 1. Empty name
      const res1 = await worker.fetch(new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataA}`,
        },
        body: JSON.stringify({ name: '   ', quantity: 1, expires_at: '2026-10-20' }),
      }), env);
      expect(res1.status).toBe(400);

      // 2. Invalid quantity (Infinity / negative / > 10000)
      const res2 = await worker.fetch(new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataA}`,
        },
        body: JSON.stringify({ name: 'Вода', quantity: -10, expires_at: '2026-10-20' }),
      }), env);
      expect(res2.status).toBe(400);

      // 3. Invalid date (non-existent day Feb 31)
      const res3 = await worker.fetch(new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataA}`,
        },
        body: JSON.stringify({ name: 'Сыр', quantity: 1, expires_at: '2026-02-31' }),
      }), env);
      expect(res3.status).toBe(400);

      // 4. Date > 5 years in future
      const farFutureYear = new Date().getFullYear() + 10;
      const res4 = await worker.fetch(new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataA}`,
        },
        body: JSON.stringify({ name: 'Консервы', quantity: 1, expires_at: `${farFutureYear}-01-01` }),
      }), env);
      expect(res4.status).toBe(400);
    });
  });

  // ========================================================
  // 5. Cron Security Tests (Closed by Default)
  // ========================================================
  describe('6. Cron Security (/api/cron/notify Closed by Default)', () => {
    it('should reject when request has no cron secret header → 401 UNAUTHORIZED', async () => {
      const req = new Request('https://edge.fridge.tma/api/cron/notify', {
        method: 'GET',
      });
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should reject when request has incorrect cron secret header → 401 UNAUTHORIZED', async () => {
      const req = new Request('https://edge.fridge.tma/api/cron/notify', {
        method: 'GET',
        headers: { 'X-Cron-Secret': 'wrong-secret' },
      });
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should reject when CRON_SECRET is not configured on server (even if client sends header) → 401', async () => {
      const envWithoutSecret = {
        TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
        CRON_SECRET: undefined,
      };

      const req = new Request('https://edge.fridge.tma/api/cron/notify', {
        method: 'GET',
        headers: { 'X-Cron-Secret': 'some-secret' },
      });
      const res = await worker.fetch(req, envWithoutSecret);
      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should succeed with 200 OK when matching CRON_SECRET is provided', async () => {
      // Create a fridge with product first
      const initDataA = await generateValidTelegramInitData(userA, TEST_BOT_TOKEN);
      const getMyRes = await worker.fetch(new Request('https://edge.fridge.tma/api/fridges/my', {
        headers: { 'Authorization': `tma ${initDataA}` },
      }), env);
      const myFridges = await getMyRes.json() as any;
      const fridgeId = myFridges.fridges[0].id;

      await worker.fetch(new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `tma ${initDataA}`,
        },
        body: JSON.stringify({
          name: 'Кефир',
          quantity: 1,
          expires_at: '2026-10-05',
        }),
      }), env);

      // Now call cron
      const req = new Request('https://edge.fridge.tma/api/cron/notify', {
        method: 'GET',
        headers: { 'X-Cron-Secret': CRON_SECRET },
      });
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.fridges[0].products.length).toBe(1);
      expect(data.fridges[0].products[0].name).toBe('Кефир');
    });
  });
});
