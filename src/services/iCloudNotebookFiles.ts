import * as FS from 'expo-file-system/legacy';
import type { SerializedNotebookData } from '@mathnotes/mobile-ink';
import type { NoteMetadata } from '../types/note';
import { rebaseAppDocumentUri } from '../utils/appDocumentUri';
import { noteId } from '../utils/id';
import { ensureDirectoryForSyncedPdf, pdfUriForNote } from './pdfStorage';
import { createEmptyNotebookData, readBody, writeBody } from './noteBodyStorage';
import {
  mapNotebookAssets, parseDriveManifest, STAGING_DIRECTORY, validateAssetName, type DriveManifest,
} from './iCloudNotebookFormat';

export function newStage(): { id: string; uri: string; clean: () => Promise<void> } {
  if (!FS.cacheDirectory) throw new Error('Notebook staging is unavailable');
  const id = noteId();
  const uri = `${FS.cacheDirectory}${STAGING_DIRECTORY}${id}/`;
  return { id, uri, clean: () => FS.deleteAsync(uri, { idempotent: true }) };
}

function localImage(uri: string): string {
  const directory = FS.documentDirectory;
  if (!directory) throw new Error('Local storage is unavailable');
  const rebased = rebaseAppDocumentUri(uri, directory);
  // Only files managed by OpenNotes can enter an iCloud notebook. An
  // externally edited package cannot trick this path into copying other files.
  const prefix = `${directory}images/`;
  if (!rebased.startsWith(prefix) || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(rebased.slice(prefix.length))) {
    throw new Error('An image is outside notebook storage');
  }
  const leaf = rebased.slice(rebased.lastIndexOf('/') + 1);
  if (leaf === '.' || leaf === '..') throw new Error('An image path is invalid');
  return rebased;
}

export async function stageLocalNotebook(stage: string, note: NoteMetadata, originId = note.id): Promise<DriveManifest> {
  await FS.makeDirectoryAsync(stage, { intermediates: true });
  const body = await readBody(note.id);
  if (body.kind === 'unreadable') throw new Error('This notebook could not be read');
  const sources = new Map<string, string>();
  const map = (uri: string) => {
    const file = localImage(uri);
    const existing = sources.get(file);
    if (existing) return existing;
    const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
    const name = validateAssetName(`asset-${sources.size}.${ext}`);
    sources.set(file, name);
    return name;
  };
  const portable = body.kind === 'ok' ? mapNotebookAssets(body.data, map) : null;
  const cover = note.customCoverUri ? map(note.customCoverUri) : undefined;
  for (const [from, name] of sources) await FS.copyAsync({ from, to: stage + name });
  if (note.pdfUri) await FS.copyAsync({ from: pdfUriForNote(note.id), to: stage + 'source.pdf' });
  if (portable) await FS.writeAsStringAsync(stage + 'body.json', JSON.stringify(portable));
  const manifest: DriveManifest = {
    version: 1,
    revision: noteId(),
    note: { ...note, id: originId, folderId: null, pdfUri: null, thumbnailUri: null, thumbnailVersion: undefined, customCoverUri: null },
    hasPdf: !!note.pdfUri,
    hasBody: !!portable,
    cover,
  };
  await FS.writeAsStringAsync(stage + 'manifest.json', JSON.stringify(manifest));
  return manifest;
}

export async function readDriveManifest(stage: string): Promise<DriveManifest> {
  return parseDriveManifest(await FS.readAsStringAsync(stage + 'manifest.json'));
}

/** PDF originals are immutable for a given notebook. A changed original is
 * imported as a separate notebook so cached ink never lands over another PDF. */
export async function canReplaceNotebookPdf(stage: string, manifest: DriveManifest, note: NoteMetadata): Promise<boolean> {
  if (!note.pdfUri) return true;
  if (!manifest.hasPdf) return false;
  const [current, incoming] = await Promise.all([
    FS.getInfoAsync(pdfUriForNote(note.id), { md5: true }),
    FS.getInfoAsync(stage + 'source.pdf', { md5: true }),
  ]);
  return !current.exists || (incoming.exists && !incoming.isDirectory && !current.isDirectory && current.md5 === incoming.md5);
}

async function installFile(from: string, to: string): Promise<void> {
  const source = await FS.getInfoAsync(from);
  if (!source.exists || source.isDirectory) throw new Error('A notebook attachment is missing');
  const existing = await FS.getInfoAsync(to);
  if (existing.exists) {
    if (!existing.isDirectory && source.size === existing.size) return;
    throw new Error('A different attachment already exists');
  }
  const temporary = to + '.icloud-tmp';
  await FS.deleteAsync(temporary, { idempotent: true });
  try {
    await FS.copyAsync({ from, to: temporary });
    const copy = await FS.getInfoAsync(temporary);
    if (!copy.exists || copy.isDirectory || copy.size !== source.size) throw new Error('Incomplete notebook attachment');
    await FS.moveAsync({ from: temporary, to });
  } finally {
    await FS.deleteAsync(temporary, { idempotent: true });
  }
}

export async function installStagedNotebook(stage: string, manifest: DriveManifest, id: string): Promise<NoteMetadata> {
  const docs = FS.documentDirectory;
  if (!docs) throw new Error('Local storage is unavailable');
  const assets = new Map<string, string>();
  const record = (name: string) => {
    validateAssetName(name);
    assets.set(name, name);
    return name;
  };
  const portable = manifest.hasBody
    ? mapNotebookAssets(JSON.parse(await FS.readAsStringAsync(stage + 'body.json')) as SerializedNotebookData, record)
    : createEmptyNotebookData();
  if (manifest.cover) record(manifest.cover);
  if (assets.size) {
    const directory = `${docs}images/${encodeURIComponent(id)}/`;
    await FS.makeDirectoryAsync(directory, { intermediates: true });
    for (const name of assets.keys()) {
      const from = stage + name;
      const info = await FS.getInfoAsync(from, { md5: true });
      if (!info.exists || info.isDirectory || !info.md5 || !/^[a-f0-9]{32}$/i.test(info.md5)) {
        throw new Error('A notebook image is missing');
      }
      const to = directory + 'icloud-' + info.md5 + name.slice(name.lastIndexOf('.'));
      await installFile(from, to);
      assets.set(name, to);
    }
  }
  const body = mapNotebookAssets(portable, name => assets.get(name)!);
  const customCoverUri = manifest.cover ? assets.get(manifest.cover)! : null;
  const pdfUri = manifest.hasPdf ? pdfUriForNote(id) : null;
  if (pdfUri) {
    await ensureDirectoryForSyncedPdf();
    await installFile(stage + 'source.pdf', pdfUri);
  }
  if (!(await writeBody(id, body))) throw new Error('Could not save the downloaded notebook');
  return { ...manifest.note, id, pdfUri, customCoverUri };
}
