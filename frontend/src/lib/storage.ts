import type { FridgeSummary, ProductItem, ShoppingItem, FridgePresetItem } from '@/types';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';

const STORAGE_ACTIVE_FRIDGE_KEY = 'smart_fridge_active_id';
const STORAGE_FRIDGES_LIST_KEY = 'smart_fridge_list_v2';
const STORAGE_MUTATION_QUEUE_KEY = 'smart_fridge_mutation_queue';
const LEGACY_STORAGE_KEY = 'smart_fridge_products_v2';
const LEGACY_FALLBACK_KEY = 'smart_fridge_inventory';
const LEGACY_MIGRATED_FLAG = 'smart_fridge_legacy_migrated_v1';

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
  lastSyncError: null as string | null,

  getLastSyncError(): string | null {
    return this.lastSyncError;
  },

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
    try {
      const res = await api.getMyFridges();
      if (res.success && res.data?.fridges) {
        this.lastSyncError = null;
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
      } else {
        const errMsg = res.error || 'Ошибка загрузки списка холодильников';
        this.lastSyncError = errMsg;
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.lastSyncError = errMsg;
      logger.warn('STORAGE', `syncFridges network exception: ${errMsg}`);
    }

    // Offline fallback to cached list
    const cached = this.getCachedFridges();
    return cached || [];
  },

  /**
   * One-time collection of legacy products for initial cloud migration
   */
  consumeLegacyProductsForMigration(): ProductItem[] {
    if (typeof window === 'undefined') return [];
    try {
      if (localStorage.getItem(LEGACY_MIGRATED_FLAG) === 'true') return [];
      const candidates: ProductItem[] = [];
      const seen = new Set<string>();
      const addItems = (raw: string | null) => {
        if (!raw) return;
        try {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item && item.id && item.name && !seen.has(item.id) && !String(item.id).startsWith('demo-')) {
                seen.add(item.id);
                candidates.push(item);
              }
            }
          }
        } catch {
          // ignore malformed JSON
        }
      };

      addItems(localStorage.getItem(LEGACY_STORAGE_KEY));
      addItems(localStorage.getItem(LEGACY_FALLBACK_KEY));

      localStorage.setItem(LEGACY_MIGRATED_FLAG, 'true');
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_FALLBACK_KEY);

      return candidates;
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
        if (local !== null) {
          try {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed)) return parsed;
          } catch {
            // ignore malformed JSON
          }
        }
      }

      // Check legacy keys only if legacy migration has not run yet
      if (localStorage.getItem(LEGACY_MIGRATED_FLAG) !== 'true') {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY) ?? localStorage.getItem(LEGACY_FALLBACK_KEY);
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          } catch {
            // ignore malformed JSON
          }
        }
      }
    } catch (e) {
      logger.error('STORAGE', `Failed parsing initial cache: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  },

  /**
   * Drain pending mutation queue and fetch latest products from D1 server.
   * Guarantees Flush-Before-Fetch order and saves latest remote state to local cache.
   */
  async fetchAndSyncProducts(fridgeId: string): Promise<ProductItem[] | null> {
    if (!fridgeId) return null;

    // 1. Process pending offline mutations first (Flush-Before-Fetch)
    try {
      await this.processMutationQueue();
    } catch (e) {
      logger.warn('STORAGE', `Offline queue processing error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 2. Fetch fresh inventory from D1
    try {
      const res = await api.getFridgeProducts(fridgeId);
      if (res.success && res.data?.products) {
        this.lastSyncError = null;
        const serverProducts = res.data.products;
        logger.sync(`Loaded ${serverProducts.length} products from D1 for fridge ${fridgeId}`);

        // Bi-directional reconciliation: protect locally entered items that haven't reached D1 yet
        const localProducts = this.getInitialProducts(fridgeId) || [];
        const serverIds = new Set(serverProducts.map((p) => p.id));
        const unsyncedLocals = localProducts.filter(
          (p) => p.status === 'active' && !serverIds.has(p.id) && !p.id.startsWith('demo-')
        );

        if (unsyncedLocals.length > 0) {
          logger.info('SYNC', `Reconciling ${unsyncedLocals.length} local products not present on D1 server to cloud...`);
          try {
            const chunkSize = 40;
            for (let i = 0; i < unsyncedLocals.length; i += chunkSize) {
              const chunk = unsyncedLocals.slice(i, i + chunkSize);
              const batchRes = await api.addProductsBatch(fridgeId, chunk);
              if (batchRes.success && batchRes.data?.products) {
                for (const created of batchRes.data.products) {
                  serverProducts.push(created);
                }
              } else {
                for (const item of chunk) {
                  if (!serverProducts.some((p) => p.id === item.id)) {
                    serverProducts.push(item);
                  }
                }
              }
            }
          } catch (batchErr) {
            logger.warn('SYNC', `Batch reconciliation error: ${batchErr}`);
            for (const item of unsyncedLocals) {
              if (!serverProducts.some((p) => p.id === item.id)) {
                serverProducts.push(item);
              }
            }
          }
        }

        // One-time legacy migration check
        const legacyCandidates = this.consumeLegacyProductsForMigration();
        if (legacyCandidates.length > 0) {
          logger.info('MIGRATION', `Migrating ${legacyCandidates.length} one-time legacy local items to cloud fridge ${fridgeId}...`);
          for (const item of legacyCandidates) {
            try {
              const addRes = await api.addProduct(fridgeId, item);
              if (addRes.success && addRes.data?.product) {
                serverProducts.push(addRes.data.product);
              }
            } catch {
              // ignore individual migration error
            }
          }
        }

        this.saveProductsLocally(fridgeId, serverProducts);
        return serverProducts;
      } else {
        const errMsg = res.error || 'Ошибка ответа D1';
        this.lastSyncError = errMsg;
        logger.warn(
          'STORAGE',
          `Server load failed or offline: ${errMsg}. Retaining local cache.`
        );
        return null;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.lastSyncError = errMsg;
      logger.warn(
        'STORAGE',
        `Network error during fetch: ${errMsg}. Retaining local cache.`
      );
      return null;
    }
  },

  /**
   * Load products with Thin Client + Offline Cache strategy:
   * 1. Returns cached products immediately if available.
   * 2. Runs background sync to D1 server and triggers onServerUpdated callback on success.
   * 3. NEVER overwrites existing data with demo items on network failures.
   */
  async loadProducts(
    fridgeId?: string,
    onServerUpdated?: (products: ProductItem[]) => void
  ): Promise<ProductItem[] | null> {
    const cached = this.getInitialProducts(fridgeId);

    if (!fridgeId) {
      return cached;
    }

    // Background fetch to D1 server
    this.fetchAndSyncProducts(fridgeId).then((serverProducts) => {
      if (serverProducts && onServerUpdated) {
        onServerUpdated(serverProducts);
      }
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
  /**
   * Update product with optimistic local cache update + D1 API sync + offline queue
   */
  async updateProduct(
    fridgeId: string,
    productId: string,
    updates: Partial<ProductItem> & { delta_consumed?: number }
  ): Promise<ProductItem | null> {
    // 1. Optimistic local cache update
    const current = this.getInitialProducts(fridgeId) || [];
    let updatedProduct: ProductItem | null = null;
    const updatedList = current.map((p) => {
      if (p.id === productId) {
        let newQty = updates.quantity !== undefined ? updates.quantity : p.quantity;
        let newStatus = updates.status !== undefined ? updates.status : p.status;
        if (typeof updates.delta_consumed === 'number' && updates.delta_consumed > 0) {
          newQty = Math.round(Math.max(0, p.quantity - updates.delta_consumed) * 1000) / 1000;
          if (newQty <= 0) {
            newStatus = 'consumed';
            newQty = 0;
          }
        }
        updatedProduct = {
          ...p,
          ...updates,
          quantity: newQty,
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        delete (updatedProduct as any).delta_consumed;
        return updatedProduct;
      }
      return p;
    });

    if (updatedProduct) {
      this.saveProductsLocally(fridgeId, updatedList);
    }

    // 2. Send API request
    try {
      const res = await api.updateProduct(fridgeId, productId, updates as any);
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

  // ==========================================
  // Shopping List Offline Cache & D1 Sync
  // ==========================================

  getShoppingCacheKey(fridgeId: string): string {
    return `smart_fridge_shopping_${fridgeId}`;
  },

  getCachedShoppingItems(fridgeId: string): ShoppingItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.getShoppingCacheKey(fridgeId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      return [];
    }
    return [];
  },

  saveShoppingItemsLocally(fridgeId: string, items: ShoppingItem[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.getShoppingCacheKey(fridgeId), JSON.stringify(items));
    } catch (e) {
      logger.error('STORAGE', `Failed saving shopping items: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  async fetchAndSyncShoppingItems(fridgeId: string): Promise<ShoppingItem[] | null> {
    if (!fridgeId) return null;
    try {
      const res = await api.getShoppingItems(fridgeId);
      if (res.success && res.data?.items) {
        this.saveShoppingItemsLocally(fridgeId, res.data.items);
        return res.data.items;
      }
      return null;
    } catch (err) {
      logger.warn('STORAGE', `Failed fetching shopping items from server: ${err}`);
      return null;
    }
  },

  async loadShoppingItems(
    fridgeId: string,
    onServerUpdated?: (items: ShoppingItem[]) => void
  ): Promise<ShoppingItem[]> {
    const cached = this.getCachedShoppingItems(fridgeId);
    this.fetchAndSyncShoppingItems(fridgeId).then((items) => {
      if (items && onServerUpdated) {
        onServerUpdated(items);
      }
    });
    return cached;
  },

  async addShoppingItem(fridgeId: string, item: Partial<ShoppingItem>): Promise<ShoppingItem> {
    const id = item.id || `shop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const fullItem: ShoppingItem = {
      id,
      fridge_id: fridgeId,
      name: item.name || '',
      canonical_name: (item.canonical_name || item.name || '').toLowerCase(),
      storage_type: item.storage_type || 'fridge',
      quantity: item.quantity || 1,
      unit: item.unit || 'шт',
      shelf_life_days: item.shelf_life_days || 7,
      is_checked: 0,
      created_at: new Date().toISOString(),
    };

    const current = this.getCachedShoppingItems(fridgeId);
    const updated = [fullItem, ...current.filter((i) => i.id !== id)];
    this.saveShoppingItemsLocally(fridgeId, updated);

    api.addShoppingItem(fridgeId, fullItem).catch(() => {});
    return fullItem;
  },

  async toggleShoppingItem(fridgeId: string, itemId: string, isChecked: boolean): Promise<ShoppingItem | null> {
    const current = this.getCachedShoppingItems(fridgeId);
    let target: ShoppingItem | null = null;
    const updated = current.map((i) => {
      if (i.id === itemId) {
        target = { ...i, is_checked: isChecked ? 1 : 0 };
        return target;
      }
      return i;
    });
    this.saveShoppingItemsLocally(fridgeId, updated);
    api.updateShoppingItem(fridgeId, itemId, { is_checked: isChecked ? 1 : 0 }).catch(() => {});
    return target;
  },

  async deleteShoppingItem(fridgeId: string, itemId: string): Promise<void> {
    const current = this.getCachedShoppingItems(fridgeId);
    const updated = current.filter((i) => i.id !== itemId);
    this.saveShoppingItemsLocally(fridgeId, updated);
    api.deleteShoppingItem(fridgeId, itemId).catch(() => {});
  },

  async transferShoppingItems(fridgeId: string): Promise<ProductItem[]> {
    const currentShopping = this.getCachedShoppingItems(fridgeId);
    const checked = currentShopping.filter((i) => i.is_checked === 1);
    const remaining = currentShopping.filter((i) => i.is_checked === 0);
    this.saveShoppingItemsLocally(fridgeId, remaining);

    const now = new Date();
    const newProducts: ProductItem[] = checked.map((item) => {
      const expDate = new Date(now.getTime() + (item.shelf_life_days || 7) * 86400000);
      return {
        id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fridge_id: fridgeId,
        name: item.name,
        canonical_name: item.canonical_name || item.name.toLowerCase(),
        category: 'Другое',
        storage_type: item.storage_type,
        quantity: item.quantity,
        unit: item.unit,
        is_discrete: 1,
        opened_at: null,
        expires_at: expDate.toISOString().slice(0, 10),
        notify_before_days: 2,
        status: 'active',
        added_by: 0,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
    });

    const currentProds = this.getInitialProducts(fridgeId) || [];
    this.saveProductsLocally(fridgeId, [...newProducts, ...currentProds]);

    api.transferShoppingItems(fridgeId).then((res) => {
      if (res.success && res.data?.products) {
        this.loadProducts(fridgeId);
      }
    }).catch(() => {});

    return newProducts;
  },

  // ==========================================
  // Family Presets
  // ==========================================
  getPresetsCacheKey(fridgeId: string): string {
    return `smart_fridge_presets_${fridgeId}`;
  },

  async loadPresets(
    fridgeId: string,
    onServerUpdated?: (presets: FridgePresetItem[]) => void
  ): Promise<FridgePresetItem[]> {
    if (typeof window === 'undefined') return [];
    let cached: FridgePresetItem[] = [];
    try {
      const raw = localStorage.getItem(this.getPresetsCacheKey(fridgeId));
      if (raw) cached = JSON.parse(raw) || [];
    } catch (e) {
      void e;
    }

    api.getFridgePresets(fridgeId).then((res) => {
      if (res.success && res.data?.presets) {
        try {
          localStorage.setItem(this.getPresetsCacheKey(fridgeId), JSON.stringify(res.data.presets));
        } catch (e) {
          void e;
        }
        if (onServerUpdated) {
          onServerUpdated(res.data.presets);
        }
      }
    }).catch(() => {});

    return cached;
  },
};

// Auto-process mutation queue when connectivity is restored (Flush-Before-Fetch order)
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    logger.info('STORAGE', 'Network online detected! Flushing offline mutation queue (Flush-Before-Fetch)...');
    await storage.processMutationQueue();
    const activeId = storage.getActiveFridgeId();
    if (activeId) {
      await storage.loadProducts(activeId);
    }
  });
}
