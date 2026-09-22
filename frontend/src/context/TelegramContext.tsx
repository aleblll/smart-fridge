import React, { useEffect, useState } from 'react';
import { initTelegramApp, syncTelegramThemeVariables } from '@/lib/telegram';
import { haptic } from '@/lib/haptics';
import { TelegramContext, type TelegramContextValue } from '@/hooks/useTelegramWebApp';
import type { UserProfile } from '@/types';

export const TelegramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [isInsideTelegram, setIsInsideTelegram] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    // 1. Initialize Telegram WebApp SDK & disableVerticalSwipes
    initTelegramApp();

    const webApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    const isTg = Boolean(webApp?.initData || (webApp?.version && webApp?.platform));
    setIsInsideTelegram(isTg);

    if (webApp) {
      if (webApp.initDataUnsafe?.user) {
        setUser(webApp.initDataUnsafe.user as UserProfile);
      }
      if (webApp.colorScheme) {
        setColorScheme(webApp.colorScheme);
      }

      // Listen to themeChanged event
      const handleThemeChanged = () => {
        syncTelegramThemeVariables();
        if (webApp.colorScheme) {
          setColorScheme(webApp.colorScheme);
        }
      };

      if (typeof webApp.onEvent === 'function') {
        webApp.onEvent('themeChanged', handleThemeChanged);
      }

      return () => {
        if (typeof webApp.offEvent === 'function') {
          webApp.offEvent('themeChanged', handleThemeChanged);
        }
      };
    }

    setIsReady(true);
  }, []);

  const closeApp = () => {
    try {
      window.Telegram?.WebApp?.close();
    } catch {
      console.log('Close called outside Telegram');
    }
  };

  const expandApp = () => {
    try {
      window.Telegram?.WebApp?.expand();
    } catch {
      // Ignore
    }
  };

  const value: TelegramContextValue = {
    isReady,
    isInsideTelegram,
    user,
    colorScheme,
    haptic,
    closeApp,
    expandApp,
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};
