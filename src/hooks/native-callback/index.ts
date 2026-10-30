import {useLayoutEffect, useMemo} from 'react';

/** Only this small cell is retained by the animation runtime, never a render scope. */
export function createNativeCallback<Args extends unknown[]>() {
  let current: ((...args: Args) => void) | null = null;
  return {
    update(next: ((...args: Args) => void) | null) { current = next; },
    invoke: (...args: Args) => { current?.(...args); },
  };
}

/** Stable runOnJS target; queued calls after unmount are deliberately ignored. */
export function useNativeCallback<Args extends unknown[]>(callback: (...args: Args) => void) {
  const bridge = useMemo(createNativeCallback<Args>, []);
  useLayoutEffect(() => {
    bridge.update(callback);
    return () => bridge.update(null);
  }, [bridge, callback]);
  return bridge.invoke;
}
