import { useState, useEffect, useRef, useCallback } from 'react';

export interface AutoSavedPayload<T> {
  data: T;
  savedAt: string;
  version?: number;
}

export interface UseFormAutoSaveOptions<T> {
  key: string;
  formData: T;
  isDirty?: boolean;
  debounceMs?: number;
  onRestore?: (savedData: T) => void;
}

export interface UseFormAutoSaveReturn<T> {
  savedDraft: T | null;
  hasSavedDraft: boolean;
  lastSavedTime: string | null;
  isAutoSaved: boolean;
  restoreDraft: () => T | null;
  clearDraft: () => void;
  discardDraft: () => void;
}

/**
 * Reusable auto-save hook that persists user input to localStorage
 * to prevent data loss on accidental tab navigation, modal closure, or browser refresh.
 */
export function useFormAutoSave<T>({
  key,
  formData,
  isDirty = true,
  debounceMs = 500,
  onRestore
}: UseFormAutoSaveOptions<T>): UseFormAutoSaveReturn<T> {
  const [savedDraft, setSavedDraft] = useState<T | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isAutoSaved, setIsAutoSaved] = useState<boolean>(false);
  
  const isInitialMount = useRef(true);
  const timerRef = useRef<any>(null);

  // 1. On mount: check if an uncommitted draft exists in localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: AutoSavedPayload<T> = JSON.parse(raw);
        if (parsed && parsed.data) {
          setSavedDraft(parsed.data);
          setHasSavedDraft(true);
          const formattedTime = new Date(parsed.savedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          setLastSavedTime(formattedTime);
        }
      }
    } catch (e) {
      console.warn(`[useFormAutoSave] Failed to read draft for key "${key}":`, e);
    }
  }, [key]);

  // 2. Debounced auto-save to localStorage whenever formData changes and form is marked dirty
  useEffect(() => {
    // Skip saving on the very first mount cycle if it hasn't been edited
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!isDirty) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      try {
        const payload: AutoSavedPayload<T> = {
          data: formData,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(key, JSON.stringify(payload));
        const timeStr = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        setLastSavedTime(timeStr);
        setIsAutoSaved(true);
      } catch (e) {
        console.warn(`[useFormAutoSave] Failed to save draft for key "${key}":`, e);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, formData, isDirty, debounceMs]);

  // 3. Clear draft upon successful submission or explicit cancel
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setSavedDraft(null);
      setHasSavedDraft(false);
      setIsAutoSaved(false);
    } catch (e) {
      console.warn(`[useFormAutoSave] Failed to clear draft for key "${key}":`, e);
    }
  }, [key]);

  // 4. Restore draft helper
  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: AutoSavedPayload<T> = JSON.parse(raw);
        if (parsed && parsed.data) {
          if (onRestore) {
            onRestore(parsed.data);
          }
          setHasSavedDraft(false); // dismissed prompt once restored
          return parsed.data;
        }
      }
    } catch (e) {
      console.warn(`[useFormAutoSave] Failed to restore draft for key "${key}":`, e);
    }
    return null;
  }, [key, onRestore]);

  const discardDraft = useCallback(() => {
    clearDraft();
  }, [clearDraft]);

  return {
    savedDraft,
    hasSavedDraft,
    lastSavedTime,
    isAutoSaved,
    restoreDraft,
    clearDraft,
    discardDraft
  };
}
