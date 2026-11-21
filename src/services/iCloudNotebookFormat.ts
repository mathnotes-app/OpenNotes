import type { SerializedNotebookData } from '@mathnotes/mobile-ink';
import type { NoteMetadata } from '../types/note';
import { parseCatalog } from './catalogStore.ts';

export const STAGING_DIRECTORY = 'icloud-notebook-staging/';
const ASSET = /^asset-[0-9]+\.(?:png|jpe?g|gif|heic|heif|webp|tiff?|bmp|avif)$/;
const ID = /^[a-zA-Z0-9_-]{1,120}$/;

export interface DriveManifest {
  version: 1;
  revision: string;
  note: NoteMetadata;
  hasBody: boolean;
  hasPdf: boolean;
  cover?: string;
}

export function packageName(title: string, id: string): string {
  if (!ID.test(id)) throw new Error('Invalid notebook identifier');
  const cleaned = Array.from(title.replace(/[/:\\\x00-\x1f\x7f]/g, ' ').trim().replace(/^\.+/, '')).slice(0, 29).join('').trim();
  return `${cleaned || 'Notebook'} — ${id}.opennotes`;
}

export function isNotebookFileUrl(uri: string): boolean {
  if (!/^file:\/\//i.test(uri)) return false;
  try {
    return decodeURIComponent(uri.split(/[?#]/, 1)[0]).replace(/\/+$/, '').toLowerCase().endsWith('.opennotes');
  } catch {
    return false;
  }
}

export function parseDriveManifest(raw: string): DriveManifest {
  const value = JSON.parse(raw);
  if (!value || value.version !== 1 || typeof value.revision !== 'string' || !ID.test(value.revision) ||
      typeof value.hasPdf !== 'boolean' || typeof value.hasBody !== 'boolean' ||
      (value.cover !== undefined && (typeof value.cover !== 'string' || !ASSET.test(value.cover)))) {
    throw new Error('Invalid OpenNotes notebook');
  }
  const normalized = parseCatalog(JSON.stringify({ notes: [value.note], folders: [] }))?.notes[0];
  if (!normalized || !ID.test(normalized.id) || !Number.isFinite(Date.parse(normalized.updatedAt))) {
    throw new Error('Invalid OpenNotes notebook metadata');
  }
  return {
    version: 1,
    revision: value.revision,
    note: { ...normalized, folderId: null, thumbnailUri: null, thumbnailVersion: undefined, pdfUri: null, customCoverUri: null },
    hasBody: value.hasBody,
    hasPdf: value.hasPdf,
    cover: value.cover,
  };
}

export function validateAssetName(name: string): string {
  if (!ASSET.test(name)) throw new Error('Invalid notebook asset');
  return name;
}

export function mapNotebookAssets(
  value: SerializedNotebookData,
  map: (uri: string) => string,
): SerializedNotebookData {
  if (!value || !Array.isArray(value.pages) || value.pages.length === 0) {
    throw new Error('Invalid notebook pages');
  }
  return {
    ...value,
    pages: value.pages.map(page => {
      if (!page || typeof page.id !== 'string' || (page.data !== undefined && typeof page.data !== 'string')) {
        throw new Error('Invalid notebook page');
      }
      const { previewUri: _, ...withoutPreview } = page;
      return {
        ...withoutPreview,
        insertedElements: page.insertedElements?.map(element => ({
          ...element,
          sourceUri: typeof element.sourceUri === 'string' && element.sourceUri ? map(element.sourceUri) : undefined,
          renderedImageUri: typeof element.renderedImageUri === 'string' && element.renderedImageUri
            ? map(element.renderedImageUri) : undefined,
        })),
      };
    }),
  };
}
