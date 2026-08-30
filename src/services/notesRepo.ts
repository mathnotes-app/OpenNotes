import type { SerializedNotebookData } from '@mathnotes/mobile-ink';
import type { BackgroundType, NoteMetadata } from '../types/note';
import { noteId as makeNoteId } from '../utils/id';
import { t } from '../i18n';
import { catalogStore } from './catalogEnv';
import { pruneTombstones } from './catalogStore';
import { deleteBody, readBody, writeBody, type BodyReadResult } from './noteBodyStorage';
import { deletePdfForNote } from './pdfStorage';
import { deleteImagesForNote } from './imageInsertStorage';

export async function listAllMetadata(): Promise<NoteMetadata[]> {
  const catalog = await catalogStore.getCatalog();
  return catalog.notes;
}

export async function listNotes(folderId: string | null): Promise<NoteMetadata[]> {
  const all = await listAllMetadata();
  return all.filter((n) => (n.folderId ?? null) === folderId);
}

export async function getNote(id: string): Promise<NoteMetadata | null> {
  const catalog = await catalogStore.getCatalog();
  return catalog.notes.find((n) => n.id === id) ?? null;
}

export async function createNote(opts: {
  folderId?: string | null;
  title?: string;
  backgroundType?: BackgroundType;
} = {}): Promise<NoteMetadata> {
  const now = new Date().toISOString();
  const meta: NoteMetadata = {
    id: makeNoteId(),
    title: opts.title ?? t.common.untitled,
    folderId: opts.folderId ?? null,
    createdAt: now,
    updatedAt: now,
    backgroundType: opts.backgroundType ?? 'plain',
    pdfUri: null,
    thumbnailUri: null,
  };
  await catalogStore.mutate((catalog) => ({
    ...catalog,
    notes: [meta, ...catalog.notes.filter((n) => n.id !== meta.id)],
  }));
  return meta;
}

export async function updateMetadata(
  id: string,
  patch: Partial<Omit<NoteMetadata, 'id' | 'createdAt'>>,
): Promise<NoteMetadata | null> {
  const next = await catalogStore.mutate((catalog) => {
    const current = catalog.notes.find((n) => n.id === id);
    if (!current) return null;
    const updated: NoteMetadata = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    return {
      ...catalog,
      notes: [updated, ...catalog.notes.filter((n) => n.id !== id)],
    };
  });
  // When the note was missing the mutator returned null, the catalog is
  // unchanged, and this find comes back empty.
  return next.notes.find((n) => n.id === id) ?? null;
}

export async function readNoteBody(id: string): Promise<BodyReadResult> {
  return readBody(id);
}

export async function saveNoteBody(
  id: string,
  data: SerializedNotebookData,
): Promise<{ ok: boolean; metadata: NoteMetadata | null }> {
  const ok = await writeBody(id, data);
  if (!ok) {
    // The body did not reach disk; leave the metadata (updatedAt, thumbnail)
    // pointing at the last version that actually persisted.
    return { ok: false, metadata: null };
  }
  const previewUri = data.pages[0]?.previewUri ?? null;
  const meta = await updateMetadata(id, {
    thumbnailUri: previewUri,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, metadata: meta };
}

export async function moveNote(id: string, folderId: string | null): Promise<NoteMetadata | null> {
  return updateMetadata(id, { folderId });
}

export async function renameNote(id: string, title: string): Promise<NoteMetadata | null> {
  return updateMetadata(id, { title: title.trim() || t.common.untitled });
}

export async function setNoteBackground(
  id: string,
  backgroundType: BackgroundType,
  pdfUri: string | null,
): Promise<NoteMetadata | null> {
  return updateMetadata(id, { backgroundType, pdfUri });
}

async function deleteNoteFiles(id: string): Promise<void> {
  await Promise.all([deleteBody(id), deletePdfForNote(id), deleteImagesForNote(id)]);
}

export async function deleteNote(id: string): Promise<void> {
  // Remove the catalog entry first so the note disappears from the library
  // even if a file delete fails; the body delete prevents the recovery scan
  // from resurrecting it. The tombstone is what allows backup sync to delete
  // the mirrored copy - files merely missing locally are never propagated.
  const now = new Date().toISOString();
  await catalogStore.mutate((catalog) => ({
    ...catalog,
    notes: catalog.notes.filter((n) => n.id !== id),
    deletedNoteIds: {
      ...pruneTombstones(catalog.deletedNoteIds, now),
      [id]: now,
    },
  }));
  await deleteNoteFiles(id);
}

export async function deleteAllNotesInFolder(folderId: string): Promise<void> {
  let targets: NoteMetadata[] = [];
  const now = new Date().toISOString();
  await catalogStore.mutate((catalog) => {
    targets = catalog.notes.filter((n) => n.folderId === folderId);
    if (targets.length === 0) return null;
    const deletedNoteIds = pruneTombstones(catalog.deletedNoteIds, now);
    for (const note of targets) deletedNoteIds[note.id] = now;
    return {
      ...catalog,
      notes: catalog.notes.filter((n) => n.folderId !== folderId),
      deletedNoteIds,
    };
  });
  await Promise.all(targets.map((n) => deleteNoteFiles(n.id)));
}

export async function orphanNotesInFolder(folderId: string): Promise<void> {
  await catalogStore.mutate((catalog) => {
    if (!catalog.notes.some((n) => n.folderId === folderId)) return null;
    return {
      ...catalog,
      notes: catalog.notes.map((n) =>
        n.folderId === folderId ? { ...n, folderId: null } : n,
      ),
    };
  });
}
