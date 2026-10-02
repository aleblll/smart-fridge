export type StorageType = 'fridge' | 'freezer' | 'pantry';
export type UnitType = 'pcs' | 'kg' | 'g' | 'l' | 'pack';
export type ProductStatus = 'active' | 'consumed' | 'discarded';

export interface ProductItem {
  id: string;
  fridge_id?: string;
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
  after_opening_hours?: number | null;
  created_at?: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface UserProfile {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface FridgeSummary {
  id: string;
  name: string;
  role: 'owner' | 'member';
  created_at: string;
  updated_at: string;
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

export interface InviteResult {
  code: string;
  invite_code: string;
  expires_at: string;
}

export interface ClaimResult {
  fridge_id: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

