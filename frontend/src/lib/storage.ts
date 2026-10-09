import type { FridgeSummary, ProductItem } from '@/types';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';

const STORAGE_ACTIVE_FRIDGE_KEY = 'smart_fridge_active_id';
const STORAGE_FRIDGES_LIST_KEY = 'smart_fridge_list_v2';
const STORAGE_MUTATION_QUEUE_KEY = 'smart_fridge_mutation_queue';
const LEGACY_STORAGE_KEY = 'smart_fridge_products_v2';
const LEGACY_FALLBACK_KEY = 'smart_fridge_inventory';

export interface QueuedMutation {
  id: string;
  type: 'ADD' | 'UPDATE' | 'DELETE';
  fridgeId: string;
  productId: string;
  payload?: Partial<ProductItem>;
  timestamp: number;
}

let isProcessingQueue = false;

function getProductsCacheKey(fridgeId: string): string {
  return `smart_fridge_products_${fridgeId}`;
}

export const storage = {
  /**
   * Get active fridge ID from localStorage
   */
  getActiveFridgeId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(STORAGE_ACTIVE_FRIDGE_KEY);
    } catch {
      return null;
    }
  },

  /**
   * Set active fridge ID in localStorage
   */
  setActiveFridgeId(id: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_ACTIVE_FRIDGE_KEY, id);
    } catch (e) {
      logger.error('STORAGE', `Failed to save active fridge ID: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /**
   * Get cached list of user's fridges
   */
  getCachedFridges(): FridgeSummary[] | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_FRIDGES_LIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      logger.error('STORAGE', `Failed parsing cached fridges: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  },

  /**
   * Save user's fridges list to localStorage cache
   */
  saveCachedFridges(fridges: FridgeSummary[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_FRIDGES_LIST_KEY, JSON.stringify(fridges));
    } catch (e) {
      logger.error('STORAGE', `Failed saving fridges list to cache: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /**
   * Synchronize list of user's fridges from D1 server
   */
  async syncFridges(): Promise<FridgeSummary[]> {
    logger.info('STORAGE', 'Syncing fridges from D1 server...');
    const res = await api.getMyFridges();
    if (res.success && res.data?.fridges) {
      const fridges = res.data.fridges;
      this.saveCachedFridges(fridges);

      const currentActive = this.getActiveFridgeId();
      const activeStillExists = fridges.some((f) => f.id === currentActive);
      if (!currentActive || !activeStillExists) {
        if (fridges.length > 0) {
          this.setActiveFridgeId(fridges[0].id);
        }
      }
      return fridges;
    }

    // Offline fallback to cached list
    const cached = this.getCachedFridges();
    return cached || [];
  },

  /**
   * Collect any products found in local storage (legacy or cache) for migration
   */
  getLocalProductsForMigration(activeFridgeId?: string): ProductItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const candidates: ProductItem[] = [];
      const seen = new Set<string>();

      const addItems = (raw: string | null) => {
        if (!raw) return;
        try {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item && item.id && item.name && !seen.has(item.id)) {
                seen.add(item.id);
                candidates.push(item);
              }
            }
          }
        } catch {}
      };

      if (activeFridgeId) {
        addItems(localStorage.getItem(getProductsCacheKey(activeFridgeId)));
      }
      addItems(localStorage.getItem(LEGACY_STORAGE_KEY));
      addItems(localStorage.getItem(LEGACY_FALLBACK_KEY));

      // Scan all potential localStorage keys for products
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('smart_fridge') || key.includes('product') || key.includes('inventory'))) {
          if (
            key === STORAGE_ACTIVE_FRIDGE_KEY ||
            key === STORAGE_FRIDGES_LIST_KEY ||
            key === STORAGE_MUTATION_QUEUE_KEY ||
            key.includes('log')
          ) {
            continue;
          }
          addItems(localStorage.getItem(key));
        }
      }

      // Filter out demo products so we only migrate real user products
      return candidates.filter((item) => !item.id.startsWith('demo-'));
    } catch {
      return [];
    }
  },

  /**
   * Synchronously get cached products from localStorage for instant UI render
   */
  getInitialProducts(fridgeId?: string): ProductItem[] | null {
    if (typeof window === 'undefined') return null;
    try {
      const targetKey = fridgeId ? getProductsCacheKey(fridgeId) : null;
      if (targetKey) {
        const local = localStorage.getItem(targetKey);
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }

      // Check legacy keys for existing users
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY) ?? localStorage.getItem(LEGACY_FALLBACK_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }

      // Scan all other potential keys for non-empty items
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('smart_fridge') || key.includes('product') || key.includes('inventory'))) {
          if (
            key === STORAGE_ACTIVE_FRIDGE_KEY ||
            key === STORAGE_FRIDGES_LIST_KEY ||
            key === STORAGE_MUTATION_QUEUE_KEY ||
            key.includes('log')
          ) {
            continue;
          }
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch {}
          }
        }
      }

      // If target key was explicitly set as empty array
      if (targetKey) {
        const local = localStorage.getItem(targetKey);
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch (e) {
      logger.error('STORAGE', `Failed parsing initial cache: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  },

  /**
   * Load products with Thin Client + Offline Cache strategy:
   * 1. Returns cached products immediately if available.
   * 2. Fires background sync to D1 server and triggers onServerUpdated callback on success.
   * 3. Automatically migrates local items to D1 if cloud fridge has 0 items.
   * 4. NEVER overwrites existing data with demo items on network failures.
   */
  async loadProducts(
    fridgeId?: string,
    onServerUpdated?: (products: ProductItem[]) => void
  ): Promise<ProductItem[] | null> {
    const cached = this.getInitialProducts(fridgeId);

    // Process pending offline mutations first
    this.processMutationQueue().catch((e) => {
      logger.warn('STORAGE', `Offline queue processing error: ${e instanceof Error ? e.message : String(e)}`);
    });

    if (!fridgeId) {
      return cached;
    }

    // Background fetch to D1 server
    api.getFridgeProducts(fridgeId).then(async (res) => {
      if (res.success && res.data?.products) {
        let serverProducts = res.data.products;
        logger.sync(`Loaded ${serverProducts.length} products from D1 for fridge ${fridgeId}`);

        // Migration Check: If D1 server has 0 products for this fridge,
        // but user has existing products from local cache / legacy storage,
        // automatically push them up to D1 so they persist in cloud and sync across devices!
        if (serverProducts.length === 0) {
          const localToMigrate = this.getLocalProductsForMigration(fridgeId);
          if (localToMigrate.length > 0) {
            logger.info('MIGRATION', `Auto-migrating ${localToMigrate.length} local items to D1 server...`);
            const migrated: ProductItem[] = [];
            for (const item of localToMigrate) {
              try {
                const addRes = await api.addProduct(fridgeId, item);
                if (addRes.success && addRes.data?.product) {
                  migrated.push(addRes.data.product);
                } else {
                  migrated.push(item);
                }
              } catch {
                migrated.push(item);
              }
            }
            if (migrated.length > 0) {
              serverProducts = migrated;
            }
          }
        }

        this.saveProductsLocally(fridgeId, serverProducts);
        if (onServerUpdated) {
          onServerUpdated(serverProducts);
        }
      } else {
        logger.warn(
          'STORAGE',
          `Server load failed or offline: ${res.error || 'network issue'}. Retaining local cache.`
        );
      }
    }).catch((err) => {
      logger.warn(
        'STORAGE',
        `Network error during background fetch: ${err instanceof Error ? err.message : String(err)}. Retaining local cache.`
      );
    });

    return cached;
  },

  /**
   * Save products to localStorage cache for a specific fridge
   */
  saveProductsLocally(fridgeId: string, products: ProductItem[]): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = JSON.stringify(products);
      localStorage.setItem(getProductsCacheKey(fridgeId), raw);
      // Keep legacy backup if products is not empty
      if (products.length > 0) {
        localStorage.setItem(LEGACY_STORAGE_KEY, raw);
      }
    } catch (e) {
      logger.error('STORAGE', `Failed saving products to cache: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /**
   * Add product with optimistic local cache update + D1 API sync + offline queue
   */
  async addProduct(fridgeId: string, product: ProductItem): Promise<ProductItem> {
    // 1. Optimistic local cache update
    const current = this.getInitialProducts(fridgeId) || [];
    const updated = [product, ...current.filter((p) => p.id !== product.id)];
    this.saveProductsLocally(fridgeId, updated);

    // 2. Send API request
    try {
      const res = await api.addProduct(fridgeId, product);
      if (res.success && res.data?.product) {
        logger.sync(`Product added to D1: ${product.name} (${product.id})`);
        return res.data.product;
      }
      // If server returned network/server error, queue mutation
      this.enqueueMutation({
        id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'ADD',
        fridgeId,
        productId: product.id,
        payload: product,
        timestamp: Date.now(),
      });
    } catch {
      this.enqueueMutation({
        id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'ADD',
        fridgeId,
        productId: product.id,
        payload: product,
        timestamp: Date.now(),
      });
    }

    return product;
  },

  /**
   * Update product with optimistic local cache update + D1 API sync + offline queue
   */
  async updateProduct(
    fridgeId: string,
    productId: string,
    updates: Partial<ProductItem>
  ): Promise<ProductItem | null> {
    // 1. Optimistic local cache update
    const current = this.getInitialProducts(fridgeId) || [];
    let updatedProduct: ProductItem | null = null;
    const updatedList = current.map((p) => {
      if (p.id === productId) {
        updatedProduct = { ...p, ...updates, updated_at: new Date().toISOString() };
        return updatedProduct;
      }
      return p;
    });

    if (updatedProduct) {
      this.saveProductsLocally(fridgeId, updatedList);
    }

    // 2. Send API request
    try {
      const res = await api.updateProduct(fridgeId, productId, updates);
      if (res.success && res.data?.product) {
        logger.sync(`Product updated in D1: ${productId}`);
        return res.data.product;
      }
      this.enqueueMutation({
        id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'UPDATE',
        fridgeId,
        productId,
        payload: updates,
        timestamp: Date.now(),
      });
    } catch {
      this.enqueueMutation({
        id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'UPDATE',
        fridgeId,
        productId,
        payload: updates,
        timestamp: Date.now(),
      });
    }

    return updatedProduct;
  },

  /**
   * Soft-delete product with optimistic local cache update + D1 API sync + offline queue
   */
  async deleteProduct(fridgeId: string, productId: string): Promise<void> {
    // 1. Optimistic local cache update
    const current = this.getInitialProducts(fridgeId) || [];
    const updatedList = current.filter((p) => p.id !== productId);
    this.saveProductsLocally(fridgeId, updatedList);

    // 2. Send API request
    try {
      const res = await api.deleteProduct(fridgeId, productId);
      if (res.success) {
        logger.sync(`Product deleted in D1: ${productId}`);
        return;
      }
      this.enqueueMutation({
        id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'DELETE',
        fridgeId,
        productId,
        timestamp: Date.now(),
      });
    } catch {
      this.enqueueMutation({
        id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'DELETE',
        fridgeId,
        productId,
        timestamp: Date.now(),
      });
    }
  },

  /**
   * Add mutation to offline retry queue
   */
  enqueueMutation(mutation: QueuedMutation): void {
    if (typeof window === 'undefined') return;
    try {
      const queue = this.getMutationQueue();
      queue.push(mutation);
      localStorage.setItem(STORAGE_MUTATION_QUEUE_KEY, JSON.stringify(queue));
      logger.info('STORAGE', `Queued offline mutation [${mutation.type}] for product ${mutation.productId}`);
    } catch (e) {
      logger.error('STORAGE', `Failed enqueueing mutation: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /**
   * Get all queued mutations
   */
  getMutationQueue(): QueuedMutation[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_MUTATION_QUEUE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      return [];
    }
    return [];
  },

  /**
   * Process and drain the offline mutation queue against D1 API
   */
  async processMutationQueue(): Promise<void> {
    if (isProcessingQueue || typeof window === 'undefined') return;
    const queue = this.getMutationQueue();
    if (queue.length === 0) return;

    isProcessingQueue = true;
    logger.info('STORAGE', `Processing offline mutation queue (${queue.length} items)...`);

    const remainingQueue: QueuedMutation[] = [];

    for (const item of queue) {
      try {
        let res: { success: boolean; code?: string; error?: string };
        if (item.type === 'ADD') {
          res = await api.addProduct(item.fridgeId, item.payload || {});
        } else if (item.type === 'UPDATE') {
          res = await api.updateProduct(item.fridgeId, item.productId, item.payload || {});
        } else if (item.type === 'DELETE') {
          res = await api.deleteProduct(item.fridgeId, item.productId);
        } else {
          continue;
        }

        if (res.success) {
          logger.sync(`Offline mutation replayed successfully: [${item.type}] ${item.productId}`);
        } else if (res.code === 'NETWORK_ERROR') {
          // Still offline, retain this and all remaining mutations
          remainingQueue.push(item);
          const index = queue.indexOf(item);
          remainingQueue.push(...queue.slice(index + 1));
          break;
        } else {
          // Client or 4xx error (e.g. not found), discard mutation to avoid stuck queue
          logger.warn('STORAGE', `Discarding failing mutation [${item.type}] ${item.productId}: ${res.error}`);
        }
      } catch {
        remainingQueue.push(item);
        const index = queue.indexOf(item);
        remainingQueue.push(...queue.slice(index + 1));
        break;
      }
    }

    try {
      localStorage.setItem(STORAGE_MUTATION_QUEUE_KEY, JSON.stringify(remainingQueue));
    } catch (e) {
      logger.error('STORAGE', `Failed writing updated mutation queue: ${e instanceof Error ? e.message : String(e)}`);
    }

    isProcessingQueue = false;
  },
};

// Auto-process mutation queue when connectivity is restored
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    logger.info('STORAGE', 'Network online detected! Flushing offline mutation queue...');
    storage.processMutationQueue();
  });
}
