import { useState, useEffect, useMemo } from 'react';
import { TelegramProvider } from '@/context/TelegramContext';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import { AddProductDrawer } from '@/components/AddProductDrawer';
import { ProductCard } from '@/components/ProductCard';
import { EveningIdeaCard } from '@/components/EveningIdeaCard';
import { ShareModal } from '@/components/ShareModal';
import { DiagnosticsDrawer } from '@/components/DiagnosticsDrawer';
import { storage } from '@/lib/storage';
import { logger } from '@/lib/logger';
import type { ProductItem, StorageType, ProductStatus } from '@/types';
import { Plus, Users, Search, Sparkles, Terminal, Snowflake, Archive, Refrigerator } from 'lucide-react';

const CATEGORIES = [
  'Все',
  'Молочная продукция',
  'Сыры',
  'Мясо и птица',
  'Рыба и морепродукты',
  'Овощи и зелень',
  'Фрукты и ягоды',
  'Готовая кулинария',
  'Полуфабрикаты',
  'Бакалея и консервы',
  'Напитки',
];

const INITIAL_DEMO_PRODUCTS: ProductItem[] = [
  {
    id: 'demo-1',
    name: 'Молоко пастеризованное 3.2%',
    category: 'Молочная продукция',
    storage_type: 'fridge',
    quantity: 1,
    unit: 'l',
    opened_at: null,
    expires_at: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    notify_before_days: 2,
    status: 'active',
    added_by: 100,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    name: 'Сыр Российский',
    category: 'Сыры',
    storage_type: 'fridge',
    quantity: 300,
    unit: 'g',
    opened_at: null,
    expires_at: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    notify_before_days: 3,
    status: 'active',
    added_by: 100,
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-3',
    name: 'Куриное филе охлажденное',
    category: 'Мясо и птица',
    storage_type: 'fridge',
    quantity: 0.8,
    unit: 'kg',
    opened_at: null,
    expires_at: new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10),
    notify_before_days: 1,
    status: 'active',
    added_by: 100,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function MainScreen() {
  const { user, haptic } = useTelegramWebApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'consumed' | 'discarded'>('inventory');
  const [activeZone, setActiveZone] = useState<StorageType | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [products, setProducts] = useState<ProductItem[]>(() => {
    const cached = storage.getInitialProducts();
    return cached !== null ? cached : INITIAL_DEMO_PRODUCTS;
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load products on start from Telegram CloudStorage / localStorage
  useEffect(() => {
    storage.loadProducts().then((loaded) => {
      if (loaded !== null) {
        setProducts(loaded);
      } else {
        setProducts(INITIAL_DEMO_PRODUCTS);
        storage.saveProducts(INITIAL_DEMO_PRODUCTS);
      }
      setIsLoaded(true);
    });
  }, []);

  // Save products on every change
  useEffect(() => {
    if (isLoaded) {
      storage.saveProducts(products);
    }
  }, [products, isLoaded]);

  // Handle adding new product
  const handleAddProduct = (newProductData: Omit<ProductItem, 'id' | 'added_by' | 'updated_at'>) => {
    const newProduct: ProductItem = {
      ...newProductData,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      added_by: user?.id || 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setProducts((prev) => [newProduct, ...prev]);
  };

  // Change status (consume / discard / restore)
  const setProductStatus = (id: string, newStatus: ProductStatus) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: newStatus, updated_at: new Date().toISOString() } : p
      )
    );
    logger.info('INVENTORY', `Item ${id} status changed to ${newStatus}`);
  };

  // Permanently delete product
  const handleDeleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    logger.info('INVENTORY', `Item ${id} permanently removed`);
  };

  // Count items and freshness balance
  const counts = useMemo(() => {
    let active = 0;
    let expiringSoon = 0;
    let fresh = 0;
    let consumed = 0;
    let discarded = 0;
    const now = Date.now();

    for (const p of products) {
      if (p.status === 'active') {
        active++;
        const expTime = new Date(p.expires_at).getTime();
        if (expTime - now <= 2 * 86400000) {
          expiringSoon++;
        } else {
          fresh++;
        }
      } else if (p.status === 'consumed') {
        consumed++;
      } else if (p.status === 'discarded') {
        discarded++;
      }
    }

    return { active, expiringSoon, fresh, consumed, discarded };
  }, [products]);

  // Overall freshness percentage for the 3px hero line
  const overallFreshnessRatio = useMemo(() => {
    if (counts.active === 0) return 100;
    return Math.round((counts.fresh / counts.active) * 100);
  }, [counts]);

  // Filtered and sorted products
  const displayedProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (activeTab === 'inventory' && p.status !== 'active') return false;
        if (activeTab === 'consumed' && p.status !== 'consumed') return false;
        if (activeTab === 'discarded' && p.status !== 'discarded') return false;

        if (activeTab === 'inventory' && activeZone !== 'all' && p.storage_type !== activeZone) {
          return false;
        }

        if (selectedCategory !== 'Все' && p.category !== selectedCategory) {
          return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
        }

        return true;
      })
      .sort((a, b) => {
        if (activeTab === 'inventory') {
          return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
        }
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [products, activeTab, activeZone, selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-[#1A2421] text-[#F1F5F4] px-4 py-5 max-w-md mx-auto space-y-4 pb-28">
      {/* 1. HERO-БЛОК СВЕЖЕСТИ (Mindora Calming Wellness Style) */}
      <header className="rounded-2xl bg-[#222E2B] border border-white/[0.06] p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[#F1F5F4]">
              Свежесть
            </h1>
            <span className="text-xs font-medium text-[#8FA39D] font-mono">
              • {counts.active} {counts.active === 1 ? 'продукт' : counts.active < 5 ? 'продукта' : 'продуктов'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                haptic.impact('light');
                setDiagOpen(true);
              }}
              className="p-2 rounded-xl bg-[#2A3834] text-[#8FA39D] hover:text-[#F1F5F4] active:scale-95 transition-all"
              title="Диагностика"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                haptic.impact('light');
                setShareModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2A3834] text-xs font-medium text-[#F1F5F4] hover:bg-[#344641] active:scale-95 transition-all"
            >
              <Users className="w-3.5 h-3.5 text-[#5E8B7E]" />
              <span>Семья</span>
            </button>
          </div>
        </div>

        {/* Human Calm Status Message */}
        <p className="text-xs text-[#8FA39D] leading-relaxed">
          {counts.active === 0 ? (
            'Холодильник пуст. Добавьте любимые продукты.'
          ) : counts.expiringSoon > 0 ? (
            <>
              В холодильнике всё в порядке, но{' '}
              <span className="text-[#EBAEB7] font-medium">
                {counts.expiringSoon} {counts.expiringSoon === 1 ? 'продукт требует' : 'продукта требуют'} внимания
              </span>
              .
            </>
          ) : (
            'В холодильнике идеальный порядок и баланс свежести.'
          )}
        </p>

        {/* Delicate 3px Freshness Index Line (Mindora section 12 style) */}
        {counts.active > 0 && (
          <div className="pt-1">
            <div className="w-full bg-[#1A2421] rounded-full h-[3px] overflow-hidden flex">
              <div
                className="h-[3px] bg-[#5E8B7E] transition-all duration-500 rounded-l-full"
                style={{ width: `${overallFreshnessRatio}%` }}
                title={`Свежие продукты: ${counts.fresh}`}
              />
              {counts.expiringSoon > 0 && (
                <div
                  className="h-[3px] bg-[#EBAEB7] transition-all duration-500 rounded-r-full"
                  style={{ width: `${100 - overallFreshnessRatio}%` }}
                  title={`Требуют внимания: ${counts.expiringSoon}`}
                />
              )}
            </div>
          </div>
        )}
      </header>

      {/* 2. НАВИГАЦИЯ (по образцу раздела 8 Mindora — чистые текстовые вкладки) */}
      <nav className="flex items-center justify-around border-b border-white/[0.06] pt-1 pb-0.5">
        {[
          { id: 'inventory' as const, label: 'Холодильник' },
          { id: 'consumed' as const, label: `Съедено (${counts.consumed})` },
          { id: 'discarded' as const, label: `Утиль (${counts.discarded})` },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                haptic.selection();
                setActiveTab(tab.id);
              }}
              className={`pb-2.5 text-xs font-medium transition-all relative ${
                isActive
                  ? 'text-[#F1F5F4] font-semibold'
                  : 'text-[#8FA39D] hover:text-[#F1F5F4]'
              }`}
            >
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#5E8B7E] rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. ЗОНЫ ХРАНЕНИЯ (Легкий текстовый фильтр без тяжелых капсул) */}
      {activeTab === 'inventory' && (
        <section className="flex items-center justify-between px-1 py-1 text-xs">
          <span className="text-[11px] font-medium text-[#8FA39D] uppercase tracking-wider">
            Зона:
          </span>
          <div className="flex items-center gap-4">
            {[
              { zone: 'all' as const, label: 'Все' },
              { zone: 'fridge' as const, label: 'Холод', icon: Refrigerator },
              { zone: 'freezer' as const, label: 'Мороз', icon: Snowflake },
              { zone: 'pantry' as const, label: 'Шкаф', icon: Archive },
            ].map(({ zone, label }) => {
              const isSelected = activeZone === zone;
              return (
                <button
                  key={zone}
                  type="button"
                  onClick={() => {
                    haptic.impact('light');
                    setActiveZone(zone);
                  }}
                  className={`text-xs transition-all relative py-0.5 ${
                    isSelected
                      ? 'text-[#A7C7E7] font-semibold'
                      : 'text-[#8FA39D] hover:text-[#F1F5F4]'
                  }`}
                >
                  <span>{label}</span>
                  {isSelected && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#A7C7E7]" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. ПРОДУКТОВАЯ МАГИЯ: БЛОК «✦ ИДЕЯ НА ВЕЧЕР» (Mindora Modal / Card Style) */}
      {activeTab === 'inventory' && activeZone === 'all' && selectedCategory === 'Все' && !searchQuery && (
        <EveningIdeaCard products={products} />
      )}

      {/* 5. КАТЕГОРИИ (Спокойный горизонтальный скролл без рядов одинаковых пилюль) */}
      <section className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                haptic.selection();
                setSelectedCategory(cat);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-[#2A3834] text-[#F1F5F4] font-medium border border-white/[0.08]'
                  : 'bg-transparent text-[#8FA39D] hover:text-[#F1F5F4]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </section>

      {/* 6. ПОИСК (Минималистичное поле ввода Mindora) */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#8FA39D]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск продуктов..."
          className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-[#222E2B] border border-white/[0.06] text-xs text-[#F1F5F4] placeholder-[#8FA39D]/60 focus:outline-none focus:border-[#5E8B7E] transition-colors"
        />
      </div>

      {/* 7. СПИСОК ПРОДУКТОВ (Карточки Mindora с главным героем — едой) */}
      <section className="space-y-2.5 pt-1">
        {displayedProducts.length === 0 ? (
          <div className="py-12 px-6 rounded-2xl bg-[#222E2B] border border-white/[0.04] text-center space-y-2.5">
            <Sparkles className="w-7 h-7 text-[#5E8B7E] mx-auto opacity-70" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#F1F5F4]">
                {activeTab === 'inventory' ? 'В этой секции пусто' : 'Здесь пока нет позиций'}
              </p>
              <p className="text-xs text-[#8FA39D]">
                {activeTab === 'inventory'
                  ? 'Нажмите кнопку ниже, чтобы быстро добавить продукты.'
                  : 'История действий будет отображаться здесь.'}
              </p>
            </div>
          </div>
        ) : (
          displayedProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onConsume={() => setProductStatus(product.id, 'consumed')}
              onDiscard={() => setProductStatus(product.id, 'discarded')}
              onRestore={() => setProductStatus(product.id, 'active')}
              onDelete={handleDeleteProduct}
            />
          ))
        )}
      </section>

      {/* 8. FLOATING ACTION BUTTON (Primary Mindora Sage Button #1) */}
      {activeTab === 'inventory' && (
        <div className="fixed bottom-5 left-0 right-0 max-w-md mx-auto px-4 pointer-events-none z-30">
          <button
            type="button"
            onClick={() => {
              haptic.impact('medium');
              setDrawerOpen(true);
            }}
            className="pointer-events-auto w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#5E8B7E] hover:bg-[#4E756A] text-[#F1F5F4] font-semibold text-sm shadow-lg shadow-[#161F1D] active:scale-[0.985] transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Добавить продукт</span>
          </button>
        </div>
      )}

      {/* Add Product Drawer */}
      <AddProductDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onAddProduct={handleAddProduct}
      />

      {/* Share Family Modal */}
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        userId={user?.id}
      />

      {/* Diagnostics / Logs Drawer */}
      <DiagnosticsDrawer
        open={diagOpen}
        onOpenChange={setDiagOpen}
      />
    </div>
  );
}

export default function App() {
  return (
    <TelegramProvider>
      <MainScreen />
    </TelegramProvider>
  );
}
