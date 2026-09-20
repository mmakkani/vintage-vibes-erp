import { useEffect, useRef, useCallback } from 'react';

interface UseIdleTimerOptions {
  timeoutMs?: number; // default 3 hours = 10,800,000 ms
  onIdle: () => void;
  isEnabled?: boolean;
}

/**
 * Enterprise Inactivity / Idle Auto-Logout Hook
 * Tracks mouse movement, clicks, key presses, touches, and wheel scrolls.
 * When inactive for timeoutMs, calls onIdle().
 * Live streaming and mobile host routes bypass this to ensure uninterrupted broadcasts.
 */
export function useIdleTimer({
  timeoutMs = 3 * 60 * 60 * 1000, // 3 hours
  onIdle,
  isEnabled = true
}: UseIdleTimerOptions) {
  const timerRef = useRef<any>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (!isEnabled) return;

    timerRef.current = setTimeout(() => {
      onIdle();
    }, timeoutMs);
  }, [timeoutMs, onIdle, isEnabled]);

  useEffect(() => {
    if (!isEnabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Start initial timer
    resetTimer();

    // Throttled activity listener
    let throttleTimeout: any = null;
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current > 1000) { // throttle checks to once per second
        resetTimer();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach(eventName => {
      window.addEventListener(eventName, handleUserActivity, { passive: true });
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (throttleTimeout) clearTimeout(throttleTimeout);
      events.forEach(eventName => {
        window.removeEventListener(eventName, handleUserActivity);
      });
    };
  }, [isEnabled, resetTimer]);
}

export const useIdleTimeout = useIdleTimer;
export default useIdleTimer;
