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

export function screenToPageCoord(
  transform: InfiniteInkViewportTransform,
  screenX: number,
  screenY: number,
  pageWidth: number,
  pageHeight: number,
  contentPadding: number,
  pageGap: number,
  pageCount: number,
): PageCoord | null {
  const scale = transform.scale;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const contentX = (screenX - transform.translateX) / scale;
  const contentY = (screenY - transform.translateY) / scale;
  const localX = contentX - contentPadding;
  if (localX < 0 || localX > pageWidth) return null;
  const stride = pageHeight + pageGap;
  const fromTop = contentY - contentPadding;
  if (fromTop < 0) return null;
  const pageIndex = Math.min(pageCount - 1, Math.floor(fromTop / stride));
  const offsetWithinPage = fromTop - pageIndex * stride;
  if (offsetWithinPage > pageHeight) return null;
  return { pageIndex, x: localX, y: offsetWithinPage };
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
