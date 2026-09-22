import { createContext, useContext } from 'react';
import { haptic } from '@/lib/haptics';
import type { UserProfile } from '@/types';

export interface TelegramContextValue {
  isReady: boolean;
  isInsideTelegram: boolean;
  user: UserProfile | null;
  colorScheme: 'light' | 'dark';
  haptic: typeof haptic;
  closeApp: () => void;
  expandApp: () => void;
}

export const TelegramContext = createContext<TelegramContextValue | null>(null);

export function useTelegramWebApp(): TelegramContextValue {
  const context = useContext(TelegramContext);
  if (!context) {
    // Safe fallback if used outside provider
    return {
      isReady: true,
      isInsideTelegram: false,
      user: null,
      colorScheme: 'dark',
      haptic,
      closeApp: () => {},
      expandApp: () => {},
    };
  }
  return context;
}
