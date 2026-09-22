import type { ApiResponse, FridgeSpace, ProductItem } from '@/types';

// Default to relative /api or custom Cloudflare Worker domain from env
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Retrieves raw Telegram initData string for authorization
 */
export function getTelegramInitData(): string {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }
  return '';
}

/**
 * Base fetch wrapper with Telegram WebApp Authorization header
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const initData = getTelegramInitData();
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(initData ? { Authorization: `tma ${initData}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `HTTP error ${response.status}: ${response.statusText}`,
        code: data?.code || `HTTP_${response.status}`,
      };
    }

    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network request failed',
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
   * Fetch fridge space and product inventory
   */
  async getFridge(fridgeId: string): Promise<ApiResponse<FridgeSpace>> {
    return request<FridgeSpace>(`/fridges/${encodeURIComponent(fridgeId)}`, {
      method: 'GET',
    });
  },

  /**
   * Add a product to the fridge
   */
  async addProduct(
    fridgeId: string,
    product: Partial<ProductItem>
  ): Promise<ApiResponse<ProductItem>> {
    return request<ProductItem>(`/fridges/${encodeURIComponent(fridgeId)}/products`, {
      method: 'POST',
      body: JSON.stringify(product),
    });
  },

  /**
   * Update product (status, quantity, opened_at, etc.)
   */
  async updateProduct(
    fridgeId: string,
    productId: string,
    updates: Partial<ProductItem>
  ): Promise<ApiResponse<ProductItem>> {
    return request<ProductItem>(
      `/fridges/${encodeURIComponent(fridgeId)}/products/${encodeURIComponent(productId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
  },

  /**
   * Delete product
   */
  async deleteProduct(
    fridgeId: string,
    productId: string
  ): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
    return request<{ id: string; deleted: boolean }>(
      `/fridges/${encodeURIComponent(fridgeId)}/products/${encodeURIComponent(productId)}`,
      {
        method: 'DELETE',
      }
    );
  },

  /**
   * Create invitation link for family members
   */
  async createInvite(fridgeId: string): Promise<ApiResponse<{ invite_code: string; expires_at: string }>> {
    return request<{ invite_code: string; expires_at: string }>('/invites/create', {
      method: 'POST',
      body: JSON.stringify({ fridge_id: fridgeId }),
    });
  },

  /**
   * Claim invitation code and join fridge
   */
  async claimInvite(code: string): Promise<ApiResponse<{ fridge_id: string }>> {
    return request<{ fridge_id: string }>('/invites/claim', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },
};
