import React, { useMemo } from 'react';
import type { ProductItem } from '@/types';
import { haptic } from '@/lib/haptics';
import { Sparkles, ArrowRight, Utensils } from 'lucide-react';

export interface RecipeIdea {
  title: string;
  description: string;
  matchedItems: string[];
  matchedProducts: ProductItem[];
  emoji: string;
  cookingTime: string;
  steps: string[];
}

interface EveningIdeaCardProps {
  products: ProductItem[];
  onCookRecipe?: (recipe: RecipeIdea) => void;
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

    const findMatching = (patterns: RegExp[]): ProductItem[] => {
      return activeProducts.filter((p) =>
        patterns.some((re) => re.test(p.name) || re.test(p.category))
      );
    };

    const pastaProds = findMatching([/паст/i, /макарон/i, /спагет/i]);
    const cheeseProds = findMatching([/сыр/i, /моцарелл/i, /пармезан/i, /сулугуни/i, /творог/i]);
    const chickenProds = findMatching([/куриц/i, /курин/i, /филе/i, /индейк/i, /цыпл/i]);
    const milkProds = findMatching([/молок/i, /сливк/i, /сметан/i]);
    const eggProds = findMatching([/яйц/i]);
    const vegProds = findMatching([/помидор/i, /томат/i, /огур/i, /зелен/i, /салат/i, /перец/i, /кабач/i, /морков/i, /броккол/i]);

    if (pastaProds.length > 0 && cheeseProds.length > 0) {
      const matched = [pastaProds[0], cheeseProds[0]];
      return {
        title: 'Паста с расплавленным сыром',
        description: 'Быстрый и уютный ужин из запасов пасты и сыра.',
        matchedItems: [pastaProds[0].name, cheeseProds[0].name],
        matchedProducts: matched,
        emoji: '🍝',
        cookingTime: '12 минут',
        steps: [
          'Вскипятите подсоленную воду и сварите пасту до состояния al dente (8–10 мин).',
          'Сыр натрите на крупной терке или нарежьте аккуратными ломтиками.',
          'Слейте воду, оставив пару ложек горячего бульона для соуса.',
          'Перемешайте горячую пасту с сыром до образования нежной кремовой текстуры. Подавайте теплым!',
        ],
      };
    }

    if (chickenProds.length > 0 && (cheeseProds.length > 0 || vegProds.length > 0)) {
      const partner = cheeseProds.length > 0 ? cheeseProds[0] : vegProds[0];
      const matched = [chickenProds[0], partner];
      return {
        title: 'Нежное филе с корочкой',
        description: 'Используйте охлажденное филе, пока оно на пике сочности.',
        matchedItems: [chickenProds[0].name, partner.name],
        matchedProducts: matched,
        emoji: '🍗',
        cookingTime: '20 минут',
        steps: [
          'Промойте филе, обсушите, нарежьте порционными кусочками и слегка приправьте солью.',
          'Обжаривайте на сковороде по 5–6 минут с каждой стороны до золотистого цвета.',
          `Выложите сверху подготовленный ингредиент («${partner.name}») и убавьте огонь.`,
          'Накройте крышкой на 4 минуты, чтобы сыр аппетитно расплавился или овощи размягчились.',
        ],
      };
    }

    if (eggProds.length > 0 && (cheeseProds.length > 0 || milkProds.length > 0 || vegProds.length > 0)) {
      const partner = cheeseProds.length > 0 ? cheeseProds[0] : (milkProds.length > 0 ? milkProds[0] : vegProds[0]);
      const matched = [eggProds[0], partner];
      return {
        title: 'Пышный деревенский омлет',
        description: 'Идеальный баланс белка и свежести за несколько минут.',
        matchedItems: [eggProds[0].name, partner.name],
        matchedProducts: matched,
        emoji: '🍳',
        cookingTime: '8 минут',
        steps: [
          'Разбейте яйца в миску, добавьте щепотку соли и слегка взбейте вилкой.',
          `Добавьте «${partner.name}» (нарезанный или влитый) и перемешайте.`,
          'Вылейте омлетную смесь на разогретую сковороду со сливочным или растительным маслом.',
          'Томите на среднем огне под крышкой 4–5 минут. Подавайте горячим!',
        ],
      };
    }

    // Default suggestion from the earliest expiring items
    const expiringItem = [...activeProducts].sort(
      (a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
    )[0];

    if (expiringItem) {
      return {
        title: `Блюдо дня с «${expiringItem.name}»`,
        description: 'Рекомендуем приготовить сегодня для максимальной свежести и вкуса.',
        matchedItems: [expiringItem.name],
        matchedProducts: [expiringItem],
        emoji: '✦',
        cookingTime: '10 минут',
        steps: [
          `Подготовьте продукт «${expiringItem.name}», промыв или отмерив нужную порцию.`,
          'Используйте в качестве основы для быстрого горячего блюда, теплого салата или гарнира.',
          'Доведите до готовности за несколько минут на среднем огне с вашими любимыми специями.',
          'Блюдо готово — продукт использован вовремя без потерь!',
        ],
      };
    }

    return null;
  }, [activeProducts]);

  if (!idea) return null;

  const handleCook = () => {
    haptic.impact('medium');
    if (idea) {
      onCookRecipe?.(idea);
    }
  };

  return (
    <div className="relative rounded-2xl backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.25)] p-4 space-y-3">
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
        <div className="flex items-center gap-1.5 text-[11px] text-[#8FA39D] min-w-0 pr-2 truncate">
          <Utensils className="w-3 h-3 text-[#A7C7E7] shrink-0" />
          <span className="truncate">{idea.matchedItems.join(' + ')}</span>
        </div>

        <button
          type="button"
          onClick={handleCook}
          className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-xs text-[#F1F5F4] font-semibold hover:brightness-105 active:scale-95 transition-all shadow-lg shadow-[#5E8B7E]/20 shrink-0"
        >
          <span>Приготовить</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
