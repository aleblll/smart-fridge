import React, { useState } from 'react';
import { haptic } from '@/lib/haptics';
import { X, Copy, Check, Send, Users, QrCode } from 'lucide-react';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  userId?: number;
}

export const ShareModal: React.FC<ShareModalProps> = ({ open, onClose, userId }) => {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const inviteUrl = `https://t.me/Svezhestt_bot?startapp=fridge_${userId || 'home'}`;

  const handleCopy = () => {
    haptic.notification('success');
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareTelegram = () => {
    haptic.impact('medium');
    const text = encodeURIComponent('Присоединяйся к нашему общему холодильнику в боте «Свежесть»!');
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${text}`;

    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--surface-card)] border border-[var(--border-strong)] p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <Users className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold">Семейный доступ</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-800 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Отправьте ссылку членам семьи или соседям, чтобы вести учет продуктов вместе в реальном времени.
        </p>

        {/* Link Box */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
          <input
            type="text"
            readOnly
            value={inviteUrl}
            className="flex-1 bg-transparent text-xs text-[var(--text-primary)] font-mono outline-none truncate"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="p-2 rounded-lg bg-[var(--surface-card)] text-sky-400 hover:text-sky-300 active:scale-95 transition-all"
            title="Скопировать ссылку"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleShareTelegram}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold active:scale-[0.985] transition-transform"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Отправить в чат Telegram</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--surface-subtle)] text-[var(--text-primary)] text-xs font-medium hover:bg-zinc-800 active:scale-[0.985] transition-all"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{copied ? 'Ссылка скопирована в буфер!' : 'Скопировать ссылку'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
