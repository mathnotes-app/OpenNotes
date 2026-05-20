import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FolderMetadata } from '../types/note';
import { folderId as makeFolderId } from '../utils/id';
import {
  deleteAllNotesInFolder,
  orphanNotesInFolder,
  listAllMetadata,
} from './notesRepo';

const INDEX_KEY = '@simplenotes:folders:index';
const FOLDER_PREFIX = '@simplenotes:folder:';

function folderKey(id: string): string {
  return `${FOLDER_PREFIX}${id}`;
}

async function readIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

async function bumpInIndex(id: string): Promise<void> {
  const ids = await readIndex();
  const filtered = ids.filter((x) => x !== id);
  filtered.unshift(id);
  await writeIndex(filtered);
}

async function removeFromIndex(id: string): Promise<void> {
  const ids = await readIndex();
  const filtered = ids.filter((x) => x !== id);
  await writeIndex(filtered);
}

export async function listFolders(): Promise<FolderMetadata[]> {
  const ids = await readIndex();
  if (ids.length === 0) return [];
  const entries = await AsyncStorage.multiGet(ids.map(folderKey));
  const out: FolderMetadata[] = [];
  for (const [, raw] of entries) {
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as FolderMetadata);
    } catch {
      // skip corrupt
    }
  }
  return out;
}

export async function getFolder(id: string): Promise<FolderMetadata | null> {
  const raw = await AsyncStorage.getItem(folderKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FolderMetadata;
  } catch {
    return null;
  }
}

export async function createFolder(name: string): Promise<FolderMetadata> {
  const now = new Date().toISOString();
  const meta: FolderMetadata = {
    id: makeFolderId(),
    name: name.trim() || 'New Folder',
    createdAt: now,
    updatedAt: now,
  };
  await AsyncStorage.setItem(folderKey(meta.id), JSON.stringify(meta));
  await bumpInIndex(meta.id);
  return meta;
}

export async function renameFolder(id: string, name: string): Promise<FolderMetadata | null> {
  const current = await getFolder(id);
  if (!current) return null;
  const next: FolderMetadata = {
    ...current,
    name: name.trim() || current.name,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(folderKey(id), JSON.stringify(next));
  await bumpInIndex(id);
  return next;
}

export type FolderDeleteMode = 'orphan-notes' | 'delete-notes';

export async function deleteFolder(id: string, mode: FolderDeleteMode): Promise<void> {
  if (mode === 'delete-notes') {
    await deleteAllNotesInFolder(id);
  } else {
    await orphanNotesInFolder(id);
  }
  await Promise.all([
    AsyncStorage.removeItem(folderKey(id)),
    removeFromIndex(id),
  ]);
}

export async function noteCountInFolder(id: string): Promise<number> {
  const all = await listAllMetadata();
  return all.filter((n) => n.folderId === id).length;
}
