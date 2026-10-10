import type {
  ApiResponse,
  FridgeSpace,
  FridgeSummary,
  InviteResult,
  ClaimResult,
  ProductItem,
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
    } catch {}
  }

  // 3. Cache persistence
  if (found) {
    try {
      sessionStorage.setItem(CACHED_INIT_DATA_KEY, found);
      localStorage.setItem(CACHED_INIT_DATA_KEY, found);
    } catch {}
    return found;
  }

  // 4. Fallback to cached value from current session
  try {
    const sessionCached = sessionStorage.getItem(CACHED_INIT_DATA_KEY);
    if (sessionCached) return sessionCached;
    const localCached = localStorage.getItem(CACHED_INIT_DATA_KEY);
    if (localCached) return localCached;
  } catch {}

  return '';
}

/**
 * Normalizes API endpoint URL ensuring /api prefix is always present.
 * Defaults to live Cloudflare Worker URL to guarantee connectivity.
 */
export function getApiUrl(endpoint: string): string {
  const defaultWorkerApi = 'https://smart-fridge-edge-gateway.alexeyberezin2.workers.dev/api';
  const base = (import.meta.env.VITE_API_BASE_URL || defaultWorkerApi).replace(/\/+$/, '');
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
 * Base fetch wrapper with Telegram WebApp Authorization headers
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const initData = getTelegramInitData();
  const url = getApiUrl(endpoint);

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

  logger.info('API', `--> ${options.method || 'GET'} ${url} (hasInitData: ${Boolean(initData)})`);

  try {
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
    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    const netErr = error instanceof Error ? error.message : 'Network request failed';
    logger.error('API', `<-- Network Exception ${url}: ${netErr}`);
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
};
