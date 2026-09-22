#!/usr/bin/env node

/**
 * Smart Fridge Telegram Mini App - Daily Morning Notifier
 * Runs daily via GitHub Actions Scheduled Cron (06:00 UTC = 09:00 MSK).
 * Implements TASK-005, ADR-003 and rate limiting up to 25 msgs/sec with 429 retry handling.
 */

// Simple HTML escaping helper for user-provided data
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Calculates date difference in whole days between expiry date (YYYY-MM-DD) and reference date.
 */
export function getDaysUntilExpiry(expiresAtStr, referenceDate = new Date()) {
  const [year, month, day] = expiresAtStr.split('-').map(Number);
  const expiryDate = new Date(Date.UTC(year, month - 1, day));
  
  // Format reference date to UTC midnight
  const refUTC = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  ));

  const diffMs = expiryDate.getTime() - refUTC.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Aggregates expiring products across all fridges grouped by Telegram user ID.
 * Produces a single unified digest per user.
 */
export function aggregateExpiringProducts(fridges = [], options = {}) {
  const referenceDate = options.referenceDate || new Date();
  const userDigests = new Map();

  for (const fridge of fridges) {
    if (!fridge || !fridge.products) continue;

    // Collect recipient user IDs for this fridge (owner + members)
    const recipientIds = new Set();
    if (fridge.owner_id) {
      recipientIds.add(Number(fridge.owner_id));
    }
    if (fridge.members && typeof fridge.members === 'object') {
      for (const memberId of Object.keys(fridge.members)) {
        const numId = Number(memberId);
        if (!isNaN(numId) && numId > 0) {
          recipientIds.add(numId);
        }
      }
    }

    if (recipientIds.size === 0) continue;

    const fridgeName = fridge.name || 'Мой холодильник';
    const expiredOrToday = [];
    const tomorrow = [];
    const soon = [];

    const products = Array.isArray(fridge.products)
      ? fridge.products
      : Object.values(fridge.products);

    for (const product of products) {
      if (!product || product.status !== 'active' || !product.expires_at) {
        continue;
      }

      const notifyDays = typeof product.notify_before_days === 'number'
        ? product.notify_before_days
        : 2;

      const daysDiff = getDaysUntilExpiry(product.expires_at, referenceDate);

      // Only notify if expiring within notify_before_days window or already expired/today
      if (daysDiff <= notifyDays) {
        const itemInfo = {
          id: product.id,
          name: product.name || 'Без названия',
          quantity: product.quantity ?? 1,
          unit: product.unit || 'pcs',
          expires_at: product.expires_at,
          daysDiff,
          fridgeName
        };

        if (daysDiff <= 0) {
          expiredOrToday.push(itemInfo);
        } else if (daysDiff === 1) {
          tomorrow.push(itemInfo);
        } else {
          soon.push(itemInfo);
        }
      }
    }

    // If this fridge has expiring products, add them to each recipient
    if (expiredOrToday.length > 0 || tomorrow.length > 0 || soon.length > 0) {
      for (const userId of recipientIds) {
        if (!userDigests.has(userId)) {
          userDigests.set(userId, {
            userId,
            expiredOrToday: [],
            tomorrow: [],
            soon: [],
            fridgeNames: new Set()
          });
        }
        const digest = userDigests.get(userId);
        digest.fridgeNames.add(fridgeName);
        digest.expiredOrToday.push(...expiredOrToday);
        digest.tomorrow.push(...tomorrow);
        digest.soon.push(...soon);
      }
    }
  }

  // Convert Set of fridge names to array
  return Array.from(userDigests.values()).map(d => ({
    ...d,
    fridgeNames: Array.from(d.fridgeNames)
  }));
}

/**
 * Formats a user digest into a compact, clean HTML message with Telegram Mini App button.
 */
export function formatDigestHtml(userDigest, appUrl = 'https://t.me/SmartFridgeBot/app') {
  const lines = ['<b>❄️ Умный холодильник: утренний дайджест</b>', ''];

  if (userDigest.expiredOrToday.length > 0) {
    lines.push('🔴 <b>Истекает сегодня / просрочено:</b>');
    for (const item of userDigest.expiredOrToday) {
      const isExpired = item.daysDiff < 0;
      const statusSuffix = isExpired ? ` (просрочено на ${Math.abs(item.daysDiff)} дн.)` : ' (сегодня)';
      lines.push(`• <b>${escapeHtml(item.name)}</b> — ${item.quantity} ${escapeHtml(item.unit)}${statusSuffix}`);
    }
    lines.push('');
  }

  if (userDigest.tomorrow.length > 0) {
    lines.push('🟡 <b>Истекает завтра:</b>');
    for (const item of userDigest.tomorrow) {
      lines.push(`• <b>${escapeHtml(item.name)}</b> — ${item.quantity} ${escapeHtml(item.unit)}`);
    }
    lines.push('');
  }

  if (userDigest.soon.length > 0) {
    lines.push('🟠 <b>Истекает в ближайшие дни:</b>');
    for (const item of userDigest.soon) {
      lines.push(`• ${escapeHtml(item.name)} (${item.quantity} ${escapeHtml(item.unit)}) — до ${item.expires_at}`);
    }
    lines.push('');
  }

  lines.push('<i>💡 Проверьте запасы и используйте продукты вовремя!</i>');

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '📱 Открыть холодильник',
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

/**
 * Rate Limiter helper ensuring <= 25 msgs/sec globally and >= 40ms interval.
 */
export class RateLimiter {
  constructor(maxPerSecond = 25) {
    this.minIntervalMs = Math.ceil(1000 / maxPerSecond);
    this.lastRequestTime = 0;
  }

  async throttle(sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      const waitMs = this.minIntervalMs - elapsed;
      await sleepFn(waitMs);
    }
    this.lastRequestTime = Date.now();
  }
}

