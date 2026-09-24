import React, { useState } from 'react';
import type { ProductItem } from '@/types';
import { haptic } from '@/lib/haptics';
import { calculateFreshnessMetrics } from '@/lib/freshness';
import { getFoodVisual } from '@/lib/foodVisuals';
import { Snowflake, Archive, Check, Trash2, RotateCcw, ChevronRight } from 'lucide-react';

interface ProductCardProps {
  product: ProductItem;
  onConsume?: (id: string) => void;
  onDiscard?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onConsume,
  onDiscard,
  onRestore,
  onDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { daysLeft, spentPercent, statusTag } = calculateFreshnessMetrics(
    product.expires_at,
    product.created_at
  );

  const visual = getFoodVisual(product.name, product.category);
  const isArchived = product.status !== 'active';

  // Mindora freshness 3px bar color
  const getProgressColor = () => {
    switch (statusTag) {
      case 'expired':
        return 'bg-[#EBAEB7]'; // Soft Coral warning
      case 'expiring':
        return 'bg-[#EBAEB7]'; // Coral for expiring soon
      case 'fresh':
      default:
        return 'bg-[#5E8B7E]'; // Sage for fresh
    }
  };

  const getDaysStatus = () => {
    if (product.status === 'consumed') return { label: 'Съедено', color: 'text-[#8FA39D]' };
    if (product.status === 'discarded') return { label: 'В утиле', color: 'text-[#8FA39D]' };
    if (daysLeft < 0) return { label: `Истек ${Math.abs(daysLeft)} дн. назад`, color: 'text-[#EBAEB7]' };
    if (daysLeft === 0) return { label: 'Истекает сегодня', color: 'text-[#EBAEB7] font-semibold' };
    if (daysLeft === 1) return { label: 'Истекает завтра', color: 'text-[#EBAEB7]' };
    if (daysLeft <= 3) return { label: `Осталось ${daysLeft} дня`, color: 'text-[#EBAEB7]' };
    return { label: `Осталось ${daysLeft} дн.`, color: 'text-[#8FA39D]' };
  };

  const status = getDaysStatus();

  const handleCardClick = () => {
    haptic.impact('light');
    setIsExpanded((prev) => !prev);
  };

  const handleConsume = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.notification('success');
    onConsume?.(product.id);
  };

  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.notification('warning');
    onDiscard?.(product.id);
  };

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.impact('light');
    onRestore?.(product.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.impact('medium');
    onDelete?.(product.id);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative rounded-2xl bg-[#222E2B] border border-white/[0.06] p-3.5 transition-all duration-200 cursor-pointer active:scale-[0.99] select-none ${
        isArchived ? 'opacity-70' : 'hover:border-white/[0.12]'
      }`}
    >
      <div className="flex items-center gap-3.5">
        {/* Food Visual Hero (25-35% expressive image/emoji container) */}
        <div className="w-14 h-14 shrink-0 rounded-xl bg-[#2A3834] border border-white/[0.04] flex items-center justify-center text-2xl shadow-inner transition-transform group-hover:scale-105">
          <span>{visual.emoji}</span>
        </div>

        {/* Product Details */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-[15px] font-medium text-[#F1F5F4] leading-snug truncate">
              {product.name}
            </h4>

            {/* Storage zone micro-icon */}
            {product.storage_type === 'freezer' && (
              <span className="shrink-0 text-[#A7C7E7] text-xs flex items-center gap-0.5 font-mono" title="Морозилка">
                <Snowflake className="w-3.5 h-3.5" />
              </span>
            )}
            {product.storage_type === 'pantry' && (
              <span className="shrink-0 text-[#8FA39D] text-xs flex items-center gap-0.5 font-mono" title="Шкаф">
                <Archive className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#8FA39D] truncate">
              {product.quantity} {product.unit} • {product.category}
            </span>
            <span className={`shrink-0 text-[11px] font-mono ${status.color}`}>
              {status.label}
            </span>
          </div>

          {/* Delicate 3px Freshness Progress Bar (Mindora section 12 style) */}
          {!isArchived && (
            <div className="pt-1">
              <div className="w-full bg-[#1A2421] rounded-full h-[3px] overflow-hidden">
                <div
                  className={`h-[3px] rounded-full transition-all duration-300 ${getProgressColor()}`}
                  style={{ width: `${Math.min(100, Math.max(6, spentPercent))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Minimal indicator to hint expandability */}
        <div className="shrink-0 text-[#8FA39D]/40 pl-1">
          <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-[#8FA39D]' : ''}`} />
        </div>
      </div>

      {/* Contextual Action Drawer / Quick Actions (Revealed cleanly on tap) */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between animate-fadeIn"
        >
          <div className="text-[11px] text-[#8FA39D] font-mono">
            Годен до {product.expires_at}
          </div>

          <div className="flex items-center gap-2">
            {isArchived ? (
              <>
                <button
                  type="button"
                  onClick={handleRestore}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2A3834] text-xs text-[#F1F5F4] hover:bg-[#344641] active:scale-95 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#A7C7E7]" />
                  <span>Вернуть</span>
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="p-1.5 rounded-xl text-[#8FA39D] hover:text-[#EBAEB7] hover:bg-rose-950/20 active:scale-95 transition-all"
                    title="Удалить навсегда"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2A3834] text-xs text-[#EBAEB7] hover:bg-rose-950/30 active:scale-95 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>В утиль</span>
                </button>
                <button
                  type="button"
                  onClick={handleConsume}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#5E8B7E] text-xs text-[#F1F5F4] font-medium hover:bg-[#4E756A] active:scale-95 transition-all shadow-xs"
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Съедено</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
