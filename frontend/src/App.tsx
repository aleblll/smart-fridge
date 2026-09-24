import { useState, useEffect, useMemo } from 'react';
import { TelegramProvider } from '@/context/TelegramContext';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import { AddProductDrawer } from '@/components/AddProductDrawer';
import { ProductCard } from '@/components/ProductCard';
import { ShareModal } from '@/components/ShareModal';
import { DiagnosticsDrawer } from '@/components/DiagnosticsDrawer';
import { storage } from '@/lib/storage';
import { logger } from '@/lib/logger';
import type { ProductItem, StorageType, ProductStatus } from '@/types';
import { Plus, Users, Search, Sparkles, Utensils, Trash2, Refrigerator, Terminal, Snowflake, Archive } from 'lucide-react';

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
        // First-time user with no stored data: seed demo products
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

  // Count items
  const counts = useMemo(() => {
    let active = 0;
    let expiringSoon = 0;
    let consumed = 0;
    let discarded = 0;
    const now = Date.now();

    for (const p of products) {
      if (p.status === 'active') {
        active++;
        const expTime = new Date(p.expires_at).getTime();
        if (expTime - now <= 2 * 86400000) {
          expiringSoon++;
        }
      } else if (p.status === 'consumed') {
        consumed++;
      } else if (p.status === 'discarded') {
        discarded++;
      }
    }

    return { active, expiringSoon, consumed, discarded };
  }, [products]);

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
    <div className="min-h-screen bg-[#0e1013] text-slate-100 px-4 py-4 max-w-md mx-auto space-y-4 pb-28">
      {/* Top Header */}
      <header className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 text-white">
            <span>Свежесть</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 font-mono">
              {counts.active} шт.
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {counts.expiringSoon > 0 ? (
              <span className="text-amber-400 font-semibold">
                ⚠️ {counts.expiringSoon} требуют внимания
              </span>
            ) : (
              <span>Все продукты в норме</span>
            )}
          </p>
        </div>

        {/* Header Actions: Share & Diagnostics */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              haptic.impact('light');
              setDiagOpen(true);
            }}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sky-400 active:scale-95 transition-all"
            title="Логи и диагностика"
          >
            <Terminal className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              haptic.impact('light');
              setShareModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-xs text-sky-400 font-semibold hover:bg-sky-500/25 active:scale-95 transition-all"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Семья</span>
          </button>
        </div>
      </header>

      {/* Main Tabs (Холодильник / Съедено / Мусорка) */}
      <nav className="flex rounded-2xl bg-zinc-900 border border-zinc-800 p-1">
        <button
          type="button"
          onClick={() => {
            haptic.selection();
            setActiveTab('inventory');
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeTab === 'inventory'
              ? 'bg-sky-500 text-slate-950 font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Refrigerator className="w-3.5 h-3.5" />
          <span>Холодильник</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic.selection();
            setActiveTab('consumed');
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeTab === 'consumed'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Utensils className="w-3.5 h-3.5" />
          <span>Съедено ({counts.consumed})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic.selection();
            setActiveTab('discarded');
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeTab === 'discarded'
              ? 'bg-rose-500 text-slate-950 font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Утиль ({counts.discarded})</span>
        </button>
      </nav>

      {/* Zone Filter (Only in Inventory tab) */}
      {activeTab === 'inventory' && (
        <section className="grid grid-cols-4 gap-1.5 text-xs">
          {[
            { zone: 'all' as const, label: 'Все зоны', icon: Sparkles },
            { zone: 'fridge' as const, label: 'Холод', icon: Refrigerator },
            { zone: 'freezer' as const, label: 'Мороз', icon: Snowflake },
            { zone: 'pantry' as const, label: 'Шкаф', icon: Archive },
          ].map(({ zone, label, icon: Icon }) => {
            const isSelected = activeZone === zone;
            return (
              <button
                key={zone}
                type="button"
                onClick={() => {
                  haptic.impact('light');
                  setActiveZone(zone);
                }}
                className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                  isSelected
                    ? 'bg-zinc-800 border-zinc-700 text-sky-400 font-bold shadow-xs'
                    : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{label}</span>
              </button>
            );
          })}
        </section>
      )}

      {/* Category Pills (Horizontal Scroll) */}
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
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap border transition-all ${
                isSelected
                  ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </section>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по добавленным продуктам..."
          className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500/60"
        />
      </div>

      {/* Product List */}
      <section className="space-y-2 pt-1">
        {displayedProducts.length === 0 ? (
          <div className="py-12 px-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 text-center space-y-3">
            <Sparkles className="w-8 h-8 text-sky-400/70 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">
                {activeTab === 'inventory' ? 'Холодильник пуст' : 'В этом разделе пока пусто'}
              </p>
              <p className="text-xs text-zinc-400">
                {activeTab === 'inventory'
                  ? 'Нажмите кнопку внизу, чтобы быстро добавить продукты'
                  : 'Здесь будут сохраняться съеденные или списанные позиции'}
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

      {/* Floating Action Button (Add Product) */}
      {activeTab === 'inventory' && (
        <div className="fixed bottom-5 left-0 right-0 max-w-md mx-auto px-4 pointer-events-none z-30">
          <button
            type="button"
            onClick={() => {
              haptic.impact('medium');
              setDrawerOpen(true);
            }}
            className="pointer-events-auto w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-xl shadow-sky-950/60 active:scale-[0.985] transition-all"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
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
