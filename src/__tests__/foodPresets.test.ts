import { describe, it, expect } from 'vitest';
import foodPresets from '../data/foodPresets.json';

describe('SanPiN & USDA Food Presets Dataset Validation', () => {
  const allowedCategories = [
    'Молочная продукция',
    'Сыры',
    'Мясо и птица',
    'Рыба и морепродукты',
    'Овощи и зелень',
    'Фрукты и ягоды',
    'Готовая кулинария',
    'Полуфабрикаты',
    'Бакалея и консервы',
    'Напитки',
    'Соусы и приправы'
  ];

  const allowedRiskLevels = ['extreme', 'high', 'medium', 'low'];
  const allowedUnits = ['pcs', 'kg', 'g', 'l', 'pack'];
  const idPattern = /^[a-z0-9_-]+$/;

  it('should contain at least 120 food items', () => {
    expect(foodPresets.length).toBeGreaterThanOrEqual(120);
  });

  it('should cover all 11 categories', () => {
    const categories = new Set(foodPresets.map((item) => item.category));
    expect(categories.size).toBe(11);
    allowedCategories.forEach((cat) => {
      expect(categories.has(cat)).toBe(true);
    });
  });

  it('should have unique IDs matching kebab-case format', () => {
    const ids = new Set<string>();
    foodPresets.forEach((item) => {
      expect(item.id).toMatch(idPattern);
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
    });
  });

  it('should validate structure and required properties of each item', () => {
    foodPresets.forEach((item) => {
      expect(item.name.length).toBeGreaterThanOrEqual(2);
      expect(item.name.length).toBeLessThanOrEqual(64);
      expect(allowedCategories).toContain(item.category);
      expect(Array.isArray(item.synonyms)).toBe(true);
      expect(allowedRiskLevels).toContain(item.risk_level);
      expect(allowedUnits).toContain(item.default_unit);
      expect(item.notify_before_days).toBeGreaterThanOrEqual(0);
      expect(item.notify_before_days).toBeLessThanOrEqual(7);

      // shelf_life_days check
      expect(item.shelf_life_days).toHaveProperty('fridge');
      expect(item.shelf_life_days).toHaveProperty('freezer');
      expect(item.shelf_life_days).toHaveProperty('pantry');
    });
  });
});
