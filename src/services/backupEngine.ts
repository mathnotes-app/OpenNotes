// Pure backup/restore logic with an injected environment, so every failure
// mode is testable under plain `node --test` (like catalogStore). The real
// wiring lives in backupEnv.ts; the iCloud specifics live in the native
// ICloudBackupModule.
//
// Model: the device is the source of truth; the iCloud Drive container holds
// a mirror of the data files plus a manifest describing what was mirrored.
// Sync pushes local changes to the mirror. Restore pulls the mirror into an
// EMPTY library (never over existing notes) - after which the catalog's own
// reconciliation pass rebuilds anything the mirrored catalog missed.
import { RECOVERED_NOTE_TITLE, parseCatalog, type Catalog } from './catalogStore.ts';

export const BACKUP_SUBDIR = 'OpenNotesBackup';
export const BACKUP_MANIFEST_NAME = 'manifest.json';
export const BACKUP_CATALOG_NAME = 'notes-catalog.json';
/** Documents-relative directories mirrored to the backup. */
export const DATA_DIRS = ['notebook-bodies', 'pdfs', 'images'] as const;
const BODIES_PREFIX = `${DATA_DIRS[0]}/`;
const ENSURE_DOWNLOAD_TIMEOUT_MS = 30000;

export interface BackupFileInfo {
  /** Path relative to the app Documents directory, e.g. "notebook-bodies/x.body". */
  rel: string;
  size: number;
  mtimeMs: number;
}

export interface BackupManifest {
  version: 1;
  files: Record<string, { size: number; mtimeMs: number }>;
  lastBackupAt: number;
  noteCount: number;
}

export interface BackupEnv {
  /** Absolute path of the iCloud container Documents dir, or null when iCloud is unavailable. */
  getContainerDir(): Promise<string | null>;
  isEnabled(): Promise<boolean>;
  readLocalCatalog(): Promise<string | null>;
  /** Writes the local catalog file atomically. */
  writeLocalCatalog(raw: string): Promise<boolean>;
  /** Every local data file (bodies, pdfs, images) with size and mtime. */
  listLocalDataFiles(): Promise<BackupFileInfo[]>;
  localFileExists(rel: string): Promise<boolean>;
  /** Copies one local data file into the backup dir, creating directories. */
  copyLocalToBackup(rel: string, backupDir: string): Promise<boolean>;
  /** Copies one backup file into the local Documents dir, creating directories. */
  copyBackupToLocal(backupDir: string, rel: string): Promise<boolean>;
  /** Returns file contents, null when missing or unreadable. */
  readBackupFile(absPath: string): Promise<string | null>;
  writeBackupFileAtomic(absPath: string, contents: string): Promise<boolean>;
  deleteBackupFile(absPath: string): Promise<void>;
  /** Recursively lists data files under the backup dir, as Documents-relative paths. */
  listBackupDataFiles(backupDir: string): Promise<string[]>;
  /** Makes an iCloud-evicted file locally readable. True when readable. */
  ensureDownloaded(absPath: string, timeoutMs: number): Promise<boolean>;
  now(): number;
  warn(message: string, error?: unknown): void;
}

export type BackupSyncResult =
  | { status: 'disabled' }
  | { status: 'unavailable' }
  /**
   * The local library is empty but the backup holds notes - the fresh-install
   * state where the restore question is still open. Pushing would overwrite
   * the backup catalog with an empty one, so the sync refuses to touch it.
   */
  | { status: 'skipped-empty-local' }
  | { status: 'ok'; copied: number; removed: number }
  | { status: 'partial'; copied: number; removed: number; failed: number };

/** Maps a mirrored data-file path back to the note id it belongs to. */
export function noteIdForRel(rel: string): string | null {
  const [dir, ...rest] = rel.split('/');
  if (rest.length === 0) return null;
  try {
    if (dir === DATA_DIRS[0] && rest.length === 1 && rest[0].endsWith('.body')) {
      return decodeURIComponent(rest[0].slice(0, -'.body'.length)) || null;
    }
    if (dir === DATA_DIRS[1] && rest.length === 1 && rest[0].endsWith('.pdf')) {
      return decodeURIComponent(rest[0].slice(0, -'.pdf'.length)) || null;
    }
    if (dir === DATA_DIRS[2]) {
      return decodeURIComponent(rest[0]) || null;
    }
  } catch {
    return null;
  }
  return null;
}

