export interface FoodVisual {
  emoji: string;
  bgColor: string;
}

export function getFoodVisual(name: string, category: string): FoodVisual {
  const n = name.toLowerCase();
  const c = category.toLowerCase();

  // Specific items matching
  if (n.includes('молок')) return { emoji: '🥛', bgColor: 'bg-emerald-950/30 text-emerald-300' };
  if (n.includes('кефир') || n.includes('ряженк') || n.includes('йогурт')) return { emoji: '🥣', bgColor: 'bg-teal-950/30 text-teal-300' };
  if (n.includes('творог') || n.includes('сырник')) return { emoji: '🧀', bgColor: 'bg-amber-950/30 text-amber-300' };
  if (n.includes('сыр') || n.includes('моцарелл') || n.includes('пармезан')) return { emoji: '🧀', bgColor: 'bg-amber-950/30 text-amber-300' };
  if (n.includes('масло сливочн') || n.includes('масло')) return { emoji: '🧈', bgColor: 'bg-yellow-950/30 text-yellow-300' };
  if (n.includes('яйц')) return { emoji: '🥚', bgColor: 'bg-amber-950/30 text-amber-200' };
  
  if (n.includes('куриц') || n.includes('индейк') || n.includes('филе') || n.includes('цыплен')) return { emoji: '🍗', bgColor: 'bg-orange-950/30 text-orange-300' };
  if (n.includes('говядин') || n.includes('свинин') || n.includes('фарш') || n.includes('стейк') || n.includes('мяс')) return { emoji: '🥩', bgColor: 'bg-rose-950/30 text-rose-300' };
  if (n.includes('сосиск') || n.includes('колбас') || n.includes('ветчин') || n.includes('бекон')) return { emoji: '🥓', bgColor: 'bg-rose-950/30 text-rose-300' };
  
  if (n.includes('лосос') || n.includes('рыб') || n.includes('форел') || n.includes('тунец') || n.includes('креветк')) return { emoji: '🐟', bgColor: 'bg-sky-950/30 text-sky-300' };
  
  if (n.includes('помидор') || n.includes('томат')) return { emoji: '🍅', bgColor: 'bg-red-950/30 text-red-300' };
  if (n.includes('огур')) return { emoji: '🥒', bgColor: 'bg-emerald-950/30 text-emerald-300' };
  if (n.includes('авокадо')) return { emoji: '🥑', bgColor: 'bg-emerald-950/30 text-emerald-300' };
  if (n.includes('салат') || n.includes('зелен') || n.includes('шпинат') || n.includes('укроп')) return { emoji: '🥬', bgColor: 'bg-emerald-950/30 text-emerald-300' };
  if (n.includes('морков')) return { emoji: '🥕', bgColor: 'bg-orange-950/30 text-orange-300' };
  
  if (n.includes('яблок')) return { emoji: '🍎', bgColor: 'bg-rose-950/30 text-rose-300' };
  if (n.includes('банан')) return { emoji: '🍌', bgColor: 'bg-amber-950/30 text-amber-300' };
  if (n.includes('ягод') || n.includes('клубник') || n.includes('малин') || n.includes('черник')) return { emoji: '🍓', bgColor: 'bg-rose-950/30 text-rose-300' };
  if (n.includes('лимон') || n.includes('апельсин')) return { emoji: '🍋', bgColor: 'bg-amber-950/30 text-amber-300' };
  
  if (n.includes('хлеб') || n.includes('батон') || n.includes('багет') || n.includes('булочк')) return { emoji: '🍞', bgColor: 'bg-amber-950/30 text-amber-300' };
  if (n.includes('пельмен') || n.includes('вареник')) return { emoji: '🥟', bgColor: 'bg-sky-950/30 text-sky-300' };
  if (n.includes('суп') || n.includes('борщ')) return { emoji: '🍲', bgColor: 'bg-amber-950/30 text-amber-300' };
  if (n.includes('паст') || n.includes('макарон')) return { emoji: '🍝', bgColor: 'bg-amber-950/30 text-amber-300' };
  if (n.includes('сок') || n.includes('морс')) return { emoji: '🧃', bgColor: 'bg-orange-950/30 text-orange-300' };

  // Category fallbacks
  if (c.includes('молочн')) return { emoji: '🥛', bgColor: 'bg-teal-950/30 text-teal-300' };
  if (c.includes('сыр')) return { emoji: '🧀', bgColor: 'bg-amber-950/30 text-amber-300' };
  if (c.includes('мясо')) return { emoji: '🥩', bgColor: 'bg-rose-950/30 text-rose-300' };
  if (c.includes('рыба')) return { emoji: '🐟', bgColor: 'bg-sky-950/30 text-sky-300' };
  if (c.includes('овощ')) return { emoji: '🥦', bgColor: 'bg-emerald-950/30 text-emerald-300' };
  if (c.includes('фрукт')) return { emoji: '🍎', bgColor: 'bg-rose-950/30 text-rose-300' };
  if (c.includes('замороз')) return { emoji: '🧊', bgColor: 'bg-sky-950/30 text-sky-300' };
  if (c.includes('кулинар')) return { emoji: '🍲', bgColor: 'bg-amber-950/30 text-amber-300' };
  if (c.includes('бакале')) return { emoji: '🥫', bgColor: 'bg-stone-950/30 text-stone-300' };
  if (c.includes('напит')) return { emoji: '🧃', bgColor: 'bg-cyan-950/30 text-cyan-300' };

  return { emoji: '🍃', bgColor: 'bg-[#2A3834] text-[#8FA39D]' };
}
