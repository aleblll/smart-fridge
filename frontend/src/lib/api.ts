import type {
  ApiResponse,
  FridgeSpace,
  FridgeSummary,
  InviteResult,
  ClaimResult,
  ProductItem,
  FridgePresetItem,
  ShoppingItem,
} from '@/types';
import { logger } from '@/lib/logger';

const CACHED_INIT_DATA_KEY = 'smart_fridge_cached_init_data';

/**
 * Retrieves raw Telegram initData string for authorization with session persistence
 */
export function getTelegramInitData(): string {
  if (typeof window === 'undefined') return '';

  let found = '';

  // 1. Native Telegram.WebApp
  if (window.Telegram?.WebApp?.initData) {
    found = window.Telegram.WebApp.initData;
  }

  // 2. Query / Hash parameters
  if (!found) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tgInitData = urlParams.get('tgWebAppData');
      if (tgInitData) found = tgInitData;

      if (!found) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const hashInitData = hashParams.get('tgWebAppData');
        if (hashInitData) found = hashInitData;
      }
    } catch {
      // ignore URL parsing errors
    }
  }

  // 3. Cache persistence (sessionStorage only to prevent stale replay)
  if (found) {
    try {
      sessionStorage.setItem(CACHED_INIT_DATA_KEY, found);
    } catch {
      // ignore storage write errors
    }
    return found;
  }

  // 4. Fallback to cached value from current session
  try {
    const sessionCached = sessionStorage.getItem(CACHED_INIT_DATA_KEY);
    if (sessionCached) return sessionCached;
  } catch {
    // ignore storage read errors
  }

  return '';
}

export const PRIMARY_WORKER_API = 'https://smart-fridge-edge-gateway.aghaskdbbb.workers.dev/api';
export const FALLBACK_WORKER_API = 'https://smart-fridge-edge-gateway.alexeyberezin2.workers.dev/api';

let activeBaseUrl = (import.meta.env.VITE_API_BASE_URL || PRIMARY_WORKER_API).replace(/\/+$/, '');

export function getApiBaseUrl(): string {
  return activeBaseUrl;
}

export function buildUrl(base: string, endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (base.endsWith('/api') && cleanEndpoint.startsWith('/api')) {
    return `${base}${cleanEndpoint.slice(4)}`;
  }
  if (!base.endsWith('/api') && !cleanEndpoint.startsWith('/api')) {
    return `${base}/api${cleanEndpoint}`;
  }
  return `${base}${cleanEndpoint}`;
}

/**
 * Normalizes API endpoint URL ensuring /api prefix is always present.
 */
export function getApiUrl(endpoint: string): string {
  return buildUrl(activeBaseUrl, endpoint);
}

