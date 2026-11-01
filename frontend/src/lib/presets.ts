import presetsData from '@/data/foodPresets.json';
import type { FoodPreset } from '@/types/presets';
import type { StorageType } from '@/types';

export const ALL_PRESETS: FoodPreset[] = presetsData as unknown as FoodPreset[];

// Popular presets for instant 1-tap chip suggestions before typing
export const DEFAULT_QUICK_PRESETS: FoodPreset[] = ALL_PRESETS.slice(0, 8);

/**
 * Filter food presets by query (matches name or synonyms)
 */
export function searchPresets(query: string, limit: number = 10): FoodPreset[] {
  const clean = query.trim().toLowerCase();
  if (clean.length < 2) {
    return DEFAULT_QUICK_PRESETS.slice(0, limit);
  }

  const matches: FoodPreset[] = [];

  for (const preset of ALL_PRESETS) {
    const nameMatch = preset.name.toLowerCase().includes(clean);
    const synonymMatch = preset.synonyms?.some(s => s.toLowerCase().includes(clean));

    if (nameMatch || synonymMatch) {
      matches.push(preset);
      if (matches.length >= limit) break;
    }
  }

  return matches;
}

/**
 * Calculate expiration date in YYYY-MM-DD based on preset and storage type
 */
export function calculateExpirationDate(preset: FoodPreset, storageType: StorageType = 'fridge'): string {
  const days = preset.shelf_life_days[storageType] ?? preset.shelf_life_days.fridge ?? 3;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Determine default storage type from preset availability
 */
export function getRecommendedStorage(preset: FoodPreset): StorageType {
  if (preset.shelf_life_days.fridge !== null) return 'fridge';
  if (preset.shelf_life_days.pantry !== null) return 'pantry';
  if (preset.shelf_life_days.freezer !== null) return 'freezer';
  return 'fridge';
}
