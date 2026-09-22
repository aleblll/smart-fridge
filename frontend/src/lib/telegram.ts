import {
  init,
  swipeBehavior,
  viewport,
  miniApp,
  themeParams,
  initData,
} from '@telegram-apps/sdk-react';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            is_premium?: boolean;
          };
          query_id?: string;
          auth_date?: number;
          hash?: string;
          start_param?: string;
        };
        version?: string;
        platform?: string;
        colorScheme?: 'light' | 'dark';
        themeParams?: Record<string, string>;
        isExpanded?: boolean;
        viewportHeight?: number;
        viewportStableHeight?: number;
        headerColor?: string;
        backgroundColor?: string;
        isClosingConfirmationEnabled?: boolean;
        ready: () => void;
        expand: () => void;
        close: () => void;
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
        onEvent?: (eventType: string, eventHandler: () => void) => void;
        offEvent?: (eventType: string, eventHandler: () => void) => void;
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

/**
 * Synchronize Telegram WebApp theme parameters with CSS root variables
 */
export function syncTelegramThemeVariables(): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const webApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  const params = webApp?.themeParams;

  if (params) {
    if (params.bg_color) root.style.setProperty('--tg-theme-bg-color', params.bg_color);
    if (params.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', params.secondary_bg_color);
    if (params.section_bg_color) root.style.setProperty('--tg-theme-section-bg-color', params.section_bg_color);
    if (params.text_color) root.style.setProperty('--tg-theme-text-color', params.text_color);
    if (params.hint_color) root.style.setProperty('--tg-theme-hint-color', params.hint_color);
    if (params.link_color) root.style.setProperty('--tg-theme-link-color', params.link_color);
    if (params.button_color) root.style.setProperty('--tg-theme-button-color', params.button_color);
    if (params.button_text_color) root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
  }

  // Update color-scheme attribute
  if (webApp?.colorScheme) {
    root.setAttribute('data-theme', webApp.colorScheme);
    if (webApp.colorScheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

/**
 * Initialize Telegram Mini App SDK, disable vertical swipes, and bind events
 */
export function initTelegramApp(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Initialize SDK
    init();

    // 2. Disable vertical swipes to prevent accidental closing on scroll
    if (swipeBehavior.isSupported()) {
      if (!swipeBehavior.isMounted()) {
        swipeBehavior.mount();
      }
      if (swipeBehavior.disableVertical.isAvailable()) {
        swipeBehavior.disableVertical();
      }
    }

    // 3. Mount viewport and expand
    if (viewport.mount.isAvailable()) {
      viewport.mount().then(() => {
        if (viewport.expand.isAvailable()) {
          viewport.expand();
        }
      }).catch((err) => {
        console.warn('[Telegram SDK] Viewport mount failed:', err);
      });
    }

    // 4. Mount miniApp and theme
    if (miniApp.mount.isAvailable()) {
      miniApp.mount();
      miniApp.ready();
    }

    if (themeParams.mount.isAvailable()) {
      themeParams.mount();
      themeParams.bindCssVars();
    }

    try {
      initData.restore();
    } catch {
      // Dev mode ignore
    }
  } catch (sdkError) {
    console.warn('[Telegram SDK] SDK initialization fallback to window.Telegram:', sdkError);
  }

  // Native window.Telegram.WebApp fallback
  const webApp = window.Telegram?.WebApp;
  if (webApp) {
    try {
      webApp.ready();
      webApp.expand();
      if (typeof webApp.disableVerticalSwipes === 'function') {
        webApp.disableVerticalSwipes();
      }
      if (typeof webApp.onEvent === 'function') {
        webApp.onEvent('themeChanged', syncTelegramThemeVariables);
      }
    } catch (e) {
      console.warn('[Telegram Native] Failed native WebApp call:', e);
    }
  }

  syncTelegramThemeVariables();
  return true;
}
