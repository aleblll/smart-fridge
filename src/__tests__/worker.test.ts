import { describe, it, expect, beforeEach } from 'vitest';
import worker, { verifyTelegramInitData, sanitizeProductItem, checkRateLimit } from '../../worker/src/index';

// Helper to generate valid Telegram initData signature using Web Crypto
async function generateValidTelegramInitData(userObj: any, botToken: string, extraParams: Record<string, string> = {}) {
  const params: Record<string, string> = {
    auth_date: Math.floor(Date.now() / 1000).toString(),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(userObj),
    ...extraParams
  };

  const sortedKeys = Object.keys(params).sort();
  const dataCheckString = sortedKeys.map(k => `${k}=${params[k]}`).join('\n');

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
    .map(b => b.toString(16).padStart(2, '0'))
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
  const mockUser = {
    id: 99887766,
    first_name: 'Pavel',
    username: 'durov'
  };

  describe('verifyTelegramInitData (HMAC-SHA256 Web Crypto)', () => {
    it('should successfully verify valid initData and extract user object', async () => {
      const validInitData = await generateValidTelegramInitData(mockUser, TEST_BOT_TOKEN);
      const verifiedUser = await verifyTelegramInitData(validInitData, TEST_BOT_TOKEN);

      expect(verifiedUser).not.toBeNull();
      expect(verifiedUser?.id).toBe(mockUser.id);
      expect(verifiedUser?.first_name).toBe(mockUser.first_name);
      expect(verifiedUser?.username).toBe(mockUser.username);
    });

    it('should reject tampered initData', async () => {
      const validInitData = await generateValidTelegramInitData(mockUser, TEST_BOT_TOKEN);
      const tamperedInitData = validInitData.replace('Pavel', 'Attacker');

      const result = await verifyTelegramInitData(tamperedInitData, TEST_BOT_TOKEN);
      expect(result).toBeNull();
    });

    it('should reject when hash is missing or token is wrong', async () => {
      const validInitData = await generateValidTelegramInitData(mockUser, TEST_BOT_TOKEN);
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
  });

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
        // Malicious / unallowed injected fields:
        is_admin: true,
        role: 'owner',
        __proto__: { backdoor: true },
        unknown_field: 'malicious'
      };

      const sanitized = sanitizeProductItem(rawInput, 99887766);
      expect(sanitized).not.toBeNull();
      expect(sanitized?.name).toBe('Молоко Домик в деревне');
      expect(sanitized?.storage_type).toBe('fridge');
      expect(sanitized?.quantity).toBe(2);
      expect(sanitized?.unit).toBe('l');
      expect(sanitized?.expires_at).toBe('2026-10-01');
      expect(sanitized?.added_by).toBe(99887766);

      // Verify unallowed fields are absent
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
        status: 'invalid_status'
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

  describe('REST Endpoints & CORS via worker.fetch', () => {
    const env = {
      TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
      ENVIRONMENT: 'test'
    };

    it('should handle CORS OPTIONS preflight requests', async () => {
      const request = new Request('https://edge.fridge.tma/api/fridges/fridge-123', {
        method: 'OPTIONS',
      });

      const response = await worker.fetch(request, env);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should validate Telegram initData on POST /api/auth/validate', async () => {
      const validInitData = await generateValidTelegramInitData(mockUser, TEST_BOT_TOKEN);

      const request = new Request('https://edge.fridge.tma/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: validInitData })
      });

      const response = await worker.fetch(request, env);
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.valid).toBe(true);
      expect(data.user.id).toBe(mockUser.id);
    });

    it('should return 401 on invalid initData signature on /api/auth/validate', async () => {
      const request = new Request('https://edge.fridge.tma/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: 'auth_date=123&hash=invalid_hash' })
      });

      const response = await worker.fetch(request, env);
      expect(response.status).toBe(401);
    });

    it('should handle CRUD flow for fridge products with CORS and sanitization', async () => {
      const fridgeId = 'fridge-test-1';

      // 1. GET initial fridge
      const getReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}`, {
        method: 'GET'
      });
      const getRes = await worker.fetch(getReq, env);
      expect(getRes.status).toBe(200);
      const fridgeData = await getRes.json() as any;
      expect(fridgeData.id).toBe(fridgeId);

      // 2. POST /api/fridges/:id/products
      const postReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: {
            id: 'product-test-1',
            name: 'Творог 9%',
            category: 'Молочная продукция',
            storage_type: 'fridge',
            quantity: 3,
            unit: 'pack',
            expires_at: '2026-10-15',
            unwanted_extra: 'should_be_stripped'
          },
          user_id: 12345
        })
      });

      const postRes = await worker.fetch(postReq, env);
      expect(postRes.status).toBe(201);
      const postResult = await postRes.json() as any;
      expect(postResult.success).toBe(true);
      expect(postResult.product.id).toBe('product-test-1');
      expect(postResult.product.name).toBe('Творог 9%');
      expect(postResult.product.unwanted_extra).toBeUndefined();

      // 3. PATCH /api/fridges/:id/products/:productId
      const patchReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products/product-test-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: { quantity: 1, status: 'active' }
        })
      });
      const patchRes = await worker.fetch(patchReq, env);
      expect(patchRes.status).toBe(200);
      const patchResult = await patchRes.json() as any;
      expect(patchResult.product.quantity).toBe(1);

      // 4. DELETE /api/fridges/:id/products/:productId
      const deleteReq = new Request(`https://edge.fridge.tma/api/fridges/${fridgeId}/products/product-test-1`, {
        method: 'DELETE'
      });
      const deleteRes = await worker.fetch(deleteReq, env);
      expect(deleteRes.status).toBe(200);

      // 5. Verify product deleted in fridge GET
      const verifyGetRes = await worker.fetch(getReq, env);
      const updatedFridge = await verifyGetRes.json() as any;
      expect(updatedFridge.products['product-test-1']).toBeUndefined();
    });
  });
});