export interface RestoreAvailability {
  noteCount: number;
  lastBackupAt: number | null;
}

export type RestoreResult =
  | { status: 'unavailable' }
  | { status: 'ok'; restored: number }
  | { status: 'partial'; restored: number; failed: number };

/**
 * Rejects any path that could escape its base directory. Backup contents are
 * user-account data but treated as untrusted input for path construction.
 */
export function isSafeRelPath(rel: string): boolean {
  if (!rel || rel.startsWith('/') || rel.includes('\\') || rel.includes('\0')) return false;
  const segments = rel.split('/');
  return segments.every((s) => s.length > 0 && s !== '.' && s !== '..');
}

function backupDirPath(containerDir: string): string {
  return `${containerDir.replace(/\/$/, '')}/${BACKUP_SUBDIR}`;
}

function parseManifest(raw: string | null, warn: BackupEnv['warn']): BackupManifest | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BackupManifest>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const files: BackupManifest['files'] = {};
    if (typeof parsed.files === 'object' && parsed.files !== null) {
      for (const [rel, entry] of Object.entries(parsed.files)) {
        if (
          isSafeRelPath(rel) &&
          typeof entry === 'object' &&
          entry !== null &&
          typeof entry.size === 'number' &&
          typeof entry.mtimeMs === 'number'
        ) {
          files[rel] = { size: entry.size, mtimeMs: entry.mtimeMs };
        }
      }
    }
    return {
      version: 1,
      files,
      lastBackupAt: typeof parsed.lastBackupAt === 'number' ? parsed.lastBackupAt : 0,
      noteCount: typeof parsed.noteCount === 'number' ? parsed.noteCount : 0,
    };
  } catch {
    warn('[backupEngine] backup manifest corrupt; performing full re-mirror');
    return null;
  }
}

const META_DOWNLOAD_TIMEOUT_MS = 10000;

/**
 * Reads a backup-side JSON file, forcing an iCloud download first - on a
 * fresh install the manifest/catalog can be cloud-only just like data files.
 * A failed download degrades to null, which every caller already handles.
 */
async function readBackupMeta(
  env: BackupEnv,
  backupDir: string,
  name: string,
): Promise<string | null> {
  const abs = `${backupDir}/${name}`;
  try {
    await env.ensureDownloaded(abs, META_DOWNLOAD_TIMEOUT_MS);
  } catch {
    // Best effort; the read below returns null if the file never landed.
  }
  return env.readBackupFile(abs);
}

async function backupDataRels(
  env: BackupEnv,
  backupDir: string,
  manifest: BackupManifest | null,
): Promise<{ rels: Set<string>; listed: Set<string> }> {
  const listed = new Set(await env.listBackupDataFiles(backupDir));
  return { rels: new Set([...Object.keys(manifest?.files ?? {}), ...listed]), listed };
}

function localNoteCount(catalogRaw: string | null): number | null {
  if (!catalogRaw) return null;
  const catalog = parseCatalog(catalogRaw);
  return catalog ? catalog.notes.length : null;
}

/**
 * Pushes local state into the backup mirror. Copies new/changed files,
 * removes files deleted locally, then writes the catalog and manifest last -
 * so a crash mid-sync leaves a manifest that still describes mirrored files
 * accurately (unlisted copies are re-copied harmlessly next sync).
 *
 * Never throws; local saving must never be affected by backup failures.
 */
