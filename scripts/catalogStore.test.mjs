import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOLDER_KEY_PREFIX,
  FOLDERS_INDEX_KEY,
  NOTE_KEY_PREFIX,
  NOTES_INDEX_KEY,
  RECOVERED_NOTE_TITLE,
  createCatalogStore,
  parseCatalog,
} from '../src/services/catalogStore.ts';

function makeKv(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    async getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async getAllKeys() {
      return [...map.keys()];
    },
    async multiGet(keys) {
      return keys.map((key) => [key, map.has(key) ? map.get(key) : null]);
    },
    async multiSet(pairs) {
      for (const [key, value] of pairs) map.set(key, value);
    },
    async multiRemove(keys) {
      for (const key of keys) map.delete(key);
    },
  };
}

function makeEnv({
  kv = makeKv(),
  catalogFile = null,
  bodyFiles = [],
  previews = {},
  pdfs = new Set(),
  failCatalogWrites = false,
} = {}) {
  const env = {
    kv,
    catalogFile,
    preservedCorruptFile: null,
    warnings: [],
    async readCatalogFile() {
      return env.catalogFile;
    },
    async writeCatalogFile(json) {
      if (failCatalogWrites) return false;
      env.catalogFile = json;
      return true;
    },
    async preserveCorruptCatalogFile() {
      env.preservedCorruptFile = env.catalogFile;
      env.catalogFile = null;
    },
    async listBodyIds() {
      return bodyFiles.map((entry) => (typeof entry === 'string' ? entry : entry.id));
    },
    async bodyModifiedAt(id) {
      const entry = bodyFiles.find((e) => typeof e !== 'string' && e.id === id);
      return entry ? entry.modifiedAt : null;
    },
    async readBodyPreview(id) {
      return previews[id] ?? null;
    },
    async pdfExistsForNote(id) {
      return pdfs.has(id);
    },
    pdfUriForNote(id) {
      return `file:///documents/pdfs/${id}.pdf`;
    },
    now() {
      return '2026-08-28T00:00:00.000Z';
    },
    warn(message) {
      env.warnings.push(message);
    },
  };
  return env;
}

function noteJson(id, extra = {}) {
  return JSON.stringify({
    id,
    title: `Title ${id}`,
    folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    backgroundType: 'plain',
    pdfUri: null,
    thumbnailUri: null,
    ...extra,
  });
}

