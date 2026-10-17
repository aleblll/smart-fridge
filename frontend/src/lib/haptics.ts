export function triggerHapticSelection(): void {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
  } catch (e) {
    void e;
  }
}

export function triggerHapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(style);
  } catch (e) {
    void e;
  }
}

export function triggerHapticNotification(type: 'success' | 'warning' | 'error'): void {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(type);
  } catch (e) {
    void e;
  }
}

export const haptic = {
  selection: triggerHapticSelection,
  impact: triggerHapticImpact,
  notification: triggerHapticNotification,
};

// Исправление вывода системных единиц на русский язык ("1 kg" -> "1 кг")
const RU_UNIT_LABELS: Record<string, string> = {
  kg: 'кг',
  g: 'г',
  l: 'л',
  ml: 'мл',
  pcs: 'шт',
  pack: 'уп',
  кг: 'кг',
  г: 'г',
  л: 'л',
  мл: 'мл',
  шт: 'шт',
  уп: 'уп',
};

export function formatUnitRu(unit: string): string {
  if (!unit) return 'шт';
  return RU_UNIT_LABELS[unit.toLowerCase().trim()] || unit;
}
