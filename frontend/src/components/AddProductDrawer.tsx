import React, { useState, useRef, useEffect } from 'react';
import { Drawer } from 'vaul';
import { haptic } from '@/lib/haptics';
import { searchPresets, calculateExpirationDate, getRecommendedStorage } from '@/lib/presets';
import type { FoodPreset } from '@/types/presets';
import type { ProductItem, StorageType, UnitType } from '@/types';
import { Plus, Minus, Check, Refrigerator, Snowflake, Archive, Search } from 'lucide-react';

interface AddProductDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProduct: (product: Omit<ProductItem, 'id' | 'added_by' | 'updated_at'>) => void;
}

const STORAGE_OPTIONS: { type: StorageType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { type: 'fridge', label: 'Холодильник', icon: Refrigerator },
  { type: 'freezer', label: 'Морозилка', icon: Snowflake },
  { type: 'pantry', label: 'Шкаф', icon: Archive },
];

const UNIT_OPTIONS: { unit: UnitType; label: string }[] = [
  { unit: 'pcs', label: 'шт' },
  { unit: 'kg', label: 'кг' },
  { unit: 'g', label: 'г' },
  { unit: 'l', label: 'л' },
  { unit: 'pack', label: 'уп' },
];

const QUICK_CATEGORIES = [
  'Все',
  'Молочная продукция',
  'Сыры',
  'Мясо и птица',
  'Овощи и зелень',
  'Фрукты и ягоды',
  'Рыба и морепродукты',
  'Бакалея и консервы',
];

export const AddProductDrawer: React.FC<AddProductDrawerProps> = ({
  open,
  onOpenChange,
  onAddProduct,
}) => {
  const [name, setName] = useState('');
  const [selectedCat, setSelectedCat] = useState('Все');
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

  // Filter presets based on current query and category
  const filteredPresets = searchPresets(name, 10).filter((p) => {
    if (selectedCat === 'Все') return true;
    return p.category === selectedCat;
  });

  // Auto-focus input on drawer open
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setName('');
      setSelectedCat('Все');
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

  const handleQuantityChange = (delta: number) => {
    haptic.impact('light');
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  const handleStorageChange = (type: StorageType) => {
    haptic.impact('light');
    setStorageType(type);
  };

  const handleUnitChange = (newUnit: UnitType) => {
    haptic.selection();
    setUnit(newUnit);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      haptic.notification('error');
      return;
    }

    haptic.notification('success');

    onAddProduct({
      name: name.trim(),
      category: selectedCat === 'Все' ? 'Другое' : selectedCat,
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
        <Drawer.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 transition-opacity" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[var(--surface-card)] border-t border-[var(--border-strong)] rounded-t-3xl z-50 p-5 pb-8 space-y-4 outline-none max-h-[90vh] overflow-y-auto">
          {/* Drawer Handle */}
          <div className="flex justify-center pb-0.5">
            <div className="w-12 h-1.5 rounded-full bg-zinc-600/40" />
          </div>

          <div className="flex items-center justify-between">
            <Drawer.Title className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
              Добавить продукт
            </Drawer.Title>
            <span className="text-xs text-[var(--text-muted)]">120+ готовых подсказок</span>
          </div>

          {/* Quick Categories Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {QUICK_CATEGORIES.map((cat) => {
              const isSelected = selectedCat === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setSelectedCat(cat);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input with Search Icon */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
              <input
                id="product-name"
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Поиск или свое название (молоко, сыр...)"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-sky-500/50"
                autoComplete="off"
              />
            </div>

            {/* Quick 1-tap Presets Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {name.length >= 2 ? 'Найденные подсказки (нажмите для добавления):' : 'Популярные продукты:'}
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                {filteredPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] hover:border-sky-500/50 active:scale-95 transition-all"
                  >
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-[10px] text-sky-400 font-mono">
                      +{preset.shelf_life_days.fridge ?? preset.shelf_life_days.pantry ?? 3}д
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Storage Zone Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)]">
                Куда кладем
              </label>
              <div className="grid grid-cols-3 gap-2">
                {STORAGE_OPTIONS.map(({ type, label, icon: Icon }) => {
                  const isSelected = storageType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleStorageChange(type)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-sky-500/15 border-sky-500 text-sky-400 font-semibold'
                          : 'bg-[var(--surface-subtle)] border-transparent text-[var(--text-muted)]'
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
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(-1)}
                    className="p-1 rounded-lg hover:bg-zinc-700/40 active:scale-95 text-[var(--text-primary)]"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-sm font-semibold">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(1)}
                    className="p-1 rounded-lg hover:bg-zinc-700/40 active:scale-95 text-[var(--text-primary)]"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">
                  Единицы
                </label>
                <div className="flex rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] p-0.5">
                  {UNIT_OPTIONS.map(({ unit: u, label }) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => handleUnitChange(u)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono transition-all ${
                        unit === u
                          ? 'bg-sky-500 text-slate-950 font-semibold shadow-xs'
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
                Срок годности (до)
              </label>
              <input
                id="expiry-date"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-sky-500/50"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold active:scale-[0.985] transition-all shadow-md"
            >
              <Check className="w-4 h-4" />
              <span>Добавить в холодильник</span>
            </button>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
