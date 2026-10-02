import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { safeCopyToClipboard } from '@/lib/clipboard';
import { X, Copy, Check, Send, Users, QrCode, Loader2, AlertCircle } from 'lucide-react';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  activeFridgeId?: string;
  fridgeName?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  open,
  onClose,
  activeFridgeId,
  fridgeName = 'Мой холодильник',
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch or generate invite code on modal open
  useEffect(() => {
    if (!open || !activeFridgeId) {
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .createInvite(activeFridgeId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          const code = res.data.code || res.data.invite_code;
          setInviteCode(code);
        } else {
          setError(res.error || 'Не удалось сгенерировать приглашение');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Сетевая ошибка');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, activeFridgeId]);

  if (!open) return null;

  const inviteUrl = inviteCode
    ? `https://t.me/Svezhestt_bot/app?startapp=${inviteCode}`
    : '';

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      const ok = await safeCopyToClipboard(inviteUrl);
      if (ok) {
        haptic.notification('success');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        haptic.notification('warning');
      }
    } catch {
      haptic.notification('error');
    }
  };

  const handleShareTelegram = () => {
    if (!inviteUrl) return;
    haptic.impact('medium');
    const text = encodeURIComponent(
      `Присоединяйся к нашему общему холодильнику «${fridgeName}» в боте «Свежесть»!`
    );
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${text}`;

    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl backdrop-blur-2xl bg-[#121615]/95 border border-white/[0.08] p-5 space-y-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_16px_40px_rgba(0,0,0,0.6)] text-[#F1F5F4]"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#5E8B7E]/15 border border-[#5E8B7E]/25 flex items-center justify-center">
              <Users className="w-4 h-4 text-[#5E8B7E]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F1F5F4]">Семейный доступ</h3>
              <p className="text-[11px] text-[#8FA39D] truncate max-w-[190px]">{fridgeName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/[0.08] text-[#8FA39D] hover:text-[#F1F5F4] transition-all"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#8FA39D] leading-relaxed">
          Отправьте персональную ссылку членам семьи. При переходе холодильник автоматически синхронизируется в реальном времени.
        </p>

        {/* State: Loading */}
        {loading && (
          <div className="py-6 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <Loader2 className="w-5 h-5 text-[#5E8B7E] animate-spin" />
            <span className="text-xs text-[#8FA39D]">Создаем безопасный инвайт D1...</span>
          </div>
        )}

        {/* State: Error */}
        {error && !loading && (
          <div className="p-3 rounded-2xl bg-rose-950/20 border border-rose-500/20 flex items-start gap-2.5 text-xs text-[#EBAEB7]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Ошибка создания инвайта</p>
              <p className="text-[11px] text-[#8FA39D] mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* State: Success Link Box */}
        {inviteUrl && !loading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] focus-within:border-[#5E8B7E]/50 transition-colors">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 bg-transparent text-xs text-[#F1F5F4] font-mono outline-none truncate select-all"
                title="Ссылка для приглашения"
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

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleShareTelegram}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] text-xs font-semibold shadow-lg shadow-[#5E8B7E]/20 hover:brightness-105 active:scale-[0.985] transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Поделиться в Telegram</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.09] text-[#F1F5F4] text-xs font-medium border border-white/[0.06] active:scale-[0.985] transition-all"
              >
                <QrCode className="w-3.5 h-3.5 text-[#8FA39D]" />
                <span>{copied ? 'Ссылка скопирована в буфер!' : 'Скопировать ссылку'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
