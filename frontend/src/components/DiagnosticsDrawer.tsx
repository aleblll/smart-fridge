import React, { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import { logger, type LogEntry } from '@/lib/logger';
import { haptic } from '@/lib/haptics';
import { Copy, Trash2, Check, Terminal } from 'lucide-react';

interface DiagnosticsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DiagnosticsDrawer: React.FC<DiagnosticsDrawerProps> = ({ open, onOpenChange }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLogs(logger.getLogs());
    const unsubscribe = logger.subscribe(() => {
      setLogs(logger.getLogs());
    });
    return unsubscribe;
  }, []);

  const handleCopy = () => {
    haptic.notification('success');
    navigator.clipboard.writeText(logger.exportAsText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    haptic.impact('light');
    logger.clear();
  };

  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 transition-opacity" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[#111317] border-t border-zinc-800 rounded-t-3xl z-50 p-5 pb-8 space-y-4 outline-none max-h-[85vh] flex flex-col text-slate-100">
          <div className="flex justify-center pb-1">
            <div className="w-12 h-1.5 rounded-full bg-zinc-700/60" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-sky-400" />
              <Drawer.Title className="text-base font-bold tracking-tight">
                Диагностика и Логи
              </Drawer.Title>
            </div>
            <span className="text-xs font-mono text-zinc-400">{logs.length} событий</span>
          </div>

          {/* System metadata banner */}
          <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 text-xs font-mono space-y-1 text-zinc-300">
            <div className="flex justify-between">
              <span className="text-zinc-500">Платформа:</span>
              <span className="text-sky-400">{tg?.platform || 'browser'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Telegram SDK:</span>
              <span>v{tg?.version || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Telegram User ID:</span>
              <span className="text-amber-300">{tg?.initDataUnsafe?.user?.id || 'не авторизован'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">CloudStorage:</span>
              <span className={tg?.CloudStorage ? 'text-emerald-400' : 'text-rose-400'}>
                {tg?.CloudStorage ? 'доступно (синхронизация активна)' : 'не поддерживается'}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold active:scale-95 transition-all shadow-xs"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Скопировано в буфер!' : 'Скопировать все логи'}</span>
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 active:scale-95 transition-all"
              title="Очистить логи"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Log Stream */}
          <div className="flex-1 min-h-[220px] max-h-[380px] overflow-y-auto space-y-1.5 p-3 rounded-2xl bg-black/60 border border-zinc-800/80 font-mono text-[11px]">
            {logs.length === 0 ? (
              <div className="py-10 text-center text-zinc-600">Логов пока нет</div>
            ) : (
              logs.map((log) => {
                const badgeColor =
                  log.level === 'error'
                    ? 'text-rose-400 bg-rose-950/40 border-rose-800/40'
                    : log.level === 'warn'
                    ? 'text-amber-400 bg-amber-950/40 border-amber-800/40'
                    : log.level === 'sync'
                    ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
                    : 'text-sky-400 bg-sky-950/40 border-sky-800/40';

                return (
                  <div key={log.id} className="p-1.5 rounded-lg bg-zinc-900/40 border border-zinc-800/40 space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-zinc-500">{log.timestamp}</span>
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] uppercase font-semibold ${badgeColor}`}>
                        {log.level}
                      </span>
                    </div>
                    <div className="text-zinc-200 break-all">
                      <span className="text-zinc-400 font-bold">[{log.category}]</span> {log.message}
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
