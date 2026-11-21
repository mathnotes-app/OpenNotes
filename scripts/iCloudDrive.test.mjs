import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rebaseAppDocumentUri } from '../src/utils/appDocumentUri.ts';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as format from '../src/services/iCloudNotebookFormat.ts';
import * as catalogFormat from '../src/services/catalogStore.ts';
import { createPromiseQueue } from '../src/utils/promiseQueue.ts';

const source = ts.transpileModule(
  readFileSync(new URL('../src/services/iCloudDrive.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const note = {
  id: 'note-original',
  title: 'Design drawings',
  updatedAt: '2026-11-21T12:00:00.000Z',
  createdAt: '2026-11-21T12:00:00.000Z',
  folderId: null,
  backgroundType: 'pdf',
  lineSpacing: 'custom-40',
  pdfUri: 'file:///local/source.pdf',
  thumbnailUri: null,
};
const editTime = '2026-11-21T12:01:00.000Z';
const laterTime = '2026-11-21T12:02:00.000Z';

function device(label, remote, notes = []) {
  const kv = new Map();
  const staged = new Map();
  const exports = {};
  let catalog = { version: 1, notes, folders: [], deletedNoteIds: {} };
  let counter = 0;
  let account = 'my-account';
  let loseAcknowledgment = false;
  const newId = () => label + '-' + ++counter;
  const native = {
    getAccount: async () => account,
    listNotebooks: async () => [...remote.keys()],
    readNotebook: async (name, _account, revision, stageId) => {
      const file = remote.get(name);
      if (!file || file.pending) return { state: 'pending' };
      const current = file.revision !== revision;
      if (!current && !file.conflicts?.length) return { state: 'unchanged' };
      if (current) staged.set(stageId + '/current/', structuredClone(file));
      const conflicts = (file.conflicts ?? []).map((entry, index) => {
        const item = 'conflict-' + index;
        staged.set(stageId + '/' + item + '/', structuredClone(entry));
        return item;
      });
      return { state: 'ready', current, conflicts };
    },
    writeNotebook: async (name, expectedAccount, revision, stageId) => {
      assert.equal(expectedAccount, account);
      if ((remote.get(name)?.revision ?? null) !== revision) throw Error('changed');
      remote.set(name, structuredClone(staged.get(stageId + '/')));
      if (loseAcknowledgment) throw Error('write reached iCloud before disconnecting');
      return true;
    },
    resolveConflicts: async (name, _account, revisions) => {
      const file = remote.get(name);
      file.conflicts = file.conflicts.filter(entry => !revisions.includes(entry.revision));
      return true;
    },
  };
  const storage = {
    getItem: async key => kv.get(key) ?? null,
    setItem: async (key, value) => { kv.set(key, value); },
    removeItem: async key => { kv.delete(key); },
  };
  const files = {
    newStage: () => {
      const id = newId();
      return { id, uri: id + '/', clean: async () => {
        for (const key of staged.keys()) if (key.startsWith(id + '/')) staged.delete(key);
      } };
    },
    stageLocalNotebook: async (uri, local, id) => {
      const manifest = { version: 1, revision: newId(), note: { ...local, id }, hasBody: true, hasPdf: true };
      staged.set(uri, manifest);
      return manifest;
    },
    readDriveManifest: async uri => staged.get(uri),
    canReplaceNotebookPdf: async () => true,
    installStagedNotebook: async (_uri, manifest, id) => ({ ...manifest.note, id }),
  };
  vm.runInNewContext(source, { exports, require(name) {
    if (name === '@react-native-async-storage/async-storage') return { default: storage };
    if (name === 'expo-file-system/legacy') return { documentDirectory: 'file:///local/', readAsStringAsync: async () => JSON.stringify(catalog) };
    if (name === 'react-native') return { Platform: { OS: 'ios' }, NativeModules: { ICloudDriveNotebooks: native } };
    if (name === '../i18n') return { t: { drive: { conflictCopy: title => title + ' (Conflict copy)' } } };
    if (name === '../utils/id') return { noteId: newId };
    if (name === '../utils/promiseQueue') return { createPromiseQueue };
    if (name === './catalogEnv') return { catalogStore: { mutate: async change => { catalog = await change(catalog) ?? catalog; } } };
    if (name === './catalogStore') return catalogFormat;
    if (name === './notesRepo') return {
      getNote: async id => catalog.notes.find(item => item.id === id),
      noteIO: createPromiseQueue(),
    };
    if (name === './iCloudNotebookFiles') return files;
    if (name === './iCloudNotebookFormat') return format;
    throw Error('Unexpected import: ' + name);
  } });
  return {
    ...exports,
    sync: () => exports.syncDriveLibrary(() => true),
    notes: () => catalog.notes,
    edit: (title, updatedAt) => { catalog.notes = catalog.notes.map(item => ({ ...item, title, updatedAt })); },
    deleteLocally: () => { catalog.notes = []; },
    changeAccount: next => { account = next; },
    loseAcknowledgment: next => { loseAcknowledgment = next; },
  };
}

test('a notebook publishes, appears on a second device, and edits travel back', async () => {
  const cloud = new Map();
  const ipad = device('ipad', cloud, [note]);
  const iphone = device('iphone', cloud);
  await ipad.addNoteToDrive(note.id);
  assert.match([...cloud.keys()][0], /^Design drawings .*\.opennotes$/);
  assert.equal(await iphone.sync(), 'off');
  await iphone.setDriveEnabled(true);
  assert.equal(await iphone.sync(), 'complete');
  assert.equal(iphone.notes()[0].id, note.id);
  iphone.edit('Edited from iPhone', editTime);
  await iphone.sync();
  await ipad.sync();
  assert.equal(ipad.notes()[0].title, 'Edited from iPhone');
  assert.equal(ipad.notes()[0].id, note.id);
});

test('concurrent edits preserve the local version and the version from iCloud', async () => {
  const cloud = new Map();
  const ipad = device('ipad', cloud, [note]);
  const iphone = device('iphone', cloud);
  await ipad.addNoteToDrive(note.id);
  await iphone.setDriveEnabled(true);
  await iphone.sync();
  ipad.edit('iPad changes', editTime);
  iphone.edit('iPhone changes', laterTime);
  await iphone.sync();
  await ipad.sync();
  assert.deepEqual([...ipad.notes()].map(item => item.title), ['iPhone changes', 'iPad changes (Conflict copy)']);
  await ipad.sync();
  assert.equal(ipad.notes().length, 2);
});

test('a completed upload recovers after an interrupted acknowledgement, and stops on account change', async () => {
  const cloud = new Map();
  const ipad = device('ipad', cloud, [note]);
  ipad.loseAcknowledgment(true);
  await assert.rejects(ipad.addNoteToDrive(note.id), /disconnecting/);
  ipad.loseAcknowledgment(false);
  assert.equal(await ipad.sync(), 'complete');
  assert.equal(ipad.notes().length, 1);
  const published = [...cloud.values()][0].revision;
  ipad.edit('Keep this on the original account', editTime);
  ipad.changeAccount('another-account');
  assert.equal(await ipad.sync(), 'unavailable');
  assert.equal([...cloud.values()][0].revision, published);
});

test('deleting a local copy keeps its Files document and avoids importing it again', async () => {
  const cloud = new Map();
  const ipad = device('ipad', cloud, [note]);
  await ipad.addNoteToDrive(note.id);
  ipad.deleteLocally();
  await ipad.sync();
  assert.equal(cloud.size, 1);
  assert.equal(ipad.notes().length, 0);
});

test('the portable format handles legacy blank pages and rejects paths from a Files document', () => {
  const body = { version: '1.0', pages: [{ id: 'page-1', title: 'Page 1', rotation: 0, previewUri: 'file:///old.png' }] };
  assert.equal(format.mapNotebookAssets(body, () => assert.fail('no attachments')).pages[0].previewUri, undefined);
  assert.equal(format.isNotebookFileUrl('file:///OpenNotes/Design%20drawings.opennotes/'), true);
  assert.equal(format.isNotebookFileUrl('https://example.invalid/a.opennotes'), false);
  assert.throws(() => format.validateAssetName('../../private.jpg'));
  assert.throws(() => format.parseDriveManifest(JSON.stringify({
    version: 1, revision: 'r1', note, hasBody: true, hasPdf: true, cover: 'file:///local.jpg',
  })));
});

test('an actual package round trip preserves PDF and image bytes and reuses unchanged attachments', async () => {
  const temp = await fs.mkdtemp(tmpdir() + '/opennotes-drive-');
  const root = pathToFileURL(temp).href + '/';
  const FS = {
    documentDirectory: root,
    cacheDirectory: root + 'cache/',
    makeDirectoryAsync: (uri, opts) => fs.mkdir(fileURLToPath(uri), { recursive: opts.intermediates }),
    copyAsync: ({ from, to }) => fs.copyFile(fileURLToPath(from), fileURLToPath(to)),
    moveAsync: ({ from, to }) => fs.rename(fileURLToPath(from), fileURLToPath(to)),
    deleteAsync: uri => fs.rm(fileURLToPath(uri), { recursive: true, force: true }),
    writeAsStringAsync: (uri, contents) => fs.writeFile(fileURLToPath(uri), contents),
    readAsStringAsync: uri => fs.readFile(fileURLToPath(uri), 'utf8'),
    getInfoAsync: async (uri, options) => {
      try {
        const stat = await fs.stat(fileURLToPath(uri));
        const md5 = options?.md5
          ? createHash('md5').update(await fs.readFile(fileURLToPath(uri))).digest('hex')
          : undefined;
        return { exists: true, isDirectory: stat.isDirectory(), size: stat.size, md5 };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return { exists: false };
      }
    },
  };
  const pdfBytes = Buffer.from('%PDF-1.4\n% fake binary fixture\n');
  const imageBytes = Buffer.from([0xff, 0xd8, 0x09, 0xff, 0xd9]);
  const pdf = id => root + 'pdfs/' + id + '.pdf';
  const images = root + 'images/' + note.id + '/';
  const photo = images + 'photo.jpg';
  const ink = '{"pages":{"0":{"ink":"fixture"}}}';
  const localBody = { version: '1.0', pages: [{
    id: 'page-1', title: 'Page 1', data: ink, rotation: 0,
    insertedElements: [{ id: 'image', sourceUri: photo, renderedImageUri: photo }],
  }] };
  const exports = {};
  const bodies = new Map();
  const compiled = ts.transpileModule(
    readFileSync(new URL('../src/services/iCloudNotebookFiles.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'expo-file-system/legacy') return FS;
    if (name === '../utils/appDocumentUri') return { rebaseAppDocumentUri };
    if (name === '../utils/id') return { noteId: () => 'note-test-revision' };
    if (name === './pdfStorage') return {
      pdfUriForNote: pdf,
      ensureDirectoryForSyncedPdf: () => FS.makeDirectoryAsync(root + 'pdfs/', { intermediates: true }),
    };
    if (name === './noteBodyStorage') return {
      readBody: async () => ({ kind: 'ok', data: localBody }),
      writeBody: async (id, body) => { bodies.set(id, body); return true; },
    };
    if (name === './iCloudNotebookFormat') return format;
    throw Error('Unexpected import: ' + name);
  } });
  try {
    await FS.makeDirectoryAsync(root + 'pdfs/', { intermediates: true });
    await FS.makeDirectoryAsync(images, { intermediates: true });
    await fs.writeFile(fileURLToPath(pdf(note.id)), pdfBytes);
    await fs.writeFile(fileURLToPath(photo), imageBytes);
    const stage = exports.newStage();
    await exports.stageLocalNotebook(stage.uri, { ...note, pdfUri: pdf(note.id), customCoverUri: photo });
    const portable = JSON.parse(await FS.readAsStringAsync(stage.uri + 'body.json'));
    assert.equal(portable.pages[0].insertedElements[0].sourceUri, 'asset-0.jpg');

    const manifest = await exports.readDriveManifest(stage.uri);
    const received = await exports.installStagedNotebook(stage.uri, manifest, 'remote-copy');
    const second = await exports.installStagedNotebook(stage.uri, { ...manifest, revision: 'other-revision' }, 'remote-copy');
    assert.deepEqual(await fs.readFile(fileURLToPath(received.pdfUri)), pdfBytes);
    assert.deepEqual(await fs.readFile(fileURLToPath(received.customCoverUri)), imageBytes);
    assert.equal(received.customCoverUri, second.customCoverUri);
    assert.equal(bodies.get(received.id).pages[0].data, ink);
    assert.equal(bodies.get(received.id).pages[0].insertedElements[0].sourceUri, received.customCoverUri);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