export async function syncBackup(env: BackupEnv): Promise<BackupSyncResult> {
  try {
    if (!(await env.isEnabled())) return { status: 'disabled' };
    const containerDir = await env.getContainerDir();
    if (!containerDir) return { status: 'unavailable' };
    const backupDir = backupDirPath(containerDir);

    const manifestRaw = await env.readBackupFile(`${backupDir}/${BACKUP_MANIFEST_NAME}`);
    const previous = parseManifest(manifestRaw, env.warn);
    const previousFiles = previous?.files ?? {};

    const catalogRaw = await env.readLocalCatalog();
    const localCatalog = catalogRaw ? parseCatalog(catalogRaw) : null;
    const localFiles = await env.listLocalDataFiles();
    const localByRel = new Map(localFiles.map((f) => [f.rel, f]));

    // Fresh-install guard: an empty local library must never overwrite a
    // backup that still holds notes. The restore flow resolves this state.
    const localIsEmpty =
      (localCatalog?.notes.length ?? 0) === 0 &&
      !localFiles.some((f) => f.rel.startsWith(BODIES_PREFIX));
    const backupHasNotes =
      (previous?.noteCount ?? 0) > 0 ||
      Object.keys(previousFiles).some((rel) => rel.startsWith(BODIES_PREFIX));
    if (localIsEmpty && backupHasNotes) {
      env.warn('[backupEngine] local library empty but backup has notes; sync skipped');
      return { status: 'skipped-empty-local' };
    }

    const tombstones = localCatalog?.deletedNoteIds ?? {};

    let copied = 0;
    let removed = 0;
    let failed = 0;
    const nextFiles: BackupManifest['files'] = {};

    for (const file of localFiles) {
      if (!isSafeRelPath(file.rel)) {
        env.warn(`[backupEngine] skipping unsafe local path ${file.rel}`);
        continue;
      }
      const prev = previousFiles[file.rel];
      if (prev && prev.size === file.size && prev.mtimeMs === file.mtimeMs) {
        nextFiles[file.rel] = prev;
        continue;
      }
      const ok = await env.copyLocalToBackup(file.rel, backupDir);
      if (ok) {
        nextFiles[file.rel] = { size: file.size, mtimeMs: file.mtimeMs };
        copied += 1;
      } else {
        failed += 1;
        env.warn(`[backupEngine] copy to backup failed for ${file.rel}`);
        // Keep the stale entry, if any, so the old mirrored version is not
        // deleted; the copy retries next sync because sizes/mtimes differ.
        if (prev) nextFiles[file.rel] = prev;
      }
    }

    for (const rel of Object.keys(previousFiles)) {
      if (localByRel.has(rel)) continue;
      // Deletions propagate ONLY for explicitly tombstoned notes. A file that
      // is merely missing locally (fresh install, partial restore, older
      // device) stays in the backup untouched.
      const noteId = noteIdForRel(rel);
      if (!noteId || !tombstones[noteId]) {
        nextFiles[rel] = previousFiles[rel];
        continue;
      }
      try {
        await env.deleteBackupFile(`${backupDir}/${rel}`);
        removed += 1;
      } catch (error) {
        failed += 1;
        env.warn(`[backupEngine] delete from backup failed for ${rel}`, error);
        nextFiles[rel] = previousFiles[rel];
      }
    }

    if (catalogRaw) {
      const ok = await env.writeBackupFileAtomic(
        `${backupDir}/${BACKUP_CATALOG_NAME}`,
        catalogRaw,
      );
      if (!ok) {
        failed += 1;
        env.warn('[backupEngine] catalog write to backup failed');
      }
    }

    const manifest: BackupManifest = {
      version: 1,
      files: nextFiles,
      lastBackupAt: env.now(),
      noteCount:
        localNoteCount(catalogRaw) ??
        localFiles.filter((f) => f.rel.startsWith(BODIES_PREFIX)).length,
    };
    const manifestOk = await env.writeBackupFileAtomic(
      `${backupDir}/${BACKUP_MANIFEST_NAME}`,
      JSON.stringify(manifest),
    );
    if (!manifestOk) {
      failed += 1;
      env.warn('[backupEngine] manifest write to backup failed');
    }

    if (failed > 0) return { status: 'partial', copied, removed, failed };
    return { status: 'ok', copied, removed };
  } catch (error) {
    env.warn('[backupEngine] sync failed unexpectedly', error);
    return { status: 'partial', copied: 0, removed: 0, failed: 1 };
  }
}

