import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'expo-router';
import { AppState } from 'react-native';
import { driveSupported, observeDriveLibrary, syncDriveLibrary } from '../services/iCloudDrive';

const SYNC_INTERVAL_MS = 20_000;
type Status = Awaited<ReturnType<typeof syncDriveLibrary>>;
let lastStatus: Status = 'off';
const statusListeners = new Set<(status: Status) => void>();

export function useDriveStatus(): Status {
  const [status, setStatus] = useState(lastStatus);
  useEffect(() => {
    statusListeners.add(setStatus);
    return () => { statusListeners.delete(setStatus); };
  }, []);
  return status;
}

export function useDriveLibraryRefresh(refresh: () => Promise<void>): void {
  useEffect(() => observeDriveLibrary(() => {
    void refresh().catch(error => { if (__DEV__) console.warn('[iCloud Drive] could not refresh the library', error); });
  }), [refresh]);
}

/** Work on the library screens, so large document copies never run continuously
 * while someone is writing and remote edits never replace a live canvas. */
export function useDriveLibrarySync(): void {
  const pathname = usePathname();
  const canSync = pathname === '/' || pathname.startsWith('/folder/');
  const canSyncRef = useRef(canSync);
  canSyncRef.current = canSync;
  useEffect(() => {
    if (!driveSupported || !canSync) return;
    let active = true;
    let running = false;
    const mayApply = () => active && canSyncRef.current && AppState.currentState === 'active';
    const run = async () => {
      if (running || !mayApply()) return;
      running = true;
      try {
        const status = await syncDriveLibrary(mayApply);
        if (!active || status === lastStatus) return;
        lastStatus = status;
        for (const listener of statusListeners) listener(status);
      } finally {
        running = false;
      }
    };
    const subscription = AppState.addEventListener('change', () => { void run(); });
    const interval = setInterval(() => { void run(); }, SYNC_INTERVAL_MS);
    void run();
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [canSync]);
}
