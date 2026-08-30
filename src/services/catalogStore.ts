// Only type-only imports and the pure promiseQueue util here: this module must
// load under plain `node --test` with fake adapters, so it cannot depend on
// React Native or Expo modules. The explicit .ts extension is what lets Node
// resolve the import when running the test suite.
import type { BackgroundType, FolderMetadata, NoteMetadata } from '../types/note';
import { createPromiseQueue } from '../utils/promiseQueue.ts';

// Record<BackgroundType, true> forces a compile error if BackgroundType ever
// gains or loses a member without this map being updated.
const BACKGROUND_TYPE_FLAGS: Record<BackgroundType, true> = {
  plain: true,
  grid: true,
  lined: true,
  dotted: true,
  graph: true,
  pdf: true,
};

/**
 * Durable catalog of all notes and folders.
 *
 * The catalog is the single source of truth for which notes/folders exist and
 * their metadata. It is persisted as one JSON file on disk with an atomic
 * verified write (the same pattern note bodies use), and mirrored into the
 * key-value store (AsyncStorage) for redundancy. On load it reconciles against
 * the note body files on disk, so even if both the catalog file and the
 * key-value store are lost or corrupted, every note body still on disk is
 * recovered into the library instead of silently disappearing.
 */

export interface Catalog {
  version: 1;
  notes: NoteMetadata[];
  folders: FolderMetadata[];
  /**
   * Tombstones: note ids the user deliberately deleted, with deletion time.
   * Backup sync propagates deletions ONLY for tombstoned ids - a file merely
   * missing locally (fresh install, partial restore) must never delete its
   * backup copy. Pruned after TOMBSTONE_TTL_MS.
   */
  deletedNoteIds: Record<string, string>;
}

export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Removes tombstones old enough that every backup has long since synced. */
export function pruneTombstones(
  tombstones: Record<string, string>,
  nowIso: string,
): Record<string, string> {
  const cutoff = Date.parse(nowIso) - TOMBSTONE_TTL_MS;
  const out: Record<string, string> = {};
  for (const [id, deletedAt] of Object.entries(tombstones)) {
    const t = Date.parse(deletedAt);
    if (!Number.isNaN(t) && t >= cutoff) out[id] = deletedAt;
  }
  return out;
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
}

export interface CatalogEnv {
  kv: KeyValueStore;
  /** Returns file contents, or null if the file does not exist. Throws on read errors. */
  readCatalogFile(): Promise<string | null>;
  /** Atomic verified write. Returns false if the write could not be completed. */
  writeCatalogFile(json: string): Promise<boolean>;
  /** Moves a corrupt catalog file aside so it is preserved for diagnostics. */
  preserveCorruptCatalogFile(): Promise<void>;
  /** Ids of every note body file on disk (a single directory read). */
  listBodyIds(): Promise<string[]>;
  /** Last-modified time of a note's body file, or null if unavailable. */
  bodyModifiedAt(id: string): Promise<string | null>;
  /** First-page preview URI from a body file, or null if unavailable. */
  readBodyPreview(id: string): Promise<string | null>;
  pdfExistsForNote(id: string): Promise<boolean>;
  /** Deterministic URI where pdfStorage keeps a note's background PDF. */
  pdfUriForNote(id: string): string;
  now(): string;
  warn(message: string, error?: unknown): void;
}

/** Filename of the durable catalog inside the app Documents directory. */
export const CATALOG_FILENAME = 'notes-catalog.json';

export const NOTES_INDEX_KEY = '@opennotes:notes:index';
export const NOTE_KEY_PREFIX = '@opennotes:note:';
export const FOLDERS_INDEX_KEY = '@opennotes:folders:index';
export const FOLDER_KEY_PREFIX = '@opennotes:folder:';

