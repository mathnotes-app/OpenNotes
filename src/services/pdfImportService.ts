import {
  createNote,
  deleteNote,
  renameNote,
  saveNoteBody,
  setNoteBackground,
} from './notesRepo';
import {
  createPdfNotebookData,
  importPdf,
  importPdfFromUri,
  type PickedPdfResult,
} from './pdfStorage';
import type { NoteMetadata } from '../types/note';
import { recordSuccessfulNoteSave } from './lifecycleService';

interface PdfNoteOptions {
  folderId?: string | null;
  title?: string;
}

export async function createPdfNoteFromPicker(
  options: PdfNoteOptions = {},
): Promise<NoteMetadata | null> {
  return createPdfNote(async (noteId) => importPdf(noteId), options);
}

export async function createPdfNoteFromUri(
  sourceUri: string,
  options: PdfNoteOptions = {},
): Promise<NoteMetadata | null> {
  const fallbackName = filenameFromUri(sourceUri) || 'Imported PDF';
  return createPdfNote(
    async (noteId) => importPdfFromUri(noteId, sourceUri, fallbackName),
    options,
  );
}

async function createPdfNote(
  importSource: (noteId: string) => Promise<PickedPdfResult | null>,
  options: PdfNoteOptions,
): Promise<NoteMetadata | null> {
  const initialTitle = cleanTitle(options.title) || 'Imported PDF';
  const meta = await createNote({
    folderId: options.folderId ?? null,
    title: initialTitle,
    backgroundType: 'plain',
  });

  try {
    const result = await importSource(meta.id);
    if (!result) {
      await deleteNote(meta.id);
      return null;
    }

    const title = cleanTitle(options.title) || cleanTitle(result.name.replace(/\.pdf$/i, ''));
    await setNoteBackground(meta.id, 'pdf', result.uri);
    const body = createPdfNotebookData(result.pageCount);
    const saveResult = await saveNoteBody(meta.id, body);
    if (!saveResult.ok) {
      throw new Error('Imported PDF note body could not be saved.');
    }
    const finalMetadata = title
      ? await renameNote(meta.id, title)
      : saveResult.metadata;
    await recordSuccessfulNoteSave(meta.id);
    return finalMetadata;
  } catch (error) {
    await deleteNote(meta.id).catch(() => {});
    throw error;
  }
}

function cleanTitle(value: string | undefined): string {
  return value?.trim() ?? '';
}

function filenameFromUri(uri: string): string {
  const withoutFragment = uri.split('#')[0];
  const withoutQuery = withoutFragment.split('?')[0];
  const last = withoutQuery.split('/').filter(Boolean).pop();
  return last ? decodeURIComponent(last) : '';
}
