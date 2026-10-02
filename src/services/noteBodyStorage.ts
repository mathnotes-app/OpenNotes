import * as FileSystem from 'expo-file-system/legacy';
import type { SerializedNotebookData } from '@mathnotes/mobile-ink';
import { writeStringAtomic } from './atomicFile';
import { withCurrentImagePaths } from '../utils/appDocumentUri';

const BODIES_SUBDIR = 'notebook-bodies/';
const BODY_EXTENSION = '.body';

function bodiesDir(): string {
  return `${FileSystem.documentDirectory ?? ''}${BODIES_SUBDIR}`;
}

function bodyPath(id: string): string {
  return `${bodiesDir()}${encodeURIComponent(id)}${BODY_EXTENSION}`;
}

let dirReady: Promise<void> | null = null;
async function ensureDir(): Promise<void> {
  if (!dirReady) {
    dirReady = (async () => {
      const dir = bodiesDir();
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    })().catch((error) => {
      dirReady = null;
      throw error;
    });
  }
  return dirReady;
}

export type BodyReadResult =
  | { kind: 'ok'; data: SerializedNotebookData }
  /** No body file exists for this note (a note that was never drawn in). */
  | { kind: 'missing' }
  /**
   * A body file exists but could not be read or parsed. Callers must NOT
   * treat this as an empty note: writing an empty body over the file would
   * destroy content that may be recoverable.
   */
  | { kind: 'unreadable' };

export async function readBody(id: string): Promise<BodyReadResult> {
  const path = bodyPath(id);
  let exists: boolean;
  try {
    const info = await FileSystem.getInfoAsync(path);
    exists = info.exists;
  } catch (error) {
    if (__DEV__) console.warn('[noteBodyStorage] readBody stat failed', id, error);
    return { kind: 'unreadable' };
  }
  if (!exists) return { kind: 'missing' };
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    if (!raw) return { kind: 'unreadable' };
    const data = JSON.parse(raw) as SerializedNotebookData;
    return { kind: 'ok', data: withCurrentImagePaths(data, FileSystem.documentDirectory ?? '') };
  } catch (error) {
    if (__DEV__) console.warn('[noteBodyStorage] readBody failed', id, error);
    return { kind: 'unreadable' };
  }
}

export async function writeBody(id: string, data: SerializedNotebookData): Promise<boolean> {
  const json = JSON.stringify(data);
  if (!json) return false;
  try {
    await ensureDir();
    return await writeStringAtomic(bodyPath(id), json);
  } catch (error) {
    if (__DEV__) console.warn(`[noteBodyStorage] write failed for ${id}`, error);
    return false;
  }
}

export async function deleteBody(id: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(bodyPath(id), { idempotent: true });
  } catch (error) {
    if (__DEV__) console.log('[noteBodyStorage] delete failed', id, error);
  }
}

/**
 * Lists the ids of every note body file on disk. Used to recover notes whose
 * catalog and key-value records were lost. Returns [] when the directory does
 * not exist. A single directory read; no per-file stats.
 */
export async function listBodyIds(): Promise<string[]> {
  const dir = bodiesDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) return [];
  const names = await FileSystem.readDirectoryAsync(dir);
  const out: string[] = [];
  for (const name of names) {
    if (!name.endsWith(BODY_EXTENSION)) continue;
    const id = decodeURIComponent(name.slice(0, -BODY_EXTENSION.length));
    if (id) out.push(id);
  }
  return out;
}

/** Last-modified time of a note's body file, or null if unavailable. */
export async function bodyModifiedAt(id: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(bodyPath(id));
    if (info.exists && typeof info.modificationTime === 'number') {
      return new Date(info.modificationTime * 1000).toISOString();
    }
  } catch {
    // Timestamp is best-effort; recovery proceeds without it.
  }
  return null;
}

/** The ink engine's empty single-page document. */
export function createEmptyNotebookData(): SerializedNotebookData {
  return {
    version: '1.0',
    pages: [
      {
        id: 'page-1',
        title: 'Page 1',
        data: '{"pages":{}}',
        rotation: 0,
      },
    ],
  };
}
