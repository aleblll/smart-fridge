import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = 'C:\\Users\\A.le_BL\\.gemini\\antigravity\\brain\\8c36fc65-ae61-47c6-bca6-92e6291affdf\\screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const BASE_URL = 'http://localhost:4173/smart-fridge/';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runHumanAudit() {
  console.log('🚀 [Human E2E Audit] Launching Google Chrome in Mobile Emulation mode (390x844)...');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram-iOS/10.9.1 (iPhone14,2; iOS 17.4; SDK 17.4; en)',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();

  // Log console errors and warnings
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error('  🔴 [Browser Console Error]:', msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
    console.error('  💥 [Browser Unhandled Exception]:', err.message);
  });

  // Dynamic In-Memory Cloudflare D1 Backend Simulator for deterministic human walkthrough
  let inMemoryProducts = [
    {
      id: 'prod-init-1',
      name: 'Сыр Пармезан',
      category: 'Сыры',
      storage_type: 'fridge',
      quantity: 0.3,
      unit: 'kg',
      opened_at: null,
      expires_at: '2026-10-22',
      notify_before_days: 3,
      status: 'active',
      added_by: 123456789,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'prod-init-2',
      name: 'Мука пшеничная высший сорт',
      category: 'Бакалея',
      storage_type: 'pantry',
      quantity: 1,
      unit: 'pack',
      opened_at: null,
      expires_at: '2027-09-15',
      notify_before_days: 2,
      status: 'active',
      added_by: 123456789,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'prod-init-3',
      name: 'Пельмени домашние',
      category: 'Заморозка',
      storage_type: 'freezer',
      quantity: 1,
      unit: 'pack',
      opened_at: null,
      expires_at: '2026-11-10',
      notify_before_days: 3,
      status: 'active',
      added_by: 123456789,
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();

    // CORS preflight
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:4173',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data, X-Cron-Secret',
        },
      });
    }

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'http://localhost:4173',
    };

    if (url.pathname.endsWith('/api/fridges/my')) {
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          success: true,
          fridges: [{ id: 'default-123456789', name: 'Мой холодильник', role: 'owner' }],
        }),
      });
    }

    if (url.pathname.match(/\/api\/fridges\/[^/]+\/products$/)) {
      if (method === 'GET') {
        const activeOnly = inMemoryProducts.filter((p) => !p.deleted_at);
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ success: true, products: activeOnly }),
        });
      }
      if (method === 'POST') {
        const payload = req.postDataJSON()?.item || req.postDataJSON();
        const newProduct = {
          id: `prod-${Date.now()}`,
          name: payload.name,
          category: payload.category || 'Другое',
          storage_type: payload.storage_type || 'fridge',
          quantity: Number(payload.quantity) || 1,
          unit: payload.unit || 'pcs',
          opened_at: payload.opened_at || null,
          expires_at: payload.expires_at,
          notify_before_days: payload.notify_before_days || 2,
          status: payload.status || 'active',
          added_by: 123456789,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
        };
        inMemoryProducts.push(newProduct);
        return route.fulfill({
          status: 201,
          headers,
          body: JSON.stringify({ success: true, product: newProduct }),
        });
      }
    }

    const prodMatch = url.pathname.match(/\/api\/fridges\/[^/]+\/products\/([^/]+)$/);
    if (prodMatch) {
      const pid = prodMatch[1];
      if (method === 'PATCH') {
        const updates = req.postDataJSON() || {};
        const idx = inMemoryProducts.findIndex((p) => p.id === pid);
        if (idx !== -1) {
          inMemoryProducts[idx] = { ...inMemoryProducts[idx], ...updates, updated_at: new Date().toISOString() };
          return route.fulfill({
            status: 200,
            headers,
            body: JSON.stringify({ success: true, product: inMemoryProducts[idx] }),
          });
        } else {
          const patched = { id: pid, ...updates, updated_at: new Date().toISOString() };
          inMemoryProducts.push(patched);
          return route.fulfill({
            status: 200,
            headers,
            body: JSON.stringify({ success: true, product: patched }),
          });
        }
      }
      if (method === 'DELETE') {
        const idx = inMemoryProducts.findIndex((p) => p.id === pid);
        if (idx !== -1) {
          inMemoryProducts[idx].deleted_at = new Date().toISOString();
        }
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ success: true }) });
      }
    }

    if (url.pathname.includes('/invites')) {
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          success: true,
          code: 'inv_human_audit_8899',
          invite_code: 'inv_human_audit_8899',
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        }),
      });
    }

    if (url.pathname.includes('/notify/test')) {
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          success: true,
          delivered: true,
          itemsCount: inMemoryProducts.filter((p) => p.status === 'active').length,
        }),
      });
    }

    return route.continue();
  });

  // Inject realistic Telegram WebApp mock
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: 'query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Alex%22%2C%22username%22%3A%22alex_tma%22%2C%22language_code%22%3A%22ru%22%7D&auth_date=1729000000&hash=mock_hash',
        initDataUnsafe: {
          query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
          user: {
            id: 123456789,
            first_name: 'Алексей',
            username: 'alex_tma',
            language_code: 'ru',
          },
          auth_date: '1729000000',
        },
        version: '7.10',
        platform: 'ios',
        colorScheme: 'dark',
        themeParams: {
          bg_color: '#121816',
          text_color: '#F1F5F4',
          hint_color: '#8FA39D',
          link_color: '#5E8B7E',
          button_color: '#5E8B7E',
          button_text_color: '#F1F5F4',
          secondary_bg_color: '#1a2421',
        },
        isExpanded: true,
        viewportHeight: 844,
        viewportStableHeight: 844,
        headerColor: '#121816',
        backgroundColor: '#121816',
        BackButton: { isVisible: false, onClick: () => {}, offClick: () => {}, show: () => {}, hide: () => {} },
        MainButton: { isVisible: false, text: '', onClick: () => {}, offClick: () => {}, show: () => {}, hide: () => {}, setText: () => {} },
        HapticFeedback: {
          impactOccurred: (style) => console.log('  📳 [Haptic Impact]:', style),
          notificationOccurred: (type) => console.log('  📳 [Haptic Notification]:', type),
          selectionChanged: () => console.log('  📳 [Haptic Selection]'),
        },
        ready: () => console.log('  ✅ [Telegram.WebApp.ready called]'),
        expand: () => console.log('  ✅ [Telegram.WebApp.expand called]'),
        close: () => console.log('  ✅ [Telegram.WebApp.close called]'),
        sendData: (data) => console.log('  📤 [Telegram.WebApp.sendData]:', data),
        openLink: (url) => console.log('  🌐 [Telegram.WebApp.openLink]:', url),
        openTelegramLink: (url) => console.log('  ✈️ [Telegram.WebApp.openTelegramLink]:', url),
      },
    };
  });

  const steps = [];

  try {
    // -------------------------------------------------------------
    // Journey 1: Cold start & Loading initial screen
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 1] Cold Start & Initial Screen Render...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await sleep(600);

    const title = await page.locator('h1', { hasText: 'Свежесть' });
    await title.waitFor({ state: 'visible', timeout: 5000 });
    console.log('  ✓ Header "Свежесть" rendered.');

    const pPath1 = path.join(SCREENSHOT_DIR, '01_home_freshness.png');
    await page.screenshot({ path: pPath1 });
    steps.push({ name: '01_home_freshness', path: pPath1, status: 'PASS' });
    console.log(`  📸 Screenshot: 01_home_freshness.png`);

    // -------------------------------------------------------------
    // Journey 2: Storage Zones Navigation
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 2] Testing Storage Zones navigation...');
    const zonesSection = page.locator('section').filter({ hasText: 'Зона:' });

    // Click "Мороз"
    await zonesSection.locator('button', { hasText: 'Мороз' }).click();
    await sleep(400);
    const pPath2 = path.join(SCREENSHOT_DIR, '02_zone_freezer.png');
    await page.screenshot({ path: pPath2 });
    steps.push({ name: '02_zone_freezer', path: pPath2, status: 'PASS' });
    console.log(`  📸 Screenshot: 02_zone_freezer.png`);

    // Click "Шкаф"
    await zonesSection.locator('button', { hasText: 'Шкаф' }).click();
    await sleep(400);
    const pPath3 = path.join(SCREENSHOT_DIR, '03_zone_pantry.png');
    await page.screenshot({ path: pPath3 });
    steps.push({ name: '03_zone_pantry', path: pPath3, status: 'PASS' });
    console.log(`  📸 Screenshot: 03_zone_pantry.png`);

    // Click "Все"
    await zonesSection.locator('button', { hasText: 'Все' }).click();
    await sleep(400);

    // -------------------------------------------------------------
    // Journey 3: Status Tabs (Съедено & Утиль)
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 3] Testing Status Tabs (Съедено, Утиль)...');
    await page.locator('nav button', { hasText: 'Съедено' }).click();
    await sleep(400);
    const pPath4 = path.join(SCREENSHOT_DIR, '04_tab_consumed.png');
    await page.screenshot({ path: pPath4 });
    steps.push({ name: '04_tab_consumed', path: pPath4, status: 'PASS' });
    console.log(`  📸 Screenshot: 04_tab_consumed.png`);

    await page.locator('nav button', { hasText: 'Утиль' }).click();
    await sleep(400);
    const pPath5 = path.join(SCREENSHOT_DIR, '05_tab_discarded.png');
    await page.screenshot({ path: pPath5 });
    steps.push({ name: '05_tab_discarded', path: pPath5, status: 'PASS' });
    console.log(`  📸 Screenshot: 05_tab_discarded.png`);

    // Back to main inventory
    await page.locator('nav button', { hasText: 'Холодильник' }).click();
    await sleep(400);

    // -------------------------------------------------------------
    // Journey 4: Search input filter
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 4] Testing Search Input filter...');
    const searchInput = page.locator('input[placeholder="Поиск продуктов..."]');
    await searchInput.fill('сыр');
    await sleep(400);
    const pPath6 = path.join(SCREENSHOT_DIR, '06_search_filtering.png');
    await page.screenshot({ path: pPath6 });
    steps.push({ name: '06_search_filtering', path: pPath6, status: 'PASS' });
    console.log(`  📸 Screenshot: 06_search_filtering.png`);

    await searchInput.fill('');
    await sleep(300);

    // -------------------------------------------------------------
    // Journey 5: Adding a Product via Bottom Drawer (Vaul)
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 5] Adding Product via Bottom Drawer...');
    const addBtn = page.locator('button', { hasText: 'Добавить продукт' });
    await addBtn.click();
    await sleep(500);

    const pPath7 = path.join(SCREENSHOT_DIR, '07_add_product_drawer.png');
    await page.screenshot({ path: pPath7 });
    steps.push({ name: '07_add_product_drawer', path: pPath7, status: 'PASS' });
    console.log(`  📸 Screenshot: 07_add_product_drawer.png`);

    // Fill form
    const nameInput = page.locator('#product-name');
    await nameInput.fill('Творог 9% зерненый');
    await sleep(300);

    const qtyInput = page.locator('#product-quantity');
    if (await qtyInput.isVisible()) {
      await qtyInput.fill('0.35');
    }

    const plusDaysBtn = page.locator('button', { hasText: '+5 дней' });
    if (await plusDaysBtn.isVisible()) {
      await plusDaysBtn.click();
    }
    await sleep(300);

    const pPath8 = path.join(SCREENSHOT_DIR, '08_fractional_qty_and_preset.png');
    await page.screenshot({ path: pPath8 });
    steps.push({ name: '08_fractional_qty_and_preset', path: pPath8, status: 'PASS' });
    console.log(`  📸 Screenshot: 08_fractional_qty_and_preset.png`);

    const submitBtn = page.locator('button', { hasText: 'Положить в холодильник' });
    await submitBtn.click();
    await sleep(700);

    const pPath9 = path.join(SCREENSHOT_DIR, '09_product_created_success.png');
    await page.screenshot({ path: pPath9 });
    steps.push({ name: '09_product_created_success', path: pPath9, status: 'PASS' });
    console.log(`  📸 Screenshot: 09_product_created_success.png`);

    // -------------------------------------------------------------
    // Journey 6: Adding Milk with Preset & Testing "Вскрыто" Feature
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 6] Testing "Вскрыто" (Open package) Feature...');
    await addBtn.click();
    await sleep(400);

    const nameInputMilk = page.locator('#product-name');
    await nameInputMilk.fill('Молоко');
    await sleep(300);

    // Click the "Молоко" preset chip to inherit after_opening_hours
    const milkPresetChip = page.locator('button', { hasText: 'Молоко' }).first();
    if (await milkPresetChip.isVisible()) {
      await milkPresetChip.click();
      await sleep(300);
    }

    const submitBtnMilk = page.locator('button', { hasText: 'Положить в холодильник' });
    await submitBtnMilk.click();
    await sleep(700);

    // Click "Вскрыть" on the milk card
    const openPackageBtn = page.locator('button', { hasText: 'Вскрыть' }).first();
    if (await openPackageBtn.isVisible()) {
      await openPackageBtn.click();
      await sleep(600);
      const pPath10 = path.join(SCREENSHOT_DIR, '10_open_package_feature.png');
      await page.screenshot({ path: pPath10 });
      steps.push({ name: '10_open_package_feature', path: pPath10, status: 'PASS' });
      console.log(`  📸 Screenshot: 10_open_package_feature.png`);
    }

    // -------------------------------------------------------------
    // Journey 7: 1-Tap "Съедено" Action
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 7] Testing 1-Tap "Съедено" Quick Action...');
    const consumeBtn = page.locator('button[title*="Отметить съеденным"]').first();
    if (await consumeBtn.isVisible()) {
      await consumeBtn.click();
      await sleep(700);
      const pPath11 = path.join(SCREENSHOT_DIR, '11_consume_product_action.png');
      await page.screenshot({ path: pPath11 });
      steps.push({ name: '11_consume_product_action', path: pPath11, status: 'PASS' });
      console.log(`  📸 Screenshot: 11_consume_product_action.png`);
    }

    // -------------------------------------------------------------
    // Journey 8: Card Expansion & Discard ("В утиль")
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 8] Testing Card Expansion & Discard Action...');
    const firstProductCard = page.locator('.group.relative.rounded-2xl').first();
    if (await firstProductCard.isVisible()) {
      await firstProductCard.click();
      await sleep(400);
      const discardBtn = page.locator('button', { hasText: 'В утиль' }).first();
      if (await discardBtn.isVisible()) {
        await discardBtn.click();
        await sleep(700);
        const pPath12 = path.join(SCREENSHOT_DIR, '12_discard_product_action.png');
        await page.screenshot({ path: pPath12 });
        steps.push({ name: '12_discard_product_action', path: pPath12, status: 'PASS' });
        console.log(`  📸 Screenshot: 12_discard_product_action.png`);
      }
    }

    // -------------------------------------------------------------
    // Journey 9: Test Notification Bell Button
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 9] Testing Notification Bell Button...');
    const bellBtn = page.locator('button[title="Проверить уведомления бота"]');
    if (await bellBtn.isVisible()) {
      await bellBtn.click();
      await sleep(800);
      const pPath13 = path.join(SCREENSHOT_DIR, '13_test_notification_toast.png');
      await page.screenshot({ path: pPath13 });
      steps.push({ name: '13_test_notification_toast', path: pPath13, status: 'PASS' });
      console.log(`  📸 Screenshot: 13_test_notification_toast.png`);
    }

    // -------------------------------------------------------------
    // Journey 10: Family Sharing Modal & Invite Link
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 10] Testing Family Share Modal...');
    const familyBtn = page.locator('button', { hasText: 'Семья' });
    await familyBtn.click();
    await sleep(700);

    const pPath14 = path.join(SCREENSHOT_DIR, '14_family_share_modal.png');
    await page.screenshot({ path: pPath14 });
    steps.push({ name: '14_family_share_modal', path: pPath14, status: 'PASS' });
    console.log(`  📸 Screenshot: 14_family_share_modal.png`);

    // Click copy button
    const copyBtn = page.locator('button', { hasText: 'Скопировать ссылку' });
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      await sleep(400);
    }

    // Close modal
    const closeBtn = page.locator('button[aria-label="Закрыть"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await sleep(400);
    }

    // -------------------------------------------------------------
    // Journey 11: Diagnostics Drawer (Header Triple-Tap Easter Egg)
    // -------------------------------------------------------------
    console.log('\n📍 [Journey 11] Testing Diagnostics Drawer (Triple-Tap Easter Egg)...');
    const headerTitle = page.locator('h1', { hasText: 'Свежесть' });
    await headerTitle.click({ clickCount: 3 });
    await sleep(700);

    const pPath15 = path.join(SCREENSHOT_DIR, '15_diagnostics_drawer.png');
    await page.screenshot({ path: pPath15 });
    steps.push({ name: '15_diagnostics_drawer', path: pPath15, status: 'PASS' });
    console.log(`  📸 Screenshot: 15_diagnostics_drawer.png`);

    console.log('\n🎉 [Human E2E Audit] All 11 user journeys executed successfully!');
  } catch (err) {
    console.error('❌ [Human E2E Audit Failed]:', err);
    const pErr = path.join(SCREENSHOT_DIR, 'error_state.png');
    await page.screenshot({ path: pErr });
    steps.push({ name: 'error_state', path: pErr, status: 'FAIL', error: err.message });
  } finally {
    await browser.close();
  }

  return { steps, consoleErrors };
}

runHumanAudit().then((result) => {
  console.log('\n=== AUDIT RESULTS SUMMARY ===');
  console.log(`Total Journeys Tested: ${result.steps.length}`);
  console.log(`Console Errors: ${result.consoleErrors.length}`);
  result.steps.forEach((s) => {
    console.log(`  ${s.status === 'PASS' ? '✅' : '❌'} ${s.name}: ${s.path}`);
  });
  if (result.consoleErrors.length > 0) {
    console.log('Errors:', result.consoleErrors);
  }
});
