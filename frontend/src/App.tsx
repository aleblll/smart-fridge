import { useState, useEffect, useMemo } from 'react';
import { TelegramProvider } from '@/context/TelegramContext';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import { AddProductDrawer } from '@/components/AddProductDrawer';
import { ProductCard } from '@/components/ProductCard';
import type { ProductItem, StorageType } from '@/types';
import { Plus, ShieldCheck, Zap, Sparkles, Filter } from 'lucide-react';

const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: 'demo-1',
    name: 'Молоко пастеризованное 3.2%',
    category: 'Молочная продукция',
    storage_type: 'fridge',
    quantity: 1,
    unit: 'l',
    opened_at: null,
    expires_at: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    notify_before_days: 2,
    status: 'active',
    added_by: 100,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    name: 'Творог 9%',
    category: 'Молочная продукция',
    storage_type: 'fridge',
    quantity: 2,
    unit: 'pack',
    opened_at: null,
    expires_at: new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10),
    notify_before_days: 2,
    status: 'active',
    added_by: 100,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-3',
    name: 'Яйца куриные С0',
    category: 'Яйца',
    storage_type: 'fridge',
    quantity: 10,
    unit: 'pcs',
    opened_at: null,
    expires_at: new Date(Date.now() + 18 * 86400000).toISOString().slice(0, 10),
    notify_before_days: 3,
    status: 'active',
    added_by: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-4',
    name: 'Пельмени домашние',
    category: 'Заморозка',
    storage_type: 'freezer',
    quantity: 800,
    unit: 'g',
    opened_at: null,
    expires_at: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    notify_before_days: 5,
    status: 'active',
    added_by: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function MainScreen() {
  const { user, isInsideTelegram, haptic } = useTelegramWebApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeZone, setActiveZone] = useState<StorageType | 'all'>('all');
  const [products, setProducts] = useState<ProductItem[]>(() => {
    const saved = localStorage.getItem('smart_fridge_inventory');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_PRODUCTS;
      }
    }
    return INITIAL_PRODUCTS;
  });

  // Sync to local storage for offline-first resilience
  useEffect(() => {
    localStorage.setItem('smart_fridge_inventory', JSON.stringify(products));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.status !== 'active') return false;
      if (activeZone === 'all') return true;
      return p.storage_type === activeZone;
    });
  }, [products, activeZone]);

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

  const handleConsume = (id: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: 'consumed', updated_at: new Date().toISOString() } : p
      )
    );
  };

  const handleDiscard = (id: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: 'discarded', updated_at: new Date().toISOString() } : p
      )
    );
  };

  const handleZoneTabChange = (zone: StorageType | 'all') => {
    haptic.impact('light');
    setActiveZone(zone);
  };

  const handleOpenDrawer = () => {
    haptic.impact('medium');
    setDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-[var(--surface-ground)] text-[var(--text-primary)] px-4 py-5 max-w-md mx-auto space-y-5 pb-24">
      {/* Header */}
      <header className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
            {isInsideTelegram ? (user?.first_name ? `Привет, ${user.first_name}` : 'Telegram Mini App') : 'Браузерный режим'}
          </span>
          <h1 className="text-xl font-bold tracking-tight mt-0.5">Умный Холодильник</h1>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-card)] border border-[var(--border-subtle)] text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono text-[11px]">TMA SDK</span>
        </div>
      </header>

      {/* Storage Filter Segmented Control */}
      <section className="flex rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] p-1">
        {(['all', 'fridge', 'freezer', 'pantry'] as const).map((zone) => {
          const labels: Record<typeof zone, string> = {
            all: 'Все',
            fridge: 'Холодильник',
            freezer: 'Морозилка',
            pantry: 'Шкаф',
          };
          const isSelected = activeZone === zone;
          return (
            <button
              key={zone}
              type="button"
              onClick={() => handleZoneTabChange(zone)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                isSelected
                  ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {labels[zone]}
            </button>
          );
        })}
      </section>

      {/* Inventory List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Filter className="w-3.5 h-3.5" />
            <span>Инвентарь ({filteredProducts.length})</span>
          </div>
          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            Относит. шкала
          </span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-8 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-center space-y-2">
            <Sparkles className="w-6 h-6 text-zinc-500 mx-auto" />
            <p className="text-sm font-medium text-[var(--text-primary)]">В этой секции пусто</p>
            <p className="text-xs text-[var(--text-muted)]">
              Нажмите кнопку ниже, чтобы быстро добавить продукт из справочника
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onConsume={handleConsume}
                onDiscard={handleDiscard}
              />
            ))}
          </div>
        )}
      </section>

      {/* Quick Test Haptics Toolstrip */}
      <section className="p-3 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[var(--text-muted)]">Тест тактильного отклика:</span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">DS-002</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => haptic.impact('light')}
            className="px-2 py-1.5 rounded bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] active:scale-95 transition-transform flex items-center justify-center gap-1"
          >
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Light</span>
          </button>
          <button
            type="button"
            onClick={() => haptic.impact('medium')}
            className="px-2 py-1.5 rounded bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] active:scale-95 transition-transform flex items-center justify-center gap-1"
          >
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Medium</span>
          </button>
          <button
            type="button"
            onClick={() => haptic.notification('success')}
            className="px-2 py-1.5 rounded bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] active:scale-95 transition-transform flex items-center justify-center gap-1"
          >
            <Zap className="w-3 h-3 text-emerald-400" />
            <span>Success</span>
          </button>
        </div>
      </section>

      {/* Fixed Floating Action Button (Add Product) */}
      <div className="fixed bottom-5 left-0 right-0 max-w-md mx-auto px-4 pointer-events-none z-30">
        <button
          type="button"
          onClick={handleOpenDrawer}
          className="pointer-events-auto w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--tg-button)] text-[var(--tg-button-text)] font-semibold text-sm shadow-md active:scale-[0.985] transition-all hover:opacity-95"
        >
          <Plus className="w-4 h-4" />
          <span>Добавить продукт (Vaul Drawer)</span>
        </button>
      </div>

      {/* Vaul Add Product Drawer */}
      <AddProductDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onAddProduct={handleAddProduct}
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
