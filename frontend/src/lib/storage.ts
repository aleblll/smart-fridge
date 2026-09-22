import type { ProductItem } from '@/types';
import { logger } from '@/lib/logger';

const STORAGE_KEY = 'smart_fridge_products_v2';

export const storage = {
  async loadProducts(): Promise<ProductItem[]> {
    logger.info('STORAGE', 'Loading products...');

    // 1. Try Telegram CloudStorage if inside Telegram
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.CloudStorage) {
      try {
        const cs = window.Telegram.WebApp.CloudStorage;
        const cloudData = await new Promise<string | null>((resolve) => {
          cs.getItem(STORAGE_KEY, (err: Error | null, val?: string) => {
            if (!err && val) {
              logger.sync(`CloudStorage read successful: ${val.length} bytes`);
              resolve(val);
            } else {
              if (err) logger.warn('STORAGE', `CloudStorage read error: ${err.message}`);
              resolve(null);
            }
          });
        });

        if (cloudData) {
          const parsed = JSON.parse(cloudData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localStorage.setItem(STORAGE_KEY, cloudData);
            logger.info('STORAGE', `Loaded ${parsed.length} products from CloudStorage`);
            return parsed;
          }
        }
      } catch (e) {
        logger.warn('STORAGE', `CloudStorage fallback: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 2. Fallback to localStorage
    try {
      const local = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('smart_fridge_inventory');
      if (local) {
        const parsed = JSON.parse(local);
        logger.info('STORAGE', `Loaded ${parsed.length} products from localStorage fallback`);
        return parsed;
      }
    } catch (e) {
      logger.error('STORAGE', `Failed parsing localStorage: ${e instanceof Error ? e.message : String(e)}`);
    }

    logger.info('STORAGE', 'No saved products found, using initial preset defaults');
    return [];
  },

  async saveProducts(products: ProductItem[]): Promise<void> {
    const raw = JSON.stringify(products);
    
    // Save to local storage
    try {
      localStorage.setItem(STORAGE_KEY, raw);
    } catch (e) {
      logger.error('STORAGE', `localStorage save error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Save to Telegram CloudStorage across devices
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.CloudStorage) {
      try {
        const cs = window.Telegram.WebApp.CloudStorage;
        cs.setItem(STORAGE_KEY, raw, (err: Error | null) => {
          if (err) {
            logger.error('SYNC', `CloudStorage save failed: ${err.message}`);
          } else {
            logger.sync(`CloudStorage synced ${products.length} products across devices`);
          }
        });
      } catch (e) {
        logger.error('SYNC', `CloudStorage exception: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  },
};
