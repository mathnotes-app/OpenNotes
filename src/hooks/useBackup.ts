import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { catalogStore } from '../services/catalogEnv';
import {
  checkBackupRestoreAvailable,
  isBackupAvailable,
  isBackupEnabled,
  performBackupRestore,
  scheduleBackupSync,
  setBackupEnabled,
} from '../services/backupService';
import { formatRelative } from '../utils/relativeTime';

export interface UseBackupResult {
  /** False on platforms without a backup implementation (Android, for now). */
  backupSupported: boolean;
  backupEnabled: boolean | null;
  backupSubtitle: string;
  toggleBackup: (enabled: boolean) => void;
  /**
   * Sets the preference directly, without the confirmation dialog. For flows
   * where the user is already answering an explicit question (onboarding).
   */
  setBackupPreference: (enabled: boolean) => void;
}

const BACKUP_SUPPORTED = Platform.OS === 'ios';

/**
 * Backup state for the library screen: the enable switch, a status line, and
 * a one-time restore offer when the library is empty but a backup exists
 * (fresh install after the app was deleted).
 *
 * `canAutoSync` gates the automatic restore-check/startup-sync until
 * onboarding has finished, so nothing is mirrored before a fresh user has
 * answered the backup question. An explicit choice always syncs immediately.
 */
export function useBackup(
  refreshLibrary: () => Promise<void>,
  canAutoSync = true,
): UseBackupResult {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const restorePromptShownRef = useRef(false);

  useEffect(() => {
    if (!BACKUP_SUPPORTED) return;
    let cancelled = false;
    void (async () => {
      const [isEnabled, isAvailable] = await Promise.all([
        isBackupEnabled(),
        isBackupAvailable(),
      ]);
      if (cancelled) return;
      setEnabled(isEnabled);
      setAvailable(isAvailable);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const offerRestore = useCallback(async () => {
    if (restorePromptShownRef.current) return;
    const availability = await checkBackupRestoreAvailable();
    if (!availability || restorePromptShownRef.current) {
      // No restore pending: safe to start the catch-up push. It retries a
      // backup that failed last session and mirrors pre-existing data after
      // an app update; a no-op copy-wise when the mirror is current. It is
      // deliberately NOT scheduled while a restore offer is on screen - the
      // engine's empty-local guard also protects the backup, but the order
      // here makes the race impossible rather than merely survivable.
      scheduleBackupSync();
      return;
    }
    restorePromptShownRef.current = true;

    const when = availability.lastBackupAt
      ? ` (backed up ${formatRelative(new Date(availability.lastBackupAt).toISOString())})`
      : '';
    const noun = availability.noteCount === 1 ? 'note' : 'notes';
    Alert.alert(
      'Restore your notes?',
      `An iCloud backup with ${availability.noteCount} ${noun}${when} was found for this device's account.`,
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => scheduleBackupSync(),
        },
        {
          text: 'Restore',
          onPress: () => {
            void (async () => {
              const result = await performBackupRestore();
              await catalogStore.invalidate();
              await refreshLibrary();
              scheduleBackupSync();
              if (result.status === 'ok') {
                Alert.alert('Restore complete', `${result.restored} files restored.`);
              } else {
                Alert.alert(
                  'Restore finished with problems',
                  result.status === 'partial'
                    ? `${result.restored} files restored, ${result.failed} could not be read from iCloud. Try again later for the rest.`
                    : 'iCloud is not reachable right now. Try again later.',
                );
              }
            })();
          },
        },
      ],
    );
  }, [refreshLibrary]);

  useEffect(() => {
    if (!BACKUP_SUPPORTED || !canAutoSync) return;
    void offerRestore();
  }, [canAutoSync, offerRestore]);

  const setBackupPreference = useCallback((next: boolean) => {
    setEnabled(next);
    void setBackupEnabled(next);
  }, []);

  const toggleBackup = useCallback((next: boolean) => {
    if (next) {
      setBackupPreference(true);
      return;
    }
    Alert.alert(
      'Turn off iCloud backup?',
      'Your notes will exist only on this device. Deleting the app will permanently delete them.',
      [
        { text: 'Keep backup on', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: () => setBackupPreference(false),
        },
      ],
    );
  }, [setBackupPreference]);

  const backupSubtitle =
    enabled === false
      ? 'Off — notes exist only on this device'
      : available === false
        ? 'iCloud unavailable — sign in to iCloud to protect your notes'
        : 'Automatic — your notes survive app deletion';

  return {
    backupSupported: BACKUP_SUPPORTED,
    backupEnabled: enabled,
    backupSubtitle,
    toggleBackup,
    setBackupPreference,
  };
}
