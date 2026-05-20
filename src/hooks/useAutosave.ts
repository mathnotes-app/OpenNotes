import { useCallback, useEffect, useRef } from 'react';

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
  const inFlightRef = useRef<Promise<void> | null>(null);
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

  const runSave = useCallback(async (): Promise<void> => {
    if (!enabledRef.current) return;
    onStatusRef.current?.('saving');
    try {
      await onSaveRef.current();
      onStatusRef.current?.('saved');
    } catch (error) {
      if (__DEV__) console.warn('[useAutosave] save failed', error);
      onStatusRef.current?.('error');
    }
  }, []);

  const flushNow = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current) {
      await inFlightRef.current;
    }
    const promise = runSave();
    inFlightRef.current = promise;
    await promise.finally(() => {
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

  const waitForIdle = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) {
      await inFlightRef.current;
    }
  }, []);

  const schedule = useCallback(() => {
    if (!enabledRef.current) return;
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

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { schedule, flushNow, cancelPending, waitForIdle };
}
