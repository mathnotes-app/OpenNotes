import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState, NativeModules } from 'react-native';
import { writeStringAtomic } from './atomicFile';
import {
  DATA_DIRS,
  checkRestoreAvailable,
  restoreFromBackup,
  resumeRestoreIfIncomplete,
  syncBackup,
  type BackupEnv,
  type BackupFileInfo,
  type BackupSyncResult,
  type RestoreAvailability,
  type RestoreResult,
} from './backupEngine';
import { CATALOG_FILENAME } from './catalogStore';
import { hasCompletedOnboarding } from './onboardingService';

const ENABLED_KEY = '@opennotes:backup:enabled';
const SYNC_DEBOUNCE_MS = 8000;
const DEV_CONTAINER_OVERRIDE_FILE = 'dev-backup-container-path.txt';

// All backup-side file I/O goes through the native module: expo-file-system
// refuses paths outside the app sandbox scopes, and the iCloud ubiquity
// container is outside them.
type ICloudBackupModuleType = {
  getContainerPath?: () => Promise<string | null>;
  ensureDownloaded?: (path: string, timeoutMs: number) => Promise<boolean>;
  copyItem?: (from: string, to: string) => Promise<boolean>;
  writeFileAtomic?: (path: string, contents: string) => Promise<boolean>;
  readFileAsString?: (path: string) => Promise<string | null>;
  deleteItem?: (path: string) => Promise<boolean>;
  listFilesRecursive?: (
    dir: string,
  ) => Promise<Array<{ rel: string; size: number; mtimeMs: number }>>;
  listCloudFiles?: (
    dir: string,
    timeoutMs: number,
  ) => Promise<Array<{ rel: string; size: number; downloaded: boolean }>>;
  uploadStatus?: (
    dir: string,
    timeoutMs: number,
  ) => Promise<{ total: number; uploaded: number; pending: string[] }>;
};

const ICloudBackupModule = NativeModules.ICloudBackupModule as
  | ICloudBackupModuleType
  | undefined;

function documentsDir(): string {
  return FileSystem.documentDirectory ?? '';
}

function localAbs(rel: string): string {
  return `${documentsDir()}${rel}`;
}

async function listDataFilesUnder(
  relDir: string,
  out: BackupFileInfo[],
): Promise<void> {
  const absDir = localAbs(relDir);
  const dirInfo = await FileSystem.getInfoAsync(absDir);
  if (!dirInfo.exists) return;
  const names = await FileSystem.readDirectoryAsync(absDir);
  for (const name of names) {
    if (name.endsWith('.tmp')) continue;
    const rel = `${relDir}/${name}`;
    const info = await FileSystem.getInfoAsync(localAbs(rel));
    if (!info.exists) continue;
    if (info.isDirectory) {
      await listDataFilesUnder(rel, out);
    } else {
      out.push({
        rel,
        size: typeof info.size === 'number' ? info.size : 0,
        mtimeMs:
          typeof info.modificationTime === 'number'
            ? Math.round(info.modificationTime * 1000)
            : 0,
      });
    }
  }
}

/**
 * iCloud shows not-yet-downloaded files as ".<name>.icloud" placeholders;
 * surface them under their real name so restore triggers the download.
 */
function normalizeICloudPlaceholder(rel: string): string {
  const slash = rel.lastIndexOf('/');
  const dir = slash >= 0 ? rel.slice(0, slash + 1) : '';
  const name = slash >= 0 ? rel.slice(slash + 1) : rel;
  if (name.startsWith('.') && name.endsWith('.icloud')) {
    return `${dir}${name.slice(1, -'.icloud'.length)}`;
  }
  return rel;
}

async function devContainerOverride(): Promise<string | null> {
  if (!__DEV__) return null;
  try {
    const path = localAbs(DEV_CONTAINER_OVERRIDE_FILE);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const contents = (await FileSystem.readAsStringAsync(path)).trim();
    return contents || null;
  } catch {
    return null;
  }
}

