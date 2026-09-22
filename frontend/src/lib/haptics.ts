export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type NotificationType = 'error' | 'success' | 'warning';

/**
 * Safe Telegram WebApp HapticFeedback wrapper complying with DS-002 Haptics Map
 */
export const haptic = {
  /**
   * Impact feedback for mechanical clicks, steppers, chips, tabs, gestures
   */
  impact: (style: ImpactStyle = 'light') => {
    try {
      if (typeof window !== 'undefined') {
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
      }
    } catch {
      // Gracefully ignore in standard browser/desktop environment
    }
  },

  /**
   * Notification feedback for action outcomes (success, error, warning)
   */
  notification: (type: NotificationType) => {
    try {
      if (typeof window !== 'undefined') {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
      }
    } catch {
      // Gracefully ignore in standard browser/desktop environment
    }
  },

  /**
   * Selection feedback for wheel scrolls, date pickers, item selections
   */
  selection: () => {
    try {
      if (typeof window !== 'undefined') {
        window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
      }
    } catch {
      // Gracefully ignore in standard browser/desktop environment
    }
  },
};
