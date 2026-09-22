import React from 'react';
import type { ProductItem } from '@/types';
import { haptic } from '@/lib/haptics';
import { calculateFreshnessMetrics } from '@/lib/freshness';
import { Refrigerator, Snowflake, Archive, Check, Trash2, RotateCcw } from 'lucide-react';

interface ProductCardProps {
  product: ProductItem;
  onConsume?: (id: string) => void;
  onDiscard?: (id: string) => void;
  onRestore?: (id: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onConsume,
  onDiscard,
  onRestore,
}) => {
  const { daysLeft, spentPercent, statusTag } = calculateFreshnessMetrics(
    product.expires_at,
    product.created_at
  );

  const getStorageBadge = () => {
    switch (product.storage_type) {
      case 'freezer':
        return { label: 'Морозилка', icon: Snowflake, color: 'text-sky-400 bg-sky-950/40 border-sky-800/40' };
      case 'pantry':
        return { label: 'Шкаф', icon: Archive, color: 'text-amber-400 bg-amber-950/40 border-amber-800/40' };
      case 'fridge':
      default:
        return { label: 'Холод', icon: Refrigerator, color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' };
    }
  };

  const getProgressColor = () => {
    switch (statusTag) {
      case 'expired':
        return 'bg-rose-500';
      case 'expiring':
        return 'bg-amber-400';
      case 'fresh':
      default:
        return 'bg-emerald-500';
    }
  };

  const getDaysText = () => {
    if (product.status === 'consumed') return 'Съедено';
    if (product.status === 'discarded') return 'В утиле';
    if (daysLeft < 0) return `Истек ${Math.abs(daysLeft)} дн. назад`;
    if (daysLeft === 0) return 'Истекает сегодня';
    if (daysLeft === 1) return 'Истекает завтра';
    return `Осталось ${daysLeft} дн.`;
  };

  const storage = getStorageBadge();
  const StorageIcon = storage.icon;

  const handleConsume = () => {
    haptic.notification('success');
    onConsume?.(product.id);
  };

  const handleDiscard = () => {
    haptic.notification('warning');
    onDiscard?.(product.id);
  };

  const handleRestore = () => {
    haptic.impact('light');
    onRestore?.(product.id);
  };

  const isArchived = product.status !== 'active';

  return (
    <div className={`p-3.5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] space-y-2.5 transition-all shadow-xs ${
      isArchived ? 'opacity-70' : ''
    }`}>
      {/* Top Header: Name and Storage Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 flex-1 min-w-0">
          <h4 className="text-[15px] font-semibold text-[var(--text-primary)] leading-tight truncate">
            {product.name}
          </h4>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="truncate">{product.category}</span>
            <span>•</span>
            <span className="font-medium text-[var(--text-primary)]">
              {product.quantity} {product.unit}
            </span>
          </div>
        </div>

        {/* Zone Badge */}
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${storage.color}`}>
          <StorageIcon className="w-3 h-3" />
          <span>{storage.label}</span>
        </div>
      </div>

      {/* Freshness Bar (only for active products) */}
      {!isArchived && (
        <div className="space-y-1 pt-0.5">
          <div className="w-full bg-[var(--surface-subtle)] rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor()}`}
              style={{ width: `${Math.min(100, Math.max(8, spentPercent))}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer Details & Action Buttons */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium ${
            product.status === 'active'
              ? statusTag === 'expired'
                ? 'text-rose-400'
                : statusTag === 'expiring'
                ? 'text-amber-400'
                : 'text-emerald-400'
              : 'text-[var(--text-muted)]'
          }`}>
            {getDaysText()}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            ({product.expires_at})
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {isArchived ? (
            <button
              type="button"
              onClick={handleRestore}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--surface-subtle)] text-xs text-[var(--text-primary)] font-medium hover:bg-zinc-800 active:scale-95 transition-all"
            >
              <RotateCcw className="w-3 h-3 text-sky-400" />
              <span>Вернуть</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDiscard}
                title="В мусорку"
                className="p-1.5 rounded-xl hover:bg-rose-500/15 text-[var(--text-muted)] hover:text-rose-400 active:scale-90 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleConsume}
                title="Съедено"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-400 font-medium hover:bg-emerald-500/25 active:scale-95 transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Съедено</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
