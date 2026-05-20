import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SerializedNotebookData } from '@mathnotes/mobile-ink';
import type { BackgroundType, NoteMetadata } from '../types/note';
import { noteId as makeNoteId } from '../utils/id';
import { deleteBody, readBody, writeBody } from './noteBodyStorage';
import { deletePdfForNote } from './pdfStorage';
import { deleteImagesForNote } from './imageInsertStorage';

const INDEX_KEY = '@opennotes:notes:index';
const NOTE_PREFIX = '@opennotes:note:';
const LEGACY_NAMESPACE = '@simple' + 'notes:';
const LEGACY_INDEX_KEY = `${LEGACY_NAMESPACE}notes:index`;
const LEGACY_NOTE_PREFIX = `${LEGACY_NAMESPACE}note:`;

function noteKey(id: string): string {
  return `${NOTE_PREFIX}${id}`;
}

function legacyNoteKey(id: string): string {
  return `${LEGACY_NOTE_PREFIX}${id}`;
}

async function readIndex(): Promise<string[]> {
  let raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) {
    raw = await AsyncStorage.getItem(LEGACY_INDEX_KEY);
    if (raw) await AsyncStorage.setItem(INDEX_KEY, raw);
  }
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

export async function listAllMetadata(): Promise<NoteMetadata[]> {
  const ids = await readIndex();
  if (ids.length === 0) return [];
  const entries = await AsyncStorage.multiGet(ids.map(noteKey));
  const out: NoteMetadata[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const id = ids[i];
    let raw = entries[i]?.[1] ?? null;
    if (!raw) {
      raw = await AsyncStorage.getItem(legacyNoteKey(id));
      if (raw) await AsyncStorage.setItem(noteKey(id), raw);
    }
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as NoteMetadata);
    } catch {
      // skip corrupt entry
    }
  }
  return out;
}

export async function listNotes(folderId: string | null): Promise<NoteMetadata[]> {
  const all = await listAllMetadata();
  return all.filter((n) => (n.folderId ?? null) === folderId);
}

export async function getNote(id: string): Promise<NoteMetadata | null> {
  let raw = await AsyncStorage.getItem(noteKey(id));
  if (!raw) {
    raw = await AsyncStorage.getItem(legacyNoteKey(id));
    if (raw) await AsyncStorage.setItem(noteKey(id), raw);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NoteMetadata;
  } catch {
    return null;
  }
}

export async function createNote(opts: {
  folderId?: string | null;
  title?: string;
  backgroundType?: BackgroundType;
} = {}): Promise<NoteMetadata> {
  const now = new Date().toISOString();
  const meta: NoteMetadata = {
    id: makeNoteId(),
    title: opts.title ?? 'Untitled',
    folderId: opts.folderId ?? null,
    createdAt: now,
    updatedAt: now,
    backgroundType: opts.backgroundType ?? 'plain',
    pdfUri: null,
    thumbnailUri: null,
  };
  await AsyncStorage.setItem(noteKey(meta.id), JSON.stringify(meta));
  await bumpInIndex(meta.id);
  return meta;
}

export async function updateMetadata(
  id: string,
  patch: Partial<Omit<NoteMetadata, 'id' | 'createdAt'>>,
): Promise<NoteMetadata | null> {
  const current = await getNote(id);
  if (!current) return null;
  const next: NoteMetadata = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
  await AsyncStorage.setItem(noteKey(id), JSON.stringify(next));
  await bumpInIndex(id);
  return next;
}

export async function readNoteBody(id: string): Promise<SerializedNotebookData | null> {
  return readBody(id);
}

export async function saveNoteBody(
  id: string,
  data: SerializedNotebookData,
): Promise<{ ok: boolean; metadata: NoteMetadata | null }> {
  const ok = await writeBody(id, data);
  const previewUri = data.pages[0]?.previewUri ?? null;
  const meta = await updateMetadata(id, {
    thumbnailUri: previewUri,
    updatedAt: new Date().toISOString(),
  });
  return { ok, metadata: meta };
}

export async function moveNote(id: string, folderId: string | null): Promise<NoteMetadata | null> {
  return updateMetadata(id, { folderId });
}

export async function renameNote(id: string, title: string): Promise<NoteMetadata | null> {
  return updateMetadata(id, { title: title.trim() || 'Untitled' });
}

export async function setNoteBackground(
  id: string,
  backgroundType: BackgroundType,
  pdfUri: string | null,
): Promise<NoteMetadata | null> {
  return updateMetadata(id, { backgroundType, pdfUri });
}

export async function deleteNote(id: string): Promise<void> {
  await Promise.all([
    deleteBody(id),
    deletePdfForNote(id),
    deleteImagesForNote(id),
    AsyncStorage.removeItem(noteKey(id)),
    AsyncStorage.removeItem(legacyNoteKey(id)),
    removeFromIndex(id),
  ]);
}

export async function deleteAllNotesInFolder(folderId: string): Promise<void> {
  const all = await listAllMetadata();
  const targets = all.filter((n) => n.folderId === folderId);
  await Promise.all(targets.map((n) => deleteNote(n.id)));
}

export async function orphanNotesInFolder(folderId: string): Promise<void> {
  const all = await listAllMetadata();
  const targets = all.filter((n) => n.folderId === folderId);
  await Promise.all(targets.map((n) => moveNote(n.id, null)));
}
