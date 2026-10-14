import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { InfiniteInkViewportTransform } from '@mathnotes/mobile-ink';

export interface ViewportTransformStore {
  transform: InfiniteInkViewportTransform | null;
  onTransformChange: (next: InfiniteInkViewportTransform) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => InfiniteInkViewportTransform | null;
}

export function createViewportTransformStore(): ViewportTransformStore {
  let current: InfiniteInkViewportTransform | null = null;
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = () => current;

  const onTransformChange = (next: InfiniteInkViewportTransform) => {
    current = next;
    listeners.forEach((l) => l());
  };

  return { transform: current, onTransformChange, subscribe, getSnapshot };
}

export function useViewportTransformStore(): {
  store: ViewportTransformStore;
  transform: InfiniteInkViewportTransform | null;
} {
  const storeRef = useRef<ViewportTransformStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createViewportTransformStore();
  }
  const store = storeRef.current;
  const transform = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => null,
  );
  return { store, transform };
}

export interface PageRect {
  pageIndex: number;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  scale: number;
}

export function pageRectFromTransform(
  transform: InfiniteInkViewportTransform,
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
  contentPadding: number,
  pageGap: number,
): PageRect {
  const scale = transform.scale;
  const pageContentTop = contentPadding + pageIndex * (pageHeight + pageGap);
  const screenY = pageContentTop * scale + transform.translateY;
  const screenX = contentPadding * scale + transform.translateX;
  return {
    pageIndex,
    screenX,
    screenY,
    width: pageWidth * scale,
    height: pageHeight * scale,
    scale,
  };
}

export interface PageCoord {
  pageIndex: number;
  x: number;
  y: number;
}

export function contentToPageCoord(
  contentX: number,
  contentY: number,
  pageWidth: number,
  pageHeight: number,
  pageGap: number,
  pageCount: number,
): PageCoord | null {
  if (
    !Number.isFinite(contentX) || !Number.isFinite(contentY) ||
    pageWidth <= 0 || pageHeight <= 0 || pageCount <= 0 ||
    contentX < 0 || contentX > pageWidth || contentY < 0
  ) return null;
  const stride = pageHeight + pageGap;
  const pageIndex = Math.floor(contentY / stride);
  const offsetWithinPage = contentY - pageIndex * stride;
  if (pageIndex >= pageCount || offsetWithinPage >= pageHeight) return null;
  return { pageIndex, x: contentX, y: offsetWithinPage };
}

export function useViewportSubscribe(
  store: ViewportTransformStore,
  callback: (t: InfiniteInkViewportTransform | null) => void,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback(() => {
    const unsubscribe = store.subscribe(() => {
      callbackRef.current(store.getSnapshot());
    });
    callbackRef.current(store.getSnapshot());
    return unsubscribe;
  }, [store]);
}
