import * as FileSystem from 'expo-file-system/legacy';
import type { SerializedNotebookData } from '@mathnotes/mobile-ink';

const BODIES_SUBDIR = 'notebook-bodies/';

function bodiesDir(): string {
  return `${FileSystem.documentDirectory ?? ''}${BODIES_SUBDIR}`;
}

function bodyPath(id: string): string {
  return `${bodiesDir()}${encodeURIComponent(id)}.body`;
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

export async function readBody(id: string): Promise<SerializedNotebookData | null> {
  try {
    const path = bodyPath(id);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    if (!raw) return null;
    return JSON.parse(raw) as SerializedNotebookData;
  } catch (error) {
    if (__DEV__) console.log('[noteBodyStorage] readBody miss', id, error);
    return null;
  }
}

export async function writeBody(id: string, data: SerializedNotebookData): Promise<boolean> {
  const json = JSON.stringify(data);
  if (!json) return false;
  try {
    await ensureDir();
    const path = bodyPath(id);
    const tmp = `${path}.tmp`;

    await FileSystem.deleteAsync(tmp, { idempotent: true });
    await FileSystem.writeAsStringAsync(tmp, json);

    const info = await FileSystem.getInfoAsync(tmp);
    if (!info.exists || typeof info.size !== 'number' || info.size < json.length) {
      await FileSystem.deleteAsync(tmp, { idempotent: true });
      if (__DEV__) {
        console.warn(
          `[noteBodyStorage] verify failed for ${id}: expected ${json.length}, got ${info.exists ? info.size : 'missing'}`,
        );
      }
      return false;
    }

    await FileSystem.moveAsync({ from: tmp, to: path });
    return true;
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
