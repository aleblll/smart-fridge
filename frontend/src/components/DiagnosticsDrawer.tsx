import React, { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import { logger, type LogEntry } from '@/lib/logger';
import { haptic } from '@/lib/haptics';
import { safeCopyToClipboard } from '@/lib/clipboard';
import { Copy, Trash2, Check, Terminal, Bell, RefreshCw, Activity, ShieldCheck, CloudUpload } from 'lucide-react';
import { storage } from '@/lib/storage';
import { getTelegramInitData, api } from '@/lib/api';

interface DiagnosticsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DiagnosticsDrawer: React.FC<DiagnosticsDrawerProps> = ({ open, onOpenChange }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isPushingLocals, setIsPushingLocals] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);

  useEffect(() => {
    setLogs(logger.getLogs());
    const unsubscribe = logger.subscribe(() => {
      setLogs(logger.getLogs());
    });
    return unsubscribe;
  }, []);

  const handleCopy = async () => {
    try {
      const ok = await safeCopyToClipboard(logger.exportAsText());
      if (ok) {
        haptic.notification('success');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        haptic.notification('warning');
      }
    } catch (err) {
      console.warn('[DiagnosticsDrawer] Copy failed:', err);
      haptic.notification('error');
    }
  };

  const handleClear = () => {
    haptic.impact('light');
    logger.clear();
  };

  const handleTestNotification = async () => {
    haptic.impact('medium');
    setTestSending(true);
    setTestResult(null);
    try {
      logger.info('DIAGNOSTICS', 'Sending test Telegram notification...');
      const res = await api.sendTestNotification();
      if (res.success && res.data?.delivered) {
        haptic.notification('success');
        setTestResult(`Отправлено! (${res.data.itemsCount} продуктов)`);
        logger.info('DIAGNOSTICS', `Notification delivered to Telegram chat. Items: ${res.data.itemsCount}`);
      } else {
        haptic.notification('error');
        setTestResult(`Ошибка: ${res.error || 'Сбой отправки'}`);
        logger.error('DIAGNOSTICS', `Failed to send notification: ${res.error}`);
      }
    } catch (err) {
      haptic.notification('error');
      setTestResult('Сетевая ошибка');
      logger.error('DIAGNOSTICS', `Test notification exception: ${err}`);
    } finally {
      setTestSending(false);
    }
  };

  const handleManualSync = async () => {
    haptic.impact('medium');
    logger.info('DIAGNOSTICS', 'Manual D1 sync triggered...');
    try {
      const fridges = await storage.syncFridges();
      if (fridges.length > 0) {
        const targetId = storage.getActiveFridgeId() || fridges[0].id;
        const prods = await storage.fetchAndSyncProducts(targetId);
        haptic.notification('success');
        logger.sync(`Manual sync success: found ${fridges.length} fridges, loaded ${prods?.length ?? 0} products`);
        window.location.reload();
      } else {
        haptic.notification('warning');
        logger.warn('DIAGNOSTICS', 'Manual sync returned 0 fridges');
      }
    } catch (err) {
      haptic.notification('error');
      logger.error('DIAGNOSTICS', `Manual sync error: ${err}`);
    }
  };

  const handlePingGateway = async () => {
    haptic.impact('light');
    setPingStatus('Проверка шлюза...');
    try {
      const res = await api.checkHealth();
      if (res.success) {
        haptic.notification('success');
        setPingStatus(`Шлюз доступен ✅ (200 OK)`);
        logger.info('DIAGNOSTICS', 'Gateway health check: 200 OK');
      } else {
        haptic.notification('error');
        setPingStatus(`Шлюз сбой: ${res.error || 'нет связи'}`);
        logger.error('DIAGNOSTICS', `Gateway check failed: ${res.error}`);
      }
    } catch (e) {
      setPingStatus('Сетевой сбой шлюза');
      logger.error('DIAGNOSTICS', `Gateway ping error: ${e}`);
    }
  };

  const handleValidateAuth = async () => {
    haptic.impact('light');
    setPingStatus('Проверка HMAC...');
    try {
      const res = await api.validateAuth();
      if (res.success && res.data?.valid) {
        haptic.notification('success');
        setPingStatus(`HMAC авторизация: Валидна ✅`);
        logger.info('DIAGNOSTICS', 'Auth validation: Valid HMAC signature');
      } else {
        haptic.notification('error');
        setPingStatus(`Ошибка HMAC: ${res.error || 'Неверная подпись'}`);
        logger.error('DIAGNOSTICS', `Auth validation failed: ${res.error}`);
      }
    } catch (e) {
      setPingStatus('Сетевая ошибка валидации auth');
      logger.error('DIAGNOSTICS', `Auth validation error: ${e}`);
    }
  };

  const handleHardReset = () => {
    haptic.notification('warning');
    if (window.confirm('Внимание! Это сотрет локальный кэш и перезагрузит данные из облака. Если есть несохраненные продукты, они будут потеряны. Продолжить?')) {
      const activeId = storage.getActiveFridgeId();
      if (activeId) {
        localStorage.removeItem(`smart_fridge_products_${activeId}`);
        localStorage.removeItem(`smart_fridge_shopping_${activeId}`);
      }
      localStorage.removeItem('smart_fridge_mutation_queue');
      window.location.reload();
    }
  };

  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  const activeFridgeId = storage.getActiveFridgeId();
  const initDataStr = getTelegramInitData();
  const hasInitData = Boolean(initDataStr);
  const localProducts = activeFridgeId ? (storage.getInitialProducts(activeFridgeId) || []) : [];
  const activeLocals = localProducts.filter((p) => p.status === 'active' && !p.id.startsWith('demo-'));
  const queue = storage.getMutationQueue();
  const lastSyncError = storage.getLastSyncError();

  const handleForceUploadLocals = async () => {
    if (!activeFridgeId) return;
    haptic.impact('medium');
    setIsPushingLocals(true);
    setTestResult(null);
    try {
      if (activeLocals.length === 0) {
        setTestResult('Нет локальных активных продуктов');
        return;
      }
      logger.info('DIAGNOSTICS', `Force uploading ${activeLocals.length} local products to D1...`);
      const res = await api.addProductsBatch(activeFridgeId, activeLocals);
      if (res.success) {
        haptic.notification('success');
        setTestResult(`Выгружено ${res.data?.count ?? activeLocals.length} продуктов в D1! 🌿`);
        await storage.fetchAndSyncProducts(activeFridgeId);
        window.location.reload();
      } else {
        haptic.notification('error');
        setTestResult(`Ошибка выгрузки: ${res.error || 'Сбой D1'}`);
      }
    } catch (e) {
      haptic.notification('error');
      setTestResult(`Сетевой сбой выгрузки: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsPushingLocals(false);
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 transition-opacity" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto backdrop-blur-2xl bg-[#1A2421]/95 border-t border-white/[0.08] rounded-t-3xl z-50 p-5 pb-8 space-y-4 outline-none max-h-[85vh] flex flex-col text-[#F1F5F4] shadow-[0_-12px_40px_rgba(0,0,0,0.5)]">
          <div className="flex justify-center pb-1">
            <div className="w-12 h-1.5 rounded-full bg-white/20" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-[#5E8B7E]" />
              <Drawer.Title className="text-base font-semibold tracking-tight text-[#F1F5F4]">
                Диагностика и Логи
              </Drawer.Title>
            </div>
            <span className="text-xs font-mono text-[#8FA39D]">{logs.length} событий</span>
          </div>

          {/* System metadata banner */}
          <div className="p-3 rounded-2xl bg-[#2A3834] border border-white/[0.06] text-xs font-mono space-y-1.5 text-[#F1F5F4]">
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">Платформа:</span>
              <span className="text-[#A7C7E7]">{tg?.platform || 'browser'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">Telegram User ID:</span>
              <span className="text-[#EBAEB7]">{tg?.initDataUnsafe?.user?.id || 'не авторизован'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">Telegram initData:</span>
              <span className={hasInitData ? 'text-[#5E8B7E]' : 'text-[#EBAEB7]'}>
                {hasInitData ? 'Присутствует (OK)' : 'ОТСУТСТВУЕТ'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">Активный Fridge ID:</span>
              <span className={activeFridgeId ? 'text-[#5E8B7E] truncate max-w-[170px]' : 'text-[#EBAEB7]'}>
                {activeFridgeId || 'Не привязан'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">Локальных продуктов:</span>
              <span className="text-[#A7C7E7] font-semibold">{localProducts.length} шт (активных: {activeLocals.length})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">Очередь мутаций:</span>
              <span className={queue.length > 0 ? 'text-amber-300' : 'text-[#8FA39D]'}>{queue.length} операций</span>
            </div>
            {lastSyncError && (
              <div className="flex flex-col gap-0.5 pt-1 text-rose-300 border-t border-white/[0.06]">
                <span className="text-[#8FA39D]">Последняя ошибка синхронизации:</span>
                <span className="break-words font-mono text-[10px] bg-rose-950/40 p-1.5 rounded-lg border border-rose-800/30 text-rose-300">
                  {lastSyncError}
                </span>
              </div>
            )}
          </div>

          {/* Diagnostic Check Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handlePingGateway}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-200 text-xs font-medium active:scale-95 transition-all"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Шлюз API ⚡</span>
            </button>

            <button
              type="button"
              onClick={handleValidateAuth}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-purple-200 text-xs font-medium active:scale-95 transition-all"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Проверка Auth 🔑</span>
            </button>
          </div>

          {pingStatus && (
            <div className="text-center text-xs font-mono p-1.5 rounded-lg bg-black/40 text-blue-200 border border-blue-500/20">
              {pingStatus}
            </div>
          )}

          {/* Test and Actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleTestNotification}
              disabled={testSending}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 text-amber-200 text-xs font-medium active:scale-95 transition-all disabled:opacity-50"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{testSending ? '...' : 'Тест пуша 🔔'}</span>
            </button>

            <button
              type="button"
              onClick={handleManualSync}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-[#5E8B7E]/20 border border-[#5E8B7E]/30 hover:bg-[#5E8B7E]/30 text-[#A7C7E7] text-xs font-medium active:scale-95 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Синхронизация 🔄</span>
            </button>

            <button
              type="button"
              onClick={handleHardReset}
              className="py-2.5 px-2 rounded-xl bg-rose-950/30 border border-rose-800/40 hover:bg-rose-900/40 text-rose-300 text-xs font-medium active:scale-95 transition-all"
              title="Сбросить кэш и перезагрузить"
            >
              Сброс кэша
            </button>
          </div>

          {activeLocals.length > 0 && (
            <button
              type="button"
              onClick={handleForceUploadLocals}
              disabled={isPushingLocals}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] hover:brightness-105 text-[#F1F5F4] text-xs font-semibold active:scale-95 transition-all shadow-md shadow-[#5E8B7E]/20 disabled:opacity-50"
            >
              <CloudUpload className="w-4 h-4" />
              <span>{isPushingLocals ? 'Выгрузка в D1...' : `Выгрузить ${activeLocals.length} локальных продуктов в облако ☁️`}</span>
            </button>
          )}

          {testResult && (
            <div className="text-center text-xs font-mono p-1.5 rounded-lg bg-black/40 text-amber-200">
              {testResult}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#5E8B7E] hover:bg-[#4E756A] text-[#F1F5F4] text-xs font-medium active:scale-95 transition-all shadow-xs"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Скопировано в буфер!' : 'Скопировать все логи'}</span>
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="p-2.5 rounded-xl bg-[#2A3834] border border-white/[0.06] text-[#8FA39D] hover:text-[#EBAEB7] active:scale-95 transition-all"
              title="Очистить логи"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Log Stream */}
          <div className="flex-1 min-h-[220px] max-h-[380px] overflow-y-auto space-y-1.5 p-3 rounded-2xl bg-[#1A2421] border border-white/[0.06] font-mono text-[11px]">
            {logs.length === 0 ? (
              <div className="py-10 text-center text-[#8FA39D]/50">Логов пока нет</div>
            ) : (
              logs.map((log) => {
                const badgeColor =
                  log.level === 'error'
                    ? 'text-[#EBAEB7] bg-rose-950/40 border-rose-800/40'
                    : log.level === 'warn'
                    ? 'text-amber-300 bg-amber-950/40 border-amber-800/40'
                    : log.level === 'sync'
                    ? 'text-[#5E8B7E] bg-emerald-950/40 border-emerald-800/40'
                    : 'text-[#A7C7E7] bg-sky-950/40 border-sky-800/40';

                return (
                  <div key={log.id} className="p-1.5 rounded-lg bg-[#222E2B] border border-white/[0.04] space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#8FA39D]">{log.timestamp}</span>
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] uppercase font-medium ${badgeColor}`}>
                        {log.level}
                      </span>
                    </div>
                    <div className="text-[#F1F5F4] break-all">
                      <span className="text-[#8FA39D] font-bold">[{log.category}]</span> {log.message}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