const LEGACY_NAMESPACE = '@simple' + 'notes:';
const LEGACY_NOTES_INDEX_KEY = `${LEGACY_NAMESPACE}notes:index`;
const LEGACY_NOTE_KEY_PREFIX = `${LEGACY_NAMESPACE}note:`;
const LEGACY_FOLDERS_INDEX_KEY = `${LEGACY_NAMESPACE}folders:index`;
const LEGACY_FOLDER_KEY_PREFIX = `${LEGACY_NAMESPACE}folder:`;

export const RECOVERED_NOTE_TITLE = 'Recovered note';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeNote(value: unknown): NoteMetadata | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.id)) return null;
  const backgroundType =
    typeof v.backgroundType === 'string' && v.backgroundType in BACKGROUND_TYPE_FLAGS
      ? (v.backgroundType as BackgroundType)
      : 'plain';
  return {
    id: v.id,
    title: typeof v.title === 'string' && v.title.trim() ? v.title : 'Untitled',
    folderId: isNonEmptyString(v.folderId) ? v.folderId : null,
    createdAt: isNonEmptyString(v.createdAt) ? v.createdAt : new Date(0).toISOString(),
    updatedAt: isNonEmptyString(v.updatedAt) ? v.updatedAt : new Date(0).toISOString(),
    backgroundType,
    pdfUri: isNonEmptyString(v.pdfUri) ? v.pdfUri : null,
    thumbnailUri: isNonEmptyString(v.thumbnailUri) ? v.thumbnailUri : null,
  };
}

function normalizeFolder(value: unknown): FolderMetadata | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.id)) return null;
  return {
    id: v.id,
    name: typeof v.name === 'string' && v.name.trim() ? v.name : 'Folder',
    createdAt: isNonEmptyString(v.createdAt) ? v.createdAt : new Date(0).toISOString(),
    updatedAt: isNonEmptyString(v.updatedAt) ? v.updatedAt : new Date(0).toISOString(),
  };
}

/** Parses and validates a serialized catalog. Returns null if it is not usable. */
export function parseCatalog(raw: string): Catalog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const v = parsed as Record<string, unknown>;
  if (!Array.isArray(v.notes) || !Array.isArray(v.folders)) return null;
  const notes: NoteMetadata[] = [];
  const seenNotes = new Set<string>();
  for (const entry of v.notes) {
    const note = normalizeNote(entry);
    if (note && !seenNotes.has(note.id)) {
      seenNotes.add(note.id);
      notes.push(note);
    }
  }
  const folders: FolderMetadata[] = [];
  const seenFolders = new Set<string>();
  for (const entry of v.folders) {
    const folder = normalizeFolder(entry);
    if (folder && !seenFolders.has(folder.id)) {
      seenFolders.add(folder.id);
      folders.push(folder);
    }
  }
  const deletedNoteIds: Record<string, string> = {};
  if (typeof v.deletedNoteIds === 'object' && v.deletedNoteIds !== null) {
    for (const [id, deletedAt] of Object.entries(v.deletedNoteIds as Record<string, unknown>)) {
      if (isNonEmptyString(id) && isNonEmptyString(deletedAt)) {
        deletedNoteIds[id] = deletedAt;
      }
    }
  }
  return { version: 1, notes, folders, deletedNoteIds };
}

