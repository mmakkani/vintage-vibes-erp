import { useEffect, useRef } from 'react';

interface UseBarcodeScannerOptions {
  onScan: (scannedCode: string) => void;
  minChars?: number;
  maxIntervalMs?: number;
  enableSound?: boolean;
}

/**
 * Universal USB & Bluetooth Barcode Scanner Listener.
 * Intercepts rapid keyboard-wedge scanner inputs terminating in 'Enter'.
 */
export function useBarcodeScanner({
  onScan,
  minChars = 4,
  maxIntervalMs = 60,
  enableSound = true
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, audioCtx.currentTime); // High pitch crisp beep
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch {
      // AudioContext unavailable or blocked by browser gesture
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore functional modifier keys
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // Check if user is typing in standard text inputs
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minChars) {
          const code = bufferRef.current.trim();
          bufferRef.current = '';
          if (code) {
            if (enableSound) playBeep();
            onScan(code);
            if (!isInput) {
              e.preventDefault();
            }
          }
        } else {
          bufferRef.current = '';
        }
        return;
      }

      // If key is a printable character
      if (e.key.length === 1) {
        // If interval is longer than scanner speed, reset buffer
        if (diff > maxIntervalMs && bufferRef.current.length > 0) {
          bufferRef.current = '';
        }
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onScan, minChars, maxIntervalMs, enableSound]);
}
