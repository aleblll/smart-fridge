import React, { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import { haptic } from '@/lib/haptics';
import type { RecipeIdea } from './EveningIdeaCard';
import { Check, Clock, X, ChefHat, Sparkles } from 'lucide-react';

interface CookRecipeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: RecipeIdea | null;
  onConsumeIngredients: (productIds: string[]) => void;
}

export const CookRecipeModal: React.FC<CookRecipeModalProps> = ({
  open,
  onOpenChange,
  recipe,
  onConsumeIngredients,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (recipe) {
      setSelectedIds(recipe.matchedProducts.map((p) => p.id));
    }
  }, [recipe]);

  if (!recipe) return null;

  const toggleProduct = (id: string) => {
    haptic.selection();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    if (selectedIds.length === 0) return;
    haptic.notification('success');
    onConsumeIngredients(selectedIds);
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 transition-opacity" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto backdrop-blur-2xl bg-[#1A2421]/95 border-t border-white/[0.08] rounded-t-3xl z-50 p-5 pb-8 outline-none max-h-[88vh] flex flex-col text-[#F1F5F4] shadow-[0_-12px_40px_rgba(0,0,0,0.5)]">
          {/* Top Handle */}
          <div className="flex justify-center pb-2">
            <div className="w-12 h-1.5 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-1">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl backdrop-blur-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-2xl shadow-inner">
                {recipe.emoji}
              </div>
              <div className="space-y-0.5">
                <Drawer.Title className="text-base font-semibold tracking-tight text-[#F1F5F4] leading-snug">
                  {recipe.title}
                </Drawer.Title>
                <div className="flex items-center gap-2 text-xs text-[#8FA39D]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#5E8B7E]" />
                    <span>{recipe.cookingTime}</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-[#5E8B7E]">
                    <ChefHat className="w-3.5 h-3.5" />
                    <span>Мини-рецепт</span>
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-[#8FA39D] hover:text-[#F1F5F4] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-[#8FA39D] leading-relaxed">
            {recipe.description}
          </p>

          {/* Scrollable Recipe Content */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 py-2 pr-0.5">
            {/* Ingredients block */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#F1F5F4] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#5E8B7E]" />
                  <span>Ингредиенты из холодильника:</span>
                </span>
                <span className="text-[11px] text-[#8FA39D]">
                  Выбрано: {selectedIds.length} из {recipe.matchedProducts.length}
                </span>
              </div>

              <div className="space-y-1.5">
                {recipe.matchedProducts.map((prod) => {
                  const isSelected = selectedIds.includes(prod.id);
                  return (
                    <div
                      key={prod.id}
                      onClick={() => toggleProduct(prod.id)}
                      className={`flex items-center justify-between p-3 rounded-2xl backdrop-blur-xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-white/[0.06] border-white/[0.12]'
                          : 'bg-white/[0.02] border-white/[0.04] opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] shadow-xs'
                              : 'border border-white/20 bg-transparent'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[#F1F5F4] truncate">
                            {prod.name}
                          </p>
                          <p className="text-[10px] text-[#8FA39D]">
                            {prod.quantity} {prod.unit} • {prod.category}
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 text-[10px] font-mono text-[#8FA39D] pl-2">
                        до {prod.expires_at}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Steps block */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-[#F1F5F4] block">
                Пошаговое приготовление:
              </span>
              <div className="space-y-2">
                {recipe.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-2xl backdrop-blur-xl bg-white/[0.03] border border-white/[0.06]"
                  >
                    <div className="w-5 h-5 shrink-0 rounded-full bg-[#5E8B7E]/20 text-[#5E8B7E] font-semibold text-xs flex items-center justify-center border border-[#5E8B7E]/30 mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-xs text-[#F1F5F4] leading-relaxed">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Action CTA Button */}
          <div className="pt-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedIds.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] font-semibold text-sm shadow-lg shadow-[#5E8B7E]/20 hover:brightness-105 active:scale-[0.985] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>
                {selectedIds.length > 0
                  ? `Отметить ингредиенты съеденными (${selectedIds.length})`
                  : 'Выберите хотя бы один продукт'}
              </span>
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
