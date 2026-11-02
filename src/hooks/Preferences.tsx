import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAYOUT_VERSION, resolveLibraryLayout, type LibraryLayout } from '../utils/libraryLayoutPreference';

export type Appearance = 'system' | 'light' | 'dark';
export type { LibraryLayout } from '../utils/libraryLayoutPreference';
type Preferences = { appearance: Appearance; returnToPen: boolean; libraryLayout: LibraryLayout; holdToShape: boolean };
type PreferencesContextValue = Preferences & {
  setAppearance: (value: Appearance) => void;
  setReturnToPen: (value: boolean) => void;
  setLibraryLayout: (value: LibraryLayout) => void;
  setHoldToShape: (value: boolean) => void;
};

const KEY = '@opennotes:preferences';
const defaults: Preferences = { appearance: 'system', returnToPen: false, libraryLayout: 'columns', holdToShape: true };
const Context = createContext<PreferencesContextValue>({
  ...defaults, setAppearance: () => {}, setReturnToPen: () => {}, setLibraryLayout: () => {}, setHoldToShape: () => {},
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const current = useRef(defaults);
  const changed = useRef(new Set<keyof Preferences>());
  const hydrated = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback(() => {
    const next = JSON.stringify({ ...current.current, libraryLayoutVersion: LAYOUT_VERSION });
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, next));
    void writes.current.catch(error => { if (__DEV__) console.warn('[Preferences] save failed', error); });
  }, []);

  useEffect(() => {
    let active = true;
    let migrateLayout = false;
    void AsyncStorage.getItem(KEY).then(raw => {
      if (!active || !raw) return;
      const stored: unknown = JSON.parse(raw);
      if (!stored || typeof stored !== 'object') return;
      const value = stored as Partial<Preferences> & { libraryLayoutVersion?: number };
      const next = { ...current.current };
      if (!changed.current.has('appearance') && ['system', 'light', 'dark'].includes(value.appearance ?? ''))
        next.appearance = value.appearance as Appearance;
      if (!changed.current.has('returnToPen') && typeof value.returnToPen === 'boolean')
        next.returnToPen = value.returnToPen;
      if (!changed.current.has('libraryLayout')) {
        // Earlier versions wrote the old grid default whenever any preference
        // changed. Move those installs to the new default once; subsequent
        // explicit layout choices are marked and preserved.
        const resolved = resolveLibraryLayout(value);
        migrateLayout = resolved.migrate;
        next.libraryLayout = resolved.layout;
      }
      if (!changed.current.has('holdToShape') && typeof value.holdToShape === 'boolean')
        next.holdToShape = value.holdToShape;
      current.current = next;
      setPreferences(next);
    }).catch(error => { if (__DEV__) console.warn('[Preferences] load failed', error); }).finally(() => {
      if (!active) return;
      hydrated.current = true;
      if (changed.current.size || migrateLayout) persist();
    });
    return () => { active = false; };
  }, [persist]);

  const update = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    changed.current.add(key);
    const next = { ...current.current, [key]: value };
    current.current = next;
    setPreferences(next);
    if (hydrated.current) persist();
  }, [persist]);
  const setAppearance = useCallback((value: Appearance) => update('appearance', value), [update]);
  const setReturnToPen = useCallback((value: boolean) => update('returnToPen', value), [update]);
  const setLibraryLayout = useCallback((value: LibraryLayout) => update('libraryLayout', value), [update]);
  const setHoldToShape = useCallback((value: boolean) => update('holdToShape', value), [update]);
  return <Context.Provider value={{ ...preferences, setAppearance, setReturnToPen, setLibraryLayout, setHoldToShape }}>{children}</Context.Provider>;
}

export function usePreferences() { return useContext(Context); }
