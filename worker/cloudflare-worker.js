/**
 * Cloudflare Worker Edge Gateway & DTO Sanitizer for Smart Fridge TMA
 * Built according to ARCH-003 and samgtu-schedule pattern.
 */

const rateLimitMap = new Map();

export function checkRateLimit(key, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter(ts => now - ts < windowMs);
  if (timestamps.length >= limit) {
    rateLimitMap.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true;
}

/**
 * DTO Sanitizer: Whitelist-фильтрация полей для защиты от Mass Assignment
 */
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

  const createdAt = typeof item.created_at === 'string' ? item.created_at : new Date().toISOString();

  return {
    id: String(item.id || crypto.randomUUID()),
    name: String(item.name || '').trim().slice(0, 128),
    category: String(item.category || 'Другое').slice(0, 64),
    storage_type: storageType,
    quantity: Number(quantity),
    unit: unit,
    opened_at: item.opened_at ? String(item.opened_at).slice(0, 30) : null,
    expires_at: expiresAt,
    notify_before_days: typeof item.notify_before_days === 'number' && item.notify_before_days >= 0 && item.notify_before_days <= 14
      ? item.notify_before_days
      : 2,
    status: status,
    added_by: Number(userId) || 0,
    created_at: createdAt,
    updated_at: new Date().toISOString()
  };
}

/**
 * Верификация Telegram initData на Edge через Web Crypto API (HMAC-SHA256)
 */
