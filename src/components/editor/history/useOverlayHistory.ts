import {useCallback, useEffect, useRef} from 'react';
import {Alert} from 'react-native';
import {t} from '../../../i18n';
import type {NotebookPage, ContinuousDocumentCanvasRef} from '@mathnotes/mobile-ink';
type DrawingEvent = {nativeEvent: {historyAction?: 'undo' | 'redo'; externalEdit?: {payload: string}}};
import {applyOverlayPatch} from './patch';
import {createOverlayTransactions} from './transactions';

type Action = 'undo' | 'redo';
type Inputs = {
  fileId?: string | null;
  readPages: () => NotebookPage[];
  canvasRef: React.RefObject<ContinuousDocumentCanvasRef | null>;
  writePages: (pages: NotebookPage[]) => void;
  onChange: () => void;
};
type Ack = {action: Action; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>};

export function useOverlayHistory(options: Inputs) {
  const latest = useRef(options);
  latest.current = options;
  const queue = useRef<ReturnType<typeof createOverlayTransactions> | null>(null);
  const ack = useRef<Ack | null>(null);
  const fault = useRef<Error | null>(null);
  const write = useCallback((pages: NotebookPage[]) => {
    latest.current.writePages(pages);
    latest.current.onChange();
  }, []);
  useEffect(() => {
    fault.current = null;
    const current = createOverlayTransactions({
      read: () => latest.current.readPages(),
      write,
      onCommitFailure: error => {fault.current = error;},
      record: async (before, after) => {
        if (fault.current) throw fault.current;
        const canvas = latest.current.canvasRef.current;
        if (!canvas) throw new Error('Ink canvas is unavailable');
        return canvas.recordExternalEdit(before, after);
      },
    });
    queue.current = current;
    return () => {
      current.dispose();
      if (ack.current) {
        clearTimeout(ack.current.timer);
        ack.current.reject(new Error('Notebook closed during history operation'));
        ack.current = null;
      }
      if (queue.current === current) queue.current = null;
    };
  }, [options.fileId, write]);

  const report = useCallback((error: unknown) => {
    console.error('[OverlayHistory] Edit could not complete', error);
    Alert.alert(t.common.pleaseTryAgain, t.common.pleaseTryAgainLater);
  }, []);
  const setOverlayPages = useCallback<React.Dispatch<React.SetStateAction<NotebookPage[]>>>(update => {
    if (!queue.current) {report(new Error('Notebook history is unavailable')); return;}
    void queue.current.commit(update).catch(report);
  }, [report]);
  const flushOverlayHistory = useCallback(async () => {
    await queue.current?.flush();
    if (fault.current) throw fault.current;
  }, []);
  const runAfterOverlayHistory = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    if (!queue.current) return Promise.reject(new Error('Notebook history is unavailable'));
    return queue.current.run(async () => {
      if (fault.current) throw fault.current;
      return operation();
    });
  }, []);
  const hasPendingOverlayHistory = useCallback(() => Boolean(queue.current?.hasPending()), []);
  const handleHistoryDrawingChange = useCallback<(event?: DrawingEvent) => void>(event => {
    const data = event?.nativeEvent;
    try {
      if (data?.externalEdit) write(applyOverlayPatch(latest.current.readPages(), data.externalEdit.payload));
      const pending = ack.current;
      if (pending && data?.historyAction === pending.action) {
        clearTimeout(pending.timer);
        pending.resolve();
        ack.current = null;
      }
    } catch (error) {
      fault.current = error instanceof Error ? error : new Error(String(error));
      if (ack.current) {
        clearTimeout(ack.current.timer);
        ack.current.reject(fault.current);
        ack.current = null;
      } else report(error);
    }
  }, [report, write]);
  const runHistory = useCallback((action: Action) => {
    if (!queue.current) {report(new Error('Notebook history is unavailable')); return;}
    void queue.current.run(async () => {
      if (fault.current) throw fault.current;
      const canvas = latest.current.canvasRef.current;
      if (!canvas) throw new Error('Ink canvas is unavailable');
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          fault.current = new Error('Native history acknowledgement timed out');
          ack.current = null;
          reject(fault.current);
        }, 10000);
        ack.current = {action, resolve, reject, timer};
        try {canvas[action]();} catch (error) {
          clearTimeout(timer);
          ack.current = null;
          reject(error);
        }
      });
    }).catch(report);
  }, [report]);
  return {setOverlayPages, flushOverlayHistory, hasPendingOverlayHistory, runAfterOverlayHistory,
    handleHistoryDrawingChange, undoHistory: useCallback(() => runHistory('undo'), [runHistory]),
    redoHistory: useCallback(() => runHistory('redo'), [runHistory])};
}
