/**
 * Calculates freshness ratio and spent percentage according to DS-001 Tokens specification
 */
export function calculateFreshnessMetrics(
  expiresAt: string,
  createdAt?: string
): {
  daysLeft: number;
  spentPercent: number;
  statusTag: 'fresh' | 'expiring' | 'expired';
  statusLabel: string;
} {
  const now = new Date();
  const start = createdAt ? new Date(createdAt) : new Date(Date.now() - 3 * 86400000);
  const exp = new Date(expiresAt);

  const totalTime = exp.getTime() - start.getTime();
  const remainingTime = exp.getTime() - now.getTime();
  const daysLeft = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));

  let ratio = totalTime > 0 ? remainingTime / totalTime : 0;
  ratio = Math.max(0, Math.min(1, ratio));

  const spentPercent = Math.round((1 - ratio) * 100);

  if (daysLeft <= 0) {
    return { daysLeft, spentPercent: 100, statusTag: 'expired', statusLabel: 'Просрочено / Сегодня' };
  } else if (daysLeft <= 3 || spentPercent >= 75) {
    return { daysLeft, spentPercent: Math.max(75, spentPercent), statusTag: 'expiring', statusLabel: `Истекает: ${daysLeft} дн` };
  } else {
    return { daysLeft, spentPercent, statusTag: 'fresh', statusLabel: `Осталось: ${daysLeft} дн` };
  }
}