function folderJson(id, extra = {}) {
  return JSON.stringify({
    id,
    name: `Folder ${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...extra,
  });
}

test('REPRO: a corrupted notes index no longer hides notes whose records survived', async () => {
  // This is the shipped-bug scenario: the device died mid-write, the
  // AsyncStorage index value is garbage, but the per-note entries survived.
  // The old readIndex() returned [] on parse failure, so the library showed
  // zero notes. The rebuild must recover them from a key scan instead.
  const kv = makeKv({
    [NOTES_INDEX_KEY]: '{"truncated-garbage',
    [`${NOTE_KEY_PREFIX}note-a`]: noteJson('note-a'),
    [`${NOTE_KEY_PREFIX}note-b`]: noteJson('note-b'),
  });
  const store = createCatalogStore(makeEnv({ kv }));
  const catalog = await store.getCatalog();
  assert.deepEqual(catalog.notes.map((n) => n.id).sort(), ['note-a', 'note-b']);
  assert.equal(catalog.notes[0].title, `Title ${catalog.notes[0].id}`);
});

test('REPRO: total key-value loss recovers every note that still has a body file on disk', async () => {
  // Worst case: the AsyncStorage manifest is gone entirely (the "all my
  // notes were deleted" report). Body files in Documents/ survive that, so
  // the recovery scan must resurrect them.
  const env = makeEnv({
    bodyFiles: [
      { id: 'note-lab-data', modifiedAt: '2026-08-01T10:00:00.000Z' },
      { id: 'note-problems', modifiedAt: null },
    ],
    previews: { 'note-lab-data': 'file:///previews/lab.png' },
    pdfs: new Set(['note-problems']),
  });
  const store = createCatalogStore(env);
  const catalog = await store.getCatalog();

  assert.equal(catalog.notes.length, 2);
  for (const note of catalog.notes) {
    assert.equal(note.title, RECOVERED_NOTE_TITLE);
    assert.equal(note.folderId, null);
  }
  const lab = catalog.notes.find((n) => n.id === 'note-lab-data');
  assert.equal(lab.thumbnailUri, 'file:///previews/lab.png');
  assert.equal(lab.updatedAt, '2026-08-01T10:00:00.000Z');
  const problems = catalog.notes.find((n) => n.id === 'note-problems');
  assert.equal(problems.backgroundType, 'pdf');
  assert.equal(problems.pdfUri, 'file:///documents/pdfs/note-problems.pdf');

  // Recovery is persisted so the next launch does not depend on the scan.
  const persisted = parseCatalog(env.catalogFile);
  assert.equal(persisted.notes.length, 2);
});

test('a corrupt catalog file is preserved for diagnostics and rebuilt from the mirror', async () => {
  const kv = makeKv({
    [NOTES_INDEX_KEY]: JSON.stringify(['note-a']),
    [`${NOTE_KEY_PREFIX}note-a`]: noteJson('note-a'),
  });
  const env = makeEnv({ kv, catalogFile: '{"notes": [truncated' });
  const store = createCatalogStore(env);
  const catalog = await store.getCatalog();
  assert.deepEqual(catalog.notes.map((n) => n.id), ['note-a']);
  assert.equal(env.preservedCorruptFile, '{"notes": [truncated');
  assert.notEqual(env.catalogFile, null);
});

test('a note pointing at a lost folder is moved to the root so it stays visible', async () => {
  const env = makeEnv({
    catalogFile: JSON.stringify({
      version: 1,
      notes: [JSON.parse(noteJson('note-a', { folderId: 'folder-gone' }))],
      folders: [],
    }),
  });
  const store = createCatalogStore(env);
  const catalog = await store.getCatalog();
  assert.equal(catalog.notes[0].folderId, null);
});

test('legacy-namespace records migrate into the catalog', async () => {
  const legacy = '@simple' + 'notes:';
  const kv = makeKv({
    [`${legacy}notes:index`]: JSON.stringify(['note-old']),
    [`${legacy}note:note-old`]: noteJson('note-old'),
    [`${legacy}folders:index`]: JSON.stringify(['folder-old']),
    [`${legacy}folder:folder-old`]: folderJson('folder-old'),
  });
  const store = createCatalogStore(makeEnv({ kv }));
  const catalog = await store.getCatalog();
  assert.deepEqual(catalog.notes.map((n) => n.id), ['note-old']);
  assert.deepEqual(catalog.folders.map((f) => f.id), ['folder-old']);
});

test('deleting a note removes its mirror keys so a rebuild cannot resurrect it', async () => {
  const kv = makeKv({
    [NOTES_INDEX_KEY]: JSON.stringify(['note-a', 'note-b']),
    [`${NOTE_KEY_PREFIX}note-a`]: noteJson('note-a'),
    [`${NOTE_KEY_PREFIX}note-b`]: noteJson('note-b'),
  });
  const env = makeEnv({ kv });
  const store = createCatalogStore(env);
  await store.getCatalog();
  await store.mutate((catalog) => ({
    ...catalog,
    notes: catalog.notes.filter((n) => n.id !== 'note-a'),
  }));

  assert.equal(kv.map.has(`${NOTE_KEY_PREFIX}note-a`), false);
  assert.deepEqual(JSON.parse(kv.map.get(NOTES_INDEX_KEY)), ['note-b']);

  // A store rebuilt from the same kv (catalog file lost) must not bring the
  // deleted note back.
  const rebuilt = createCatalogStore(makeEnv({ kv }));
  const catalog = await rebuilt.getCatalog();
  assert.deepEqual(catalog.notes.map((n) => n.id), ['note-b']);
});

test('mutations persist to both the catalog file and the mirror', async () => {
  const env = makeEnv();
  const store = createCatalogStore(env);
  await store.mutate((catalog) => ({
    ...catalog,
    notes: [JSON.parse(noteJson('note-new')), ...catalog.notes],
  }));

  const persisted = parseCatalog(env.catalogFile);
  assert.deepEqual(persisted.notes.map((n) => n.id), ['note-new']);
  assert.equal(env.kv.map.has(`${NOTE_KEY_PREFIX}note-new`), true);
  assert.deepEqual(JSON.parse(env.kv.map.get(NOTES_INDEX_KEY)), ['note-new']);
});

test('a failing catalog file write still leaves data readable in-session and mirrored', async () => {
  const env = makeEnv({ failCatalogWrites: true });
  const store = createCatalogStore(env);
  await store.mutate((catalog) => ({
    ...catalog,
    notes: [JSON.parse(noteJson('note-a')), ...catalog.notes],
  }));

  const catalog = await store.getCatalog();
  assert.deepEqual(catalog.notes.map((n) => n.id), ['note-a']);
  assert.equal(env.kv.map.has(`${NOTE_KEY_PREFIX}note-a`), true);

  // After a relaunch (fresh store, no catalog file) the mirror restores it.
  const rebuilt = createCatalogStore(makeEnv({ kv: env.kv }));
  const restored = await rebuilt.getCatalog();
  assert.deepEqual(restored.notes.map((n) => n.id), ['note-a']);
});

test('reconciliation does not duplicate notes already in the catalog', async () => {
  const env = makeEnv({
    catalogFile: JSON.stringify({
      version: 1,
      notes: [JSON.parse(noteJson('note-a'))],
      folders: [],
    }),
    bodyFiles: ['note-a'],
  });
  const store = createCatalogStore(env);
  const catalog = await store.getCatalog();
  assert.equal(catalog.notes.length, 1);
  assert.equal(catalog.notes[0].title, 'Title note-a');
});

test('a body file missing from a valid catalog is restored with its mirror metadata, not a stub', async () => {
  // Covers a stale catalog file (e.g. after a version downgrade/upgrade
  // cycle): the note is absent from the catalog, but its kv record survived.
  const kv = makeKv({
    [`${NOTE_KEY_PREFIX}note-fresh`]: noteJson('note-fresh', { folderId: 'folder-a' }),
  });
  const env = makeEnv({
    kv,
    catalogFile: JSON.stringify({
      version: 1,
      notes: [],
      folders: [JSON.parse(folderJson('folder-a'))],
    }),
    bodyFiles: ['note-fresh'],
  });
  const store = createCatalogStore(env);
  const catalog = await store.getCatalog();
  assert.equal(catalog.notes.length, 1);
  assert.equal(catalog.notes[0].title, 'Title note-fresh');
  assert.equal(catalog.notes[0].folderId, 'folder-a');
});

test('concurrent mutations are serialized and both apply', async () => {
  const store = createCatalogStore(makeEnv());
  await Promise.all([
    store.mutate((catalog) => ({
      ...catalog,
      notes: [JSON.parse(noteJson('note-1')), ...catalog.notes],
    })),
    store.mutate((catalog) => ({
      ...catalog,
      notes: [JSON.parse(noteJson('note-2')), ...catalog.notes],
    })),
  ]);
  const catalog = await store.getCatalog();
  assert.deepEqual(catalog.notes.map((n) => n.id).sort(), ['note-1', 'note-2']);
});

test('parseCatalog rejects garbage and skips malformed entries', () => {
  assert.equal(parseCatalog('not json'), null);
  assert.equal(parseCatalog('42'), null);
  assert.equal(parseCatalog('{"notes": "nope", "folders": []}'), null);

  const mixed = parseCatalog(
    JSON.stringify({
      version: 1,
      notes: [JSON.parse(noteJson('note-a')), { id: '' }, 'junk', null],
      folders: [JSON.parse(folderJson('folder-a')), 7],
    }),
  );
  assert.deepEqual(mixed.notes.map((n) => n.id), ['note-a']);
  assert.deepEqual(mixed.folders.map((f) => f.id), ['folder-a']);
});

test('kv index order is preserved; unindexed survivors sort by recency after it', async () => {
  const kv = makeKv({
    [NOTES_INDEX_KEY]: JSON.stringify(['note-b', 'note-a']),
    [`${NOTE_KEY_PREFIX}note-a`]: noteJson('note-a'),
    [`${NOTE_KEY_PREFIX}note-b`]: noteJson('note-b'),
    [`${NOTE_KEY_PREFIX}note-stray`]: noteJson('note-stray', {
      updatedAt: '2026-05-01T00:00:00.000Z',
    }),
  });
  const store = createCatalogStore(makeEnv({ kv }));
  const catalog = await store.getCatalog();
  assert.deepEqual(
    catalog.notes.map((n) => n.id),
    ['note-b', 'note-a', 'note-stray'],
  );
});

test('empty folders index with surviving folder records still lists folders', async () => {
  const kv = makeKv({
    [FOLDERS_INDEX_KEY]: '###',
    [`${FOLDER_KEY_PREFIX}folder-a`]: folderJson('folder-a'),
  });
  const store = createCatalogStore(makeEnv({ kv }));
  const catalog = await store.getCatalog();
  assert.deepEqual(catalog.folders.map((f) => f.id), ['folder-a']);
});

test('REPRO: a PDF note saved before the app container moved is re-pointed at its PDF and healed on disk', async () => {
  // iOS moves the app container on updates and iCloud restores. The stored
  // pdfUri still named the old container, so the native PDF background could
  // not load it: annotations stayed visible but the PDF vanished.
  const stale = 'file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/pdfs/note-pdf.pdf';
  const catalogFile = JSON.stringify({
    version: 1,
    notes: [
      { id: 'note-pdf', title: 'Lecture', folderId: null, createdAt: 'x', updatedAt: 'x', backgroundType: 'pdf', pdfUri: stale, thumbnailUri: null },
      { id: 'note-plain', title: 'Plain', folderId: null, createdAt: 'x', updatedAt: 'x', backgroundType: 'plain', pdfUri: null, thumbnailUri: null },
    ],
    folders: [],
    deletedNoteIds: {},
  });
  const env = makeEnv({ catalogFile, bodyFiles: ['note-pdf', 'note-plain'] });

  const catalog = await createCatalogStore(env).getCatalog();

  const pdfNote = catalog.notes.find((n) => n.id === 'note-pdf');
  assert.equal(pdfNote.pdfUri, 'file:///documents/pdfs/note-pdf.pdf');
  assert.equal(catalog.notes.find((n) => n.id === 'note-plain').pdfUri, null);
  const persisted = JSON.parse(env.catalogFile).notes.find((n) => n.id === 'note-pdf');
  assert.equal(persisted.pdfUri, 'file:///documents/pdfs/note-pdf.pdf');
});
