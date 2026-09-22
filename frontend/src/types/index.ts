export type StorageType = 'fridge' | 'freezer' | 'pantry';
export type UnitType = 'pcs' | 'kg' | 'g' | 'l' | 'pack';
export type ProductStatus = 'active' | 'consumed' | 'discarded';

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  storage_type: StorageType;
  quantity: number;
  unit: UnitType;
  opened_at: string | null;
  expires_at: string;
  notify_before_days: number;
  status: ProductStatus;
  added_by: number;
  created_at?: string;
  updated_at: string;
}

export interface UserProfile {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface FridgeSpace {
  id: string;
  name: string;
  owner_id: number;
  members: number[];
  products: ProductItem[];
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
