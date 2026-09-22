import type { ProductItem } from '@/types';

const STORAGE_KEY = 'smart_fridge_products_v2';

/**
 * Universal storage adapter:
 * Uses Telegram WebApp CloudStorage (synced across all user devices in Telegram)
 * with graceful fallback to localStorage (desktop/browser offline mode).
 */
export const storage = {
  async loadProducts(): Promise<ProductItem[]> {
    // 1. Try Telegram CloudStorage if inside Telegram
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.CloudStorage) {
      try {
        const cs = window.Telegram.WebApp.CloudStorage;
        const cloudData = await new Promise<string | null>((resolve) => {
          cs.getItem(STORAGE_KEY, (err: Error | null, val?: string) => {
            if (!err && val) resolve(val);
            else resolve(null);
          });
        });

        if (cloudData) {
          const parsed = JSON.parse(cloudData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localStorage.setItem(STORAGE_KEY, cloudData);
            return parsed;
          }
        }
      } catch (e) {
        console.warn('CloudStorage read fallback:', e);
      }
    }

    // 2. Fallback to localStorage
    try {
      const local = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('smart_fridge_inventory');
      if (local) {
        return JSON.parse(local);
      }
    } catch {
      // return default
    }

    return [];
  },

  async saveProducts(products: ProductItem[]): Promise<void> {
    const raw = JSON.stringify(products);
    
    // Save to local storage immediately
    try {
      localStorage.setItem(STORAGE_KEY, raw);
    } catch (e) {
      console.warn('localStorage save failed:', e);
    }

    // Save to Telegram CloudStorage across devices
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.CloudStorage) {
      try {
        const cs = window.Telegram.WebApp.CloudStorage;
        cs.setItem(STORAGE_KEY, raw, (err: Error | null) => {
          if (err) console.warn('CloudStorage sync error:', err);
        });
      } catch (e) {
        console.warn('CloudStorage set error:', e);
      }
    }
  },
};
