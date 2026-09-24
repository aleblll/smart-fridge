import React, { useMemo } from 'react';
import type { ProductItem } from '@/types';
import { haptic } from '@/lib/haptics';
import { Sparkles, ArrowRight, Utensils } from 'lucide-react';

interface EveningIdeaCardProps {
  products: ProductItem[];
  onCookRecipe?: (productNames: string[]) => void;
}

interface RecipeIdea {
  title: string;
  description: string;
  matchedItems: string[];
  emoji: string;
}

export const EveningIdeaCard: React.FC<EveningIdeaCardProps> = ({
  products,
  onCookRecipe,
}) => {
  const activeProducts = useMemo(() => {
    return products.filter((p) => p.status === 'active');
  }, [products]);

  // Generate contextual smart culinary suggestion based on active fridge inventory
  const idea = useMemo<RecipeIdea | null>(() => {
    if (activeProducts.length === 0) return null;

    const names = activeProducts.map((p) => p.name.toLowerCase());

    const hasEgg = names.some((n) => n.includes('яйц'));
    const hasCheese = names.some((n) => n.includes('сыр') || n.includes('моцарелл'));
    const hasChicken = names.some((n) => n.includes('куриц') || n.includes('филе') || n.includes('индейк'));
    const hasMilk = names.some((n) => n.includes('молок') || n.includes('сливк'));
    const hasPasta = names.some((n) => n.includes('паст') || n.includes('макарон'));
    const hasVeg = names.some((n) => n.includes('помидор') || n.includes('огур') || n.includes('зелен') || n.includes('салат'));

    if (hasPasta && hasCheese) {
      return {
        title: 'Паста с расплавленным сыром',
        description: 'Быстрый и уютный ужин из запасов пасты и сыра.',
        matchedItems: ['Паста', 'Сыр'],
        emoji: '🍝',
      };
    }

    if (hasChicken && (hasVeg || hasCheese)) {
      return {
        title: 'Нежное филе с сырной корочкой',
        description: 'Используйте охлажденное филе, пока оно на пике сочности.',
        matchedItems: ['Куриное филе', hasCheese ? 'Сыр' : 'Овощи'],
        emoji: '🍗',
      };
    }

    if (hasEgg && (hasCheese || hasMilk || hasVeg)) {
      return {
        title: 'Пышный деревенский омлет',
        description: 'Идеальный баланс белка и свежести за 7 минут.',
        matchedItems: ['Яйца', hasCheese ? 'Сыр' : 'Молоко'],
        emoji: '🍳',
      };
    }

    // Default suggestion from the earliest expiring items
    const expiringItem = [...activeProducts].sort(
      (a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
    )[0];

    if (expiringItem) {
      return {
        title: `Блюдо дня с «${expiringItem.name}»`,
        description: 'Рекомендуем употребить сегодня для максимальной пользы.',
        matchedItems: [expiringItem.name],
        emoji: '✦',
      };
    }

    return null;
  }, [activeProducts]);

  if (!idea) return null;

  const handleCook = () => {
    haptic.impact('medium');
    onCookRecipe?.(idea.matchedItems);
  };

  return (
    <div className="relative rounded-2xl bg-[#222E2B] border border-white/[0.07] p-4 space-y-3 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase text-[#5E8B7E]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Идея на вечер</span>
        </div>
        <span className="text-xl">{idea.emoji}</span>
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-semibold text-[#F1F5F4] leading-snug">
          {idea.title}
        </h3>
        <p className="text-xs text-[#8FA39D] leading-relaxed">
          {idea.description}
        </p>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 text-[11px] text-[#8FA39D]">
          <Utensils className="w-3 h-3 text-[#A7C7E7]" />
          <span>{idea.matchedItems.join(' + ')}</span>
        </div>

        <button
          type="button"
          onClick={handleCook}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#5E8B7E] text-xs text-[#F1F5F4] font-medium hover:bg-[#4E756A] active:scale-95 transition-all shadow-xs"
        >
          <span>Приготовить</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
