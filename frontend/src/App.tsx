import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { TelegramProvider } from '@/context/TelegramContext';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import { AddProductDrawer } from '@/components/AddProductDrawer';
import { ProductCard } from '@/components/ProductCard';
// Recipe feature hidden per user request:
// import { EveningIdeaCard, type RecipeIdea } from '@/components/EveningIdeaCard';
// import { CookRecipeModal } from '@/components/CookRecipeModal';
import { ShareModal } from '@/components/ShareModal';
import { DiagnosticsDrawer } from '@/components/DiagnosticsDrawer';
import { ShoppingListTab } from '@/components/ShoppingListTab';
import { storage } from '@/lib/storage';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';
import { calculateFreshnessMetrics, autoDiscardExpiredProducts } from '@/lib/freshness';
import type { ProductItem, StorageType, ProductStatus, FridgeSummary, ShoppingItem } from '@/types';
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
  Bell,
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
  // Recipe states hidden per user request:
  // const [cookingRecipe, setCookingRecipe] = useState<RecipeIdea | null>(null);
  // const [cookModalOpen, setCookModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'shopping' | 'consumed' | 'discarded'>('inventory');
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

  // Shopping List state
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>(() => {
    const fId = storage.getActiveFridgeId();
    return fId ? storage.getCachedShoppingItems(fId) : [];
  });

  // Toast Notification with optional Action button (e.g. [+ В покупки])
  const [toast, setToast] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, actionLabel?: string, onAction?: () => void) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message: msg, actionLabel, onAction });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, actionLabel ? 5000 : 3500);
  }, []);

  const [isSendingTestNotify, setIsSendingTestNotify] = useState(false);

  const handleTestNotification = async () => {
    haptic.impact('medium');
    setIsSendingTestNotify(true);
    showToast('Отправка проверки в Telegram...');
    try {
      const res = await api.sendTestNotification();
      if (res.success && res.data?.delivered) {
        haptic.notification('success');
        showToast('🔔 Сообщение отправлено в Telegram бота!');
      } else {
        haptic.notification('warning');
        showToast(res.error || 'Бот не смог отправить сообщение');
      }
    } catch {
      haptic.notification('error');
      showToast('Ошибка связи с сервером');
    } finally {
      setIsSendingTestNotify(false);
    }
  };

  // Helper to safely set products and automatically discard expired items
  const applyProductsWithAutoDiscard = useCallback(
    (rawProducts: ProductItem[], targetFridgeId?: string | null): ProductItem[] => {
      const { updated, discardedCount } = autoDiscardExpiredProducts(rawProducts);

      if (discardedCount > 0) {
        logger.info('INVENTORY', `Auto-discarded ${discardedCount} expired items to Утиль`);
        if (targetFridgeId) {
          storage.saveProductsLocally(targetFridgeId, updated);
          for (const item of updated) {
            if (item.status === 'discarded') {
              const orig = rawProducts.find((p) => p.id === item.id);
              if (orig && orig.status === 'active') {
                storage.updateProduct(targetFridgeId, item.id, { status: 'discarded' }).catch(() => {});
              }
            }
          }
        }
      }

      return updated;
    },
    []
  );

  // Products state initialized from local cache with auto-discard of expired products
  const [products, setProducts] = useState<ProductItem[]>(() => {
    const cached = storage.getInitialProducts(storage.getActiveFridgeId() || undefined);
    if (cached !== null) {
      const { updated } = autoDiscardExpiredProducts(cached);
      return updated;
    }
    return INITIAL_DEMO_PRODUCTS;
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

  // 5-tap secret counter on footer version string to open Diagnostics
  const footerTapCount = useRef(0);
  const footerTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFooterVersionClick = () => {
    footerTapCount.current += 1;
    if (footerTapTimer.current) clearTimeout(footerTapTimer.current);
    if (footerTapCount.current >= 5) {
      footerTapCount.current = 0;
      haptic.notification('success');
      setDiagOpen(true);
    } else {
      footerTapTimer.current = setTimeout(() => {
        footerTapCount.current = 0;
      }, 1500);
    }
  };

  // App Initialization:
  // 1. Process Telegram start_param invite code
  // 2. Sync fridges list from D1 with persistent multi-tier retry
  // 3. Load active fridge products (Thin Client + Offline Cache)
  useEffect(() => {
    let unmounted = false;

    // Disable Telegram Mini App vertical swipe to prevent accidental gesture closes
    try {
      window.Telegram?.WebApp?.disableVerticalSwipes?.();
    } catch (e) {
      void e;
    }

    async function initializeApp() {
      // 1. Check for invite code in Telegram start_param, URL search params or URL hash
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const directFridgeId = urlParams.get('fridge_id') || hashParams.get('fridge_id');

      const rawStartParam =
        window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
        urlParams.get('startapp') ||
        urlParams.get('start_param') ||
        hashParams.get('tgWebAppStartParam');

      if (rawStartParam) {
        const inviteCode = rawStartParam.replace(/^(?:fridge_|join_)/, '').trim();
        if (inviteCode) {
          logger.info('INVITE', `Claiming invite code from start_param: ${inviteCode}`);
          try {
            const claimRes = await api.claimInvite(inviteCode);
            if (!unmounted && claimRes.success && claimRes.data?.fridge_id) {
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
      } else if (directFridgeId) {
        storage.setActiveFridgeId(directFridgeId);
        setActiveFridgeId(directFridgeId);
      }

      // 2. Synchronize fridges list and inventory with multi-tier backoff
      const delays = [0, 400, 1200, 2500];
      for (const delay of delays) {
        if (unmounted) break;
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
        if (unmounted) break;

        try {
          const syncedFridges = await storage.syncFridges();
          if (syncedFridges && syncedFridges.length > 0) {
            if (!unmounted) {
              setFridges(syncedFridges);
              const currentActive = storage.getActiveFridgeId();
              const targetFridgeId =
                syncedFridges.find((f) => f.id === currentActive)?.id || syncedFridges[0].id;
              storage.setActiveFridgeId(targetFridgeId);
              setActiveFridgeId(targetFridgeId);
              logger.info('STORAGE', `Attached to active fridge: ${targetFridgeId}`);

              // Immediate fetch from D1 during initialization
              const serverProds = await storage.fetchAndSyncProducts(targetFridgeId);
              if (!unmounted && serverProds) {
                const processed = applyProductsWithAutoDiscard(serverProds, targetFridgeId);
                setProducts(processed);
                setSyncState('connected');
              }
              const serverShop = await storage.fetchAndSyncShoppingItems(targetFridgeId);
              if (!unmounted && serverShop) {
                setShoppingItems(serverShop);
              }
            }
            break;
          }
        } catch (e) {
          logger.warn('STORAGE', `Sync attempt at +${delay}ms failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    initializeApp();

    return () => {
      unmounted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncState, setSyncState] = useState<'connected' | 'syncing' | 'offline'>('connected');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Background refresh helper: resolves active fridge, drains queue, and pulls latest state from D1
  const refreshProducts = useCallback(async (isManual = false) => {
    setIsSyncing(true);
    setSyncState('syncing');
    try {
      // 1. Re-sync fridges list to verify active membership
      const syncedFridges = await storage.syncFridges();
      let targetId = activeFridgeId;

      if (syncedFridges && syncedFridges.length > 0) {
        setFridges(syncedFridges);
        const currentActive = storage.getActiveFridgeId();
        const activeValid = syncedFridges.some((f) => f.id === currentActive);
        targetId = activeValid ? currentActive! : syncedFridges[0].id;
        if (targetId !== activeFridgeId) {
          storage.setActiveFridgeId(targetId);
          setActiveFridgeId(targetId);
        }
      }

      if (targetId) {
        // 2. Fetch fresh products from D1 with flush-before-fetch
        const serverProducts = await storage.fetchAndSyncProducts(targetId);
        if (serverProducts) {
          const processed = applyProductsWithAutoDiscard(serverProducts, targetId);
          setProducts(processed);
          setSyncState('connected');
          setLastSyncError(null);
          if (isManual) {
            haptic.notification('success');
            showToast('Облачная синхронизация выполнена 🌿');
          }
        } else {
          const err = storage.getLastSyncError() || 'Сервер временно недоступен';
          setSyncState('offline');
          setLastSyncError(err);
          if (isManual) {
            haptic.notification('warning');
            showToast(`Офлайн: ${err} 📦`);
          }
        }

        // 3. Fetch fresh shopping list from D1
        const serverShopping = await storage.fetchAndSyncShoppingItems(targetId);
        if (serverShopping) {
          setShoppingItems(serverShopping);
        }
      } else {
        const err = storage.getLastSyncError() || 'Холодильник не выбран';
        setSyncState('offline');
        setLastSyncError(err);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.warn('STORAGE', `Refresh failed: ${errMsg}`);
      setSyncState('offline');
      setLastSyncError(errMsg);
      if (isManual) {
        haptic.notification('error');
        showToast(`Ошибка синхронизации: ${errMsg}`);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [activeFridgeId, applyProductsWithAutoDiscard, showToast, haptic]);

  // Load products & shopping items when activeFridgeId changes
  useEffect(() => {
    if (!activeFridgeId) return;

    // 1. Instant render from local cache with auto-discard
    const cached = storage.getInitialProducts(activeFridgeId);
    if (cached !== null) {
      const processed = applyProductsWithAutoDiscard(cached, activeFridgeId);
      setProducts(processed);
    }
    const cachedShopping = storage.getCachedShoppingItems(activeFridgeId);
    setShoppingItems(cachedShopping);

    // 2. Background sync to D1 server
    refreshProducts();
  }, [activeFridgeId, refreshProducts, applyProductsWithAutoDiscard]);

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
    } catch {
      // ignore sync failure, will fallback to null
    }
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

  // Add item to shopping list (from product card or toast)
  const handleAddToShopping = async (product: { name: string; storage_type?: StorageType; unit?: string }) => {
    const targetFridgeId = await ensureActiveFridge();
    if (!targetFridgeId) return;

    haptic.impact('light');
    const newItem = await storage.addShoppingItem(targetFridgeId, {
      name: product.name,
      storage_type: product.storage_type || 'fridge',
      quantity: 1,
      unit: product.unit || 'шт',
      shelf_life_days: product.storage_type === 'freezer' ? 90 : product.storage_type === 'pantry' ? 60 : 7,
    });

    setShoppingItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
    showToast(`«${product.name}» добавлено в покупки 🛒`);
  };

  // Consume product (supports partial decrements or full consumption)
  const handleConsumeProduct = async (id: string, delta?: number) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const targetFridgeId = await ensureActiveFridge();

    if (delta && delta < product.quantity) {
      // Partial consumption:
      const newQty = Math.max(0, Math.round((product.quantity - delta) * 1000) / 1000);
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, quantity: newQty, updated_at: new Date().toISOString() } : p))
      );
      if (targetFridgeId) {
        await storage.updateProduct(targetFridgeId, id, { delta_consumed: delta });
      }
      haptic.notification('success');
      showToast(`Списано: ${delta} ${product.unit}`);
    } else {
      // Full consumption:
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: 'consumed', updated_at: new Date().toISOString() } : p))
      );
      if (targetFridgeId) {
        await storage.updateProduct(targetFridgeId, id, { status: 'consumed' });
      }
      haptic.notification('success');
      showToast(`«${product.name}» съедено`, '+ В покупки', () => {
        handleAddToShopping(product);
      });
    }
    logger.info('INVENTORY', `Item ${id} consumed (delta=${delta || 'all'})`);
  };

  // Discard product (1-tap immediate discard with "+ В покупки" toast action)
  const handleDiscardProduct = async (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const targetFridgeId = await ensureActiveFridge();

    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'discarded', updated_at: new Date().toISOString() } : p))
    );
    if (targetFridgeId) {
      await storage.updateProduct(targetFridgeId, id, { status: 'discarded' });
    }
    haptic.impact('medium');
    showToast(`«${product.name}» списано в утиль`, '+ В покупки', () => {
      handleAddToShopping(product);
    });
    logger.info('INVENTORY', `Item ${id} discarded`);
  };

  // Generic status change (used for restore to active)
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

  // Shopping list CRUD handlers
  const handleAddShoppingItem = async (item: Partial<ShoppingItem>) => {
    const targetFridgeId = await ensureActiveFridge();
    if (!targetFridgeId) return;
    const created = await storage.addShoppingItem(targetFridgeId, item);
    setShoppingItems((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);
  };

  const handleToggleShoppingItem = async (id: string, isChecked: boolean) => {
    const targetFridgeId = await ensureActiveFridge();
    if (!targetFridgeId) return;
    setShoppingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, is_checked: isChecked ? 1 : 0 } : item))
    );
    await storage.toggleShoppingItem(targetFridgeId, id, isChecked);
  };

  const handleDeleteShoppingItem = async (id: string) => {
    const targetFridgeId = await ensureActiveFridge();
    if (!targetFridgeId) return;
    setShoppingItems((prev) => prev.filter((item) => item.id !== id));
    await storage.deleteShoppingItem(targetFridgeId, id);
  };

  const handleTransferShoppingToFridge = async () => {
    const targetFridgeId = await ensureActiveFridge();
    if (!targetFridgeId) return;
    haptic.notification('success');
    const addedProducts = await storage.transferShoppingItems(targetFridgeId);
    const remainingShopping = storage.getCachedShoppingItems(targetFridgeId);
    setShoppingItems(remainingShopping);
    setProducts((prev) => [...addedProducts, ...prev]);
    showToast(`Перенесено в запасы: ${addedProducts.length} поз.`);
    setActiveTab('inventory');
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

  /* Recipe cooking logic hidden per user request:
  const handleCookRecipe = (recipe: RecipeIdea) => {
    setCookingRecipe(recipe);
    setCookModalOpen(true);
  };

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
    logger.info('COOKING', `Consumed ${productIds.length} ingredients for recipe`);
  };
  */

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
      {/* Floating Toast Notification with Action button */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-50 flex items-center justify-center animate-fadeIn pointer-events-none">
          <div className="rounded-2xl backdrop-blur-2xl bg-[#121615]/95 border border-[#5E8B7E]/40 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)] flex items-center justify-between gap-3 text-xs text-[#F1F5F4] w-full max-w-sm pointer-events-auto">
            <div className="flex items-center gap-2.5 truncate">
              <CheckCircle2 className="w-4 h-4 text-[#5E8B7E] shrink-0" />
              <span className="font-medium truncate">{toast.message}</span>
            </div>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-[#5E8B7E] hover:bg-[#486e63] text-[#F1F5F4] font-semibold text-[11px] shadow-sm transition-all active:scale-95"
              >
                {toast.actionLabel}
              </button>
            )}
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
                refreshProducts(true);
              }}
              className="p-2 rounded-xl backdrop-blur-md bg-white/[0.05] border border-white/[0.06] text-[#8FA39D] hover:text-[#F1F5F4] hover:bg-white/[0.08] active:scale-95 transition-all shadow-xs"
              title="Синхронизировать с облаком"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#5E8B7E]' : ''}`} />
            </button>

            {/* Test Notification / Bell Button */}
            <button
              type="button"
              onClick={handleTestNotification}
              disabled={isSendingTestNotify}
              className="p-2 rounded-xl backdrop-blur-md bg-white/[0.05] border border-white/[0.06] text-[#8FA39D] hover:text-[#F1F5F4] hover:bg-white/[0.08] active:scale-95 transition-all shadow-xs disabled:opacity-50"
              title="Проверить уведомления бота"
            >
              <Bell className={`w-3.5 h-3.5 ${isSendingTestNotify ? 'animate-bounce text-amber-300' : 'text-amber-200'}`} />
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

      {/* 2. НАВИГАЦИЯ (чистые текстовые вкладки) */}
      <nav className="flex items-center justify-around border-b border-white/[0.06] pt-1 pb-0.5">
        {[
          { id: 'inventory' as const, label: `Запасы (${counts.active})` },
          { id: 'shopping' as const, label: `Покупки${shoppingItems.length > 0 ? ` (${shoppingItems.length})` : ''}` },
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

      {/* 3. ТАБ ПОКУПОК / СПИСОК «ЧТО ЗАКОНЧИЛОСЬ» */}
      {activeTab === 'shopping' ? (
        <ShoppingListTab
          items={shoppingItems}
          onAddItem={handleAddShoppingItem}
          onToggleItem={handleToggleShoppingItem}
          onDeleteItem={handleDeleteShoppingItem}
          onTransferToFridge={handleTransferShoppingToFridge}
        />
      ) : (
        <>
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

          {/* 4. БЛОК РЕЦЕПТОВ («Идея на вечер» временно скрыт по запросу пользователя) */}
          {/* activeTab === 'inventory' && activeZone === 'all' && selectedCategory === 'Все' && !searchQuery && (
            <EveningIdeaCard products={products} onCookRecipe={handleCookRecipe} />
          ) */}

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
                  onConsume={handleConsumeProduct}
                  onDiscard={handleDiscardProduct}
                  onRestore={() => setProductStatus(product.id, 'active')}
                  onDelete={handleDeleteProduct}
                  onOpenPackage={handleOpenPackage}
                  onAddToShopping={handleAddToShopping}
                />
              ))
            )}
          </section>
        </>
      )}

      {/* 9. ФУТЕР (Кликабельная версия с секретным 5-тапом для перехода в диагностику) */}
      <footer className="pt-4 pb-2 text-center select-none">
        <button
          type="button"
          onClick={handleFooterVersionClick}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#8FA39D]/40 hover:text-[#8FA39D] active:scale-95 transition-all"
        >
          <span>
            {syncState === 'connected'
              ? 'Свежесть v1.2 • Облако подключено 🌿'
              : syncState === 'syncing'
              ? 'Свежесть v1.2 • Синхронизация... ⏳'
              : `Свежесть v1.2 • Офлайн: ${lastSyncError || 'локальные данные'} 📦`}
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
        activeFridgeId={activeFridgeId}
        onOpenChange={setDrawerOpen}
        onAddProduct={handleAddProduct}
      />

      {/* Quick Cook Recipe Drawer (hidden per user request) */}
      {/* <CookRecipeModal
        open={cookModalOpen}
        onOpenChange={setCookModalOpen}
        recipe={cookingRecipe}
        onConsumeIngredients={handleConsumeRecipeIngredients}
      /> */}

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
