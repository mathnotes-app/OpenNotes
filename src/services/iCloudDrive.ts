import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import { NativeModules, Platform } from 'react-native';
import { t } from '../i18n';
import { noteId } from '../utils/id';
import { createPromiseQueue } from '../utils/promiseQueue';
import { catalogStore } from './catalogEnv';
import { CATALOG_FILENAME, parseCatalog } from './catalogStore';
import { getNote, noteIO } from './notesRepo';
import {
  canReplaceNotebookPdf, installStagedNotebook, newStage, readDriveManifest, stageLocalNotebook,
} from './iCloudNotebookFiles';
import { packageName, type DriveManifest } from './iCloudNotebookFormat';

type ReadResult =
  | { state: 'pending' }
  | { state: 'unchanged' }
  | { state: 'ready'; current: boolean; conflicts: string[] };

type NativeDrive = {
  getAccount(): Promise<string>;
  listNotebooks(account: string): Promise<string[]>;
  readNotebook(name: string, account: string, revision: string | null, stageId: string): Promise<ReadResult>;
  writeNotebook(name: string, account: string, revision: string | null, stageId: string): Promise<boolean>;
  openNotebook(uri: string, stageId: string): Promise<{ account?: string; name?: string }>;
  resolveConflicts(name: string, account: string, revisions: string[]): Promise<boolean>;
};

type Version = { revision: string; updatedAt: string };
type NotebookLink = { name: string; noteId: string; originId: string; version: Version | null; pending?: Version };
type DriveState = { links: NotebookLink[]; savedConflicts: string[] };
type DriveSession = { account: string; state: DriveState };

const drive = Platform.OS === 'ios' ? NativeModules.ICloudDriveNotebooks as NativeDrive | undefined : undefined;
const ENABLED = '@opennotes:icloud-drive:account';
const STATE = '@opennotes:icloud-drive:documents:';
const queue = createPromiseQueue();
const listeners = new Set<() => void>();
let generation = 0;

export const driveSupported = !!drive;

export function observeDriveLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifyLibrary(): void {
  for (const listener of listeners) listener();
}

export function isDriveEnabled(): Promise<boolean> {
  return AsyncStorage.getItem(ENABLED).then(account => !!account);
}

export async function setDriveEnabled(enabled: boolean): Promise<void> {
  generation++;
  if (!enabled) return AsyncStorage.removeItem(ENABLED);
  if (!drive) throw new Error(t.drive.unavailable);
  await AsyncStorage.setItem(ENABLED, await drive.getAccount());
}

async function readSession(account: string): Promise<DriveSession> {
  const stored = await AsyncStorage.getItem(STATE + account);
  const state = stored ? JSON.parse(stored) as DriveState : { links: [], savedConflicts: [] };
  return { account, state };
}

async function persist(session: DriveSession): Promise<void> {
  await AsyncStorage.setItem(STATE + session.account, JSON.stringify(session.state));
}

function manifestVersion(manifest: DriveManifest): Version {
  return { revision: manifest.revision, updatedAt: manifest.note.updatedAt };
}

async function upload(session: DriveSession, link: NotebookLink, canContinue: () => boolean): Promise<void> {
  const note = await getNote(link.noteId);
  if (!note || note.updatedAt === link.version?.updatedAt || !canContinue()) return;
  const stage = newStage();
  try {
    const manifest = await noteIO.enqueue(() => stageLocalNotebook(stage.uri, note, link.originId));
    const latest = await getNote(link.noteId);
    if (!canContinue() || latest?.updatedAt !== note.updatedAt) return;
    // Persist intent before crossing the native write boundary. If the app
    // stops between the write and acknowledgment, the next read adopts it.
    link.pending = manifestVersion(manifest);
    await persist(session);
    if (!canContinue()) return;
    await drive!.writeNotebook(link.name, session.account, link.version?.revision ?? null, stage.id);
    link.version = link.pending;
    delete link.pending;
    await persist(session);
  } finally {
    await stage.clean();
  }
}

