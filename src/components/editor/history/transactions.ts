import type {NotebookPage} from '@mathnotes/mobile-ink';
import {applyOverlayPatch, overlayPatches} from './patch.ts';

type Update = NotebookPage[] | ((pages: NotebookPage[]) => NotebookPage[]);
type Options = {
  read: () => NotebookPage[];
  write: (pages: NotebookPage[]) => void;
  onCommitFailure?: (error: Error) => void;
  prepare?: (before: NotebookPage[], after: NotebookPage[]) => Promise<NotebookPage[]>;
  record: (before: string, after: string) => Promise<boolean>;
};

/** Serializes overlay commits with undo/redo and persistence barriers. */
export function createOverlayTransactions({read, write, record, prepare, onCommitFailure}: Options) {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  let disposed = false;

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (disposed) return Promise.reject(new Error('Notebook history has closed'));
    pending += 1;
    const result = tail.then(async () => {
      if (disposed) throw new Error('Notebook history has closed');
      return operation();
    });
    // The caller receives failures; later valid edits must remain usable.
    tail = result.then(() => undefined, () => undefined).finally(() => {pending -= 1;});
    return result;
  }

  return {
    commit(update: Update): Promise<void> {
      return enqueue(async () => {
        const before = read();
        // Evaluate outside React's state updater: StrictMode must not record twice.
        let after = typeof update === 'function' ? update(before) : update;
        if (prepare) after = await prepare(before, after);
        if (disposed) throw new Error('Notebook closed while preparing overlay edit');
        const patches = overlayPatches(before, after);
        if (!patches) return;
        if (!await record(patches.before, patches.after)) {
          throw new Error('Ink engine could not record the overlay edit');
        }
        if (disposed) throw new Error('Notebook closed before overlay commit');
        // Derived image/render metadata and newly captured ink may have arrived
        // while crossing the native bridge. Apply just the user's changed fields.
        try {write(applyOverlayPatch(read(), patches.after));} catch (error) {
          onCommitFailure?.(error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      });
    },
    run: enqueue,
    async flush(): Promise<void> {
      // Include operations enqueued while a bridge call was in flight.
      let observed: Promise<void>;
      do {observed = tail; await observed;} while (observed !== tail);
    },
    hasPending: () => pending > 0,
    dispose() {disposed = true;},
  };
}
