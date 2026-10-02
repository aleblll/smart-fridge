export interface Env {
  DB?: D1Database;
  FRIDGE_KV?: KVNamespace;
  TELEGRAM_BOT_TOKEN?: string;
  CRON_SECRET?: string;
  ENVIRONMENT?: string;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = any>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(colName?: string): Promise<T | null>;
  all<T = any>(): Promise<D1Result<T>>;
  run<T = any>(): Promise<D1Response>;
}

export interface D1Result<T = any> {
  results: T[];
  success: boolean;
  meta?: any;
}

export interface D1Response {
  success: boolean;
  meta?: any;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface ProductItem {
  id: string;
  fridge_id?: string;
  name: string;
  category: string;
  storage_type: 'fridge' | 'freezer' | 'pantry';
  quantity: number;
  unit: 'pcs' | 'kg' | 'g' | 'l' | 'pack';
  opened_at: string | null;
  expires_at: string;
  notify_before_days: number;
  status: 'active' | 'consumed' | 'discarded';
  added_by: number;
  created_at?: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface VerifyAuthResult {
  user: TelegramUser | null;
  error?: 'MISSING_INIT_DATA' | 'AUTH_EXPIRED' | 'INVALID_SIGNATURE' | 'MALFORMED_DATA';
}

export interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
  type: string;
  noRetry?: () => void;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export interface ExpiringProductRow {
  id: string;
  fridge_id: string;
  name: string;
  category: string;
  storage_type: string;
  quantity: number;
  unit: string;
  expires_at: string;
  notify_before_days: number;
  fridge_name: string;
  user_id: number;
  last_digest_date?: string | null;
}

export interface ExpiringProductItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expires_at: string;
  fridge_name: string;
  daysDiff: number;
}

export interface UserDigest {
  userId: number;
  items: ExpiringProductItem[];
  fridgeNames: string[];
}

export interface NotificationStats {
  total: number;
  sent: number;
  blocked: number;
  failed: number;
  skipped: number;
}

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  userId: number;
  blocked?: boolean;
  error?: string;
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS fridges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fridge_members (
  fridge_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (fridge_id, user_id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  fridge_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  storage_type TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  opened_at TEXT,
  expires_at TEXT NOT NULL,
  notify_before_days INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active',
  added_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  fridge_id TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 10,
  uses_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_notifications (
  user_id INTEGER PRIMARY KEY,
  last_digest_date TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_fridge ON products(fridge_id);
CREATE INDEX IF NOT EXISTS idx_products_expires ON products(expires_at);
CREATE INDEX IF NOT EXISTS idx_members_user ON fridge_members(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_date ON user_notifications(last_digest_date);
`;

// In-memory rate limiting store: key -> timestamps array
const rateLimitMap = new Map<string, number[]>();

export function checkRateLimit(key: string, limit = 60, windowMs = 60000): boolean {
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
 * Constant-time byte-by-byte comparison to prevent timing attacks
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aLen = a.length;
  const bLen = b.length;
  let mismatch = aLen ^ bLen;
  const maxLen = Math.max(aLen, bLen);
  for (let i = 0; i < maxLen; i++) {
    const charA = i < aLen ? a.charCodeAt(i) : 0;
    const charB = i < bLen ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }
  return mismatch === 0;
}

/**
 * DTO Sanitizer: Whitelist-фильтрация полей для защиты от Mass Assignment
 */
export function sanitizeProductItem(item: any, userId: number | string): ProductItem | null {
  if (!item || typeof item !== 'object') return null;

  const validStorageTypes: Array<'fridge' | 'freezer' | 'pantry'> = ['fridge', 'freezer', 'pantry'];
  const validUnits: Array<'pcs' | 'kg' | 'g' | 'l' | 'pack'> = ['pcs', 'kg', 'g', 'l', 'pack'];
  const validStatuses: Array<'active' | 'consumed' | 'discarded'> = ['active', 'consumed', 'discarded'];

  const storageType = validStorageTypes.includes(item.storage_type) ? item.storage_type : 'fridge';
  const unit = validUnits.includes(item.unit) ? item.unit : 'pcs';
  const status = validStatuses.includes(item.status) ? item.status : 'active';
  const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 && item.quantity <= 10000
    ? item.quantity
    : 1;

  // Регулярное выражение для формата даты YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const expiresAt = typeof item.expires_at === 'string' && dateRegex.test(item.expires_at)
    ? item.expires_at
    : new Date().toISOString().slice(0, 10);

  const createdAt = typeof item.created_at === 'string' ? item.created_at : new Date().toISOString();

  return {
    id: String(item.id || `prod-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`),
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
 * с проверкой auth_date (макс 3600 сек) и timing-safe сравнением хэша.
 */
export async function verifyTelegramAuth(initDataRaw: string, botToken: string, maxAgeSec = 3600): Promise<VerifyAuthResult> {
  if (!initDataRaw || !botToken) return { user: null, error: 'MISSING_INIT_DATA' };

  try {
    const urlParams = new URLSearchParams(initDataRaw);
    const hash = urlParams.get('hash');
    if (!hash) return { user: null, error: 'INVALID_SIGNATURE' };

    urlParams.delete('hash');
    urlParams.delete('signature'); // Совместимость с Bot API 8.0

    const params: string[] = [];
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

    // Timing-safe check
    if (!timingSafeCompare(hexHash.toLowerCase(), hash.toLowerCase())) {
      return { user: null, error: 'INVALID_SIGNATURE' };
    }

    // Проверка возраста подписи auth_date
    const authDateStr = urlParams.get('auth_date');
    if (!authDateStr) {
      return { user: null, error: 'INVALID_SIGNATURE' };
    }
    const authDate = parseInt(authDateStr, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(authDate) || (now - authDate > maxAgeSec) || (authDate > now + 300)) {
      return { user: null, error: 'AUTH_EXPIRED' };
    }

    // Извлекаем объект user
    const userJson = urlParams.get('user');
    if (!userJson) return { user: null, error: 'MALFORMED_DATA' };
    const user = JSON.parse(userJson) as TelegramUser;
    if (!user || typeof user.id !== 'number') return { user: null, error: 'MALFORMED_DATA' };

    return { user, error: undefined };
  } catch {
    return { user: null, error: 'INVALID_SIGNATURE' };
  }
}

/**
 * Обертка обратной совместимости для существующих тестов и вызовов
 */
export async function verifyTelegramInitData(initDataRaw: string, botToken: string): Promise<TelegramUser | null> {
  const result = await verifyTelegramAuth(initDataRaw, botToken);
  return result.user;
}

// In-Memory SQLite wrapper for D1 API
class SqliteD1PreparedStatement implements D1PreparedStatement {
  private db: any;
  private query: string;
  private params: any[];

  constructor(db: any, query: string, params: any[] = []) {
    this.db = db;
    this.query = query;
    this.params = params;
  }

  bind(...values: any[]): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.db, this.query, values);
  }

  async first<T = any>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.query);
    const row = stmt.get(...this.params) as any;
    if (!row) return null;
    if (colName) return (row[colName] ?? null) as T;
    return row as T;
  }

  async all<T = any>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.query);
    const rows = stmt.all(...this.params) as T[];
    return {
      results: rows || [],
      success: true,
      meta: { changes: 0 }
    };
  }

  async run<T = any>(): Promise<D1Response> {
    const stmt = this.db.prepare(this.query);
    const res = stmt.run(...this.params);
    return {
      success: true,
      meta: { changes: res.changes, last_row_id: Number(res.lastInsertRowid) }
    };
  }
}

class SqliteD1Database implements D1Database {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.db, query);
  }

  async batch<T = any>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const res: D1Result<T>[] = [];
    for (const s of statements) {
      res.push(await s.all<T>());
    }
    return res;
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.db.exec(query);
    return { count: 1, duration: 0 };
  }
}

export function createInMemoryD1(): D1Database {
  let sqliteDb: any = null;
  try {
    const mod = typeof process !== 'undefined' && typeof (process as any).getBuiltinModule === 'function'
      ? (process as any).getBuiltinModule('node:sqlite')
      : null;
    if (mod && mod.DatabaseSync) {
      sqliteDb = new mod.DatabaseSync(':memory:');
    }
  } catch {}

  if (sqliteDb) {
    sqliteDb.exec(SCHEMA_SQL);
    return new SqliteD1Database(sqliteDb);
  }

  throw new Error('No D1 Database binding provided and node:sqlite is unavailable.');
}

let _inMemoryDb: D1Database | null = null;

export function getInMemoryD1(): D1Database {
  if (!_inMemoryDb) {
    _inMemoryDb = createInMemoryD1();
  }
  return _inMemoryDb;
}

export function resetInMemoryD1(): void {
  _inMemoryDb = createInMemoryD1();
}

export function getDb(env: Env): D1Database {
  if (env.DB) return env.DB;
  return getInMemoryD1();
}

// In-memory legacy fallback store (for backwards compatibility if needed)
export const memoryStore = new Map<string, any>();

// CORS Whitelist
const ALLOWED_ORIGINS = new Set([
  'https://aleblll.github.io',
  'http://localhost:5173',
  'http://localhost:3000'
]);

export function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers?.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://aleblll.github.io';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data, X-Cron-Secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(data: any, status = 200, cors: Record<string, string> = {}, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cors,
      ...extraHeaders,
    },
  });
}

// ==========================================
// Morning Notification Digest Functions (TASK-005 & Phase 4)
// ==========================================

export function escapeHtml(str: any): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getDaysUntilExpiry(expiresAtStr: string, referenceDate: Date = new Date()): number {
  const [year, month, day] = expiresAtStr.split('-').map(Number);
  const expiryDate = new Date(Date.UTC(year, month - 1, day));

  const refUTC = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  ));

  const diffMs = expiryDate.getTime() - refUTC.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function formatMoreProducts(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) {
    return `и еще ${count} продуктов`;
  }
  if (mod10 === 1) {
    return `и еще ${count} продукт`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `и еще ${count} продукта`;
  }
  return `и еще ${count} продуктов`;
}

export function formatDigestHtml(
  userDigest: UserDigest,
  appUrl = 'https://aleblll.github.io/smart-fridge/'
): { html: string; replyMarkup: any } {
  const lines: string[] = ['<b>❄️ Умный холодильник: утренний дайджест</b>', ''];

  // Sort items by urgency (daysDiff ASC)
  const sortedItems = [...userDigest.items].sort((a, b) => a.daysDiff - b.daysDiff);
  const totalCount = sortedItems.length;
  const displayedItems = sortedItems.slice(0, 10);
  const remainingCount = totalCount - displayedItems.length;

  const expiredOrToday = displayedItems.filter(item => item.daysDiff <= 0);
  const tomorrow = displayedItems.filter(item => item.daysDiff === 1);
  const soon = displayedItems.filter(item => item.daysDiff > 1);

  if (expiredOrToday.length > 0) {
    lines.push('🔴 <b>Истекает сегодня / просрочено:</b>');
    for (const item of expiredOrToday) {
      const isExpired = item.daysDiff < 0;
      const statusSuffix = isExpired ? ` (просрочено на ${Math.abs(item.daysDiff)} дн.)` : ' (сегодня)';
      lines.push(`• <b>${escapeHtml(item.name)}</b> — ${item.quantity} ${escapeHtml(item.unit)}${statusSuffix}`);
    }
    lines.push('');
  }

  if (tomorrow.length > 0) {
    lines.push('🟡 <b>Истекает завтра:</b>');
    for (const item of tomorrow) {
      lines.push(`• <b>${escapeHtml(item.name)}</b> — ${item.quantity} ${escapeHtml(item.unit)}`);
    }
    lines.push('');
  }

  if (soon.length > 0) {
    lines.push('🟠 <b>Истекает в ближайшие дни:</b>');
    for (const item of soon) {
      lines.push(`• ${escapeHtml(item.name)} (${item.quantity} ${escapeHtml(item.unit)}) — до ${item.expires_at}`);
    }
    lines.push('');
  }

  if (remainingCount > 0) {
    lines.push(`<i>...${formatMoreProducts(remainingCount)}</i>`);
    lines.push('');
  }

  lines.push('<i>💡 Проверьте запасы и используйте продукты вовремя!</i>');

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: 'Открыть Холодильник 🌿',
          web_app: { url: appUrl }
        }
      ]
    ]
  };

  return {
    html: lines.join('\n'),
    replyMarkup
  };
}

export class RateLimiter {
  private minIntervalMs: number;
  public lastRequestTime: number;

  constructor(maxPerSecond = 25) {
    this.minIntervalMs = Math.ceil(1000 / maxPerSecond);
    this.lastRequestTime = 0;
  }

  async throttle(sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      const waitMs = this.minIntervalMs - elapsed;
      await sleepFn(waitMs);
    }
    this.lastRequestTime = Date.now();
  }
}

export async function sendTelegramMessage({
  botToken,
  chatId,
  html,
  replyMarkup,
  fetchFn = fetch,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxRetries = 3
}: {
  botToken: string;
  chatId: number;
  html: string;
  replyMarkup?: any;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  maxRetries?: number;
}): Promise<TelegramSendResult> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    reply_markup: replyMarkup
  };

  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      // Handle 429 Too Many Requests
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({})) as any;
        const retryAfterSec = errorData?.parameters?.retry_after || Math.pow(2, attempt);
        console.warn(`[Telegram API] 429 Rate Limit for chat ${chatId}. Retrying after ${retryAfterSec}s...`);
        await sleepFn((retryAfterSec * 1000) + 100);
        continue;
      }

      // Handle 403 Forbidden (Bot blocked or deactivated) or 400 (chat not found)
      if (response.status === 403 || response.status === 400) {
        const errorData = await response.json().catch(() => ({})) as any;
        const description = errorData?.description || '';
        if (
          response.status === 403 ||
          description.includes('bot was blocked by the user') ||
          description.includes('user is deactivated') ||
          description.includes('chat not found')
        ) {
          console.warn(`[Telegram API] User ${chatId} blocked the bot or chat unavailable: ${description || 'Forbidden'}`);
          return { success: false, blocked: true, userId: chatId, error: description || 'Forbidden' };
        }
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Telegram API HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json() as any;
      return { success: true, messageId: data?.result?.message_id, userId: chatId };
    } catch (err: any) {
      if (attempt > maxRetries) {
        console.error(`[Telegram API] Failed to send to chat ${chatId} after ${maxRetries} attempts:`, err.message);
        return { success: false, error: err.message, userId: chatId };
      }
      await sleepFn(500 * attempt);
    }
  }

  return { success: false, error: 'Max retries exceeded', userId: chatId };
}

export async function runDailyDigestNotifications(
  env: Env,
  options?: {
    referenceDate?: Date | string;
    fetchFn?: typeof fetch;
    sleepFn?: (ms: number) => Promise<void>;
    appUrl?: string;
  }
): Promise<NotificationStats> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn('⚠️ [Worker Cron] TELEGRAM_BOT_TOKEN is not configured. Skipping notifications.');
    return { total: 0, sent: 0, blocked: 0, failed: 0, skipped: 0 };
  }

  const db = getDb(env);
  const fetchFn = options?.fetchFn || fetch;
  const sleepFn = options?.sleepFn || ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  const appUrl = options?.appUrl || 'https://aleblll.github.io/smart-fridge/';

  const refDate = options?.referenceDate
    ? (options.referenceDate instanceof Date ? options.referenceDate : new Date(options.referenceDate))
    : new Date();
  const todayStr = refDate.toISOString().slice(0, 10);

  // Ensure user_notifications table exists
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        user_id INTEGER PRIMARY KEY,
        last_digest_date TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();
  } catch {}

  // D1 query: select active products expiring on or before now + notify_before_days
  // Joined with fridges and fridge_members to get recipient user_id and last_digest_date
  let query: string;
  let params: any[];

  if (options?.referenceDate) {
    query = `
      SELECT
        p.id,
        p.fridge_id,
        p.name,
        p.category,
        p.storage_type,
        p.quantity,
        p.unit,
        p.expires_at,
        p.notify_before_days,
        f.name AS fridge_name,
        m.user_id,
        un.last_digest_date
      FROM products p
      JOIN fridges f ON p.fridge_id = f.id
      JOIN fridge_members m ON f.id = m.fridge_id
      LEFT JOIN user_notifications un ON m.user_id = un.user_id
      WHERE p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.expires_at <= date(?, '+' || p.notify_before_days || ' days')
      ORDER BY m.user_id ASC, p.expires_at ASC, p.name ASC
    `;
    params = [todayStr];
  } else {
    query = `
      SELECT
        p.id,
        p.fridge_id,
        p.name,
        p.category,
        p.storage_type,
        p.quantity,
        p.unit,
        p.expires_at,
        p.notify_before_days,
        f.name AS fridge_name,
        m.user_id,
        un.last_digest_date
      FROM products p
      JOIN fridges f ON p.fridge_id = f.id
      JOIN fridge_members m ON f.id = m.fridge_id
      LEFT JOIN user_notifications un ON m.user_id = un.user_id
      WHERE p.status = 'active'
        AND p.deleted_at IS NULL
        AND p.expires_at <= date('now', '+' || p.notify_before_days || ' days')
      ORDER BY m.user_id ASC, p.expires_at ASC, p.name ASC
    `;
    params = [];
  }

  const stmt = params.length > 0 ? db.prepare(query).bind(...params) : db.prepare(query);
  const rowsRes = await stmt.all<ExpiringProductRow>();
  const rows = rowsRes.results || [];

  // Group by user_id with idempotency check
  const userDigestsMap = new Map<number, { items: ExpiringProductItem[]; fridgeNames: Set<string> }>();
  let skippedCount = 0;
  const skippedUsers = new Set<number>();

  for (const row of rows) {
    const userId = Number(row.user_id);
    if (!userId) continue;

    // Idempotency: check if user already received digest today
    if (row.last_digest_date === todayStr) {
      if (!skippedUsers.has(userId)) {
        skippedUsers.add(userId);
        skippedCount++;
      }
      continue;
    }

    const daysDiff = getDaysUntilExpiry(row.expires_at, refDate);
    const notifyBefore = typeof row.notify_before_days === 'number' ? row.notify_before_days : 2;

    // Filter to ensure it falls within notify window or already expired
    if (daysDiff <= notifyBefore) {
      if (!userDigestsMap.has(userId)) {
        userDigestsMap.set(userId, {
          items: [],
          fridgeNames: new Set()
        });
      }

      const userGroup = userDigestsMap.get(userId)!;
      userGroup.fridgeNames.add(row.fridge_name || 'Мой холодильник');
      userGroup.items.push({
        id: row.id,
        name: row.name || 'Без названия',
        quantity: row.quantity ?? 1,
        unit: row.unit || 'pcs',
        expires_at: row.expires_at,
        fridge_name: row.fridge_name,
        daysDiff
      });
    }
  }

  // Anti-spam: filter out users with 0 expiring items
  const userDigests: UserDigest[] = [];
  for (const [userId, group] of userDigestsMap.entries()) {
    if (group.items.length > 0) {
      userDigests.push({
        userId,
        items: group.items,
        fridgeNames: Array.from(group.fridgeNames)
      });
    }
  }

  if (userDigests.length === 0) {
    console.log('✨ [Worker Cron] No users require notification today.');
    return { total: 0, sent: 0, blocked: 0, failed: 0, skipped: skippedCount };
  }

  const rateLimiter = new RateLimiter(25);
  let sentCount = 0;
  let blockedCount = 0;
  let failedCount = 0;

  for (const digest of userDigests) {
    await rateLimiter.throttle(sleepFn);

    const { html, replyMarkup } = formatDigestHtml(digest, appUrl);
    const result = await sendTelegramMessage({
      botToken,
      chatId: digest.userId,
      html,
      replyMarkup,
      fetchFn,
      sleepFn
    });

    const nowIso = new Date().toISOString();

    if (result.success) {
      sentCount++;
      // Record idempotency to prevent duplicate sends on same day
      await db.prepare(`
        INSERT INTO user_notifications (user_id, last_digest_date, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET last_digest_date = excluded.last_digest_date, updated_at = excluded.updated_at
      `).bind(digest.userId, todayStr, nowIso).run();
    } else if (result.blocked) {
      blockedCount++;
      // Mark as processed today so we don't repeatedly hit Telegram for blocked users
      await db.prepare(`
        INSERT INTO user_notifications (user_id, last_digest_date, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET last_digest_date = excluded.last_digest_date, updated_at = excluded.updated_at
      `).bind(digest.userId, todayStr, nowIso).run();
    } else {
      failedCount++;
    }
  }

  console.log(`📊 [Worker Cron] Notification sequence completed: sent=${sentCount}, blocked=${blockedCount}, failed=${failedCount}, skipped=${skippedCount}`);

  return {
    total: userDigests.length,
    sent: sentCount,
    blocked: blockedCount,
    failed: failedCount,
    skipped: skippedCount
  };
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request);
    const clientIP = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    // Handle OPTIONS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Rate Limiting (60 requests/min per IP)
    if (!checkRateLimit(clientIP, 60, 60000)) {
      return jsonResponse({ error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' }, 429, corsHeaders);
    }

    const db = getDb(env);
    const botToken = env.TELEGRAM_BOT_TOKEN || '';

    // ==========================================
    // 1. Route: GET/POST /api/cron/notify (Closed by default)
    // ==========================================
    if (url.pathname === '/api/cron/notify') {
      const cronSecret = env.CRON_SECRET;
      const providedSecret = request.headers.get('X-Cron-Secret') ||
        (request.headers.get('Authorization')?.startsWith('Bearer ') ? request.headers.get('Authorization')?.slice(7) : null);

      if (!cronSecret || !providedSecret || !timingSafeCompare(providedSecret, cronSecret)) {
        return jsonResponse({ error: 'Unauthorized: invalid or missing cron secret', code: 'UNAUTHORIZED' }, 401, corsHeaders);
      }

      const fridgesRes = await db.prepare('SELECT id, name, created_at, updated_at FROM fridges').all<any>();
      const fridgesList = fridgesRes.results || [];
      const fridgesPayload: any[] = [];

      for (const fridge of fridgesList) {
        const membersRes = await db.prepare('SELECT user_id, role FROM fridge_members WHERE fridge_id = ?').bind(fridge.id).all<any>();
        const members = membersRes.results || [];
        const membersMap: Record<string, string> = {};
        let ownerId = 0;
        for (const m of members) {
          membersMap[m.user_id] = m.role;
          if (m.role === 'owner') ownerId = m.user_id;
        }

        const productsRes = await db.prepare(
          "SELECT id, fridge_id, name, category, storage_type, quantity, unit, opened_at, expires_at, notify_before_days, status, added_by, created_at, updated_at FROM products WHERE fridge_id = ? AND deleted_at IS NULL AND status = 'active'"
        ).bind(fridge.id).all<any>();
        const products = productsRes.results || [];

        const productsMap: Record<string, any> = {};
        for (const p of products) {
          productsMap[p.id] = p;
        }

        fridgesPayload.push({
          id: fridge.id,
          name: fridge.name,
          owner_id: ownerId,
          members: membersMap,
          products: products,
          productsMap: productsMap
        });
      }

      return jsonResponse({
        success: true,
        count: fridgesPayload.length,
        fridges: fridgesPayload,
        server_time: new Date().toISOString()
      }, 200, corsHeaders);
    }

    // ==========================================
    // 2. Route: POST /api/auth/validate
    // ==========================================
    if (request.method === 'POST' && url.pathname === '/api/auth/validate') {
      let initDataRaw = request.headers.get('X-Telegram-Init-Data') ||
        (request.headers.get('Authorization')?.startsWith('tma ') ? request.headers.get('Authorization')?.slice(4) : null);

      if (!initDataRaw) {
        try {
          const clonedReq = request.clone();
          const body = await clonedReq.json() as any;
          if (body?.initData) initDataRaw = body.initData;
        } catch {}
      }

      if (!initDataRaw) {
        return jsonResponse({ error: 'Missing initData', code: 'MISSING_INIT_DATA' }, 401, corsHeaders);
      }

      if (!botToken) {
        return jsonResponse({ error: 'Bot token not configured on server', code: 'SERVER_MISCONFIG' }, 500, corsHeaders);
      }

      const authResult = await verifyTelegramAuth(initDataRaw, botToken);
      if (authResult.error === 'AUTH_EXPIRED') {
        return jsonResponse({ error: 'Auth date expired', code: 'AUTH_EXPIRED' }, 401, corsHeaders);
      }
      if (!authResult.user) {
        return jsonResponse({ error: 'Invalid HMAC signature or malformed initData', code: 'INVALID_SIGNATURE' }, 401, corsHeaders);
      }

      return jsonResponse({
        valid: true,
        user: authResult.user,
        server_time: new Date().toISOString()
      }, 200, corsHeaders);
    }

    // ==========================================
    // Zero-Trust Auth Gate for all other /api/* routes
    // ==========================================
    if (!url.pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'Not Found', path: url.pathname }, 404, corsHeaders);
    }

    const initDataHeader = request.headers.get('X-Telegram-Init-Data') ||
      (request.headers.get('Authorization')?.startsWith('tma ') ? request.headers.get('Authorization')?.slice(4) : null);

    if (!initDataHeader) {
      return jsonResponse({ error: 'Unauthorized: missing Telegram initData header', code: 'MISSING_INIT_DATA' }, 401, corsHeaders);
    }

    if (!botToken) {
      return jsonResponse({ error: 'Bot token not configured on server', code: 'SERVER_MISCONFIG' }, 500, corsHeaders);
    }

    const authResult = await verifyTelegramAuth(initDataHeader, botToken);
    if (authResult.error === 'AUTH_EXPIRED') {
      return jsonResponse({ error: 'Unauthorized: auth date expired', code: 'AUTH_EXPIRED' }, 401, corsHeaders);
    }
    if (!authResult.user || typeof authResult.user.id !== 'number') {
      return jsonResponse({ error: 'Unauthorized: invalid HMAC signature', code: 'INVALID_SIGNATURE' }, 401, corsHeaders);
    }

    const authUserId = authResult.user.id;

    // ==========================================
    // 3. Route: GET /api/fridges/my
    // ==========================================
    if (request.method === 'GET' && url.pathname === '/api/fridges/my') {
      const myFridgesRes = await db.prepare(
        `SELECT f.id, f.name, f.created_at, f.updated_at, m.role
         FROM fridges f
         JOIN fridge_members m ON f.id = m.fridge_id
         WHERE m.user_id = ?
         ORDER BY f.created_at DESC`
      ).bind(authUserId).all<any>();

      let fridges = myFridgesRes.results || [];
      if (fridges.length === 0) {
        const newId = crypto.randomUUID();
        const now = new Date().toISOString();
        await db.prepare('INSERT INTO fridges (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(
          newId,
          'Мой холодильник',
          now,
          now
        ).run();
        await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind(
          newId,
          authUserId,
          'owner',
          now
        ).run();

        fridges = [{
          id: newId,
          name: 'Мой холодильник',
          role: 'owner',
          created_at: now,
          updated_at: now
        }];
      }

      return jsonResponse({ success: true, fridges }, 200, corsHeaders);
    }

    // ==========================================
    // 4. Invites Claim: POST /api/invites/:code/claim OR POST /api/invites/claim
    // ==========================================
    const claimMatch = url.pathname.match(/^\/api\/invites\/([a-zA-Z0-9_-]+)\/claim$/);
    const isLegacyClaim = request.method === 'POST' && url.pathname === '/api/invites/claim';

    if (request.method === 'POST' && (claimMatch || isLegacyClaim)) {
      let inviteCode = claimMatch ? claimMatch[1] : '';
      if (isLegacyClaim) {
        try {
          const body = await request.json() as any;
          inviteCode = body?.code || '';
        } catch {}
      }

      if (!inviteCode) {
        return jsonResponse({ error: 'Missing invite code', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
      }

      const invite = await db.prepare('SELECT * FROM invites WHERE code = ?').bind(inviteCode).first<any>();
      if (!invite) {
        return jsonResponse({ error: 'Invite code not found', code: 'INVITE_NOT_FOUND' }, 404, corsHeaders);
      }

      if (new Date(invite.expires_at).getTime() < Date.now()) {
        return jsonResponse({ error: 'Invite code expired', code: 'INVITE_EXPIRED' }, 400, corsHeaders);
      }

      if (invite.uses_count >= invite.max_uses) {
        return jsonResponse({ error: 'Invite limit reached', code: 'INVITE_LIMIT' }, 400, corsHeaders);
      }

      // Check if user is already a member
      const existingMember = await db.prepare(
        'SELECT role FROM fridge_members WHERE fridge_id = ? AND user_id = ?'
      ).bind(invite.fridge_id, authUserId).first<any>();

      if (!existingMember) {
        await db.prepare('UPDATE invites SET uses_count = uses_count + 1 WHERE code = ? AND uses_count < max_uses').bind(inviteCode).run();
        const now = new Date().toISOString();
        await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind(
          invite.fridge_id,
          authUserId,
          'member',
          now
        ).run();
      }

      return jsonResponse({ success: true, fridge_id: invite.fridge_id }, 200, corsHeaders);
    }

    // ==========================================
    // 5. Invites Create: POST /api/fridges/:id/invites OR POST /api/invites/create
    // ==========================================
    const inviteCreateMatch = url.pathname.match(/^\/api\/fridges\/([a-zA-Z0-9_-]+)\/invites$/);
    const isLegacyInviteCreate = request.method === 'POST' && url.pathname === '/api/invites/create';

    if (request.method === 'POST' && (inviteCreateMatch || isLegacyInviteCreate)) {
      let fridgeId = inviteCreateMatch ? inviteCreateMatch[1] : '';
      let maxUses = 10;
      if (isLegacyInviteCreate) {
        try {
          const body = await request.json() as any;
          fridgeId = body?.fridge_id || '';
          if (body?.max_uses) maxUses = Number(body.max_uses) || 10;
        } catch {}
      }

      if (!fridgeId) {
        return jsonResponse({ error: 'Missing fridge_id', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
      }

      // Verify membership
      const membership = await db.prepare(
        'SELECT role FROM fridge_members WHERE fridge_id = ? AND user_id = ?'
      ).bind(fridgeId, authUserId).first<any>();

      if (!membership) {
        return jsonResponse({ error: 'Access denied: not a member of this fridge', code: 'ACCESS_DENIED' }, 403, corsHeaders);
      }

      const code = crypto.randomUUID().replace(/-/g, '');
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

      await db.prepare(
        'INSERT INTO invites (code, fridge_id, created_by, max_uses, uses_count, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(code, fridgeId, authUserId, maxUses, 0, expiresAt, now).run();

      return jsonResponse({ success: true, code, invite_code: code, expires_at: expiresAt }, 201, corsHeaders);
    }

    // ==========================================
    // 6. Fridge & Products CRUD Routes
    // ==========================================
    const fridgeMatch = url.pathname.match(/^\/api\/fridges\/([a-zA-Z0-9_-]+)(?:\/products(?:\/([a-zA-Z0-9_-]+))?)?$/);

    if (fridgeMatch) {
      const fridgeId = fridgeMatch[1];
      const isProductRoute = url.pathname.includes('/products');
      const productId = fridgeMatch[2];

      // Resource-Level Auth: Check membership in fridge_members
      const membership = await db.prepare(
        'SELECT role FROM fridge_members WHERE fridge_id = ? AND user_id = ?'
      ).bind(fridgeId, authUserId).first<any>();

      if (!membership) {
        return jsonResponse({ error: 'Access denied: not a member of this fridge', code: 'ACCESS_DENIED' }, 403, corsHeaders);
      }

      // Route: GET /api/fridges/:id
      if (request.method === 'GET' && !isProductRoute) {
        const fridge = await db.prepare('SELECT id, name, created_at, updated_at FROM fridges WHERE id = ?').bind(fridgeId).first<any>();
        if (!fridge) {
          return jsonResponse({ error: 'Fridge not found', code: 'FRIDGE_NOT_FOUND' }, 404, corsHeaders);
        }

        const membersRes = await db.prepare('SELECT user_id, role FROM fridge_members WHERE fridge_id = ?').bind(fridgeId).all<any>();
        const members = membersRes.results || [];
        const ownerMember = members.find((m: any) => m.role === 'owner');
        const ownerId = ownerMember ? ownerMember.user_id : 0;
        const memberIds = members.map((m: any) => m.user_id);

        const productsRes = await db.prepare(
          'SELECT id, fridge_id, name, category, storage_type, quantity, unit, opened_at, expires_at, notify_before_days, status, added_by, created_at, updated_at FROM products WHERE fridge_id = ? AND deleted_at IS NULL ORDER BY expires_at ASC'
        ).bind(fridgeId).all<any>();
        const products = productsRes.results || [];

        return jsonResponse({
          id: fridge.id,
          name: fridge.name,
          owner_id: ownerId,
          members: memberIds,
          products,
          created_at: fridge.created_at,
          updated_at: fridge.updated_at
        }, 200, corsHeaders);
      }

      // Route: GET /api/fridges/:id/products
      if (request.method === 'GET' && isProductRoute && !productId) {
        const productsRes = await db.prepare(
          'SELECT id, fridge_id, name, category, storage_type, quantity, unit, opened_at, expires_at, notify_before_days, status, added_by, created_at, updated_at FROM products WHERE fridge_id = ? AND deleted_at IS NULL ORDER BY expires_at ASC'
        ).bind(fridgeId).all<any>();
        const products = productsRes.results || [];
        return jsonResponse({ success: true, products }, 200, corsHeaders);
      }

      // Route: POST /api/fridges/:id/products
      if (request.method === 'POST' && isProductRoute && !productId) {
        try {
          const body = await request.json() as any;
          const payload = body?.item || body;

          // 1. Validate name
          const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
          if (!name || name.length > 128) {
            return jsonResponse({ error: 'Invalid product name: must be 1-128 characters', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
          }

          // 2. Validate quantity
          const quantity = Number(payload?.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
            return jsonResponse({ error: 'Invalid quantity: must be finite number > 0 and <= 10000', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
          }

          // 3. Validate expires_at
          const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
          if (typeof payload?.expires_at !== 'string' || !dateRegex.test(payload.expires_at)) {
            return jsonResponse({ error: 'Invalid expires_at format: must be YYYY-MM-DD', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
          }
          const [year, month, day] = payload.expires_at.split('-').map(Number);
          const parsedDate = new Date(Date.UTC(year, month - 1, day));
          if (
            parsedDate.getUTCFullYear() !== year ||
            parsedDate.getUTCMonth() !== month - 1 ||
            parsedDate.getUTCDate() !== day
          ) {
            return jsonResponse({ error: 'Invalid calendar date for expires_at', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
          }
          const currentYear = new Date().getUTCFullYear();
          if (year > currentYear + 5) {
            return jsonResponse({ error: 'expires_at cannot be more than 5 years in the future', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
          }

          // 4. Active products limit check (max 300)
          const countRes = await db.prepare(
            'SELECT COUNT(*) as count FROM products WHERE fridge_id = ? AND deleted_at IS NULL'
          ).bind(fridgeId).first<any>();
          const count = countRes?.count || 0;
          if (count >= 300) {
            return jsonResponse({ error: 'Product limit reached: max 300 active products per fridge', code: 'PRODUCT_LIMIT_EXCEEDED' }, 400, corsHeaders);
          }

          const category = typeof payload.category === 'string' ? payload.category.slice(0, 64) : 'Другое';
          const storageType = ['fridge', 'freezer', 'pantry'].includes(payload.storage_type) ? payload.storage_type : 'fridge';
          const unit = ['pcs', 'kg', 'g', 'l', 'pack'].includes(payload.unit) ? payload.unit : 'pcs';
          const status = ['active', 'consumed', 'discarded'].includes(payload.status) ? payload.status : 'active';
          const notifyBeforeDays = typeof payload.notify_before_days === 'number' && payload.notify_before_days >= 0 && payload.notify_before_days <= 14
            ? payload.notify_before_days
            : 2;
          const openedAt = payload.opened_at ? String(payload.opened_at).slice(0, 30) : null;

          const prodId = typeof payload.id === 'string' && payload.id.trim()
            ? payload.id.trim()
            : `prod-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

          const now = new Date().toISOString();

          await db.prepare(`
            INSERT INTO products (
              id, fridge_id, name, category, storage_type, quantity, unit,
              opened_at, expires_at, notify_before_days, status, added_by,
              created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
          `).bind(
            prodId, fridgeId, name, category, storageType, quantity, unit,
            openedAt, payload.expires_at, notifyBeforeDays, status, authUserId,
            now, now
          ).run();

          const createdProduct: ProductItem = {
            id: prodId,
            fridge_id: fridgeId,
            name,
            category,
            storage_type: storageType,
            quantity,
            unit,
            opened_at: openedAt,
            expires_at: payload.expires_at,
            notify_before_days: notifyBeforeDays,
            status,
            added_by: authUserId,
            created_at: now,
            updated_at: now
          };

          return jsonResponse({ success: true, product: createdProduct }, 201, corsHeaders);
        } catch (e: any) {
          return jsonResponse({ error: e.message || 'Bad Request', code: 'BAD_REQUEST' }, 400, corsHeaders);
        }
      }

      // Route: PATCH /api/fridges/:id/products/:productId
      if (request.method === 'PATCH' && isProductRoute && productId) {
        try {
          const existingProduct = await db.prepare(
            'SELECT * FROM products WHERE id = ? AND fridge_id = ? AND deleted_at IS NULL'
          ).bind(productId, fridgeId).first<any>();

          if (!existingProduct) {
            return jsonResponse({ error: 'Product not found', code: 'PRODUCT_NOT_FOUND' }, 404, corsHeaders);
          }

          const body = await request.json() as any;
          const payload = body?.item || body;

          let name = existingProduct.name;
          if (payload.name !== undefined) {
            name = String(payload.name).trim();
            if (!name || name.length > 128) {
              return jsonResponse({ error: 'Invalid product name', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
            }
          }

          let quantity = existingProduct.quantity;
          if (payload.quantity !== undefined) {
            quantity = Number(payload.quantity);
            if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
              return jsonResponse({ error: 'Invalid quantity', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
            }
          }

          let expiresAt = existingProduct.expires_at;
          if (payload.expires_at !== undefined) {
            const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
            if (typeof payload.expires_at !== 'string' || !dateRegex.test(payload.expires_at)) {
              return jsonResponse({ error: 'Invalid expires_at format: must be YYYY-MM-DD', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
            }
            const [year, month, day] = payload.expires_at.split('-').map(Number);
            const parsedDate = new Date(Date.UTC(year, month - 1, day));
            if (
              parsedDate.getUTCFullYear() !== year ||
              parsedDate.getUTCMonth() !== month - 1 ||
              parsedDate.getUTCDate() !== day
            ) {
              return jsonResponse({ error: 'Invalid calendar date for expires_at', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
            }
            const currentYear = new Date().getUTCFullYear();
            if (year > currentYear + 5) {
              return jsonResponse({ error: 'expires_at cannot be more than 5 years in the future', code: 'INVALID_PAYLOAD' }, 400, corsHeaders);
            }
            expiresAt = payload.expires_at;
          }

          const category = payload.category !== undefined ? String(payload.category).slice(0, 64) : existingProduct.category;
          const storageType = payload.storage_type !== undefined && ['fridge', 'freezer', 'pantry'].includes(payload.storage_type)
            ? payload.storage_type
            : existingProduct.storage_type;
          const unit = payload.unit !== undefined && ['pcs', 'kg', 'g', 'l', 'pack'].includes(payload.unit)
            ? payload.unit
            : existingProduct.unit;
          const status = payload.status !== undefined && ['active', 'consumed', 'discarded'].includes(payload.status)
            ? payload.status
            : existingProduct.status;
          const notifyBeforeDays = payload.notify_before_days !== undefined && typeof payload.notify_before_days === 'number' && payload.notify_before_days >= 0 && payload.notify_before_days <= 14
            ? payload.notify_before_days
            : existingProduct.notify_before_days;
          const openedAt = payload.opened_at !== undefined ? (payload.opened_at ? String(payload.opened_at).slice(0, 30) : null) : existingProduct.opened_at;

          const now = new Date().toISOString();

          await db.prepare(`
            UPDATE products SET
              name = ?, category = ?, storage_type = ?, quantity = ?, unit = ?,
              opened_at = ?, expires_at = ?, notify_before_days = ?, status = ?,
              updated_at = ?
            WHERE id = ? AND fridge_id = ?
          `).bind(
            name, category, storageType, quantity, unit,
            openedAt, expiresAt, notifyBeforeDays, status,
            now, productId, fridgeId
          ).run();

          const updatedProduct: ProductItem = {
            ...existingProduct,
            name,
            category,
            storage_type: storageType,
            quantity,
            unit,
            opened_at: openedAt,
            expires_at: expiresAt,
            notify_before_days: notifyBeforeDays,
            status,
            updated_at: now
          };

          return jsonResponse({ success: true, product: updatedProduct }, 200, corsHeaders);
        } catch (e: any) {
          return jsonResponse({ error: e.message || 'Bad Request', code: 'BAD_REQUEST' }, 400, corsHeaders);
        }
      }

      // Route: DELETE /api/fridges/:id/products/:productId
      if (request.method === 'DELETE' && isProductRoute && productId) {
        const existingProduct = await db.prepare(
          'SELECT id FROM products WHERE id = ? AND fridge_id = ? AND deleted_at IS NULL'
        ).bind(productId, fridgeId).first<any>();

        if (!existingProduct) {
          return jsonResponse({ error: 'Product not found', code: 'PRODUCT_NOT_FOUND' }, 404, corsHeaders);
        }

        const now = new Date().toISOString();
        await db.prepare(
          'UPDATE products SET deleted_at = ?, updated_at = ? WHERE id = ? AND fridge_id = ?'
        ).bind(now, now, productId, fridgeId).run();

        return jsonResponse({ success: true, message: 'Product deleted', id: productId }, 200, corsHeaders);
      }
    }

    // Default 404
    return jsonResponse({ error: 'Not Found', path: url.pathname }, 404, corsHeaders);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx?: ExecutionContext): Promise<void> {
    console.log(`⏰ [Worker Cron] Scheduled event triggered: cron=${event?.cron}, scheduledTime=${event?.scheduledTime}`);
    const promise = runDailyDigestNotifications(env);
    if (ctx?.waitUntil) {
      ctx.waitUntil(promise);
    }
    await promise;
  }
};

