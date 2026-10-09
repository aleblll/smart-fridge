import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { TelegramProvider } from '@/context/TelegramContext';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import { AddProductDrawer } from '@/components/AddProductDrawer';
import { ProductCard } from '@/components/ProductCard';
import { EveningIdeaCard, type RecipeIdea } from '@/components/EveningIdeaCard';
import { CookRecipeModal } from '@/components/CookRecipeModal';
import { ShareModal } from '@/components/ShareModal';
import { DiagnosticsDrawer } from '@/components/DiagnosticsDrawer';
import { storage } from '@/lib/storage';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';
import { calculateFreshnessMetrics } from '@/lib/freshness';
import type { ProductItem, StorageType, ProductStatus, FridgeSummary } from '@/types';
import {
  Plus,
  Users,
  Search,
  Sparkles,
  Snowflake,
  Archive,
  Refrigerator,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

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
    after_opening_hours: 48,
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
    after_opening_hours: 120,
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
  const [cookingRecipe, setCookingRecipe] = useState<RecipeIdea | null>(null);
  const [cookModalOpen, setCookModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'consumed' | 'discarded'>('inventory');
  const [activeZone, setActiveZone] = useState<StorageType | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fridge Management
  const [fridges, setFridges] = useState<FridgeSummary[]>(() => {
    return storage.getCachedFridges() || [];
  });
  const [activeFridgeId, setActiveFridgeId] = useState<string>(() => {
    return storage.getActiveFridgeId() || '';
  });
  const [fridgeSelectorOpen, setFridgeSelectorOpen] = useState(false);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Products state initialized from local cache
  const [products, setProducts] = useState<ProductItem[]>(() => {
    const cached = storage.getInitialProducts(storage.getActiveFridgeId() || undefined);
    return cached !== null ? cached : INITIAL_DEMO_PRODUCTS;
  });

  const activeFridge = useMemo(() => {
    return fridges.find((f) => f.id === activeFridgeId) || fridges[0] || null;
  }, [fridges, activeFridgeId]);

  // Hidden Easter Egg: Triple-tap or long-press on header title to open diagnostics
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHeaderTitleClick = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      haptic.notification('success');
      setDiagOpen(true);
    } else {
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, 500);
    }
  };

  const handleHeaderTitleTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      haptic.notification('success');
      setDiagOpen(true);
    }, 750);
  };

  const handleHeaderTitleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // App Initialization:
  // 1. Process Telegram start_param invite code
  // 2. Sync fridges list from D1
  // 3. Load active fridge products (Thin Client + Offline Cache)
  useEffect(() => {
    let isCancelled = false;

    async function initializeApp() {
      // 1. Check for invite code in Telegram start_param
      const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
      if (startParam) {
        const inviteCode = startParam.replace(/^fridge_/, '').trim();
        if (inviteCode) {
          logger.info('INVITE', `Claiming invite code from start_param: ${inviteCode}`);
          try {
            const claimRes = await api.claimInvite(inviteCode);
            if (!isCancelled && claimRes.success && claimRes.data?.fridge_id) {
              const joinedFridgeId = claimRes.data.fridge_id;
              storage.setActiveFridgeId(joinedFridgeId);
              setActiveFridgeId(joinedFridgeId);
              haptic.notification('success');
              showToast('Вы успешно присоединились к семейному холодильнику!');
            }
          } catch (e) {
            logger.warn('INVITE', `Failed to claim invite: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // 2. Synchronize fridges list with automatic retry
      const attemptSync = async () => {
        try {
          const syncedFridges = await storage.syncFridges();
          if (!isCancelled && syncedFridges.length > 0) {
            setFridges(syncedFridges);
            const currentActive = storage.getActiveFridgeId();
            const targetFridgeId =
              syncedFridges.find((f) => f.id === currentActive)?.id || syncedFridges[0].id;
            storage.setActiveFridgeId(targetFridgeId);
            setActiveFridgeId(targetFridgeId);
            return true;
          }
        } catch (e) {
          logger.warn('STORAGE', `Failed syncing fridges: ${e instanceof Error ? e.message : String(e)}`);
        }
        return false;
      };

      const success = await attemptSync();
      if (!success && !isCancelled) {
        // Retry after Telegram WebApp finishes handshake and populates initData
        setTimeout(() => {
          if (!isCancelled) {
            attemptSync();
          }
        }, 1500);
      }
    }

    initializeApp();

    return () => {
      isCancelled = true;
    };
  }, [haptic, showToast]);

  const [isSyncing, setIsSyncing] = useState(false);

  // Background refresh helper: resolves active fridge if needed, then syncs products
  const refreshProducts = useCallback(async () => {
    setIsSyncing(true);
    try {
      let targetId = activeFridgeId;
      if (!targetId) {
        const synced = await storage.syncFridges();
        if (synced && synced.length > 0) {
          targetId = synced[0].id;
          setFridges(synced);
          storage.setActiveFridgeId(targetId);
          setActiveFridgeId(targetId);
        }
      }
      if (targetId) {
        await storage.loadProducts(targetId, (serverProducts) => {
          setProducts(serverProducts);
        });
      }
    } catch (e) {
      logger.warn('STORAGE', `Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  }, [activeFridgeId]);

  // Load products when activeFridgeId changes
  useEffect(() => {
    if (!activeFridgeId) return;

    // 1. Instant render from local cache
    const cached = storage.getInitialProducts(activeFridgeId);
    if (cached !== null) {
      setProducts(cached);
    }

    // 2. Background sync to D1 server
    refreshProducts();
  }, [activeFridgeId, refreshProducts]);

  // Auto-refresh when app window regains focus or comes into foreground
  useEffect(() => {
    const handleFocus = () => {
      refreshProducts();
    };

    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshProducts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshProducts]);

  // Handle switching active fridge
  const handleSelectFridge = (fridgeId: string) => {
    haptic.selection();
    storage.setActiveFridgeId(fridgeId);
    setActiveFridgeId(fridgeId);
    setFridgeSelectorOpen(false);
  };

  // Helper to ensure active fridge exists before mutation
  const ensureActiveFridge = async (): Promise<string | null> => {
    if (activeFridgeId) return activeFridgeId;
    try {
      const synced = await storage.syncFridges();
      if (synced && synced.length > 0) {
        const firstId = synced[0].id;
        storage.setActiveFridgeId(firstId);
        setActiveFridgeId(firstId);
        setFridges(synced);
        return firstId;
      }
    } catch {}
    return null;
  };

  // Handle adding new product
  const handleAddProduct = async (
    newProductData: Omit<ProductItem, 'id' | 'added_by' | 'updated_at'>
  ) => {
    const targetFridgeId = await ensureActiveFridge();

    const newProduct: ProductItem = {
      ...newProductData,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fridge_id: targetFridgeId || undefined,
      added_by: user?.id || 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setProducts((prev) => [newProduct, ...prev]);

    if (targetFridgeId) {
      await storage.addProduct(targetFridgeId, newProduct);
    }
  };

  // Change status (consume / discard / restore)
  const setProductStatus = async (id: string, newStatus: ProductStatus) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: newStatus, updated_at: new Date().toISOString() } : p
      )
    );

    const targetFridgeId = await ensureActiveFridge();
    if (targetFridgeId) {
      await storage.updateProduct(targetFridgeId, id, { status: newStatus });
    }
    logger.info('INVENTORY', `Item ${id} status changed to ${newStatus}`);
  };

  // Handle opening product packaging («Вскрыто»)
  const handleOpenPackage = async (
    id: string,
    updates: { opened_at: string; expires_at: string }
  ) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
      )
    );

    const targetFridgeId = await ensureActiveFridge();
    if (targetFridgeId) {
      await storage.updateProduct(targetFridgeId, id, updates);
    }
    logger.info('INVENTORY', `Item ${id} package opened, new expiry: ${updates.expires_at}`);
  };

  // Handle cooking recipe: open recipe modal
  const handleCookRecipe = (recipe: RecipeIdea) => {
    setCookingRecipe(recipe);
    setCookModalOpen(true);
  };

  // Handle consuming recipe ingredients
  const handleConsumeRecipeIngredients = async (productIds: string[]) => {
    setProducts((prev) =>
      prev.map((p) =>
        productIds.includes(p.id)
          ? { ...p, status: 'consumed' as ProductStatus, updated_at: new Date().toISOString() }
          : p
      )
    );
    setCookModalOpen(false);

    const targetFridgeId = await ensureActiveFridge();
    if (targetFridgeId) {
      for (const pid of productIds) {
        storage.updateProduct(targetFridgeId, pid, { status: 'consumed' }).catch(() => {});
      }
    }
    logger.info('COOKING', `Consumed ${productIds.length} ingredients for recipe "${cookingRecipe?.title}"`);
  };

  // Permanently delete product
  const handleDeleteProduct = async (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    const targetFridgeId = await ensureActiveFridge();
    if (targetFridgeId) {
      await storage.deleteProduct(targetFridgeId, id);
    }
    logger.info('INVENTORY', `Item ${id} permanently removed`);
  };

  // Count items and freshness balance with calculateFreshnessMetrics
  const counts = useMemo(() => {
    let active = 0;
    let expiringSoon = 0;
    let fresh = 0;
    let consumed = 0;
    let discarded = 0;

    for (const p of products) {
      if (p.status === 'active') {
        active++;
        const metrics = calculateFreshnessMetrics(
          p.expires_at,
          p.created_at,
          p.notify_before_days ?? 3
        );
        if (metrics.statusTag === 'expiring' || metrics.statusTag === 'expired') {
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
    <div className="min-h-screen text-[#F1F5F4] px-4 py-5 max-w-md mx-auto space-y-4 pb-28">
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-4 right-4 z-50 flex items-center justify-center pointer-events-none animate-fadeIn">
          <div className="rounded-2xl backdrop-blur-2xl bg-[#121615]/95 border border-[#5E8B7E]/40 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)] flex items-center gap-2.5 text-xs text-[#F1F5F4]">
            <CheckCircle2 className="w-4 h-4 text-[#5E8B7E] shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* 1. HERO-БЛОК СВЕЖЕСТИ (Mindora Calming Wellness Frosted Glass) */}
      <header className="rounded-2xl backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.25)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          {/* Header Title with Easter Egg: Triple-tap or Long-press opens Diagnostics */}
          <div
            onClick={handleHeaderTitleClick}
            onTouchStart={handleHeaderTitleTouchStart}
            onTouchEnd={handleHeaderTitleTouchEnd}
            onMouseDown={handleHeaderTitleTouchStart}
            onMouseUp={handleHeaderTitleTouchEnd}
            className="flex items-center gap-2 cursor-pointer select-none active:opacity-85 transition-opacity"
            title="Свежесть"
          >
            <h1 className="text-xl font-semibold tracking-tight text-[#F1F5F4]">Свежесть</h1>
            <span className="text-xs font-medium text-[#8FA39D] font-mono">
              • {counts.active} {counts.active === 1 ? 'продукт' : counts.active < 5 ? 'продукта' : 'продуктов'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Multiple fridges selector or fridge badge */}
            {fridges.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    haptic.impact('light');
                    setFridgeSelectorOpen((prev) => !prev);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl backdrop-blur-md bg-white/[0.05] border border-white/[0.06] text-xs text-[#8FA39D] hover:text-[#F1F5F4] active:scale-95 transition-all shadow-xs"
                >
                  <span className="truncate max-w-[90px]">{activeFridge?.name || 'Холодильник'}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>

                {fridgeSelectorOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 rounded-2xl backdrop-blur-2xl bg-[#121615]/95 border border-white/[0.08] shadow-2xl p-1.5 z-40 space-y-0.5 animate-fadeIn">
                    {fridges.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleSelectFridge(f.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all ${
                          f.id === activeFridgeId
                            ? 'bg-[#5E8B7E]/20 text-[#F1F5F4] font-medium'
                            : 'text-[#8FA39D] hover:bg-white/[0.04] hover:text-[#F1F5F4]'
                        }`}
                      >
                        <span className="truncate">{f.name}</span>
                        {f.role === 'owner' ? (
                          <span className="text-[10px] text-[#5E8B7E] font-mono">Владелец</span>
                        ) : (
                          <span className="text-[10px] text-[#A7C7E7] font-mono">Семья</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Refresh / Sync Button */}
            <button
              type="button"
              onClick={() => {
                haptic.impact('light');
                refreshProducts();
              }}
              className="p-2 rounded-xl backdrop-blur-md bg-white/[0.05] border border-white/[0.06] text-[#8FA39D] hover:text-[#F1F5F4] hover:bg-white/[0.08] active:scale-95 transition-all shadow-xs"
              title="Синхронизировать с облаком"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#5E8B7E]' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                haptic.impact('light');
                setShareModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md bg-white/[0.05] border border-white/[0.06] text-xs font-medium text-[#F1F5F4] hover:bg-white/[0.08] active:scale-95 transition-all shadow-xs"
              title="Семейный доступ"
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
            <div className="w-full bg-white/[0.06] rounded-full h-[3px] overflow-hidden flex">
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

      {/* 4. ПРОДУКТОВАЯ МАГИЯ: БЛОК «✦ ИДЕЯ НА ВЕЧЕР» (Mindora Frosted Glass) */}
      {activeTab === 'inventory' && activeZone === 'all' && selectedCategory === 'Все' && !searchQuery && (
        <EveningIdeaCard products={products} onCookRecipe={handleCookRecipe} />
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
                  ? 'backdrop-blur-md bg-white/[0.08] text-[#F1F5F4] font-medium border border-white/[0.12] shadow-xs'
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
          className="w-full pl-9 pr-4 py-2.5 rounded-2xl backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] text-xs text-[#F1F5F4] placeholder-[#8FA39D]/60 focus:outline-none focus:border-[#5E8B7E] transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]"
        />
      </div>

      {/* 7. СПИСОК ПРОДУКТОВ (Карточки Mindora с главным героем — едой) */}
      <section className="space-y-2.5 pt-1">
        {displayedProducts.length === 0 ? (
          <div className="py-12 px-6 rounded-2xl backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.25)] text-center space-y-2.5">
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
              onOpenPackage={handleOpenPackage}
            />
          ))
        )}
      </section>

      {/* 9. ФУТЕР (Кликабельная версия для быстрого доступа к диагностике) */}
      <footer className="pt-4 pb-2 text-center select-none">
        <button
          type="button"
          onClick={() => {
            haptic.impact('light');
            setDiagOpen(true);
          }}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#8FA39D]/40 hover:text-[#8FA39D] active:scale-95 transition-all"
        >
          <span>
            {activeFridgeId ? 'Свежесть v1.1 • Облако подключено 🌿' : 'Свежесть v1.1 • Автономный режим ⚡'}
          </span>
        </button>
      </footer>

      {/* 8. FLOATING ACTION BUTTON (Primary Mindora Sage Button с мягким переливом) */}
      {activeTab === 'inventory' && (
        <div className="fixed bottom-5 left-0 right-0 max-w-md mx-auto px-4 pointer-events-none z-30">
          <button
            type="button"
            onClick={() => {
              haptic.impact('medium');
              setDrawerOpen(true);
            }}
            className="pointer-events-auto w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] font-semibold text-sm shadow-lg shadow-[#5E8B7E]/20 hover:brightness-105 active:scale-[0.985] transition-all"
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

      {/* Quick Cook Recipe Drawer */}
      <CookRecipeModal
        open={cookModalOpen}
        onOpenChange={setCookModalOpen}
        recipe={cookingRecipe}
        onConsumeIngredients={handleConsumeRecipeIngredients}
      />

      {/* Share Family Modal */}
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        activeFridgeId={activeFridge?.id}
        fridgeName={activeFridge?.name}
      />

      {/* Diagnostics / Logs Drawer */}
      <DiagnosticsDrawer open={diagOpen} onOpenChange={setDiagOpen} />
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
