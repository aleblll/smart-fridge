import { triggerHapticNotification } from './haptics';

export interface ScannedProductDraft {
  barcode: string;
  name: string;
  category: string;
  storageType: 'fridge' | 'freezer' | 'pantry';
  unit: 'шт' | 'кг' | 'г' | 'л' | 'уп';
  quantity: number;
  estimatedShelfLifeDays: number;
  isApproximateDate: boolean;
}

const LOCAL_BARCODE_CACHE_KEY = 'smart_fridge_barcode_cache_v1';

// Базовая матрица примерных сроков годности по тегам категорий OpenFoodFacts
const CATEGORY_SHELF_LIFE_FALLBACKS: Array<{
  pattern: RegExp;
  categoryName: string;
  storageType: 'fridge' | 'freezer' | 'pantry';
  days: number;
  defaultUnit: 'шт' | 'кг' | 'г' | 'л' | 'уп';
}> = [
  { pattern: /milk|молок|кефир|сливк|ряженк/i, categoryName: 'Молочная продукция', storageType: 'fridge', days: 7, defaultUnit: 'л' },
  { pattern: /yogurt|йогурт|творог|сметан|сырок/i, categoryName: 'Молочная продукция', storageType: 'fridge', days: 10, defaultUnit: 'шт' },
  { pattern: /cheese|сыр/i, categoryName: 'Сыры', storageType: 'fridge', days: 14, defaultUnit: 'г' },
  { pattern: /meat|poultry|chicken|мяс|птиц|куриц|индейк|фарш|охлажден/i, categoryName: 'Мясо и птица', storageType: 'fridge', days: 3, defaultUnit: 'уп' },
  { pattern: /sausage|колбас|сосиск|ветчин/i, categoryName: 'Мясо и птица', storageType: 'fridge', days: 10, defaultUnit: 'уп' },
  { pattern: /fish|seafood|рыб|креветк|форель|семг/i, categoryName: 'Рыба', storageType: 'fridge', days: 3, defaultUnit: 'уп' },
  { pattern: /frozen|заморож|пельмен|морожен/i, categoryName: 'Заморозка', storageType: 'freezer', days: 90, defaultUnit: 'уп' },
  { pattern: /flour|pasta|grocer|круп|мука|макарон|рис|гречк|консерв/i, categoryName: 'Бакалея и консервы', storageType: 'pantry', days: 180, defaultUnit: 'уп' },
];

export function openTelegramBarcodeScanner(): Promise<string | null> {
  return new Promise((resolve) => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.showScanQrPopup) {
      resolve(null);
      return;
    }

    let isDone = false;
    const finish = (result: string | null) => {
      if (isDone) return;
      isDone = true;
      try {
        tg.offEvent?.('scanQrPopupClosed', handleClosed);
      } catch (e) {
        void e;
      }
      resolve(result);
    };

    const handleClosed = () => {
      finish(null);
    };

    try {
      tg.onEvent?.('scanQrPopupClosed', handleClosed);
    } catch (e) {
      void e;
    }

    try {
      tg.showScanQrPopup(
        { text: 'Наведите камеру на штрихкод или QR-код товара' },
        (scannedText: string) => {
          const raw = scannedText?.trim();
          if (!raw) return false;

          // 1. Direct standard digits: EAN-13, EAN-8, UPC (8-14 digits)
          const digitsMatch = raw.match(/\b\d{8,14}\b/);
          let extractedBarcode = '';

          if (digitsMatch) {
            extractedBarcode = digitsMatch[0];
          } else if (/^01\d{14}/.test(raw)) {
            // 2. Russian "Честный Знак" / GS1 DataMatrix (dairy, water, pharmacy)
            // Starts with 01 + 14-digit GTIN. EAN-13 is usually digits 3-15 or GTIN without leading 0
            const gtin = raw.slice(2, 16);
            extractedBarcode = gtin.startsWith('0') ? gtin.slice(1) : gtin;
          } else if (raw.length >= 4 && raw.length <= 64) {
            // 3. Any other alphanumeric barcode / QR code
            extractedBarcode = raw;
          }

          if (extractedBarcode) {
            try {
              tg.closeScanQrPopup?.();
            } catch (e) {
              void e;
            }
            triggerHapticNotification('success');
            finish(extractedBarcode);
            return true;
          }

          return false;
        }
      );
    } catch (e) {
      console.warn('showScanQrPopup error:', e);
      finish(null);
    }
  });
}