export async function verifyTelegramInitData(initDataRaw, botToken) {
  if (!initDataRaw || !botToken) return null;

  try {
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
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data, X-Cron-Secret',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

export const memoryStore = new Map();

async function getFridgeData(fridgeId, kv) {
  if (kv) {
    const raw = await kv.get(`fridge:${fridgeId}`);
    return raw ? JSON.parse(raw) : null;
  }
  return memoryStore.get(`fridge:${fridgeId}`) || null;
}

async function saveFridgeData(fridgeId, data, kv) {
  if (kv) {
    await kv.put(`fridge:${fridgeId}`, JSON.stringify(data));
  } else {
    memoryStore.set(`fridge:${fridgeId}`, data);
  }
}

async function listAllFridges(kv) {
  const result = [];
  if (kv) {
    const list = await kv.list({ prefix: 'fridge:' });
    for (const key of list.keys) {
      const raw = await kv.get(key.name);
      if (raw) {
        try {
          result.push(JSON.parse(raw));
        } catch {}
      }
    }
  } else {
    for (const [k, v] of memoryStore.entries()) {
      if (k.startsWith('fridge:')) {
        result.push(v);
      }
    }
  }
  return result;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const clientIP = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Rate Limiting
    if (!checkRateLimit(clientIP, 30, 60000)) {
      return jsonResponse({ error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' }, 429);
    }

    const initDataHeader = request.headers.get('X-Telegram-Init-Data') ||
      (request.headers.get('Authorization')?.startsWith('tma ') ? request.headers.get('Authorization')?.slice(4) : null);

    const botToken = env?.TELEGRAM_BOT_TOKEN || '';

    // Route: GET/POST /api/cron/notify
    if (url.pathname === '/api/cron/notify') {
      const providedSecret = request.headers.get('X-Cron-Secret') ||
        (request.headers.get('Authorization')?.startsWith('Bearer ') ? request.headers.get('Authorization')?.slice(7) : null);

      if (env?.CRON_SECRET && providedSecret !== env.CRON_SECRET) {
        return jsonResponse({ error: 'Unauthorized: invalid cron secret', code: 'UNAUTHORIZED' }, 401);
      }

      const fridges = await listAllFridges(env?.FRIDGE_KV);
      return jsonResponse({
        success: true,
        count: fridges.length,
        fridges,
        server_time: new Date().toISOString()
      });
    }

    // Route: POST /api/auth/validate
    if (request.method === 'POST' && url.pathname === '/api/auth/validate') {
      let initDataRaw = initDataHeader;
      try {
        const body = await request.json();
        if (body?.initData) initDataRaw = body.initData;
      } catch {
        // empty or non-json body
      }

      if (!initDataRaw) {
        return jsonResponse({ error: 'Missing initData', code: 'MISSING_INIT_DATA' }, 400);
      }

      if (!botToken) {
        return jsonResponse({ error: 'Bot token not configured on server', code: 'SERVER_MISCONFIG' }, 500);
      }

      const user = await verifyTelegramInitData(initDataRaw, botToken);
      if (!user) {
        return jsonResponse({ error: 'Invalid HMAC signature or malformed initData', code: 'INVALID_SIGNATURE' }, 401);
      }

      return jsonResponse({
        valid: true,
        user,
        server_time: new Date().toISOString()
      });
    }

    // Fridge routes
    const fridgeMatch = url.pathname.match(/^\/api\/fridges\/([a-zA-Z0-9_-]+)(?:\/products(?:\/([a-zA-Z0-9_-]+))?)?$/);

    if (fridgeMatch) {
      const fridgeId = fridgeMatch[1];
      const isProductSubRoute = url.pathname.includes('/products');
      const productId = fridgeMatch[2];

      // GET /api/fridges/:id
      if (request.method === 'GET' && !isProductSubRoute) {
        let fridge = await getFridgeData(fridgeId, env?.FRIDGE_KV);
        if (!fridge) {
          fridge = {
            id: fridgeId,
            name: 'Мой холодильник',
            owner_id: 0,
            members: {},
            products: {},
            created_at: new Date().toISOString()
          };
          await saveFridgeData(fridgeId, fridge, env?.FRIDGE_KV);
        }
        return jsonResponse(fridge);
      }

      // POST /api/fridges/:id/products
      if (request.method === 'POST' && isProductSubRoute && !productId) {
        try {
          const body = await request.json();
          const itemPayload = body.item || body;
          const initDataRaw = body.initData || initDataHeader;

          let userId = body.user_id || 0;
          if (initDataRaw && botToken) {
            const verifiedUser = await verifyTelegramInitData(initDataRaw, botToken);
            if (verifiedUser) userId = verifiedUser.id;
          }

          const sanitized = sanitizeProductItem(itemPayload, userId);
          if (!sanitized || !sanitized.name) {
            return jsonResponse({ error: 'Invalid product payload', code: 'INVALID_PAYLOAD' }, 400);
          }

          let fridge = await getFridgeData(fridgeId, env?.FRIDGE_KV) || {
            id: fridgeId,
            name: 'Мой холодильник',
            owner_id: userId,
            members: { [userId]: 'owner' },
            products: {},
            created_at: new Date().toISOString()
          };

          if (!fridge.products) fridge.products = {};
          fridge.products[sanitized.id] = sanitized;
          await saveFridgeData(fridgeId, fridge, env?.FRIDGE_KV);

          return jsonResponse({ success: true, product: sanitized }, 201);
        } catch (e) {
          return jsonResponse({ error: e.message || 'Bad Request', code: 'BAD_REQUEST' }, 400);
        }
      }

      // PATCH /api/fridges/:id/products/:productId
      if (request.method === 'PATCH' && isProductSubRoute && productId) {
        try {
          const body = await request.json();
          const updatePayload = body.item || body;
          const initDataRaw = body.initData || initDataHeader;

          let userId = body.user_id || 0;
          if (initDataRaw && botToken) {
            const verifiedUser = await verifyTelegramInitData(initDataRaw, botToken);
            if (verifiedUser) userId = verifiedUser.id;
          }

          let fridge = await getFridgeData(fridgeId, env?.FRIDGE_KV);
          if (!fridge || !fridge.products || !fridge.products[productId]) {
            return jsonResponse({ error: 'Product not found', code: 'PRODUCT_NOT_FOUND' }, 404);
          }

          const existingProduct = fridge.products[productId];
          const merged = { ...existingProduct, ...updatePayload, id: productId };
          const sanitized = sanitizeProductItem(merged, existingProduct.added_by || userId);

          if (!sanitized) {
            return jsonResponse({ error: 'Invalid update payload', code: 'INVALID_PAYLOAD' }, 400);
          }

          fridge.products[productId] = sanitized;
          await saveFridgeData(fridgeId, fridge, env?.FRIDGE_KV);

          return jsonResponse({ success: true, product: sanitized });
        } catch (e) {
          return jsonResponse({ error: e.message || 'Bad Request', code: 'BAD_REQUEST' }, 400);
        }
      }

      // DELETE /api/fridges/:id/products/:productId
      if (request.method === 'DELETE' && isProductSubRoute && productId) {
        let fridge = await getFridgeData(fridgeId, env?.FRIDGE_KV);
        if (!fridge || !fridge.products || !fridge.products[productId]) {
          return jsonResponse({ error: 'Product not found', code: 'PRODUCT_NOT_FOUND' }, 404);
        }

        delete fridge.products[productId];
        await saveFridgeData(fridgeId, fridge, env?.FRIDGE_KV);

        return jsonResponse({ success: true, message: 'Product deleted' });
      }
    }

    // POST /api/invites/create
    if (request.method === 'POST' && url.pathname === '/api/invites/create') {
      try {
        const body = await request.json();
        const fridgeId = body.fridge_id;
        const inviteCode = crypto.randomUUID().slice(0, 8);
        const inviteData = {
          code: inviteCode,
          fridge_id: fridgeId,
          created_by: body.user_id || 0,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
          max_uses: body.max_uses || 5,
          uses_count: 0
        };

        if (env?.FRIDGE_KV) {
          await env.FRIDGE_KV.put(`invite:${inviteCode}`, JSON.stringify(inviteData));
        } else {
          memoryStore.set(`invite:${inviteCode}`, inviteData);
        }

        return jsonResponse({ success: true, invite: inviteData });
      } catch (e) {
        return jsonResponse({ error: e.message || 'Bad Request' }, 400);
      }
    }

    // POST /api/invites/claim
    if (request.method === 'POST' && url.pathname === '/api/invites/claim') {
      try {
        const body = await request.json();
        const inviteCode = body.code;
        let invite = null;

        if (env?.FRIDGE_KV) {
          const raw = await env.FRIDGE_KV.get(`invite:${inviteCode}`);
          if (raw) invite = JSON.parse(raw);
        } else {
          invite = memoryStore.get(`invite:${inviteCode}`);
        }

        if (!invite) {
          return jsonResponse({ error: 'Invite code not found or expired', code: 'INVITE_NOT_FOUND' }, 404);
        }

        if (invite.uses_count >= invite.max_uses) {
          return jsonResponse({ error: 'Invite limit reached', code: 'INVITE_LIMIT' }, 400);
        }

        invite.uses_count += 1;
        if (env?.FRIDGE_KV) {
          await env.FRIDGE_KV.put(`invite:${inviteCode}`, JSON.stringify(invite));
        } else {
          memoryStore.set(`invite:${inviteCode}`, invite);
        }

        return jsonResponse({ success: true, fridge_id: invite.fridge_id });
      } catch (e) {
        return jsonResponse({ error: e.message || 'Bad Request' }, 400);
      }
    }

    return jsonResponse({ error: 'Not Found', path: url.pathname }, 404);
  }
};