/**
 * A restore is offered only when the local library is empty (no catalog notes
 * AND no body files) and the backup holds at least one note. Restoring must
 * never overwrite existing local data.
 */
export async function checkRestoreAvailable(env: BackupEnv): Promise<RestoreAvailability | null> {
  try {
    if (!(await env.isEnabled())) return null;

    const localCount = localNoteCount(await env.readLocalCatalog());
    if (localCount !== null && localCount > 0) return null;
    const localFiles = await env.listLocalDataFiles();
    if (localFiles.some((f) => f.rel.startsWith(BODIES_PREFIX))) return null;

    const containerDir = await env.getContainerDir();
    if (!containerDir) return null;
    const backupDir = backupDirPath(containerDir);

    const manifest = parseManifest(
      await readBackupMeta(env, backupDir, BACKUP_MANIFEST_NAME),
      env.warn,
    );
    const backupCatalog = parseCatalog(
      (await readBackupMeta(env, backupDir, BACKUP_CATALOG_NAME)) ?? '',
    );

    const bodyCount =
      backupCatalog?.notes.length ??
      manifest?.noteCount ??
      (await env.listBackupDataFiles(backupDir)).filter((rel) =>
        rel.startsWith(BODIES_PREFIX),
      ).length;
    if (bodyCount === 0) return null;

    return {
      noteCount: bodyCount,
      lastBackupAt: manifest?.lastBackupAt ?? null,
    };
  } catch (error) {
    env.warn('[backupEngine] restore availability check failed', error);
    return null;
  }
}

/**
 * Merges the backup catalog into the local one. Backup metadata wins for
 * notes the local catalog is missing or only knows as recovery stubs; notes
 * the user created locally are kept untouched, as are local tombstones.
 * Returns the merged catalog, or null when nothing changes.
 */
export function mergeBackupCatalog(
  localRaw: string | null,
  backupRaw: string | null,
): Catalog | null {
  const backup = backupRaw ? parseCatalog(backupRaw) : null;
  if (!backup || (backup.notes.length === 0 && backup.folders.length === 0)) return null;
  const local = (localRaw ? parseCatalog(localRaw) : null) ?? {
    version: 1 as const,
    notes: [],
    folders: [],
    deletedNoteIds: {},
  };

  let changed = false;
  const localById = new Map(local.notes.map((n) => [n.id, n]));
  const backupById = new Map(backup.notes.map((n) => [n.id, n]));
  const notes = local.notes.map((note) => {
    const backupNote = backupById.get(note.id);
    if (backupNote && note.title === RECOVERED_NOTE_TITLE) {
      changed = true;
      return backupNote;
    }
    return note;
  });
  for (const backupNote of backup.notes) {
    if (!localById.has(backupNote.id) && !local.deletedNoteIds[backupNote.id]) {
      notes.push(backupNote);
      changed = true;
    }
  }

  const localFolderIds = new Set(local.folders.map((f) => f.id));
  const folders = [...local.folders];
  for (const backupFolder of backup.folders) {
    if (!localFolderIds.has(backupFolder.id)) {
      folders.push(backupFolder);
      changed = true;
    }
  }

  if (!changed) return null;
  return { version: 1, notes, folders, deletedNoteIds: local.deletedNoteIds };
}

/**
 * Copies every backup data file into the local Documents dir (skipping any
 * that already exist locally), then merges the backup catalog into the local
 * one. Files that fail to download or copy are counted, not fatal - the
 * restore is resumable: a later run copies only what is still missing.
 */