function parseIndex(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

interface KvNamespace {
  indexKey: string;
  entryPrefix: string;
}

/**
 * Rebuilds one entity list (notes or folders) from the key-value mirror.
 *
 * The stored index is only a hint for ordering: the authoritative id set comes
 * from scanning all keys by prefix, so a corrupted or lost index cannot hide
 * entries whose individual records survived.
 */
async function rebuildFromKv<T extends { id: string; updatedAt: string }>(
  kv: KeyValueStore,
  namespaces: KvNamespace[],
  normalize: (value: unknown) => T | null,
  warn: (message: string, error?: unknown) => void,
): Promise<T[]> {
  let allKeys: readonly string[] = [];
  try {
    allKeys = await kv.getAllKeys();
  } catch (error) {
    warn('[catalogStore] kv.getAllKeys failed during rebuild', error);
  }

  const indexOrder: string[] = [];
  const indexOrderSet = new Set<string>();
  for (const ns of namespaces) {
    let raw: string | null = null;
    try {
      raw = await kv.getItem(ns.indexKey);
    } catch (error) {
      warn(`[catalogStore] kv read failed for ${ns.indexKey}`, error);
    }
    for (const id of parseIndex(raw)) {
      if (!indexOrderSet.has(id)) {
        indexOrderSet.add(id);
        indexOrder.push(id);
      }
    }
  }

  const keysToRead = new Map<string, string>();
  for (const ns of namespaces) {
    for (const id of indexOrder) {
      const key = `${ns.entryPrefix}${id}`;
      if (!keysToRead.has(key)) keysToRead.set(key, id);
    }
    for (const key of allKeys) {
      if (key.startsWith(ns.entryPrefix) && !keysToRead.has(key)) {
        keysToRead.set(key, key.slice(ns.entryPrefix.length));
      }
    }
  }
  if (keysToRead.size === 0) return [];

  let entries: readonly (readonly [string, string | null])[] = [];
  try {
    entries = await kv.multiGet([...keysToRead.keys()]);
  } catch (error) {
    warn('[catalogStore] kv.multiGet failed during rebuild', error);
    return [];
  }

  const byId = new Map<string, T>();
  for (const [key, raw] of entries) {
    if (!raw) continue;
    const id = keysToRead.get(key);
    if (!id || byId.has(id)) continue;
    try {
      const normalized = normalize(JSON.parse(raw));
      if (normalized && normalized.id === id) byId.set(id, normalized);
    } catch {
      warn(`[catalogStore] skipping corrupt kv entry ${key}`);
    }
  }

  const ordered: T[] = [];
  for (const id of indexOrder) {
    const entry = byId.get(id);
    if (entry) {
      ordered.push(entry);
      byId.delete(id);
    }
  }
  const extras = [...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return [...ordered, ...extras];
}

/**
 * Reconciles a catalog against the body files on disk. Returns the reconciled
 * catalog and whether anything changed.
 *
 * - Any body file without a catalog entry becomes a recovered note.
 * - Any note pointing at a folder that no longer exists is moved to the root
 *   so it stays visible in the library.
 */
async function reconcileCatalog(
  env: CatalogEnv,
  catalog: Catalog,
): Promise<{ catalog: Catalog; changed: boolean }> {
  let changed = false;

  let bodyIds: string[] = [];
  try {
    bodyIds = await env.listBodyIds();
  } catch (error) {
    env.warn('[catalogStore] listing body files failed; skipping recovery scan', error);
  }

  const knownNoteIds = new Set(catalog.notes.map((n) => n.id));
  const orphanIds = bodyIds.filter((id) => !knownNoteIds.has(id));
  // In the normal case orphanIds is empty and no per-note I/O happens at all;
  // when there is something to recover, the notes recover in parallel.
  const recovered = await Promise.all(orphanIds.map((id) => recoverNote(env, id)));
  if (recovered.length > 0) changed = true;

  // A recovered note whose id was tombstoned gets its tombstone dropped:
  // the body file's presence wins over a recorded deletion (bias toward
  // resurrecting data, never toward losing it).
  let deletedNoteIds = catalog.deletedNoteIds;
  const resurrected = recovered.filter((n) => deletedNoteIds[n.id]);
  if (resurrected.length > 0) {
    deletedNoteIds = { ...deletedNoteIds };
    for (const note of resurrected) delete deletedNoteIds[note.id];
    changed = true;
  }

  const folderIds = new Set(catalog.folders.map((f) => f.id));
  const notes = [...catalog.notes, ...recovered].map((note) => {
    if (note.folderId !== null && !folderIds.has(note.folderId)) {
      changed = true;
      return { ...note, folderId: null };
    }
    return note;
  });

  return {
    catalog: changed
      ? { version: 1, notes, folders: catalog.folders, deletedNoteIds }
      : catalog,
    changed,
  };
}

async function recoverNote(env: CatalogEnv, id: string): Promise<NoteMetadata> {
  // Prefer the key-value mirror record when one survived: it carries the real
  // title, folder, and background instead of a recovery stub.
  const mirrored = await recoverNoteFromKv(env, id);
  if (mirrored) return mirrored;

  let modifiedAt: string | null = null;
  try {
    modifiedAt = await env.bodyModifiedAt(id);
  } catch (error) {
    env.warn(`[catalogStore] stat failed for recovered note ${id}`, error);
  }
  const timestamp = modifiedAt ?? env.now();
  let thumbnailUri: string | null = null;
  try {
    thumbnailUri = await env.readBodyPreview(id);
  } catch (error) {
    env.warn(`[catalogStore] preview read failed for recovered note ${id}`, error);
  }
  let hasPdf = false;
  try {
    hasPdf = await env.pdfExistsForNote(id);
  } catch (error) {
    env.warn(`[catalogStore] pdf check failed for recovered note ${id}`, error);
  }
  return {
    id,
    title: RECOVERED_NOTE_TITLE,
    folderId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    backgroundType: hasPdf ? 'pdf' : 'plain',
    pdfUri: hasPdf ? env.pdfUriForNote(id) : null,
    thumbnailUri,
  };
}

async function recoverNoteFromKv(env: CatalogEnv, id: string): Promise<NoteMetadata | null> {
  for (const key of [`${NOTE_KEY_PREFIX}${id}`, `${LEGACY_NOTE_KEY_PREFIX}${id}`]) {
    let raw: string | null = null;
    try {
      raw = await env.kv.getItem(key);
    } catch (error) {
      env.warn(`[catalogStore] kv read failed for ${key}`, error);
    }
    if (!raw) continue;
    try {
      const note = normalizeNote(JSON.parse(raw));
      if (note && note.id === id) return note;
    } catch {
      env.warn(`[catalogStore] skipping corrupt kv entry ${key}`);
    }
  }
  return null;
}

export interface CatalogStore {
  getCatalog(): Promise<Catalog>;
  /**
   * Applies a serialized mutation. Return null from the mutator to indicate no
   * change (nothing is persisted). Mutators must not modify the input catalog.
   */
  mutate(fn: (catalog: Catalog) => Catalog | null): Promise<Catalog>;
  /**
   * Drops the in-memory cache so the next read reloads (and reconciles) from
   * disk. Used after a restore writes files behind the store's back.
   */
  invalidate(): Promise<void>;
}

export function createCatalogStore(env: CatalogEnv): CatalogStore {
  const queue = createPromiseQueue();
  let cached: Catalog | null = null;

  async function loadLocked(): Promise<Catalog> {
    if (cached) return cached;

    let catalog: Catalog | null = null;
    let needsPersist = false;

    let raw: string | null = null;
    let readFailed = false;
    try {
      raw = await env.readCatalogFile();
    } catch (error) {
      readFailed = true;
      env.warn('[catalogStore] catalog file read failed; rebuilding from mirror', error);
    }
    if (raw !== null) {
      catalog = parseCatalog(raw);
      if (!catalog) {
        env.warn('[catalogStore] catalog file corrupt; preserving and rebuilding');
        try {
          await env.preserveCorruptCatalogFile();
        } catch (error) {
          env.warn('[catalogStore] failed to preserve corrupt catalog file', error);
        }
        needsPersist = true;
      }
    } else if (!readFailed) {
      needsPersist = true;
    }

    if (!catalog) {
      const [notes, folders] = await Promise.all([
        rebuildFromKv(
          env.kv,
          [
            { indexKey: NOTES_INDEX_KEY, entryPrefix: NOTE_KEY_PREFIX },
            { indexKey: LEGACY_NOTES_INDEX_KEY, entryPrefix: LEGACY_NOTE_KEY_PREFIX },
          ],
          normalizeNote,
          env.warn,
        ),
        rebuildFromKv(
          env.kv,
          [
            { indexKey: FOLDERS_INDEX_KEY, entryPrefix: FOLDER_KEY_PREFIX },
            { indexKey: LEGACY_FOLDERS_INDEX_KEY, entryPrefix: LEGACY_FOLDER_KEY_PREFIX },
          ],
          normalizeFolder,
          env.warn,
        ),
      ]);
      catalog = { version: 1, notes, folders, deletedNoteIds: {} };
    }

    const reconciled = await reconcileCatalog(env, catalog);
    catalog = reconciled.catalog;
    if (reconciled.changed || needsPersist) {
      await persist(catalog, null);
    }
    cached = catalog;
    return catalog;
  }

  async function persist(next: Catalog, prev: Catalog | null): Promise<void> {
    try {
      const ok = await env.writeCatalogFile(JSON.stringify(next));
      if (!ok) env.warn('[catalogStore] catalog file write did not complete');
    } catch (error) {
      env.warn('[catalogStore] catalog file write failed', error);
    }

    // Mirror into the key-value store so the catalog survives loss of either
    // store independently. Removals must be mirrored too, otherwise deleted
    // entries would be resurrected by a later rebuild. Mutations are
    // immutable, so an entry with the same object identity as before is
    // unchanged and can be skipped — a typical autosave mirrors one note, not
    // the whole library.
    try {
      const prevNotes = new Map(prev?.notes.map((n) => [n.id, n]) ?? []);
      const prevFolders = new Map(prev?.folders.map((f) => [f.id, f]) ?? []);
      const pairs: [string, string][] = [
        [NOTES_INDEX_KEY, JSON.stringify(next.notes.map((n) => n.id))],
        [FOLDERS_INDEX_KEY, JSON.stringify(next.folders.map((f) => f.id))],
        ...next.notes
          .filter((n) => prevNotes.get(n.id) !== n)
          .map((n): [string, string] => [`${NOTE_KEY_PREFIX}${n.id}`, JSON.stringify(n)]),
        ...next.folders
          .filter((f) => prevFolders.get(f.id) !== f)
          .map((f): [string, string] => [`${FOLDER_KEY_PREFIX}${f.id}`, JSON.stringify(f)]),
      ];
      await env.kv.multiSet(pairs);

      if (prev) {
        const nextNoteIds = new Set(next.notes.map((n) => n.id));
        const nextFolderIds = new Set(next.folders.map((f) => f.id));
        const staleKeys: string[] = [];
        for (const note of prev.notes) {
          if (!nextNoteIds.has(note.id)) {
            staleKeys.push(`${NOTE_KEY_PREFIX}${note.id}`, `${LEGACY_NOTE_KEY_PREFIX}${note.id}`);
          }
        }
        for (const folder of prev.folders) {
          if (!nextFolderIds.has(folder.id)) {
            staleKeys.push(
              `${FOLDER_KEY_PREFIX}${folder.id}`,
              `${LEGACY_FOLDER_KEY_PREFIX}${folder.id}`,
            );
          }
        }
        if (staleKeys.length > 0) await env.kv.multiRemove(staleKeys);
      }
    } catch (error) {
      env.warn('[catalogStore] kv mirror write failed', error);
    }
  }

  return {
    getCatalog(): Promise<Catalog> {
      return queue.enqueue(loadLocked);
    },
    invalidate(): Promise<void> {
      return queue.enqueue(async () => {
        cached = null;
      });
    },
    mutate(fn: (catalog: Catalog) => Catalog | null): Promise<Catalog> {
      return queue.enqueue(async () => {
        const current = await loadLocked();
        const next = fn(current);
        if (next === null) return current;
        await persist(next, current);
        cached = next;
        return next;
      });
    },
  };
}
