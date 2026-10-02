import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, {
  escapeHtml,
  getDaysUntilExpiry,
  formatMoreProducts,
  formatDigestHtml,
  RateLimiter,
  sendTelegramMessage,
  runDailyDigestNotifications,
  getInMemoryD1,
  resetInMemoryD1,
  Env
} from '../../worker/src/index';

describe('Worker Morning Notifier & Cron Trigger (TASK-005 & Phase 4)', () => {
  const fixedToday = new Date('2026-09-23T06:00:00Z');
  const TEST_BOT_TOKEN = '1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ';

  beforeEach(() => {
    resetInMemoryD1();
  });

  // ==========================================
  // 1. Pure Helper Functions
  // ==========================================
  describe('getDaysUntilExpiry & escapeHtml', () => {
    it('should correctly calculate date differences in days', () => {
      expect(getDaysUntilExpiry('2026-09-23', fixedToday)).toBe(0);
      expect(getDaysUntilExpiry('2026-09-24', fixedToday)).toBe(1);
      expect(getDaysUntilExpiry('2026-09-25', fixedToday)).toBe(2);
      expect(getDaysUntilExpiry('2026-09-22', fixedToday)).toBe(-1);
    });

    it('should escape HTML characters for safety in Telegram Bot messages', () => {
      expect(escapeHtml('Молоко <3.2%> & "Простоквашино"')).toBe('Молоко &lt;3.2%&gt; &amp; &quot;Простоквашино&quot;');
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
    });

    it('should correctly pluralize remaining products count in Russian', () => {
      expect(formatMoreProducts(1)).toBe('и еще 1 продукт');
      expect(formatMoreProducts(2)).toBe('и еще 2 продукта');
      expect(formatMoreProducts(4)).toBe('и еще 4 продукта');
      expect(formatMoreProducts(5)).toBe('и еще 5 продуктов');
      expect(formatMoreProducts(11)).toBe('и еще 11 продуктов');
      expect(formatMoreProducts(21)).toBe('и еще 21 продукт');
    });
  });

  // ==========================================
  // 2. formatDigestHtml & Anti-spam formatting
  // ==========================================
  describe('formatDigestHtml', () => {
    it('should format clean HTML digest with emojis, sections, and WebApp inline button', () => {
      const sampleDigest = {
        userId: 111,
        fridgeNames: ['Дом'],
        items: [
          { id: '1', name: 'Молоко <3.2%>', quantity: 1, unit: 'l', expires_at: '2026-09-23', fridge_name: 'Дом', daysDiff: 0 },
          { id: '2', name: 'Сыр', quantity: 200, unit: 'g', expires_at: '2026-09-24', fridge_name: 'Дом', daysDiff: 1 },
          { id: '3', name: 'Йогурт', quantity: 2, unit: 'pcs', expires_at: '2026-09-25', fridge_name: 'Дом', daysDiff: 2 }
        ]
      };

      const { html, replyMarkup } = formatDigestHtml(sampleDigest);

      expect(html).toContain('<b>❄️ Умный холодильник: утренний дайджест</b>');
      expect(html).toContain('🔴 <b>Истекает сегодня / просрочено:</b>');
      expect(html).toContain('• <b>Молоко &lt;3.2%&gt;</b> — 1 l (сегодня)');
      expect(html).toContain('🟡 <b>Истекает завтра:</b>');
      expect(html).toContain('• <b>Сыр</b> — 200 g');
      expect(html).toContain('🟠 <b>Истекает в ближайшие дни:</b>');
      expect(html).toContain('• Йогурт (2 pcs) — до 2026-09-25');

      expect(replyMarkup.inline_keyboard[0][0].text).toBe('Открыть Холодильник 🌿');
      expect(replyMarkup.inline_keyboard[0][0].web_app.url).toBe('https://aleblll.github.io/smart-fridge/');
    });

    it('should limit list to 10 positions and append "и еще X продуктов" when > 10 items', () => {
      const items = Array.from({ length: 14 }, (_, i) => ({
        id: `p-${i}`,
        name: `Продукт ${i + 1}`,
        quantity: 1,
        unit: 'pcs',
        expires_at: '2026-09-23',
        fridge_name: 'Дом',
        daysDiff: 0
      }));

      const digest = {
        userId: 111,
        fridgeNames: ['Дом'],
        items
      };

      const { html } = formatDigestHtml(digest);

      // Should contain first 10 items
      expect(html).toContain('Продукт 10');
      // Should NOT contain 11th item
      expect(html).not.toContain('Продукт 11');
      // Should contain remaining count banner
      expect(html).toContain('...и еще 4 продукта');
    });
  });

  // ==========================================
  // 3. RateLimiter & Telegram Sender
  // ==========================================
  describe('RateLimiter & Telegram Sender', () => {
    it('should throttle requests to maintain <= 25 req/sec limit', async () => {
      const limiter = new RateLimiter(25);
      const sleepSpy = vi.fn().mockResolvedValue(undefined);

      limiter.lastRequestTime = Date.now();
      await limiter.throttle(sleepSpy);

      expect(sleepSpy).toHaveBeenCalled();
      const waitTime = sleepSpy.mock.calls[0][0];
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(40);
    });

    it('should send Telegram message and return success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 12345 } })
      });

      const res = await sendTelegramMessage({
        botToken: 'dummy_token',
        chatId: 998877,
        html: '<b>Test</b>',
        fetchFn: mockFetch as any
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toBe(12345);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telegram.org/botdummy_token/sendMessage',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle HTTP 429 Too Many Requests with retry_after backoff', async () => {
      let callCount = 0;
      const sleepSpy = vi.fn().mockResolvedValue(undefined);

      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            json: async () => ({ parameters: { retry_after: 1 } })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: { message_id: 777 } })
        };
      });

      const res = await sendTelegramMessage({
        botToken: 'dummy_token',
        chatId: 998877,
        html: '<b>Test</b>',
        fetchFn: mockFetch as any,
        sleepFn: sleepSpy
      });

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledWith(1100); // (1s * 1000) + 100ms
    });

    it('should handle 403 bot blocked gracefully without crashing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ description: 'Forbidden: bot was blocked by the user' })
      });

      const res = await sendTelegramMessage({
        botToken: 'dummy_token',
        chatId: 998877,
        html: '<b>Test</b>',
        fetchFn: mockFetch as any
      });

      expect(res.success).toBe(false);
      expect(res.blocked).toBe(true);
    });
  });

  // ==========================================
  // 4. Worker Cron Scheduled & D1 Database Integration
  // ==========================================
  describe('runDailyDigestNotifications & worker.scheduled', () => {
    it('should read expiring products directly from D1 and send digests to fridge members', async () => {
      const db = getInMemoryD1();
      const now = fixedToday.toISOString();

      // Setup 3 fridges
      await db.prepare('INSERT INTO fridges (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind('f1', 'Дом', now, now).run();
      await db.prepare('INSERT INTO fridges (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind('f2', 'Дача', now, now).run();
      await db.prepare('INSERT INTO fridges (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind('f3', 'Офис', now, now).run();

      // User 101 is in fridge 1 & fridge 2
      // User 102 is in fridge 1
      // User 103 is in fridge 3 (which only has far-future products)
      await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind('f1', 101, 'owner', now).run();
      await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind('f1', 102, 'member', now).run();
      await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind('f2', 101, 'owner', now).run();
      await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind('f3', 103, 'member', now).run();

      // Product 1: Expiring today in fridge 1 (affects 101, 102)
      await db.prepare(`
        INSERT INTO products (id, fridge_id, name, category, storage_type, quantity, unit, expires_at, notify_before_days, status, added_by, created_at, updated_at, deleted_at)
        VALUES ('p1', 'f1', 'Сыр', 'Молочные', 'fridge', 1, 'pcs', '2026-09-23', 2, 'active', 101, ?, ?, NULL)
      `).bind(now, now).run();

      // Product 2: Expiring tomorrow in fridge 2 (affects 101)
      await db.prepare(`
        INSERT INTO products (id, fridge_id, name, category, storage_type, quantity, unit, expires_at, notify_before_days, status, added_by, created_at, updated_at, deleted_at)
        VALUES ('p2', 'f2', 'Молоко', 'Молочные', 'fridge', 1, 'l', '2026-09-24', 2, 'active', 101, ?, ?, NULL)
      `).bind(now, now).run();

      // Product 3: Consumed product (should NOT trigger notification)
      await db.prepare(`
        INSERT INTO products (id, fridge_id, name, category, storage_type, quantity, unit, expires_at, notify_before_days, status, added_by, created_at, updated_at, deleted_at)
        VALUES ('p3', 'f1', 'Съеденный хлеб', 'Выпечка', 'pantry', 1, 'pcs', '2026-09-23', 2, 'consumed', 101, ?, ?, NULL)
      `).bind(now, now).run();

      // Product 4: Soft-deleted product (should NOT trigger notification)
      await db.prepare(`
        INSERT INTO products (id, fridge_id, name, category, storage_type, quantity, unit, expires_at, notify_before_days, status, added_by, created_at, updated_at, deleted_at)
        VALUES ('p4', 'f1', 'Удаленный суп', 'Готовое', 'fridge', 1, 'pcs', '2026-09-23', 2, 'active', 101, ?, ?, '2026-09-22')
      `).bind(now, now).run();

      // Product 5: Far future product in f3 (expires in 2027, should NOT trigger notification)
      await db.prepare(`
        INSERT INTO products (id, fridge_id, name, category, storage_type, quantity, unit, expires_at, notify_before_days, status, added_by, created_at, updated_at, deleted_at)
        VALUES ('p5', 'f3', 'Консервы', 'Бакалея', 'pantry', 1, 'pack', '2027-01-01', 2, 'active', 103, ?, ?, NULL)
      `).bind(now, now).run();

      const sentMessages: { chatId: number; text: string }[] = [];
      const mockFetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        sentMessages.push({ chatId: body.chat_id, text: body.text });
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: { message_id: 1000 + body.chat_id } })
        };
      });

      const env: Env = {
        TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
        DB: db
      };

      const stats = await runDailyDigestNotifications(env, {
        referenceDate: fixedToday,
        fetchFn: mockFetch as any
      });

      // Exactly 2 users should be notified: 101 (has items from f1 & f2) and 102 (has item from f1)
      // User 103 has no expiring items and must NOT receive an empty digest (anti-spam)
      expect(stats.total).toBe(2);
      expect(stats.sent).toBe(2);
      expect(stats.blocked).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);

      expect(sentMessages.length).toBe(2);
      const msg101 = sentMessages.find(m => m.chatId === 101);
      const msg102 = sentMessages.find(m => m.chatId === 102);
      expect(msg101).toBeDefined();
      expect(msg102).toBeDefined();

      // User 101 receives both Сыр and Молоко
      expect(msg101?.text).toContain('Сыр');
      expect(msg101?.text).toContain('Молоко');

      // User 102 receives only Сыр (since they are only in f1)
      expect(msg102?.text).toContain('Сыр');
      expect(msg102?.text).not.toContain('Молоко');
    });

    it('should be idempotent: subsequent runs on the same calendar day skip already notified users', async () => {
      const db = getInMemoryD1();
      const now = fixedToday.toISOString();

      await db.prepare('INSERT INTO fridges (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind('f1', 'Дом', now, now).run();
      await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind('f1', 201, 'owner', now).run();
      await db.prepare(`
        INSERT INTO products (id, fridge_id, name, category, storage_type, quantity, unit, expires_at, notify_before_days, status, added_by, created_at, updated_at, deleted_at)
        VALUES ('p1', 'f1', 'Йогурт', 'Молочные', 'fridge', 1, 'pcs', '2026-09-23', 2, 'active', 201, ?, ?, NULL)
      `).bind(now, now).run();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 111 } })
      });

      const env: Env = {
        TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
        DB: db
      };

      // Run 1: Should send notification
      const stats1 = await runDailyDigestNotifications(env, {
        referenceDate: fixedToday,
        fetchFn: mockFetch as any
      });
      expect(stats1.sent).toBe(1);
      expect(stats1.skipped).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify user_notifications record was written
      const notifRow = await db.prepare('SELECT * FROM user_notifications WHERE user_id = ?').bind(201).first<any>();
      expect(notifRow).not.toBeNull();
      expect(notifRow?.last_digest_date).toBe('2026-09-23');

      // Run 2 on same day: Should be skipped via idempotency
      const stats2 = await runDailyDigestNotifications(env, {
        referenceDate: fixedToday,
        fetchFn: mockFetch as any
      });
      expect(stats2.sent).toBe(0);
      expect(stats2.skipped).toBe(1);
      // Fetch should NOT have been called again!
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle 403 Forbidden without crashing and record last_digest_date', async () => {
      const db = getInMemoryD1();
      const now = fixedToday.toISOString();

      await db.prepare('INSERT INTO fridges (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind('f1', 'Дом', now, now).run();
      await db.prepare('INSERT INTO fridge_members (fridge_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind('f1', 301, 'owner', now).run();
      await db.prepare(`
        INSERT INTO products (id, fridge_id, name, category, storage_type, quantity, unit, expires_at, notify_before_days, status, added_by, created_at, updated_at, deleted_at)
        VALUES ('p1', 'f1', 'Хлеб', 'Выпечка', 'pantry', 1, 'pcs', '2026-09-23', 2, 'active', 301, ?, ?, NULL)
      `).bind(now, now).run();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ description: 'Forbidden: bot was blocked by the user' })
      });

      const env: Env = {
        TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
        DB: db
      };

      const stats = await runDailyDigestNotifications(env, {
        referenceDate: fixedToday,
        fetchFn: mockFetch as any
      });

      expect(stats.total).toBe(1);
      expect(stats.sent).toBe(0);
      expect(stats.blocked).toBe(1);
      expect(stats.failed).toBe(0);

      // Blocked user should still be marked as processed for today to avoid repeated attempts
      const notifRow = await db.prepare('SELECT * FROM user_notifications WHERE user_id = ?').bind(301).first<any>();
      expect(notifRow?.last_digest_date).toBe('2026-09-23');
    });

    it('should execute successfully when invoked via worker.scheduled handler', async () => {
      const db = getInMemoryD1();
      const env: Env = {
        TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
        DB: db
      };

      const scheduledEvent = {
        cron: '0 6 * * *',
        scheduledTime: fixedToday.getTime(),
        type: 'cron'
      };

      const waitUntilSpy = vi.fn();
      const ctx = {
        waitUntil: waitUntilSpy,
        passThroughOnException: vi.fn()
      };

      // Invoke scheduled directly
      await expect(worker.scheduled(scheduledEvent, env, ctx)).resolves.not.toThrow();
      expect(waitUntilSpy).toHaveBeenCalled();
    });
  });
});
