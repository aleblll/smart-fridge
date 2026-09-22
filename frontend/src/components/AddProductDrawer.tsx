import React, { useState, useRef, useEffect } from 'react';
import { Drawer } from 'vaul';
import { haptic } from '@/lib/haptics';
import { searchPresets, calculateExpirationDate, getRecommendedStorage } from '@/lib/presets';
import { logger } from '@/lib/logger';
import type { FoodPreset } from '@/types/presets';
import type { ProductItem, StorageType, UnitType } from '@/types';
import { Plus, Minus, Check, Refrigerator, Snowflake, Archive, Search, Calendar, Sparkles, X } from 'lucide-react';

interface AddProductDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProduct: (product: Omit<ProductItem, 'id' | 'added_by' | 'updated_at'>) => void;
}

const STORAGE_OPTIONS: { type: StorageType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { type: 'fridge', label: 'Холод', icon: Refrigerator },
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

const QUICK_DAYS = [
  { days: 2, label: '+2 дня' },
  { days: 4, label: '+4 дня' },
  { days: 7, label: '+1 нед' },
  { days: 14, label: '+2 нед' },
  { days: 30, label: '+1 мес' },
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
  const [daysOffset, setDaysOffset] = useState<number>(5);
  const [expiresAt, setExpiresAt] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().slice(0, 10);
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // Filter presets matching search
  const filteredPresets = searchPresets(name, 8);

  // Set date from days offset
  const setDays = (days: number) => {
    haptic.impact('light');
    setDaysOffset(days);
    const d = new Date();
    d.setDate(d.getDate() + days);
    setExpiresAt(d.toISOString().slice(0, 10));
  };

  // Adjust exact date by delta days
  const adjustDateDays = (delta: number) => {
    haptic.impact('light');
    const current = new Date(expiresAt || Date.now());
    current.setDate(current.getDate() + delta);
    const newStr = current.toISOString().slice(0, 10);
    setExpiresAt(newStr);

    const diffDays = Math.round((current.getTime() - Date.now()) / 86400000);
    setDaysOffset(diffDays);
  };

  // On drawer open, auto focus
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 180);
      return () => clearTimeout(timer);
    } else {
      setName('');
      setCategory('Другое');
      setStorageType('fridge');
      setQuantity(1);
      setUnit('pcs');
      setDays(5);
    }
  }, [open]);

  // Click on preset chip: autofills form WITHOUT closing abruptly
  const handleSelectPreset = (preset: FoodPreset) => {
    haptic.impact('medium');
    setName(preset.name);
    setCategory(preset.category);

    const recommendedStorage = getRecommendedStorage(preset);
    setStorageType(recommendedStorage);

    const calculatedExpiry = calculateExpirationDate(preset, recommendedStorage);
    setExpiresAt(calculatedExpiry);

    const days = preset.shelf_life_days[recommendedStorage] ?? 5;
    setDaysOffset(days);

    if (preset.default_unit) {
      setUnit(preset.default_unit);
    }

    logger.info('UI', `Autofilled preset: ${preset.name}, shelf life: ${days}d`);
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
      category: category || 'Другое',
      storage_type: storageType,
      quantity,
      unit,
      opened_at: null,
      expires_at: expiresAt,
      notify_before_days: 2,
      status: 'active',
    });

    logger.info('INVENTORY', `Added product: ${name.trim()} (${quantity} ${unit}) expires: ${expiresAt}`);
    onOpenChange(false);
  };

  // Format date display in Russian
  const formatHumanDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(dateStr);
      target.setHours(0, 0, 0, 0);
      const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

      const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      const dateFormatted = `${d.getDate()} ${months[d.getMonth()]}`;

      if (diffDays === 0) return `${dateFormatted} (сегодня)`;
      if (diffDays === 1) return `${dateFormatted} (завтра)`;
      if (diffDays < 0) return `${dateFormatted} (просрочено)`;
      return `${dateFormatted} (через ${diffDays} дн.)`;
    } catch {
      return dateStr;
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 transition-opacity" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[#14171b] border-t border-zinc-800 rounded-t-3xl z-50 p-5 space-y-4 outline-none max-h-[92vh] flex flex-col text-slate-100">
          {/* Drawer Handle */}
          <div className="flex justify-center pb-0.5">
            <div className="w-12 h-1.5 rounded-full bg-zinc-700/60" />
          </div>

          {/* Drawer Header */}
          <div className="flex items-center justify-between">
            <Drawer.Title className="text-lg font-bold tracking-tight text-white">
              Добавить продукт
            </Drawer.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
            <form id="add-product-form" onSubmit={handleSubmit} className="space-y-4">
              {/* Product Name Input */}
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-400" />
                  <input
                    id="product-name"
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Название (молоко, сыр, рыба...)"
                    className="w-full pl-10 pr-10 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    autoComplete="off"
                  />
                  {name && (
                    <button
                      type="button"
                      onClick={() => setName('')}
                      className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Preset Chips */}
                {filteredPresets.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                    {filteredPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200 hover:border-sky-500 hover:text-sky-400 active:scale-95 transition-all whitespace-nowrap"
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span className="font-medium">{preset.name}</span>
                        <span className="text-[10px] text-sky-400 font-mono">
                          +{preset.shelf_life_days.fridge ?? preset.shelf_life_days.pantry ?? 3}д
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Expiration Date Section (PROMINENT AND CUSTOMIZABLE) */}
              <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                    <Calendar className="w-4 h-4 text-sky-400" />
                    <span>Срок годности:</span>
                  </div>
                  <span className="text-xs font-bold text-sky-400 font-mono">
                    {formatHumanDate(expiresAt)}
                  </span>
                </div>

                {/* Quick Days Selector Chips */}
                <div className="flex items-center gap-1.5">
                  {QUICK_DAYS.map(({ days, label }) => {
                    const isSelected = daysOffset === days;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setDays(days)}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-sky-500 text-slate-950 font-bold shadow-xs'
                            : 'bg-zinc-800/80 text-zinc-300 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Fine-Tuning Date Stepper & Native Date Input */}
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
                  <button
                    type="button"
                    onClick={() => adjustDateDays(-1)}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-800 text-xs font-medium hover:bg-zinc-700 active:scale-95"
                  >
                    -1 день
                  </button>

                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => {
                      setExpiresAt(e.target.value);
                      const diff = Math.round((new Date(e.target.value).getTime() - Date.now()) / 86400000);
                      setDaysOffset(diff);
                    }}
                    className="flex-1 py-1.5 px-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-center text-white font-mono focus:outline-none focus:border-sky-500"
                  />

                  <button
                    type="button"
                    onClick={() => adjustDateDays(1)}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-800 text-xs font-medium hover:bg-zinc-700 active:scale-95"
                  >
                    +1 день
                  </button>
                </div>
              </div>

              {/* Storage Zone Selector */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Зона хранения</span>
                <div className="grid grid-cols-3 gap-2">
                  {STORAGE_OPTIONS.map(({ type, label, icon: Icon }) => {
                    const isSelected = storageType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          haptic.impact('light');
                          setStorageType(type);
                        }}
                        className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-sky-500/15 border-sky-500 text-sky-400 font-bold'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
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
                  <span className="text-xs font-medium text-zinc-400">Количество</span>
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        haptic.impact('light');
                        setQuantity((q) => Math.max(1, q - 1));
                      }}
                      className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-300"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-mono text-sm font-bold text-white">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => {
                        haptic.impact('light');
                        setQuantity((q) => q + 1);
                      }}
                      className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-300"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-400">Единицы</span>
                  <div className="flex rounded-xl bg-zinc-900 border border-zinc-800 p-0.5">
                    {UNIT_OPTIONS.map(({ unit: u, label }) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          haptic.selection();
                          setUnit(u);
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono transition-all ${
                          unit === u
                            ? 'bg-sky-500 text-slate-950 font-bold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </form>
          </div>

          {/* Sticky Bottom Submit Button (ALWAYS VISIBLE) */}
          <div className="pt-2 border-t border-zinc-800/80">
            <button
              type="submit"
              form="add-product-form"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold active:scale-[0.985] transition-all shadow-lg shadow-sky-950/40"
            >
              <Check className="w-4 h-4" />
              <span>Положить в холодильник</span>
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