export async function restoreFromBackup(env: BackupEnv): Promise<RestoreResult> {
  try {
    const containerDir = await env.getContainerDir();
    if (!containerDir) return { status: 'unavailable' };
    const backupDir = backupDirPath(containerDir);

    const manifest = parseManifest(
      await readBackupMeta(env, backupDir, BACKUP_MANIFEST_NAME),
      env.warn,
    );
    const { rels } = await backupDataRels(env, backupDir, manifest);

    let restored = 0;
    let failed = 0;
    for (const rel of rels) {
      // Restores may only land inside the known data directories - never in
      // the Documents root (where the catalog and dev override live).
      if (!isSafeRelPath(rel) || noteIdForRel(rel) === null) {
        env.warn(`[backupEngine] skipping unsafe backup path ${rel}`);
        continue;
      }
      if (await env.localFileExists(rel)) continue;
      const abs = `${backupDir}/${rel}`;
      const downloaded = await env.ensureDownloaded(abs, ENSURE_DOWNLOAD_TIMEOUT_MS);
      if (!downloaded) {
        failed += 1;
        env.warn(`[backupEngine] backup file not downloadable: ${rel}`);
        continue;
      }
      const ok = await env.copyBackupToLocal(backupDir, rel);
      if (ok) restored += 1;
      else {
        failed += 1;
        env.warn(`[backupEngine] restore copy failed for ${rel}`);
      }
    }

    const backupCatalogRaw = await readBackupMeta(env, backupDir, BACKUP_CATALOG_NAME);
    const merged = mergeBackupCatalog(await env.readLocalCatalog(), backupCatalogRaw);
    if (merged) {
      const ok = await env.writeLocalCatalog(JSON.stringify(merged));
      if (!ok) {
        // Not counted as user-visible failure: reconciliation rebuilds the
        // catalog from the restored body files on next load.
        env.warn('[backupEngine] local catalog merge write failed; relying on reconciliation');
      }
    }

    if (failed > 0) return { status: 'partial', restored, failed };
    return { status: 'ok', restored };
  } catch (error) {
    env.warn('[backupEngine] restore failed unexpectedly', error);
    return { status: 'partial', restored: 0, failed: 1 };
  }
}

/**
 * Detects and completes an interrupted restore: backup data files that are
 * still missing locally for notes the local catalog knows about (the state a
 * partial restore leaves behind - titles present, content absent). Returns
 * null when there is nothing to resume. Never throws.
 */
export async function resumeRestoreIfIncomplete(env: BackupEnv): Promise<RestoreResult | null> {
  try {
    if (!(await env.isEnabled())) return null;
    const containerDir = await env.getContainerDir();
    if (!containerDir) return null;
    const backupDir = backupDirPath(containerDir);

    const localCatalog = parseCatalog((await env.readLocalCatalog()) ?? '');
    if (!localCatalog || localCatalog.notes.length === 0) return null;
    const localIds = new Set(localCatalog.notes.map((n) => n.id));

    const manifest = parseManifest(
      await readBackupMeta(env, backupDir, BACKUP_MANIFEST_NAME),
      env.warn,
    );
    const { listed } = await backupDataRels(env, backupDir, manifest);

    // Only files iCloud still claims to have count as pending - a rel that
    // exists solely in a stale manifest is gone, not downloadable, and must
    // not put the resume path into a retry-forever loop.
    let resumable = false;
    for (const rel of listed) {
      if (!isSafeRelPath(rel)) continue;
      const noteId = noteIdForRel(rel);
      if (!noteId || !localIds.has(noteId)) continue;
      if (!(await env.localFileExists(rel))) {
        resumable = true;
        break;
      }
    }

    // Also heal metadata-only damage: recovery stubs whose real titles are
    // still in the backup catalog (the race running the other way - bodies
    // synced first, catalog was cloud-only during the first restore).
    if (!resumable && localCatalog.notes.some((n) => n.title === RECOVERED_NOTE_TITLE)) {
      const backupCatalog = parseCatalog(
        (await readBackupMeta(env, backupDir, BACKUP_CATALOG_NAME)) ?? '',
      );
      if (backupCatalog) {
        const backupIds = new Set(backupCatalog.notes.map((n) => n.id));
        resumable = localCatalog.notes.some(
          (n) => n.title === RECOVERED_NOTE_TITLE && backupIds.has(n.id),
        );
      }
    }

    if (!resumable) return null;
    env.warn('[backupEngine] resuming incomplete restore');
    return await restoreFromBackup(env);
  } catch (error) {
    env.warn('[backupEngine] resume check failed', error);
    return null;
  }
}
