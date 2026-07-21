import { useEffect, useRef } from 'react';

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

export default function useBarcodeScanner({ onScan, enabled = true }: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string[]>([]);
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Enter is the default barcode scanner suffix
      if (e.key === 'Enter') {
        const barcode = bufferRef.current.join('').trim();
        if (barcode && bufferRef.current.length >= 3 && diff < 100) {
          e.preventDefault();
          e.stopPropagation();
          onScan(barcode);
        }
        bufferRef.current = [];
        return;
      }

      // If keypress is too slow, it's a human typing, reset the buffer
      if (diff > 60) {
        bufferRef.current = [];
      }

      // Append printable characters
      if (e.key.length === 1) {
        bufferRef.current.push(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onScan, enabled]);
}