export async function resolveProductByBarcode(
  barcode: string,
  localPresets: Array<{ name: string; category?: string; storage_type: 'fridge' | 'freezer' | 'pantry'; shelf_life_days: number; unit?: any }>
): Promise<ScannedProductDraft> {
  // 1. Проверяем локальный кэш ранее отсканированных товаров семьи
  try {
    const cachedMap = JSON.parse(localStorage.getItem(LOCAL_BARCODE_CACHE_KEY) || '{}');
    if (cachedMap[barcode]) {
      return { ...cachedMap[barcode], isApproximateDate: true };
    }
  } catch (e) {
    void e;
  }

  let productName = '';
  let rawCategories = '';

  // 2. Бесплатный запрос в открытую базу OpenFoodFacts API
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_ru,categories,categories_tags`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.status === 1 && data?.product) {
        productName = (data.product.product_name_ru || data.product.product_name || '').trim();
        rawCategories = [
          data.product.categories || '',
          ...(data.product.categories_tags || []),
        ].join(' ');
      }
    }
  } catch (e) {
    void e;
    // При офлайне или ошибке сети просто открываем форму с пустым названием
  }

  // 3. Пытаемся найти совпадение в локальной базе foodPresets.json
  const combinedSearchText = `${productName} ${rawCategories}`.toLowerCase();
  const matchedPreset = localPresets.find((p) =>
    p.name && combinedSearchText.includes(p.name.toLowerCase())
  );

  if (matchedPreset) {
    const draft: ScannedProductDraft = {
      barcode,
      name: productName || matchedPreset.name,
      category: matchedPreset.category || 'Разное',
      storageType: matchedPreset.storage_type,
      unit: (matchedPreset.unit === 'l' ? 'л' : matchedPreset.unit === 'kg' ? 'кг' : matchedPreset.unit === 'g' ? 'г' : matchedPreset.unit === 'pack' ? 'уп' : 'шт') as any,
      quantity: 1,
      estimatedShelfLifeDays: matchedPreset.shelf_life_days,
      isApproximateDate: true,
    };
    saveBarcodeToLocalCache(barcode, draft);
    return draft;
  }

  // 4. Фоллбэк по категории продукта
  for (const rule of CATEGORY_SHELF_LIFE_FALLBACKS) {
    if (rule.pattern.test(combinedSearchText)) {
      const draft: ScannedProductDraft = {
        barcode,
        name: productName,
        category: rule.categoryName,
        storageType: rule.storageType,
        unit: rule.defaultUnit,
        quantity: 1,
        estimatedShelfLifeDays: rule.days,
        isApproximateDate: true,
      };
      if (productName) saveBarcodeToLocalCache(barcode, draft);
      return draft;
    }
  }

  // 5. Дефолт, если штрихкод редкий (даём +7 дней и возможность сразу поправить дату)
  return {
    barcode,
    name: productName,
    category: 'Молочная продукция',
    storageType: 'fridge',
    unit: 'шт',
    quantity: 1,
    estimatedShelfLifeDays: 7,
    isApproximateDate: true,
  };
}

export function saveBarcodeToLocalCache(barcode: string, draft: ScannedProductDraft): void {
  try {
    const cachedMap = JSON.parse(localStorage.getItem(LOCAL_BARCODE_CACHE_KEY) || '{}');
    cachedMap[barcode] = draft;
    localStorage.setItem(LOCAL_BARCODE_CACHE_KEY, JSON.stringify(cachedMap));
  } catch {
    // Ignore storage quota errors
  }
}
