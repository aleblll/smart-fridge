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
      className={`group relative rounded-2xl backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.25)] p-3.5 transition-all duration-200 cursor-pointer active:scale-[0.99] select-none ${
        isArchived ? 'opacity-65' : 'hover:border-white/[0.14]'
      }`}
    >
      <div className="flex items-center gap-3.5">
        {/* Food Visual Hero (25-35% expressive image/emoji container) */}
        <div className="w-14 h-14 shrink-0 rounded-xl backdrop-blur-md bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-2xl shadow-inner transition-transform group-hover:scale-105">
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

        {/* Right Action: Quick Check button for active items (1-tap consume) */}
        {!isArchived ? (
          <div className="flex items-center gap-2 shrink-0 pl-1">
            <button
              type="button"
              onClick={handleConsume}
              className="w-9 h-9 rounded-full bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] shadow-lg shadow-[#5E8B7E]/25 hover:brightness-110 active:scale-90 transition-all flex items-center justify-center border border-white/10 shrink-0"
              title="Отметить съеденным (в 1 тап)"
              aria-label="Отметить съеденным"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
            </button>
            <div className="text-[#8FA39D]/40">
              <ChevronRight
                className={`w-4 h-4 transition-transform duration-200 ${
                  isExpanded ? 'rotate-90 text-[#8FA39D]' : ''
                }`}
              />
            </div>
          </div>
        ) : (
          <div className="shrink-0 text-[#8FA39D]/40 pl-1">
            <ChevronRight
              className={`w-4 h-4 transition-transform duration-200 ${
                isExpanded ? 'rotate-90 text-[#8FA39D]' : ''
              }`}
            />
          </div>
        )}
      </div>

      {/* Contextual Action Drawer / Quick Actions (Revealed cleanly on tap) */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between animate-fadeIn text-xs"
        >
          <div className="space-y-0.5 text-[11px] text-[#8FA39D]">
            <div className="font-mono">Годен до {product.expires_at}</div>
            {product.created_at && (
              <div className="text-[10px] text-[#8FA39D]/60">Создан {product.created_at.slice(0, 10)}</div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isArchived ? (
              <>
                <button
                  type="button"
                  onClick={handleRestore}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md bg-white/[0.05] border border-white/[0.06] text-xs text-[#F1F5F4] hover:bg-white/[0.08] active:scale-95 transition-all shadow-xs"
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-xs text-[#EBAEB7] border border-rose-500/20 active:scale-95 transition-all shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>В утиль</span>
                </button>
                <button
                  type="button"
                  onClick={handleConsume}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-xs text-[#F1F5F4] font-medium shadow-md shadow-[#5E8B7E]/20 hover:brightness-105 active:scale-95 transition-all"
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
