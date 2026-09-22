import React, { useState, useRef, useEffect } from 'react';
import { Drawer } from 'vaul';
import { haptic } from '@/lib/haptics';
import { searchPresets, calculateExpirationDate, getRecommendedStorage } from '@/lib/presets';
import type { FoodPreset } from '@/types/presets';
import type { ProductItem, StorageType, UnitType } from '@/types';
import { Plus, Minus, Check, Refrigerator, Snowflake, Archive, Sparkles } from 'lucide-react';

interface AddProductDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProduct: (product: Omit<ProductItem, 'id' | 'added_by' | 'updated_at'>) => void;
}

const STORAGE_OPTIONS: { type: StorageType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { type: 'fridge', label: 'Холод', icon: Refrigerator },
  { type: 'freezer', label: 'Мороз', icon: Snowflake },
  { type: 'pantry', label: 'Шкаф', icon: Archive },
];

const UNIT_OPTIONS: { unit: UnitType; label: string }[] = [
  { unit: 'pcs', label: 'шт' },
  { unit: 'kg', label: 'кг' },
  { unit: 'g', label: 'г' },
  { unit: 'l', label: 'л' },
  { unit: 'pack', label: 'уп' },
];

export const AddProductDrawer: React.FC<AddProductDrawerProps> = ({
  open,
  onOpenChange,
  onAddProduct,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Другое');
  const [storageType, setStorageType] = useState<StorageType>('fridge');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<UnitType>('pcs');
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().slice(0, 10);
  });
  const [notifyBeforeDays] = useState(2);

  const inputRef = useRef<HTMLInputElement>(null);

  // Filter presets based on current input name
  const filteredPresets = searchPresets(name, 8);

  // Auto-focus input on drawer open
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    } else {
      // Reset form on close
      setName('');
      setCategory('Другое');
      setStorageType('fridge');
      setQuantity(1);
      setUnit('pcs');
    }
  }, [open]);

  // Quick 1-tap addition via preset chip
  const handleSelectPreset = (preset: FoodPreset) => {
    const recommendedStorage = getRecommendedStorage(preset);
    const calculatedExpiry = calculateExpirationDate(preset, recommendedStorage);

    haptic.notification('success');

    onAddProduct({
      name: preset.name,
      category: preset.category,
      storage_type: recommendedStorage,
      quantity: 1,
      unit: preset.default_unit || 'pcs',
      opened_at: null,
      expires_at: calculatedExpiry,
      notify_before_days: preset.notify_before_days || 2,
      status: 'active',
    });

    onOpenChange(false);
  };

  // Quantity stepper
  const handleQuantityChange = (delta: number) => {
    haptic.impact('light');
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  // Storage tab switch
  const handleStorageChange = (type: StorageType) => {
    haptic.impact('light');
    setStorageType(type);
  };

  // Unit switch
  const handleUnitChange = (newUnit: UnitType) => {
    haptic.selection();
    setUnit(newUnit);
  };

  // Manual submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      haptic.notification('error');
      return;
    }

    haptic.notification('success');

    onAddProduct({
      name: name.trim(),
      category,
      storage_type: storageType,
      quantity,
      unit,
      opened_at: null,
      expires_at: expiresAt,
      notify_before_days: notifyBeforeDays,
      status: 'active',
    });

    onOpenChange(false);
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 transition-opacity" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[var(--surface-card)] border-t border-[var(--border-strong)] rounded-t-2xl z-50 p-4 pb-8 space-y-4 outline-none focus:outline-none max-h-[90vh] overflow-y-auto">
          {/* Drawer Drag Handle */}
          <div className="flex justify-center pb-1">
            <div className="w-10 h-1 rounded-full bg-zinc-600/50" />
          </div>

          <div className="flex items-center justify-between">
            <Drawer.Title className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              Добавить продукт
            </Drawer.Title>
            <span className="text-xs font-mono text-[var(--text-muted)]">СанПиН справочник</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name Input with Auto-Focus */}
            <div className="space-y-1.5">
              <label htmlFor="product-name" className="text-xs font-medium text-[var(--text-muted)]">
                Наименование
              </label>
              <input
                id="product-name"
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Творог 9% или Молоко"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
                autoComplete="off"
              />
            </div>

            {/* Predictive Chips (Instant 1-tap add) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Быстрый выбор (1 тап для добавления):</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                {filteredPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] hover:border-[var(--border-strong)] active:scale-[0.98] transition-transform"
                  >
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      +{preset.shelf_life_days.fridge ?? preset.shelf_life_days.pantry ?? 3}д
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Storage Zone Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">
                Зона хранения
              </label>
              <div className="grid grid-cols-3 gap-2">
                {STORAGE_OPTIONS.map(({ type, label, icon: Icon }) => {
                  const isSelected = storageType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleStorageChange(type)}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-[var(--surface-subtle)] border-[var(--border-strong)] text-[var(--text-primary)] font-semibold'
                          : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity and Units */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">
                  Количество
                </label>
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(-1)}
                    className="p-1 rounded hover:bg-zinc-700/30 active:scale-95 text-[var(--text-primary)]"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-sm font-semibold">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(1)}
                    className="p-1 rounded hover:bg-zinc-700/30 active:scale-95 text-[var(--text-primary)]"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">
                  Единицы
                </label>
                <div className="flex rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-subtle)] p-0.5">
                  {UNIT_OPTIONS.map(({ unit: u, label }) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => handleUnitChange(u)}
                      className={`flex-1 py-1.5 rounded text-xs font-mono transition-all ${
                        unit === u
                          ? 'bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold shadow-xs'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Expiration Date */}
            <div className="space-y-1.5">
              <label htmlFor="expiry-date" className="text-xs font-medium text-[var(--text-muted)]">
                Годен до
              </label>
              <input
                id="expiry-date"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono focus:outline-none"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[var(--tg-button)] text-[var(--tg-button-text)] text-sm font-semibold active:scale-[0.985] transition-transform"
            >
              <Check className="w-4 h-4" />
              <span>Сохранить в инвентарь</span>
            </button>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
