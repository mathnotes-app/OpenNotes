import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { catalogStore } from '../services/catalogEnv';
import {
  checkBackupRestoreAvailable,
  isBackupAvailable,
  isBackupEnabled,
  performBackupRestore,
  resumeBackupRestoreIfIncomplete,
  scheduleBackupSync,
  setBackupEnabled,
} from '../services/backupService';
import { formatRelative } from '../utils/relativeTime';
import { t } from '../i18n';

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
      // Heal any interrupted restore first: notes whose titles arrived but
      // whose content files are still only in iCloud (a fresh install can
      // race the metadata sync). Copies only what is missing; silent.
      const resumed = await resumeBackupRestoreIfIncomplete();
      if (resumed && resumed.status !== 'unavailable' && resumed.restored > 0) {
        await catalogStore.invalidate();
        await refreshLibrary();
      }
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
      ? formatRelative(new Date(availability.lastBackupAt).toISOString())
      : null;
    Alert.alert(
      t.backup.restoreTitle,
      t.backup.restoreMessage(t.library.noteCount(availability.noteCount), when),
      [
        {
          text: t.common.notNow,
          style: 'cancel',
          onPress: () => scheduleBackupSync(),
        },
        {
          text: t.backup.restoreAction,
          onPress: () => {
            void (async () => {
              const result = await performBackupRestore();
              await catalogStore.invalidate();
              await refreshLibrary();
              scheduleBackupSync();
              if (result.status === 'ok') {
                Alert.alert(t.backup.restoreCompleteTitle, t.backup.restoreCompleteMessage(result.restored));
              } else {
                Alert.alert(
                  t.backup.restoreProblemsTitle,
                  result.status === 'partial'
                    ? t.backup.restorePartialMessage(result.restored, result.failed)
                    : t.backup.restoreUnavailableMessage,
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
      t.backup.turnOffTitle,
      t.backup.turnOffMessage,
      [
        { text: t.backup.keepOn, style: 'cancel' },
        {
          text: t.backup.turnOffConfirm,
          style: 'destructive',
          onPress: () => setBackupPreference(false),
        },
      ],
    );
  }, [setBackupPreference]);

  const backupSubtitle =
    enabled === false
      ? t.backup.statusOff
      : available === false
        ? t.backup.statusUnavailable
        : t.backup.statusAutomatic;

  return {
    backupSupported: BACKUP_SUPPORTED,
    backupEnabled: enabled,
    backupSubtitle,
    toggleBackup,
    setBackupPreference,
  };
}
