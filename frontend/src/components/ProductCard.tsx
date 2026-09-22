import React from 'react';
import type { ProductItem } from '@/types';
import { haptic } from '@/lib/haptics';
import { calculateFreshnessMetrics } from '@/lib/freshness';
import { Refrigerator, Snowflake, Archive, Check, Trash2 } from 'lucide-react';

interface ProductCardProps {
  product: ProductItem;
  onConsume: (id: string) => void;
  onDiscard: (id: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onConsume,
  onDiscard,
}) => {
  const { daysLeft, spentPercent, statusTag, statusLabel } = calculateFreshnessMetrics(
    product.expires_at,
    product.created_at
  );

  const getStorageIcon = () => {
    switch (product.storage_type) {
      case 'freezer':
        return <Snowflake className="w-3.5 h-3.5 text-blue-400" />;
      case 'pantry':
        return <Archive className="w-3.5 h-3.5 text-amber-300" />;
      case 'fridge':
      default:
        return <Refrigerator className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const getProgressBarColor = () => {
    switch (statusTag) {
      case 'expired':
        return 'bg-rose-500';
      case 'expiring':
        return 'bg-amber-400';
      case 'fresh':
      default:
        return 'bg-zinc-400';
    }
  };

  const getStatusTextColor = () => {
    switch (statusTag) {
      case 'expired':
        return 'text-rose-400';
      case 'expiring':
        return 'text-amber-400';
      case 'fresh':
      default:
        return 'text-[var(--text-muted)]';
    }
  };

  const handleConsume = () => {
    haptic.notification('success');
    onConsume(product.id);
  };

  const handleDiscard = () => {
    haptic.notification('warning');
    onDiscard(product.id);
  };

  return (
    <div className="p-3 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] space-y-2.5 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            {getStorageIcon()}
            <h4 className="text-sm font-semibold text-[var(--text-primary)] leading-tight">
              {product.name}
            </h4>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] font-mono">
            {product.category} • {product.quantity} {product.unit}
          </p>
        </div>

        {/* Status Badge */}
        <span className={`text-[11px] font-medium font-mono ${getStatusTextColor()}`}>
          {statusLabel}
        </span>
      </div>

      {/* Relative Progress Bar */}
      <div className="space-y-1">
        <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
            style={{ width: `${Math.min(100, Math.max(10, spentPercent))}%` }}
          />
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
        <span className="text-[10px] text-[var(--text-muted)] font-mono">
          Годен: {product.expires_at} ({daysLeft > 0 ? `${daysLeft}д` : 'истек'})
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDiscard}
            title="Списать в утиль"
            className="p-1.5 rounded hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-400 active:scale-90 transition-transform"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleConsume}
            title="Съедено"
            className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-medium hover:border-[var(--border-strong)] active:scale-95 transition-all"
          >
            <Check className="w-3 h-3 text-emerald-400" />
            <span>Съедено</span>
          </button>
        </div>
      </div>
    </div>
  );
};