async function importVersion(
  stage: string,
  manifest: DriveManifest,
  link: NotebookLink | undefined,
  canApply: () => boolean,
  options: { explicit?: boolean; conflict?: boolean } = {},
): Promise<string | null> {
  return noteIO.enqueue(async () => {
    let importedId: string | null = null;
    await catalogStore.mutate(async catalog => {
      if (!canApply()) return null;
      const current = link && catalog.notes.find(note => note.id === link.noteId);
      if (link && !current && !options.explicit) return null;
      const canReplace = current && current.updatedAt === link?.version?.updatedAt &&
        await canReplaceNotebookPdf(stage, manifest, current);
      if (!canApply()) return null;
      const useManifestId = !link && !options.conflict &&
        !catalog.notes.some(note => note.id === manifest.note.id) &&
        !Object.hasOwn(catalog.deletedNoteIds, manifest.note.id);
      const id = canReplace ? current.id : useManifestId ? manifest.note.id : noteId();
      const incoming = await installStagedNotebook(stage, manifest, id);
      importedId = id;
      return {
        ...catalog,
        notes: [
          {
            ...incoming,
            folderId: canReplace ? current.folderId : null,
            title: options.conflict ? t.drive.conflictCopy(incoming.title) : incoming.title,
          },
          ...catalog.notes.filter(note => note.id !== id).map(note =>
            current?.id === note.id && !canReplace ? { ...note, title: t.drive.conflictCopy(note.title) } : note),
        ],
      };
    });
    if (importedId) {
      const raw = await FS.readAsStringAsync(FS.documentDirectory + CATALOG_FILENAME);
      const saved = parseCatalog(raw)?.notes.find(note => note.id === importedId);
      if (!saved || saved.updatedAt !== manifest.note.updatedAt) throw new Error('The notebook catalog could not be saved');
    }
    return importedId;
  });
}

async function acceptCurrent(
  session: DriveSession, name: string, stage: string, canApply: () => boolean, explicit = false,
  visibleNames?: Set<string>,
): Promise<string | null> {
  const manifest = await readDriveManifest(stage);
  let link = session.state.links.find(item => item.name === name);
  if (!link && visibleNames) {
    // A rename in Files changes the path while preserving document lineage.
    const renamed = session.state.links.filter(item => item.originId === manifest.note.id && !visibleNames.has(item.name));
    if (renamed.length === 1) {
      link = renamed[0];
      link.name = name;
    }
  }
  if (link?.pending?.revision === manifest.revision) {
    link.version = link.pending;
    delete link.pending;
    await persist(session);
    if (!explicit || await getNote(link.noteId)) return link.noteId;
  }
  if (link?.version?.revision === manifest.revision) {
    await persist(session);
    if (!explicit || await getNote(link.noteId)) return link.noteId;
  }
  const id = await importVersion(stage, manifest, link, canApply, { explicit });
  if (!id) return null;
  if (link) {
    link.noteId = id;
    link.version = manifestVersion(manifest);
    delete link.pending;
  } else {
    session.state.links.push({
      name, noteId: id, originId: manifest.note.id, version: manifestVersion(manifest),
    });
  }
  await persist(session);
  notifyLibrary();
  return id;
}

