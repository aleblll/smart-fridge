import type { UnitType } from './index';

export interface FoodPreset {
  id: string;
  name: string;
  category: string;
  synonyms: string[];
  shelf_life_days: {
    fridge: number | null;
    freezer: number | null;
    pantry: number | null;
  };
  after_opening_hours?: number | null;
  risk_level?: 'low' | 'medium' | 'high';
  sanpin_ref?: string;
  storage_tips?: string;
  default_unit: UnitType;
  notify_before_days: number;
}
