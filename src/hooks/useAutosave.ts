import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const DEFAULT_DEBOUNCE_MS = 350;

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface UseAutosaveOptions {
  onSave: () => Promise<void>;
  onStatusChange?: (status: AutosaveStatus) => void;
  debounceMs?: number;
  enabled?: boolean;
}

export function useAutosave({
  onSave,
  onStatusChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  enabled = true,
}: UseAutosaveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const dirtyRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const onStatusRef = useRef(onStatusChange);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onStatusRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const runSave = useCallback(async (): Promise<boolean> => {
    if (!enabledRef.current) return true;
    // Cleared before the save so changes made while it runs mark dirty again.
    dirtyRef.current = false;
    onStatusRef.current?.('saving');
    try {
      await onSaveRef.current();
      onStatusRef.current?.('saved');
      return true;
    } catch (error) {
      dirtyRef.current = true;
      if (__DEV__) console.warn('[useAutosave] save failed', error);
      onStatusRef.current?.('error');
      return false;
    }
  }, []);

  const flushNow = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current) {
      await inFlightRef.current;
    }
    if (!dirtyRef.current) return true;
    const promise = runSave();
    inFlightRef.current = promise;
    return promise.finally(() => {
      if (inFlightRef.current === promise) inFlightRef.current = null;
    });
  }, [runSave]);

  const cancelPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onStatusRef.current?.('idle');
  }, []);

  const schedule = useCallback(() => {
    if (!enabledRef.current) return;
    dirtyRef.current = true;
    onStatusRef.current?.('pending');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const promise = runSave().finally(() => {
        if (inFlightRef.current === promise) inFlightRef.current = null;
      });
      inFlightRef.current = promise;
    }, debounceMs);
  }, [debounceMs, runSave]);

  // Flush the moment the app leaves the foreground: JS timers do not fire in
  // the background, so a pending debounced save would otherwise sit unsaved
  // until the app returns — and be lost if it never does.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void flushNow();
      }
    });
    return () => subscription.remove();
  }, [flushNow]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { schedule, flushNow, cancelPending };
}
