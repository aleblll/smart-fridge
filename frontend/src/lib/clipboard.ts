/**
 * Safe clipboard copy with fallback to execCommand('copy') for older browsers/webviews
 */
export async function safeCopyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('[Clipboard] navigator.clipboard.writeText failed, trying fallback:', err);
  }

  // Fallback for older Telegram WebViews or insecure context
  try {
    if (typeof document !== 'undefined') {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    }
  } catch (fallbackErr) {
    console.error('[Clipboard] document.execCommand fallback failed:', fallbackErr);
  }

  return false;
}