const env: BackupEnv = {
  async getContainerDir(): Promise<string | null> {
    const override = await devContainerOverride();
    if (override) return override;
    if (!ICloudBackupModule?.getContainerPath) return null;
    try {
      return await ICloudBackupModule.getContainerPath();
    } catch (error) {
      env.warn('[backupService] container lookup failed', error);
      return null;
    }
  },

  async isEnabled(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(ENABLED_KEY)) !== 'false';
    } catch {
      return true;
    }
  },

  async readLocalCatalog(): Promise<string | null> {
    try {
      const path = localAbs(CATALOG_FILENAME);
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) return null;
      return await FileSystem.readAsStringAsync(path);
    } catch {
      return null;
    }
  },

  writeLocalCatalog(raw: string): Promise<boolean> {
    return writeStringAtomic(localAbs(CATALOG_FILENAME), raw).catch(() => false);
  },

  async listLocalDataFiles(): Promise<BackupFileInfo[]> {
    const out: BackupFileInfo[] = [];
    for (const dir of DATA_DIRS) {
      // The native walk returns every file with its stat in ONE bridge call;
      // the JS walk (one getInfoAsync per file) is the module-less fallback.
      if (ICloudBackupModule?.listFilesRecursive) {
        const entries = await ICloudBackupModule.listFilesRecursive(localAbs(dir));
        for (const entry of entries) {
          if (entry.rel.endsWith('.tmp')) continue;
          out.push({ rel: `${dir}/${entry.rel}`, size: entry.size, mtimeMs: entry.mtimeMs });
        }
      } else {
        await listDataFilesUnder(dir, out);
      }
    }
    return out;
  },

  async localFileExists(rel: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(localAbs(rel));
    return info.exists;
  },

  async copyLocalToBackup(rel: string, backupDir: string): Promise<boolean> {
    if (!ICloudBackupModule?.copyItem) return false;
    try {
      await ICloudBackupModule.copyItem(localAbs(rel), `${backupDir}/${rel}`);
      return true;
    } catch (error) {
      env.warn(`[backupService] copy to backup failed for ${rel}`, error);
      return false;
    }
  },

  async copyBackupToLocal(backupDir: string, rel: string): Promise<boolean> {
    if (!ICloudBackupModule?.copyItem) return false;
    try {
      await ICloudBackupModule.copyItem(`${backupDir}/${rel}`, localAbs(rel));
      return true;
    } catch (error) {
      env.warn(`[backupService] restore copy failed for ${rel}`, error);
      return false;
    }
  },

  async readBackupFile(absPath: string): Promise<string | null> {
    if (!ICloudBackupModule?.readFileAsString) return null;
    try {
      return await ICloudBackupModule.readFileAsString(absPath);
    } catch (error) {
      env.warn(`[backupService] backup read failed for ${absPath}`, error);
      return null;
    }
  },

  async writeBackupFileAtomic(absPath: string, contents: string): Promise<boolean> {
    if (!ICloudBackupModule?.writeFileAtomic) return false;
    try {
      return await ICloudBackupModule.writeFileAtomic(absPath, contents);
    } catch (error) {
      env.warn(`[backupService] backup write failed for ${absPath}`, error);
      return false;
    }
  },

  async deleteBackupFile(absPath: string): Promise<void> {
    if (!ICloudBackupModule?.deleteItem) return;
    await ICloudBackupModule.deleteItem(absPath);
  },

  async listBackupDataFiles(backupDir: string): Promise<string[]> {
    const out = new Set<string>();
    // The filesystem walk sees materialized files (and the dev override dir).
    if (ICloudBackupModule?.listFilesRecursive) {
      for (const dir of DATA_DIRS) {
        const entries = await ICloudBackupModule.listFilesRecursive(`${backupDir}/${dir}`);
        for (const entry of entries) {
          if (entry.rel.endsWith('.tmp')) continue;
          out.add(normalizeICloudPlaceholder(`${dir}/${entry.rel}`));
        }
      }
    }
    // The metadata query sees items iCloud knows about but has not yet
    // synced to disk - the fresh-install state - and nudges the sync along.
    if (ICloudBackupModule?.listCloudFiles) {
      try {
        const cloud = await ICloudBackupModule.listCloudFiles(backupDir, 15000);
        for (const entry of cloud) {
          const rel = normalizeICloudPlaceholder(entry.rel);
          if (rel.endsWith('.tmp')) continue;
          if (DATA_DIRS.some((d) => rel.startsWith(`${d}/`))) out.add(rel);
        }
      } catch (error) {
        env.warn('[backupService] cloud metadata listing failed', error);
      }
    }
    return [...out];
  },

  async ensureDownloaded(absPath: string, timeoutMs: number): Promise<boolean> {
    if (!ICloudBackupModule?.ensureDownloaded) return false;
    try {
      return await ICloudBackupModule.ensureDownloaded(absPath, timeoutMs);
    } catch (error) {
      env.warn(`[backupService] download failed for ${absPath}`, error);
      return false;
    }
  },

  now(): number {
    return Date.now();
  },

  warn(message: string, error?: unknown): void {
    if (__DEV__) console.warn(message, error ?? '');
  },
};

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<BackupSyncResult> | null = null;
let syncQueued = false;

