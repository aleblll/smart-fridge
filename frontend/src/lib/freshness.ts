/**
 * Calculates freshness ratio and spent percentage according to DS-001 Tokens specification
 * Eliminates timezone discrepancy by calculating calendar days in UTC.
 *
 * @param expiresAt Strict calendar date string YYYY-MM-DD
 * @param createdAt Optional creation date ISO string or YYYY-MM-DD
 * @param notifyBeforeDays Threshold in days for 'expiring' notification (default: 3)
 */
export function calculateFreshnessMetrics(
  expiresAt: string,
  createdAt?: string,
  notifyBeforeDays: number = 3
): {
  daysLeft: number;
  spentPercent: number;
  statusTag: 'fresh' | 'expiring' | 'expired';
  statusLabel: string;
} {
  const [y, m, d] = expiresAt.split('-').map(Number);
  const expUtc = Date.UTC(y, m - 1, d);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((expUtc - todayUtc) / 86400000);

  // Calculate start date in calendar days
  let startUtc: number;
  if (createdAt) {
    const parts = createdAt.slice(0, 10).split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      startUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    } else {
      startUtc = todayUtc - 3 * 86400000;
    }
  } else {
    startUtc = todayUtc - 3 * 86400000;
  }

  const totalDays = Math.max(1, Math.round((expUtc - startUtc) / 86400000));
  const remainingDays = Math.max(0, daysLeft);
  const ratio = Math.max(0, Math.min(1, remainingDays / totalDays));
  const spentPercent = daysLeft < 0 ? 100 : Math.round((1 - ratio) * 100);

  if (daysLeft < 0) {
    return {
      daysLeft,
      spentPercent: 100,
      statusTag: 'expired',
      statusLabel: 'Просрочено',
    };
  }

  if (daysLeft === 0) {
    return {
      daysLeft,
      spentPercent: 100,
      statusTag: 'expiring',
      statusLabel: 'Истекает сегодня',
    };
  }

  if (daysLeft <= notifyBeforeDays) {
    return {
      daysLeft,
      spentPercent: Math.max(75, spentPercent),
      statusTag: 'expiring',
      statusLabel: `Истекает: ${daysLeft} дн`,
    };
  }

  return {
    daysLeft,
    spentPercent,
    statusTag: 'fresh',
    statusLabel: `Осталось: ${daysLeft} дн`,
  };
}
