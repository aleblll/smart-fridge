import React, { useState } from 'react';
import type { ShoppingItem } from '@/types';
import { haptic, formatUnitRu } from '@/lib/haptics';
import {
  Check,
  Plus,
  Trash2,
  ShoppingCart,
  Refrigerator,
  Snowflake,
  Archive,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface ShoppingListTabProps {
  items: ShoppingItem[];
  onAddItem: (item: Partial<ShoppingItem>) => void;
  onToggleItem: (id: string, isChecked: boolean) => void;
  onDeleteItem: (id: string) => void;
  onTransferToFridge: () => void;
}

export const ShoppingListTab: React.FC<ShoppingListTabProps> = ({
  items,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onTransferToFridge,
}) => {
  const [inputText, setInputText] = useState('');
  const [storageType, setStorageType] = useState<'fridge' | 'freezer' | 'pantry'>('fridge');

  const checkedCount = items.filter((i) => i.is_checked === 1).length;
  const totalCount = items.length;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputText.trim();
    if (!clean) return;

    haptic.notification('success');
    onAddItem({
      name: clean,
      storage_type: storageType,
      quantity: 1,
      unit: 'шт',
      shelf_life_days: storageType === 'freezer' ? 90 : storageType === 'pantry' ? 60 : 7,
    });
    setInputText('');
  };

  const handleToggle = (id: string, currentChecked: number) => {
    haptic.selection();
    onToggleItem(id, currentChecked === 0);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    haptic.impact('light');
    onDeleteItem(id);
  };

  const handleTransfer = () => {
    if (checkedCount === 0) return;
    haptic.notification('success');
    onTransferToFridge();
  };

  return (
    <div className="space-y-4 pb-24 animate-fadeIn">
      {/* Quick Add Bar */}
      <form onSubmit={handleAdd} className="space-y-2">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Что нужно купить? (молоко, хлеб, яблоки...)"
            className="w-full pl-4 pr-12 py-3.5 rounded-2xl bg-[#2A3834]/80 border border-white/[0.08] text-sm text-[#F1F5F4] placeholder-[#8FA39D]/60 focus:outline-none focus:border-[#5E8B7E] focus:ring-1 focus:ring-[#5E8B7E] shadow-inner transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="absolute right-2 p-2 rounded-xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all shadow-md shadow-[#5E8B7E]/20"
            title="Добавить в список"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Storage zone destination toggle */}
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[11px] text-[#8FA39D]">Куда положить:</span>
          {(
            [
              { type: 'fridge', label: 'Холод', icon: Refrigerator },
              { type: 'freezer', label: 'Мороз', icon: Snowflake },
              { type: 'pantry', label: 'Шкаф', icon: Archive },
            ] as const
          ).map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                haptic.impact('light');
                setStorageType(type);
              }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all ${
                storageType === type
                  ? 'bg-[#5E8B7E] text-[#F1F5F4] font-semibold'
                  : 'bg-white/[0.04] text-[#8FA39D] hover:text-[#F1F5F4]'
              }`}
            >
              <Icon className="w-2.5 h-2.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </form>

      {/* Progress & Batch Action Bar */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-[#8FA39D]">
          <span>
            Куплено: <strong className="text-[#F1F5F4]">{checkedCount}</strong> из {totalCount}
          </span>
          {checkedCount > 0 && (
            <button
              type="button"
              onClick={handleTransfer}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-xs font-medium text-[#F1F5F4] shadow-md shadow-[#5E8B7E]/20 hover:brightness-105 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#A7C7E7]" />
              <span>В холодильник ({checkedCount})</span>
            </button>
          )}
        </div>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="py-12 px-4 rounded-3xl backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#5E8B7E]/10 flex items-center justify-center text-[#5E8B7E]">
            <ShoppingCart className="w-6 h-6 stroke-[1.5]" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-[#F1F5F4]">Список покупок пуст</h4>
            <p className="text-xs text-[#8FA39D] max-w-xs mx-auto">
              Добавляйте то, что закончилось, или отмечайте продукты из холодильника кнопкой «В покупки».
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isChecked = item.is_checked === 1;
            return (
              <div
                key={item.id}
                onClick={() => handleToggle(item.id, item.is_checked)}
                className={`group flex items-center justify-between p-3.5 rounded-2xl backdrop-blur-xl border transition-all duration-200 cursor-pointer active:scale-[0.99] select-none ${
                  isChecked
                    ? 'bg-white/[0.02] border-white/[0.04] opacity-55'
                    : 'bg-white/[0.04] border-white/[0.08] hover:border-white/[0.14]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Custom Checkbox */}
                  <div
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                      isChecked
                        ? 'bg-[#5E8B7E] border-[#5E8B7E] text-[#F1F5F4]'
                        : 'border-white/20 bg-white/[0.02] group-hover:border-[#5E8B7E]'
                    }`}
                  >
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </div>

                  {/* Name & Details */}
                  <div className="min-w-0">
                    <span
                      className={`text-[14px] leading-tight block truncate ${
                        isChecked ? 'line-through text-[#8FA39D]' : 'text-[#F1F5F4] font-medium'
                      }`}
                    >
                      {item.name}
                    </span>
                    <span className="text-[11px] text-[#8FA39D] flex items-center gap-1.5 pt-0.5">
                      <span>
                        {item.quantity} {formatUnitRu(item.unit)}
                      </span>
                      <span>•</span>
                      <span className="font-mono">
                        {item.storage_type === 'freezer'
                          ? 'Морозилка'
                          : item.storage_type === 'pantry'
                          ? 'Шкаф'
                          : 'Холод'}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, item.id)}
                  className="p-1.5 text-[#8FA39D]/50 hover:text-[#EBAEB7] hover:bg-rose-950/20 rounded-lg active:scale-90 transition-all ml-2 shrink-0"
                  title="Удалить из списка"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Primary Bottom Action (when checked items > 0) */}
      {checkedCount > 0 && (
        <div className="fixed bottom-5 left-0 right-0 max-w-md mx-auto px-4 pointer-events-none z-30">
          <button
            type="button"
            onClick={handleTransfer}
            className="pointer-events-auto w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] font-semibold text-sm shadow-xl shadow-[#5E8B7E]/30 hover:brightness-105 active:scale-[0.985] transition-all"
          >
            <span>Положить купленное в холодильник ({checkedCount})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