/**
 * Sends a single HTML message via Telegram Bot API with retry on HTTP 429 and error handling.
 */
export async function sendTelegramMessage({
  botToken,
  chatId,
  html,
  replyMarkup,
  fetchFn = fetch,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxRetries = 3
}) {
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
        const errorData = await response.json().catch(() => ({}));
        const retryAfterSec = errorData?.parameters?.retry_after || Math.pow(2, attempt);
        console.warn(`[Telegram API] 429 Rate Limit for chat ${chatId}. Retrying after ${retryAfterSec}s...`);
        await sleepFn((retryAfterSec * 1000) + 100);
        continue;
      }

      // Handle 403 Forbidden (Bot blocked or deactivated)
      if (response.status === 403 || response.status === 400) {
        const errorData = await response.json().catch(() => ({}));
        const description = errorData?.description || '';
        if (
          description.includes('bot was blocked by the user') ||
          description.includes('user is deactivated') ||
          description.includes('chat not found')
        ) {
          console.warn(`[Telegram API] User ${chatId} blocked the bot or chat unavailable: ${description}`);
          return { success: false, blocked: true, userId: chatId, error: description };
        }
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Telegram API HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return { success: true, messageId: data?.result?.message_id, userId: chatId };
    } catch (err) {
      if (attempt > maxRetries) {
        console.error(`[Telegram API] Failed to send to chat ${chatId} after ${maxRetries} attempts:`, err.message);
        return { success: false, error: err.message, userId: chatId };
      }
      await sleepFn(500 * attempt);
    }
  }

  return { success: false, error: 'Max retries exceeded', userId: chatId };
}

/**
 * Main orchestration function for the daily notifier.
 */
export async function sendAllNotifications({
  workerUrl,
  cronSecret,
  botToken,
  appUrl = 'https://t.me/SmartFridgeBot/app',
  referenceDate = new Date(),
  fetchFn = fetch,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  fridgesData = null
} = {}) {
  console.log('🚀 [Morning Notifier] Starting notification sequence at', new Date().toISOString());

  let fridges = fridgesData;

  // If fridgesData was not injected directly, fetch from Cloudflare Worker Edge Gateway
  if (!fridges) {
    if (!workerUrl) {
      throw new Error('Missing CLOUDFLARE_WORKER_URL environment variable');
    }

    const endpoint = `${workerUrl.replace(/\/$/, '')}/api/cron/notify`;
    console.log(`📡 [Morning Notifier] Fetching active fridges from ${endpoint}...`);

    const headers = { 'Content-Type': 'application/json' };
    if (cronSecret) {
      headers['X-Cron-Secret'] = cronSecret;
      headers['Authorization'] = `Bearer ${cronSecret}`;
    }

    const res = await fetchFn(endpoint, { method: 'GET', headers });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to fetch fridges from Cloudflare Worker (HTTP ${res.status}): ${err}`);
    }

    const payload = await res.json();
    fridges = payload.fridges || [];
  }

  console.log(`📦 [Morning Notifier] Retrieved ${fridges.length} fridge(s) to scan.`);

  // Aggregate expiring items per user
  const userDigests = aggregateExpiringProducts(fridges, { referenceDate });
  console.log(`👥 [Morning Notifier] Generated digests for ${userDigests.length} user(s) with expiring items.`);

  if (userDigests.length === 0) {
    console.log('✨ [Morning Notifier] No expiring products found today. Sequence finished.');
    return { total: 0, sent: 0, blocked: 0, failed: 0 };
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

    if (result.success) {
      sentCount++;
    } else if (result.blocked) {
      blockedCount++;
    } else {
      failedCount++;
    }
  }

  console.log('📊 [Morning Notifier] Sequence Summary:');
  console.log(`   - Total Users: ${userDigests.length}`);
  console.log(`   - Sent Successfully: ${sentCount}`);
  console.log(`   - Blocked Users: ${blockedCount}`);
  console.log(`   - Failed: ${failedCount}`);

  return {
    total: userDigests.length,
    sent: sentCount,
    blocked: blockedCount,
    failed: failedCount
  };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('notify.mjs') || process.argv[1]?.endsWith('notify.js')) {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  const cronSecret = process.env.CRON_SECRET;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.TELEGRAM_APP_URL || 'https://t.me/SmartFridgeBot/app';

  if (!botToken) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is required');
    process.exit(1);
  }

  sendAllNotifications({
    workerUrl,
    cronSecret,
    botToken,
    appUrl
  })
    .then((stats) => {
      console.log('✅ Daily notification run completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Fatal error in daily notifier:', err);
      process.exit(1);
    });
}
