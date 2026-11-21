export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveQueueOptions {
  save: () => Promise<void>;
  onStatus: (status: AutosaveStatus) => void;
  isEnabled: () => boolean;
  debounceMs: number;
  onError?: (error: unknown) => void;
  /** True when newer edits invalidated the save; their own schedule retries it. */
  isSuperseded?: (error: unknown) => boolean;
}

/**
 * Debounced saves that never overlap. A save captures the document first and
 * writes it last, so two concurrent saves could land out of order and let an
 * older capture overwrite newer ink on disk.
 */
export function createAutosaveQueue({ save, onStatus, isEnabled, debounceMs, onError, isSuperseded }: AutosaveQueueOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<boolean> | null = null;
  let dirty = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const runSave = async (): Promise<boolean> => {
    if (!isEnabled()) return true;
    // Cleared before the save so changes made while it runs mark dirty again.
    dirty = false;
    onStatus('saving');
    try {
      await save();
      onStatus(dirty ? 'pending' : 'saved');
      return true;
    } catch (error) {
      dirty = true;
      if (isSuperseded?.(error)) {
        onStatus('pending');
        return false;
      }
      onError?.(error);
      onStatus('error');
      return false;
    }
  };

  const start = (): Promise<boolean> => {
    const previous = inFlight;
    const promise = (async () => {
      if (previous) await previous;
      if (!dirty) return true;
      return runSave();
    })();
    inFlight = promise;
    void promise.finally(() => {
      if (inFlight === promise) inFlight = null;
    });
    return promise;
  };

  return {
    schedule() {
      if (!isEnabled()) return;
      dirty = true;
      onStatus('pending');
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void start();
      }, debounceMs);
    },
    flushNow(): Promise<boolean> {
      clearTimer();
      return start();
    },
    cancelPending() {
      clearTimer();
      onStatus('idle');
    },
    dispose() {
      clearTimer();
    },
  };
}
