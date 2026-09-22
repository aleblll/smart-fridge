import { describe, it, expect, vi } from 'vitest';
import {
  escapeHtml,
  getDaysUntilExpiry,
  aggregateExpiringProducts,
  formatDigestHtml,
  RateLimiter,
  sendTelegramMessage,
  sendAllNotifications
} from '../../scripts/notify.mjs';

describe('Daily Morning Notifier (TASK-005)', () => {
  const fixedToday = new Date('2026-09-23T06:00:00Z');

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
  });

  describe('aggregateExpiringProducts', () => {
    const mockFridges = [
      {
        id: 'fridge-1',
        name: 'Дом',
        owner_id: 111,
        members: { 222: 'editor' },
        products: {
          'p1': {
            id: 'p1',
            name: 'Молоко',
            quantity: 1,
            unit: 'l',
            expires_at: '2026-09-23', // Today (diff 0)
            notify_before_days: 2,
            status: 'active'
          },
          'p2': {
            id: 'p2',
            name: 'Сыр',
            quantity: 200,
            unit: 'g',
            expires_at: '2026-09-24', // Tomorrow (diff 1)
            notify_before_days: 2,
            status: 'active'
          },
          'p3': {
            id: 'p3',
            name: 'Йогурт',
            quantity: 2,
            unit: 'pcs',
            expires_at: '2026-09-25', // Soon (diff 2)
            notify_before_days: 2,
            status: 'active'
          },
          'p4': {
            id: 'p4',
            name: 'Консервы',
            quantity: 1,
            unit: 'pcs',
            expires_at: '2026-10-30', // Far future
            notify_before_days: 2,
            status: 'active'
          },
          'p5': {
            id: 'p5',
            name: 'Съеденный хлеб',
            quantity: 1,
            unit: 'pcs',
            expires_at: '2026-09-23',
            notify_before_days: 2,
            status: 'consumed' // Inactive
          }
        }
      },
      {
        id: 'fridge-2',
        name: 'Дача',
        owner_id: 111, // Same user 111 owns two fridges
        members: {},
        products: {
          'p6': {
            id: 'p6',
            name: 'Колбаса',
            quantity: 300,
            unit: 'g',
            expires_at: '2026-09-22', // Expired yesterday (diff -1)
            notify_before_days: 3,
            status: 'active'
          }
        }
      }
    ];

    it('should aggregate products and create single unified digest per user without spamming', () => {
      const digests = aggregateExpiringProducts(mockFridges, { referenceDate: fixedToday });

      // There are 2 distinct users: 111 (owner) and 222 (member of fridge 1)
      expect(digests.length).toBe(2);

      const user111 = digests.find(d => d.userId === 111);
      expect(user111).toBeDefined();
      expect(user111?.fridgeNames).toContain('Дом');
      expect(user111?.fridgeNames).toContain('Дача');

      // Expired or Today: Молоко (diff 0) and Колбаса (diff -1)
      expect(user111?.expiredOrToday.length).toBe(2);
      expect(user111?.expiredOrToday.map(p => p.name)).toEqual(expect.arrayContaining(['Молоко', 'Колбаса']));

      // Tomorrow: Сыр (diff 1)
      expect(user111?.tomorrow.length).toBe(1);
      expect(user111?.tomorrow[0].name).toBe('Сыр');

      // Soon: Йогурт (diff 2)
      expect(user111?.soon.length).toBe(1);
      expect(user111?.soon[0].name).toBe('Йогурт');

      // Verify user 222 only gets fridge-1 items
      const user222 = digests.find(d => d.userId === 222);
      expect(user222).toBeDefined();
      expect(user222?.fridgeNames).toEqual(['Дом']);
      expect(user222?.expiredOrToday.length).toBe(1);
      expect(user222?.expiredOrToday[0].name).toBe('Молоко');
    });

    it('should return empty list when no fridges or no expiring products exist', () => {
      expect(aggregateExpiringProducts([], { referenceDate: fixedToday })).toEqual([]);

      const freshFridge = [
        {
          id: 'fresh-1',
          name: 'Свежий',
          owner_id: 333,
          products: {
            'item-1': {
              name: 'Макароны',
              expires_at: '2027-01-01',
              status: 'active',
              notify_before_days: 2
            }
          }
        }
      ];
      expect(aggregateExpiringProducts(freshFridge, { referenceDate: fixedToday })).toEqual([]);
    });
  });

  describe('formatDigestHtml', () => {
    it('should format clean HTML digest with emojis, sections, and WebApp inline button', () => {
      const sampleDigest = {
        userId: 111,
        fridgeNames: ['Дом'],
        expiredOrToday: [
          { id: '1', name: 'Молоко <3.2%>', quantity: 1, unit: 'l', daysDiff: 0 }
        ],
        tomorrow: [
          { id: '2', name: 'Сыр', quantity: 200, unit: 'g', daysDiff: 1 }
        ],
        soon: [
          { id: '3', name: 'Йогурт', quantity: 2, unit: 'pcs', expires_at: '2026-09-25', daysDiff: 2 }
        ]
      };

      const { html, replyMarkup } = formatDigestHtml(sampleDigest, 'https://t.me/SmartFridgeBot/app');

      expect(html).toContain('<b>❄️ Умный холодильник: утренний дайджест</b>');
      expect(html).toContain('🔴 <b>Истекает сегодня / просрочено:</b>');
      expect(html).toContain('• <b>Молоко &lt;3.2%&gt;</b> — 1 l (сегодня)');
      expect(html).toContain('🟡 <b>Истекает завтра:</b>');
      expect(html).toContain('• <b>Сыр</b> — 200 g');
      expect(html).toContain('🟠 <b>Истекает в ближайшие дни:</b>');
      expect(html).toContain('• Йогурт (2 pcs) — до 2026-09-25');

      expect(replyMarkup.inline_keyboard[0][0].text).toBe('📱 Открыть холодильник');
      expect(replyMarkup.inline_keyboard[0][0].web_app.url).toBe('https://t.me/SmartFridgeBot/app');
    });
  });

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

  describe('sendAllNotifications Orchestrator', () => {
    it('should coordinate end-to-end digest sending workflow', async () => {
      const sampleFridges = [
        {
          id: 'fridge-1',
          name: 'Дом',
          owner_id: 101,
          products: {
            'item-1': {
              name: 'Сыр',
              quantity: 1,
              unit: 'pcs',
              expires_at: '2026-09-23',
              notify_before_days: 2,
              status: 'active'
            }
          }
        },
        {
          id: 'fridge-2',
          name: 'Офис',
          owner_id: 102,
          products: {
            'item-2': {
              name: 'Молоко',
              quantity: 1,
              unit: 'l',
              expires_at: '2026-09-23',
              notify_before_days: 2,
              status: 'active'
            }
          }
        }
      ];

      const mockFetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        if (body.chat_id === 102) {
          return {
            ok: false,
            status: 403,
            json: async () => ({ description: 'Forbidden: bot was blocked by the user' })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: { message_id: 999 } })
        };
      });

      const sleepSpy = vi.fn().mockResolvedValue(undefined);

      const stats = await sendAllNotifications({
        botToken: 'test_token',
        fridgesData: sampleFridges,
        referenceDate: fixedToday,
        fetchFn: mockFetch as any,
        sleepFn: sleepSpy
      });

      expect(stats.total).toBe(2);
      expect(stats.sent).toBe(1);
      expect(stats.blocked).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });
});
