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
        <Drawer.Content className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[#1F2B28] border-t border-white/[0.08] rounded-t-3xl z-50 p-5 pb-8 space-y-4 outline-none max-h-[85vh] flex flex-col text-[#F1F5F4]">
          <div className="flex justify-center pb-1">
            <div className="w-12 h-1.5 rounded-full bg-[#344641]" />
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
          <div className="p-3 rounded-2xl bg-[#2A3834] border border-white/[0.06] text-xs font-mono space-y-1 text-[#F1F5F4]">
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">Платформа:</span>
              <span className="text-[#A7C7E7]">{tg?.platform || 'browser'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">Telegram SDK:</span>
              <span>v{tg?.version || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">Telegram User ID:</span>
              <span className="text-[#EBAEB7]">{tg?.initDataUnsafe?.user?.id || 'не авторизован'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8FA39D]">CloudStorage:</span>
              <span className={tg?.CloudStorage ? 'text-[#5E8B7E]' : 'text-[#EBAEB7]'}>
                {tg?.CloudStorage ? 'доступно (активно)' : 'не поддерживается'}
              </span>
            </div>
          </div>

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
