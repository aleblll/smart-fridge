import React, { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { X, Camera, Image, Keyboard, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { haptic } from '@/lib/haptics';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  onClose,
  onDetected,
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'photo' | 'manual'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to extract clean barcode / EAN from various formats
  const cleanExtractedCode = (rawText: string): string => {
    const clean = rawText.trim();
    // 1. Direct standard digits: EAN-13, EAN-8, UPC
    const digitsMatch = clean.match(/\b\d{8,14}\b/);
    if (digitsMatch) {
      return digitsMatch[0];
    }
    // 2. Russian "Честный Знак" / GS1 DataMatrix (dairy, water, pharmacy)
    if (/^01\d{14}/.test(clean)) {
      const gtin = clean.slice(2, 16);
      return gtin.startsWith('0') ? gtin.slice(1) : gtin;
    }
    return clean;
  };

  const handleSuccess = (code: string) => {
    const cleaned = cleanExtractedCode(code);
    haptic.notification('success');
    // Stop camera before closing
    if (readerRef.current) {
      readerRef.current.reset();
    }
    onDetected(cleaned);
    onClose();
  };

  // Start live camera scanning
  useEffect(() => {
    if (!open || activeTab !== 'camera') {
      if (readerRef.current) {
        readerRef.current.reset();
      }
      return;
    }

    let isMounted = true;
    setIsInitializing(true);
    setCameraError(null);

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    const startCamera = async () => {
      try {
        if (!videoRef.current) return;
        await reader.decodeFromVideoDevice(
          null, // Default environment/back camera
          videoRef.current,
          (result, error) => {
            if (!isMounted) return;
            if (result) {
              const text = result.getText();
              if (text) {
                handleSuccess(text);
              }
            }
            if (error) {
              // Expected continuous scanning misses, ignore
            }
          }
        );
        if (isMounted) setIsInitializing(false);
      } catch (err: unknown) {
        if (!isMounted) return;
        setIsInitializing(false);
        const errMessage = err instanceof Error ? err.message : String(err);
        console.warn('Camera stream failed:', errMessage);
        setCameraError('Не удалось открыть видеопоток камеры в Telegram. Попробуйте сфотографировать штрихкод или ввести его вручную.');
        setActiveTab('photo');
      }
    };

    // Small delay to allow drawer modal DOM to mount
    const timer = setTimeout(startCamera, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (readerRef.current) {
        readerRef.current.reset();
      }
    };
  }, [open, activeTab]);

  // Handle photo snapshot upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptic.impact('medium');
    setIsProcessingPhoto(true);
    setCameraError(null);

    try {
      const reader = new BrowserMultiFormatReader();
      const imageUrl = URL.createObjectURL(file);
      try {
        const result = await reader.decodeFromImageUrl(imageUrl);
        URL.revokeObjectURL(imageUrl);
        if (result && result.getText()) {
          handleSuccess(result.getText());
          return;
        }
      } catch {
        URL.revokeObjectURL(imageUrl);
      }

      // If ZXing failed on whole image, try native BarcodeDetector if available
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e', 'data_matrix', 'code_128'],
          });
          const bitmap = await createImageBitmap(file);
          const detected = await detector.detect(bitmap);
          if (detected && detected.length > 0 && detected[0].rawValue) {
            handleSuccess(detected[0].rawValue);
            return;
          }
        } catch (e) {
          void e;
        }
      }

      haptic.notification('warning');
      setCameraError('Штрихкод на фото не распознан. Пожалуйста, сфотографируйте штрихкод крупнее при хорошем освещении или введите цифры вручную.');
    } catch {
      haptic.notification('error');
      setCameraError('Сбой чтения фотографии штрихкода.');
    } finally {
      setIsProcessingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;
    handleSuccess(clean);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl backdrop-blur-2xl bg-[#121615]/95 border border-white/[0.08] p-5 space-y-4 shadow-[0_16px_40px_rgba(0,0,0,0.6)] text-[#F1F5F4]"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#5E8B7E]/15 border border-[#5E8B7E]/25 flex items-center justify-center">
              <Camera className="w-4 h-4 text-[#5E8B7E]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F1F5F4]">Сканер штрихкодов</h3>
              <p className="text-[11px] text-[#8FA39D]">EAN-13, EAN-8, QR, Честный Знак</p>
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

        {/* Tab switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-xs">
          <button
            type="button"
            onClick={() => { setActiveTab('camera'); setCameraError(null); }}
            className={`py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'camera'
                ? 'bg-[#5E8B7E] text-[#F1F5F4] shadow-sm'
                : 'text-[#8FA39D] hover:text-[#F1F5F4]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Камера</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('photo'); setCameraError(null); }}
            className={`py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'photo'
                ? 'bg-[#5E8B7E] text-[#F1F5F4] shadow-sm'
                : 'text-[#8FA39D] hover:text-[#F1F5F4]'
            }`}
          >
            <Image className="w-3.5 h-3.5" />
            <span>Фото</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('manual'); setCameraError(null); }}
            className={`py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'manual'
                ? 'bg-[#5E8B7E] text-[#F1F5F4] shadow-sm'
                : 'text-[#8FA39D] hover:text-[#F1F5F4]'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Вручную</span>
          </button>
        </div>

        {/* Error notification banner if any */}
        {cameraError && (
          <div className="p-3 rounded-2xl bg-rose-950/20 border border-rose-500/20 flex items-start gap-2 text-xs text-[#EBAEB7] animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-snug">{cameraError}</span>
          </div>
        )}

        {/* Tab 1: Live Video Camera */}
        {activeTab === 'camera' && (
          <div className="space-y-3">
            <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-black/60 border border-white/[0.08] flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Aiming Reticle */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-28 border-2 border-[#5E8B7E] rounded-xl relative shadow-[0_0_20px_rgba(94,139,126,0.3)]">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse" />
                </div>
              </div>

              {isInitializing && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#5E8B7E]" />
                  <span className="text-xs text-[#8FA39D]">Запуск видеокамеры...</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-[#8FA39D] text-center leading-tight">
              Наведите красную линию на штрихкод упаковки. Определение произойдет автоматически.
            </p>
          </div>
        )}

        {/* Tab 2: Photo Snapshot */}
        {activeTab === 'photo' && (
          <div className="space-y-3 py-2 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#5E8B7E]/15 border border-[#5E8B7E]/25 flex items-center justify-center">
                <Camera className="w-6 h-6 text-[#5E8B7E]" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#F1F5F4]">Сфотографировать штрихкод</p>
                <p className="text-[11px] text-[#8FA39D] max-w-[220px]">
                  Откроет системную камеру смартфона с четким автофокусом и макросъемкой
                </p>
              </div>
              <button
                type="button"
                disabled={isProcessingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] text-xs font-semibold shadow-md shadow-[#5E8B7E]/20 hover:brightness-105 active:scale-[0.985] transition-all disabled:opacity-50"
              >
                {isProcessingPhoto ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Распознаем штрихкод...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Сделать снимок штрихкода</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Manual input */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-[#8FA39D] block">Цифры под штрихкодом (EAN-13 / EAN-8):</label>
              <input
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                autoFocus
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Например: 4607004880123"
                className="w-full px-3.5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-[#F1F5F4] font-mono outline-none focus:border-[#5E8B7E]/60 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim() || manualCode.length < 4}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-[#5E8B7E] to-[#486e63] text-[#F1F5F4] text-xs font-semibold shadow-md shadow-[#5E8B7E]/20 hover:brightness-105 active:scale-[0.985] transition-all disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Найти продукт по штрихкоду</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
