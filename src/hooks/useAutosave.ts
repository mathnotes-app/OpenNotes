import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isDocumentCaptureSuperseded } from '@mathnotes/mobile-ink';
import { createAutosaveQueue, type AutosaveStatus } from './autosaveQueue';

export type { AutosaveStatus } from './autosaveQueue';

const DEFAULT_DEBOUNCE_MS = 350;

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
  const onSaveRef = useRef(onSave);
  const onStatusRef = useRef(onStatusChange);
  const enabledRef = useRef(enabled);
  onSaveRef.current = onSave;
  onStatusRef.current = onStatusChange;
  enabledRef.current = enabled;

  const [queue] = useState(() => createAutosaveQueue({
    save: () => onSaveRef.current(),
    onStatus: status => onStatusRef.current?.(status),
    isEnabled: () => enabledRef.current,
    debounceMs,
    onError: error => { if (__DEV__) console.warn('[useAutosave] save failed', error); },
    isSuperseded: isDocumentCaptureSuperseded,
  }));

  // Flush the moment the app leaves the foreground: JS timers do not fire in
  // the background, so a pending debounced save would otherwise sit unsaved
  // until the app returns — and be lost if it never does.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void queue.flushNow();
      }
    });
    return () => subscription.remove();
  }, [queue]);

  useEffect(() => () => queue.dispose(), [queue]);

  return { schedule: queue.schedule, flushNow: queue.flushNow, cancelPending: queue.cancelPending };
}