/**
 * Base fetch wrapper with Telegram WebApp Authorization headers and resilient dual-gateway fallback
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const initData = getTelegramInitData();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(initData
      ? {
          'X-Telegram-Init-Data': initData,
          Authorization: `tma ${initData}`,
        }
      : {}),
    ...options.headers,
  };

  const executeFetch = async (targetBase: string) => {
    const url = buildUrl(targetBase, endpoint);
    logger.info('API', `--> ${options.method || 'GET'} ${url} (hasInitData: ${Boolean(initData)})`);
    const response = await fetch(url, {
      ...options,
      headers,
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = data?.error || `HTTP error ${response.status}: ${response.statusText}`;
      logger.error('API', `<-- ${response.status} ${url}: ${errMsg}`);
      return {
        success: false,
        error: errMsg,
        code: data?.code || `HTTP_${response.status}`,
      };
    }

    logger.info('API', `<-- ${response.status} ${url}`);
    activeBaseUrl = targetBase;
    return {
      success: true,
      data: data as T,
    };
  };

  try {
    return await executeFetch(activeBaseUrl);
  } catch (error) {
    // If activeBaseUrl failed with a network error and it was primary, attempt fallback immediately!
    if (activeBaseUrl !== FALLBACK_WORKER_API) {
      logger.warn('API', `Primary gateway unreachable (${activeBaseUrl}), attempting fallback to ${FALLBACK_WORKER_API}...`);
      try {
        const fallbackRes = await executeFetch(FALLBACK_WORKER_API);
        activeBaseUrl = FALLBACK_WORKER_API;
        return fallbackRes;
      } catch (fallbackErr) {
        const netErr = fallbackErr instanceof Error ? fallbackErr.message : 'Fallback request failed';
        logger.error('API', `<-- Fallback network error: ${netErr}`);
      }
    }

    const netErr = error instanceof Error ? error.message : 'Network request failed';
    logger.error('API', `<-- Network Exception: ${netErr}`);
    return {
      success: false,
      error: netErr,
      code: 'NETWORK_ERROR',
    };
  }
}

export const api = {
  /**
   * Validate Telegram initData HMAC hash and obtain session info
   */
  async validateAuth(): Promise<ApiResponse<{ user: unknown; valid: boolean }>> {
    return request<{ user: unknown; valid: boolean }>('/auth/validate', {
      method: 'POST',
      body: JSON.stringify({ initData: getTelegramInitData() }),
    });
  },

  /**
   * Get all fridges accessible to current Telegram user (creates default if none)
   * GET /api/fridges/my
   */
  async getMyFridges(): Promise<ApiResponse<{ fridges: FridgeSummary[] }>> {
    return request<{ fridges: FridgeSummary[] }>('/fridges/my', {
      method: 'GET',
    });
  },

  /**
   * Fetch full fridge space details
   * GET /api/fridges/:id
   */
  async getFridge(fridgeId: string): Promise<ApiResponse<FridgeSpace>> {
    return request<FridgeSpace>(`/fridges/${encodeURIComponent(fridgeId)}`, {
      method: 'GET',
    });
  },

  /**
   * Fetch product inventory for a specific fridge
   * GET /api/fridges/:id/products
   */
  async getFridgeProducts(fridgeId: string): Promise<ApiResponse<{ products: ProductItem[] }>> {
    return request<{ products: ProductItem[] }>(
      `/fridges/${encodeURIComponent(fridgeId)}/products`,
      {
        method: 'GET',
      }
    );
  },

  /**
   * Add a product to the fridge
   * POST /api/fridges/:id/products
   */
  async addProduct(
    fridgeId: string,
    product: Partial<ProductItem>
  ): Promise<ApiResponse<{ product: ProductItem }>> {
    return request<{ product: ProductItem }>(
      `/fridges/${encodeURIComponent(fridgeId)}/products`,
      {
        method: 'POST',
        body: JSON.stringify(product),
      }
    );
  },

  /**
   * Update product (status, quantity, opened_at, expires_at, etc.)
   * PATCH /api/fridges/:id/products/:productId
   */
  async updateProduct(
    fridgeId: string,
    productId: string,
    updates: Partial<ProductItem>
  ): Promise<ApiResponse<{ product: ProductItem }>> {
    return request<{ product: ProductItem }>(
      `/fridges/${encodeURIComponent(fridgeId)}/products/${encodeURIComponent(productId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
  },

  /**
   * Soft-delete product
   * DELETE /api/fridges/:id/products/:productId
   */
  async deleteProduct(
    fridgeId: string,
    productId: string
  ): Promise<ApiResponse<{ message: string; id: string }>> {
    return request<{ message: string; id: string }>(
      `/fridges/${encodeURIComponent(fridgeId)}/products/${encodeURIComponent(productId)}`,
      {
        method: 'DELETE',
      }
    );
  },

  /**
   * Create invitation link for family members
   * POST /api/fridges/:id/invites
   */
  async createInvite(fridgeId: string): Promise<ApiResponse<InviteResult>> {
    return request<InviteResult>(`/fridges/${encodeURIComponent(fridgeId)}/invites`, {
      method: 'POST',
    });
  },

  /**
   * Claim invitation code and join fridge
   * POST /api/invites/:code/claim
   */
  async claimInvite(code: string): Promise<ApiResponse<ClaimResult>> {
    return request<ClaimResult>(`/invites/${encodeURIComponent(code)}/claim`, {
      method: 'POST',
    });
  },

  /**
   * Send test morning notification to user's Telegram chat
   * POST /api/notify/test
   */
  async sendTestNotification(): Promise<ApiResponse<{ delivered: boolean; itemsCount: number }>> {
    return request<{ delivered: boolean; itemsCount: number }>('/notify/test', {
      method: 'POST',
    });
  },

  /**
   * Get frequent family presets
   * GET /api/fridges/:id/presets
   */
  async getFridgePresets(fridgeId: string): Promise<ApiResponse<{ presets: FridgePresetItem[] }>> {
    return request<{ presets: FridgePresetItem[] }>(`/fridges/${encodeURIComponent(fridgeId)}/presets`, {
      method: 'GET',
    });
  },

  /**
   * Batch insert products
   * POST /api/fridges/:id/products/batch
   */
  async addProductsBatch(
    fridgeId: string,
    items: Partial<ProductItem>[]
  ): Promise<ApiResponse<{ count: number; products: ProductItem[] }>> {
    return request<{ count: number; products: ProductItem[] }>(
      `/fridges/${encodeURIComponent(fridgeId)}/products/batch`,
      {
        method: 'POST',
        body: JSON.stringify({ items }),
      }
    );
  },

  /**
   * Get shopping list items
   * GET /api/fridges/:id/shopping
   */
  async getShoppingItems(fridgeId: string): Promise<ApiResponse<{ items: ShoppingItem[] }>> {
    return request<{ items: ShoppingItem[] }>(`/fridges/${encodeURIComponent(fridgeId)}/shopping`, {
      method: 'GET',
    });
  },

  /**
   * Add item to shopping list
   * POST /api/fridges/:id/shopping
   */
  async addShoppingItem(
    fridgeId: string,
    item: Partial<ShoppingItem>
  ): Promise<ApiResponse<{ item: ShoppingItem }>> {
    return request<{ item: ShoppingItem }>(`/fridges/${encodeURIComponent(fridgeId)}/shopping`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  /**
   * Update shopping list item (check/uncheck, rename, etc.)
   * PATCH /api/fridges/:id/shopping/:itemId
   */
  async updateShoppingItem(
    fridgeId: string,
    itemId: string,
    updates: Partial<ShoppingItem>
  ): Promise<ApiResponse<{ item: ShoppingItem }>> {
    return request<{ item: ShoppingItem }>(
      `/fridges/${encodeURIComponent(fridgeId)}/shopping/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
  },

  /**
   * Delete item from shopping list
   * DELETE /api/fridges/:id/shopping/:itemId
   */
  async deleteShoppingItem(fridgeId: string, itemId: string): Promise<ApiResponse<{ id: string }>> {
    return request<{ id: string }>(
      `/fridges/${encodeURIComponent(fridgeId)}/shopping/${encodeURIComponent(itemId)}`,
      {
        method: 'DELETE',
      }
    );
  },

  /**
   * Transfer checked shopping items into fridge inventory
   * POST /api/fridges/:id/shopping/transfer
   */
  async transferShoppingItems(
    fridgeId: string
  ): Promise<ApiResponse<{ count: number; products: ProductItem[] }>> {
    return request<{ count: number; products: ProductItem[] }>(
      `/fridges/${encodeURIComponent(fridgeId)}/shopping/transfer`,
      {
        method: 'POST',
      }
    );
  },
};