function startSync(): Promise<BackupSyncResult> {
  if (syncInFlight) {
    // A sync is running against a snapshot that may already be stale; run one
    // more full pass when it finishes.
    syncQueued = true;
    return syncInFlight;
  }
  const promise = syncBackup(env).finally(() => {
    syncInFlight = null;
    if (syncQueued) {
      syncQueued = false;
      void startSync();
    }
  });
  syncInFlight = promise;
  return promise;
}

/**
 * True once the user has been asked the backup question. Automatic syncs
 * (debounced pushes, background flushes) must not mirror anything before
 * onboarding presents the choice; explicit user actions bypass this via
 * flushBackupSync.
 */
async function autoSyncAllowed(): Promise<boolean> {
  try {
    return await hasCompletedOnboarding();
  } catch {
    return false;
  }
}

async function startSyncIfConsented(): Promise<void> {
  if (await autoSyncAllowed()) await startSync();
}

/** Debounced backup push; called after every successful catalog persist. */
export function scheduleBackupSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void startSyncIfConsented();
  }, SYNC_DEBOUNCE_MS);
}

/** Runs any pending or new sync immediately (app background, manual). */
export function flushBackupSync(): Promise<BackupSyncResult> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  return startSync();
}

export async function isBackupEnabled(): Promise<boolean> {
  return env.isEnabled();
}

/** True when an iCloud container (or dev override) is reachable right now. */
export async function isBackupAvailable(): Promise<boolean> {
  return (await env.getContainerDir()) !== null;
}

export interface BackupUploadStatus {
  total: number;
  uploaded: number;
  pending: number;
}

/**
 * Asks iCloud how much of the mirrored backup has actually reached the
 * server. Local container copies are NOT durable until uploaded - this is
 * the only honest basis for telling the user their notes are safe. Returns
 * null when unknowable (no module, dev override, container unavailable).
 */
export async function getBackupUploadStatus(): Promise<BackupUploadStatus | null> {
  if (!ICloudBackupModule?.uploadStatus) return null;
  if (await devContainerOverride()) return null;
  const containerDir = await env.getContainerDir();
  if (!containerDir) return null;
  try {
    const status = await ICloudBackupModule.uploadStatus(containerDir, 10000);
    return { total: status.total, uploaded: status.uploaded, pending: status.pending.length };
  } catch (error) {
    env.warn('[backupService] upload status query failed', error);
    return null;
  }
}

export async function setBackupEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  if (enabled) {
    // Catch up immediately so re-enabling mirrors everything without waiting
    // for the next edit.
    void flushBackupSync();
  }
}

export function checkBackupRestoreAvailable(): Promise<RestoreAvailability | null> {
  return checkRestoreAvailable(env);
}

export function performBackupRestore(): Promise<RestoreResult> {
  return restoreFromBackup(env);
}

/**
 * Completes an interrupted restore (notes known locally whose content files
 * are still only in the backup). Returns null when nothing was missing.
 */
export function resumeBackupRestoreIfIncomplete(): Promise<RestoreResult | null> {
  return resumeRestoreIfIncomplete(env);
}

// Timers do not fire while backgrounded; push any pending sync out before the
// app is suspended, mirroring the autosave hook's behavior.
AppState.addEventListener('change', (state) => {
  if ((state === 'background' || state === 'inactive') && syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
    void startSyncIfConsented();
  }
});
