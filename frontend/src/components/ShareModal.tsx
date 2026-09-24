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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-3xl backdrop-blur-2xl bg-[#1A2421]/95 border border-white/[0.08] p-5 space-y-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.5)] text-[#F1F5F4]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#5E8B7E]" />
            <h3 className="text-base font-semibold">Семейный доступ</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/[0.08] text-[#8FA39D] hover:text-[#F1F5F4] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#8FA39D] leading-relaxed">
          Отправьте ссылку членам семьи или соседям, чтобы вести учет продуктов вместе в реальном времени.
        </p>

        {/* Link Box */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          <input
            type="text"
            readOnly
            value={inviteUrl}
            className="flex-1 bg-transparent text-xs text-[#F1F5F4] font-mono outline-none truncate"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="p-2 rounded-lg bg-white/[0.06] text-[#5E8B7E] hover:text-[#A7C7E7] active:scale-95 transition-all"
            title="Скопировать ссылку"
          >
            {copied ? <Check className="w-4 h-4 text-[#5E8B7E]" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleShareTelegram}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] text-xs font-semibold shadow-lg shadow-[#5E8B7E]/20 hover:brightness-105 active:scale-[0.985] transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Отправить в чат Telegram</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#2A3834] text-[#F1F5F4] text-xs font-medium hover:bg-[#344641] active:scale-[0.985] transition-all"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{copied ? 'Ссылка скопирована в буфер!' : 'Скопировать ссылку'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