async function reconcileFile(
  session: DriveSession, name: string, visibleNames: Set<string>, canApply: () => boolean,
): Promise<boolean> {
  const link = session.state.links.find(item => item.name === name);
  const stage = newStage();
  try {
    const result = await drive!.readNotebook(name, session.account, link?.version?.revision ?? null, stage.id);
    if (!canApply()) return false;
    if (result.state === 'pending') return true;
    if (result.state === 'unchanged') {
      if (link) await upload(session, link, canApply);
      return false;
    }
    if (result.current) {
      await acceptCurrent(session, name, stage.uri + 'current/', canApply, false, visibleNames);
    }
    const resolved: string[] = [];
    for (const conflict of result.conflicts) {
      if (!canApply()) return false;
      const uri = stage.uri + conflict + '/';
      const manifest = await readDriveManifest(uri);
      if (!session.state.savedConflicts.includes(manifest.revision)) {
        const id = await importVersion(uri, manifest, undefined, canApply, { conflict: true });
        if (!id) return false;
        session.state.savedConflicts.push(manifest.revision);
        await persist(session);
        notifyLibrary();
      }
      resolved.push(manifest.revision);
    }
    if (resolved.length && canApply()) await drive!.resolveConflicts(name, session.account, resolved);
    return false;
  } finally {
    await stage.clean();
  }
}

export function syncDriveLibrary(canApply: () => boolean): Promise<'off' | 'complete' | 'pending' | 'unavailable'> {
  return queue.enqueue(async () => {
    if (!drive || !canApply()) return 'off';
    const myGeneration = generation;
    const mayWrite = () => generation === myGeneration && canApply();
    try {
      const enabled = await AsyncStorage.getItem(ENABLED);
      if (!enabled || !mayWrite()) return 'off';
      if (await drive.getAccount() !== enabled) return 'unavailable';
      const session = await readSession(enabled);
      const names = new Set(await drive.listNotebooks(enabled));
      let pending = false;
      for (const name of names) {
        if (!mayWrite()) break;
        try {
          if (await reconcileFile(session, name, names, mayWrite)) pending = true;
        } catch {
          // An individual unavailable or malformed file must not prevent
          // healthy notebooks from syncing. The status remains retryable.
          pending = true;
        }
      }
      for (const link of session.state.links) {
        if (!mayWrite()) break;
        // Retry initial saves, including a prior app exit. A missing *linked*
        // file may have been removed in Files. Never recreate it implicitly.
        if (names.has(link.name) || link.version) continue;
        try { await upload(session, link, mayWrite); } catch { pending = true; }
      }
      return pending ? 'pending' : 'complete';
    } catch {
      return 'unavailable';
    }
  });
}

export function addNoteToDrive(id: string): Promise<void> {
  return queue.enqueue(async () => {
    if (!drive) throw new Error(t.drive.unavailable);
    const account = await drive.getAccount();
    const note = await getNote(id);
    if (!note) throw new Error(t.drive.failed);
    const session = await readSession(account);
    let link = session.state.links.find(item => item.noteId === id);
    if (link?.version) {
      const names = await drive.listNotebooks(account);
      if (!names.includes(link.name)) throw new Error(t.drive.pending);
      await AsyncStorage.setItem(ENABLED, account);
      return;
    }
    if (!link) {
      link = { name: packageName(note.title, note.id), noteId: id, originId: id, version: null };
      session.state.links.push(link);
      await persist(session);
    }
    const myGeneration = generation;
    await AsyncStorage.setItem(ENABLED, account);
    await upload(session, link, () => generation === myGeneration);
    if (!link.version) throw new Error(t.drive.pending);
  });
}

export function openDriveNotebook(uri: string): Promise<string> {
  return queue.enqueue(async () => {
    if (!drive) throw new Error(t.drive.unavailable);
    const stage = newStage();
    try {
      const { account, name } = await drive.openNotebook(uri, stage.id);
      const source = stage.uri + 'current/';
      if (account && name) {
        const session = await readSession(account);
        const id = await acceptCurrent(session, name, source, () => true, true);
        if (!id) throw new Error(t.drive.failed);
        await AsyncStorage.setItem(ENABLED, account);
        return id;
      }
      const manifest = await readDriveManifest(source);
      const id = await importVersion(source, manifest, undefined, () => true, { explicit: true });
      if (!id) throw new Error(t.drive.failed);
      notifyLibrary();
      return id;
    } finally {
      await stage.clean();
    }
  });
}
