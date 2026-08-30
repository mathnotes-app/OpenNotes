import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_CATALOG_NAME,
  BACKUP_MANIFEST_NAME,
  BACKUP_SUBDIR,
  checkRestoreAvailable,
  isSafeRelPath,
  mergeBackupCatalog,
  noteIdForRel,
  restoreFromBackup,
  resumeRestoreIfIncomplete,
  syncBackup,
} from '../src/services/backupEngine.ts';
import { RECOVERED_NOTE_TITLE } from '../src/services/catalogStore.ts';

const CONTAINER = '/icloud/Documents';
const BACKUP_DIR = `${CONTAINER}/${BACKUP_SUBDIR}`;

function catalogRaw(noteIds, deletedNoteIds = {}) {
  return JSON.stringify({
    version: 1,
    deletedNoteIds,
    notes: noteIds.map((id) => ({
      id,
      title: `Title ${id}`,
      folderId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      backgroundType: 'plain',
      pdfUri: null,
      thumbnailUri: null,
    })),
    folders: [],
  });
}

/**
 * Fake environment backed by two in-memory file maps:
 * - local: rel path -> { contents, size, mtimeMs }
 * - backup: abs path -> contents (data files store the local contents string)
 */
function makeEnv({
  enabled = true,
  container = CONTAINER,
  local = {},
  backup = {},
  localCatalog = null,
  failBackupWrites = false,
  failCopyRels = new Set(),
  undownloadableRels = new Set(),
} = {}) {
  const localFiles = new Map(Object.entries(local));
  const backupFiles = new Map(Object.entries(backup));
  const env = {
    localFiles,
    backupFiles,
    localCatalog,
    warnings: [],
    async getContainerDir() {
      return container;
    },
    async isEnabled() {
      return enabled;
    },
    async readLocalCatalog() {
      return env.localCatalog;
    },
    async writeLocalCatalog(raw) {
      env.localCatalog = raw;
      return true;
    },
    async listLocalDataFiles() {
      return [...localFiles.entries()].map(([rel, f]) => ({
        rel,
        size: f.size,
        mtimeMs: f.mtimeMs,
      }));
    },
    async localFileExists(rel) {
      return localFiles.has(rel);
    },
    async copyLocalToBackup(rel, backupDir) {
      if (failBackupWrites || failCopyRels.has(rel)) return false;
      const file = localFiles.get(rel);
      if (!file) return false;
      backupFiles.set(`${backupDir}/${rel}`, file.contents);
      return true;
    },
    async copyBackupToLocal(backupDir, rel) {
      const contents = backupFiles.get(`${backupDir}/${rel}`);
      if (contents === undefined) return false;
      localFiles.set(rel, { contents, size: contents.length, mtimeMs: 1 });
      return true;
    },
    async readBackupFile(abs) {
      return backupFiles.has(abs) ? backupFiles.get(abs) : null;
    },
    async writeBackupFileAtomic(abs, contents) {
      if (failBackupWrites) return false;
      backupFiles.set(abs, contents);
      return true;
    },
    async deleteBackupFile(abs) {
      backupFiles.delete(abs);
    },
    async listBackupDataFiles(backupDir) {
      const prefix = `${backupDir}/`;
      return [...backupFiles.keys()]
        .filter(
          (abs) =>
            abs.startsWith(prefix) &&
            !abs.endsWith(BACKUP_MANIFEST_NAME) &&
            !abs.endsWith(BACKUP_CATALOG_NAME),
        )
        .map((abs) => abs.slice(prefix.length));
    },
    async ensureDownloaded(abs) {
      const prefix = `${BACKUP_DIR}/`;
      const rel = abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
      return backupFiles.has(abs) && !undownloadableRels.has(rel);
    },
    now() {
      return 1756400000000;
    },
    warn(message) {
      env.warnings.push(message);
    },
  };
  return env;
}

function localFile(contents, mtimeMs = 100) {
  return { contents, size: contents.length, mtimeMs };
}

function manifestIn(env) {
  return JSON.parse(env.backupFiles.get(`${BACKUP_DIR}/${BACKUP_MANIFEST_NAME}`));
}

test('first sync mirrors every data file plus catalog and manifest', async () => {
  const env = makeEnv({
    local: {
      'notebook-bodies/note-a.body': localFile('body-a'),
      'pdfs/note-a.pdf': localFile('pdf-a'),
      'images/note-a/img1.png': localFile('img-1'),
    },
    localCatalog: catalogRaw(['note-a']),
  });
  const result = await syncBackup(env);
  assert.deepEqual(result, { status: 'ok', copied: 3, removed: 0 });
  assert.equal(env.backupFiles.get(`${BACKUP_DIR}/notebook-bodies/note-a.body`), 'body-a');
  assert.equal(env.backupFiles.get(`${BACKUP_DIR}/${BACKUP_CATALOG_NAME}`), catalogRaw(['note-a']));
  const manifest = manifestIn(env);
  assert.equal(manifest.noteCount, 1);
  assert.equal(Object.keys(manifest.files).length, 3);
});

test('unchanged files are not re-copied on the next sync', async () => {
  const env = makeEnv({
    local: { 'notebook-bodies/note-a.body': localFile('body-a') },
    localCatalog: catalogRaw(['note-a']),
  });
  await syncBackup(env);
  const second = await syncBackup(env);
  assert.deepEqual(second, { status: 'ok', copied: 0, removed: 0 });
});

test('a changed file (same size, new mtime) is re-copied', async () => {
  const env = makeEnv({
    local: { 'notebook-bodies/note-a.body': localFile('body-a', 100) },
    localCatalog: catalogRaw(['note-a']),
  });
  await syncBackup(env);
  env.localFiles.set('notebook-bodies/note-a.body', localFile('body-b', 200));
  const result = await syncBackup(env);
  assert.deepEqual(result, { status: 'ok', copied: 1, removed: 0 });
  assert.equal(env.backupFiles.get(`${BACKUP_DIR}/notebook-bodies/note-a.body`), 'body-b');
});

test('a tombstoned (user-deleted) note is removed from the backup', async () => {
  const env = makeEnv({
    local: {
      'notebook-bodies/note-a.body': localFile('body-a'),
      'notebook-bodies/note-b.body': localFile('body-b'),
    },
    localCatalog: catalogRaw(['note-a', 'note-b']),
  });
  await syncBackup(env);
  env.localFiles.delete('notebook-bodies/note-b.body');
  env.localCatalog = catalogRaw(['note-a'], { 'note-b': '2026-08-30T00:00:00.000Z' });
  const result = await syncBackup(env);
  assert.deepEqual(result, { status: 'ok', copied: 0, removed: 1 });
  assert.equal(env.backupFiles.has(`${BACKUP_DIR}/notebook-bodies/note-b.body`), false);
  assert.equal(manifestIn(env).noteCount, 1);
});

test('DISASTER REPRO: an empty local library never wipes a backup that has notes', async () => {
  // The exact simulator-caught race: fresh install after app deletion, the
  // restore prompt is still on screen, and a sync runs. It must refuse.
  const source = makeEnv({
    local: { 'notebook-bodies/note-a.body': localFile('body-a') },
    localCatalog: catalogRaw(['note-a']),
  });
  await syncBackup(source);

  const freshInstall = makeEnv({ backup: Object.fromEntries(source.backupFiles) });
  const result = await syncBackup(freshInstall);
  assert.deepEqual(result, { status: 'skipped-empty-local' });
  assert.equal(
    freshInstall.backupFiles.get(`${BACKUP_DIR}/notebook-bodies/note-a.body`),
    'body-a',
  );
  assert.equal(
    freshInstall.backupFiles.get(`${BACKUP_DIR}/${BACKUP_CATALOG_NAME}`),
    catalogRaw(['note-a']),
  );
  // And the restore must still be offered afterwards.
  const offer = await checkRestoreAvailable(freshInstall);
  assert.equal(offer.noteCount, 1);
});

test('EDGE: a file missing locally WITHOUT a tombstone is preserved in the backup', async () => {
  // "Not now" after reinstall, then the user creates a new note: the old
  // backup bodies have no tombstones and must survive the next sync.
  const source = makeEnv({
    local: {
      'notebook-bodies/note-old1.body': localFile('old-1'),
      'notebook-bodies/note-old2.body': localFile('old-2'),
      'pdfs/note-old1.pdf': localFile('pdf-old'),
    },
    localCatalog: catalogRaw(['note-old1', 'note-old2']),
  });
  await syncBackup(source);

  const afterReinstall = makeEnv({
    backup: Object.fromEntries(source.backupFiles),
    local: { 'notebook-bodies/note-new.body': localFile('new') },
    localCatalog: catalogRaw(['note-new']),
  });
  const result = await syncBackup(afterReinstall);
  assert.deepEqual(result, { status: 'ok', copied: 1, removed: 0 });
  assert.equal(
    afterReinstall.backupFiles.get(`${BACKUP_DIR}/notebook-bodies/note-old1.body`),
    'old-1',
  );
  assert.equal(
    afterReinstall.backupFiles.get(`${BACKUP_DIR}/pdfs/note-old1.pdf`),
    'pdf-old',
  );
  assert.equal(
    afterReinstall.backupFiles.get(`${BACKUP_DIR}/notebook-bodies/note-new.body`),
    'new',
  );
  // The preserved files stay in the manifest so a later restore finds them.
  const manifest = manifestIn(afterReinstall);
  assert.ok(manifest.files['notebook-bodies/note-old1.body']);
  assert.ok(manifest.files['notebook-bodies/note-new.body']);
});

test('noteIdForRel maps every mirrored layout back to its note id', () => {
  assert.equal(noteIdForRel('notebook-bodies/note-a.body'), 'note-a');
  assert.equal(noteIdForRel('pdfs/note-a.pdf'), 'note-a');
  assert.equal(noteIdForRel('images/note-a/img1.png'), 'note-a');
  assert.equal(noteIdForRel('notebook-bodies/note%20b.body'), 'note b');
  assert.equal(noteIdForRel('unknown/file.txt'), null);
  assert.equal(noteIdForRel('manifest.json'), null);
});

test('EDGE: backup disabled does nothing', async () => {
  const env = makeEnv({
    enabled: false,
    local: { 'notebook-bodies/note-a.body': localFile('a') },
  });
  assert.deepEqual(await syncBackup(env), { status: 'disabled' });
  assert.equal(env.backupFiles.size, 0);
});

test('EDGE: iCloud unavailable reports unavailable and never throws', async () => {
  const env = makeEnv({
    container: null,
    local: { 'notebook-bodies/note-a.body': localFile('a') },
  });
  assert.deepEqual(await syncBackup(env), { status: 'unavailable' });
});

test('EDGE: iCloud appearing later catches up with a full mirror', async () => {
  const env = makeEnv({
    container: null,
    local: { 'notebook-bodies/note-a.body': localFile('a') },
    localCatalog: catalogRaw(['note-a']),
  });
  assert.equal((await syncBackup(env)).status, 'unavailable');
  env.getContainerDir = async () => CONTAINER;
  const result = await syncBackup(env);
  assert.deepEqual(result, { status: 'ok', copied: 1, removed: 0 });
});

test('EDGE: a copy failure is partial, keeps the stale mirror entry, and retries next sync', async () => {
  const failCopyRels = new Set(['notebook-bodies/note-b.body']);
  const env = makeEnv({
    local: {
      'notebook-bodies/note-a.body': localFile('a'),
      'notebook-bodies/note-b.body': localFile('b'),
    },
    localCatalog: catalogRaw(['note-a', 'note-b']),
    failCopyRels,
  });
  const first = await syncBackup(env);
  assert.equal(first.status, 'partial');
  assert.equal(first.failed, 1);
  failCopyRels.clear();
  const second = await syncBackup(env);
  assert.deepEqual(second, { status: 'ok', copied: 1, removed: 0 });
  assert.equal(env.backupFiles.get(`${BACKUP_DIR}/notebook-bodies/note-b.body`), 'b');
});

test('EDGE: total backup write failure never affects local data and reports partial', async () => {
  const env = makeEnv({
    local: { 'notebook-bodies/note-a.body': localFile('a') },
    localCatalog: catalogRaw(['note-a']),
    failBackupWrites: true,
  });
  const result = await syncBackup(env);
  assert.equal(result.status, 'partial');
  assert.equal(env.localCatalog, catalogRaw(['note-a']));
});

test('EDGE: corrupt backup manifest triggers a full harmless re-mirror', async () => {
  const env = makeEnv({
    local: { 'notebook-bodies/note-a.body': localFile('a') },
    localCatalog: catalogRaw(['note-a']),
    backup: { [`${BACKUP_DIR}/${BACKUP_MANIFEST_NAME}`]: '{{{corrupt' },
  });
  const result = await syncBackup(env);
  assert.deepEqual(result, { status: 'ok', copied: 1, removed: 0 });
  assert.equal(manifestIn(env).version, 1);
});

test('EDGE: unsafe relative paths are never copied in either direction', async () => {
  assert.equal(isSafeRelPath('../escape'), false);
  assert.equal(isSafeRelPath('/abs'), false);
  assert.equal(isSafeRelPath('a/../../b'), false);
  assert.equal(isSafeRelPath('notebook-bodies/ok.body'), true);

  const env = makeEnv({
    backup: {
      [`${BACKUP_DIR}/${BACKUP_MANIFEST_NAME}`]: JSON.stringify({
        version: 1,
        files: { '../../etc/passwd': { size: 1, mtimeMs: 1 } },
        lastBackupAt: 1,
        noteCount: 1,
      }),
      [`${BACKUP_DIR}/../../etc/passwd`]: 'evil',
    },
  });
  const result = await restoreFromBackup(env);
  assert.equal(env.localFiles.has('../../etc/passwd'), false);
  assert.equal(result.restored, 0);
});

test('restore is offered only for an empty library with a non-empty backup', async () => {
  const backup = {
    [`${BACKUP_DIR}/${BACKUP_CATALOG_NAME}`]: catalogRaw(['note-a']),
    [`${BACKUP_DIR}/${BACKUP_MANIFEST_NAME}`]: JSON.stringify({
      version: 1,
      files: { 'notebook-bodies/note-a.body': { size: 1, mtimeMs: 1 } },
      lastBackupAt: 123,
      noteCount: 1,
    }),
    [`${BACKUP_DIR}/notebook-bodies/note-a.body`]: 'a',
  };

  const emptyLocal = makeEnv({ backup });
  const offer = await checkRestoreAvailable(emptyLocal);
  assert.deepEqual(offer, { noteCount: 1, lastBackupAt: 123 });

  // EDGE: local notes exist in the catalog -> never offer.
  const withCatalog = makeEnv({ backup, localCatalog: catalogRaw(['note-x']) });
  assert.equal(await checkRestoreAvailable(withCatalog), null);

  // EDGE: local body files exist even without a catalog -> never offer.
  const withBodies = makeEnv({
    backup,
    local: { 'notebook-bodies/note-x.body': localFile('x') },
  });
  assert.equal(await checkRestoreAvailable(withBodies), null);

  // EDGE: empty backup -> nothing to offer.
  const emptyBackup = makeEnv({});
  assert.equal(await checkRestoreAvailable(emptyBackup), null);

  // EDGE: backup disabled -> no offer.
  const disabled = makeEnv({ backup, enabled: false });
  assert.equal(await checkRestoreAvailable(disabled), null);

  // EDGE: iCloud unavailable -> no offer.
  const unavailable = makeEnv({ backup, container: null });
  assert.equal(await checkRestoreAvailable(unavailable), null);
});

test('EDGE: restore offer works from file listing when manifest and catalog are corrupt', async () => {
  const env = makeEnv({
    backup: {
      [`${BACKUP_DIR}/${BACKUP_MANIFEST_NAME}`]: 'corrupt{{',
      [`${BACKUP_DIR}/${BACKUP_CATALOG_NAME}`]: 'also-corrupt{{',
      [`${BACKUP_DIR}/notebook-bodies/note-a.body`]: 'a',
    },
  });
  const offer = await checkRestoreAvailable(env);
  assert.deepEqual(offer, { noteCount: 1, lastBackupAt: null });
});

test('restore copies everything, installs the catalog, and round-trips a full backup', async () => {
  const source = makeEnv({
    local: {
      'notebook-bodies/note-a.body': localFile('body-a'),
      'pdfs/note-a.pdf': localFile('pdf-a'),
      'images/note-a/img1.png': localFile('img-1'),
    },
    localCatalog: catalogRaw(['note-a']),
  });
  await syncBackup(source);

  // Same backup contents, fresh empty device (the delete-and-reinstall case).
  const fresh = makeEnv({ backup: Object.fromEntries(source.backupFiles) });
  const result = await restoreFromBackup(fresh);
  assert.deepEqual(result, { status: 'ok', restored: 3 });
  assert.equal(fresh.localFiles.get('notebook-bodies/note-a.body').contents, 'body-a');
  const restoredCatalog = JSON.parse(fresh.localCatalog);
  assert.deepEqual(restoredCatalog.notes.map((n) => n.id), ['note-a']);
  assert.equal(restoredCatalog.notes[0].title, 'Title note-a');
});

test('EDGE: restore never overwrites files that already exist locally', async () => {
  const env = makeEnv({
    local: { 'notebook-bodies/note-a.body': localFile('local-version') },
    backup: {
      [`${BACKUP_DIR}/notebook-bodies/note-a.body`]: 'backup-version',
      [`${BACKUP_DIR}/notebook-bodies/note-b.body`]: 'body-b',
    },
  });
  const result = await restoreFromBackup(env);
  assert.deepEqual(result, { status: 'ok', restored: 1 });
  assert.equal(env.localFiles.get('notebook-bodies/note-a.body').contents, 'local-version');
});

test('EDGE: restore merges into a non-empty local catalog without clobbering local notes', async () => {
  const env = makeEnv({
    localCatalog: catalogRaw(['note-local']),
    backup: {
      [`${BACKUP_DIR}/${BACKUP_CATALOG_NAME}`]: catalogRaw(['note-backup']),
      [`${BACKUP_DIR}/notebook-bodies/note-backup.body`]: 'b',
    },
  });
  await restoreFromBackup(env);
  const merged = JSON.parse(env.localCatalog);
  const ids = merged.notes.map((n) => n.id).sort();
  assert.deepEqual(ids, ['note-backup', 'note-local']);
  assert.equal(merged.notes.find((n) => n.id === 'note-local').title, 'Title note-local');
});

test('EDGE: evicted (undownloadable) files are counted as failures, rest still restores', async () => {
  const env = makeEnv({
    backup: {
      [`${BACKUP_DIR}/notebook-bodies/note-a.body`]: 'a',
      [`${BACKUP_DIR}/notebook-bodies/note-b.body`]: 'b',
    },
    undownloadableRels: new Set(['notebook-bodies/note-b.body']),
  });
  const result = await restoreFromBackup(env);
  assert.equal(result.status, 'partial');
  assert.equal(result.restored, 1);
  assert.equal(result.failed, 1);
  assert.equal(env.localFiles.has('notebook-bodies/note-a.body'), true);
});

test('EDGE: restore with corrupt backup catalog still restores body files', async () => {
  const env = makeEnv({
    backup: {
      [`${BACKUP_DIR}/${BACKUP_CATALOG_NAME}`]: 'corrupt{{',
      [`${BACKUP_DIR}/notebook-bodies/note-a.body`]: 'a',
    },
  });
  const result = await restoreFromBackup(env);
  assert.deepEqual(result, { status: 'ok', restored: 1 });
  assert.equal(env.localCatalog, null);
});

test('mergeBackupCatalog: stubs healed, user notes kept, backup-only added, tombstones respected', () => {
  const local = JSON.parse(catalogRaw(['note-user', 'note-stub']));
  local.notes[1].title = RECOVERED_NOTE_TITLE;
  local.deletedNoteIds = { 'note-deleted': '2026-08-30T00:00:00.000Z' };
  const backup = JSON.parse(catalogRaw(['note-stub', 'note-cloud-only', 'note-deleted']));
  const merged = mergeBackupCatalog(JSON.stringify(local), JSON.stringify(backup));
  const titles = Object.fromEntries(merged.notes.map((n) => [n.id, n.title]));
  assert.equal(titles['note-user'], 'Title note-user');
  assert.equal(titles['note-stub'], 'Title note-stub');
  assert.equal(titles['note-cloud-only'], 'Title note-cloud-only');
  assert.equal('note-deleted' in titles, false);
  assert.deepEqual(Object.keys(merged.deletedNoteIds), ['note-deleted']);
});

test('DEVICE REPRO: partial restore (cloud metadata race) resumes to completion on later launches', async () => {
  // Fresh install on a real device: catalog synced fast, bodies were still
  // cloud-only. The restore installed titles but no content. The resume pass
  // must detect notes-without-bodies and pull them once downloadable.
  const backup = {
    [`${BACKUP_DIR}/${BACKUP_CATALOG_NAME}`]: catalogRaw(['note-a', 'note-b']),
    [`${BACKUP_DIR}/${BACKUP_MANIFEST_NAME}`]: JSON.stringify({
      version: 1,
      files: {
        'notebook-bodies/note-a.body': { size: 1, mtimeMs: 1 },
        'notebook-bodies/note-b.body': { size: 1, mtimeMs: 1 },
      },
      lastBackupAt: 5,
      noteCount: 2,
    }),
    [`${BACKUP_DIR}/notebook-bodies/note-a.body`]: 'body-a',
    [`${BACKUP_DIR}/notebook-bodies/note-b.body`]: 'body-b',
  };
  const undownloadable = new Set([
    'notebook-bodies/note-a.body',
    'notebook-bodies/note-b.body',
  ]);
  const env = makeEnv({ backup, undownloadableRels: undownloadable });

  const first = await restoreFromBackup(env);
  assert.equal(first.status, 'partial');
  assert.equal(first.restored, 0);
  // Titles arrived via catalog merge, content did not - the reported state.
  assert.equal(JSON.parse(env.localCatalog).notes.length, 2);
  assert.equal(env.localFiles.size, 0);

  // Next launch, iCloud metadata has synced: resume completes the restore.
  undownloadable.clear();
  const resumed = await resumeRestoreIfIncomplete(env);
  assert.equal(resumed.status, 'ok');
  assert.equal(resumed.restored, 2);
  assert.equal(env.localFiles.get('notebook-bodies/note-a.body').contents, 'body-a');

  // Fully healed: nothing further to resume.
  assert.equal(await resumeRestoreIfIncomplete(env), null);
});

test('EDGE: resume does nothing for an empty library (prompt path owns that) or complete one', async () => {
  const empty = makeEnv({
    backup: { [`${BACKUP_DIR}/notebook-bodies/note-a.body`]: 'a' },
  });
  assert.equal(await resumeRestoreIfIncomplete(empty), null);

  const complete = makeEnv({
    local: { 'notebook-bodies/note-a.body': localFile('a') },
    localCatalog: catalogRaw(['note-a']),
    backup: { [`${BACKUP_DIR}/notebook-bodies/note-a.body`]: 'a' },
  });
  assert.equal(await resumeRestoreIfIncomplete(complete), null);
});

test('EDGE: a manifest-only rel (file gone from iCloud) never causes an endless resume loop', async () => {
  const env = makeEnv({
    local: { 'notebook-bodies/note-a.body': localFile('a') },
    localCatalog: catalogRaw(['note-a', 'note-gone']),
    backup: {
      [`${BACKUP_DIR}/${BACKUP_MANIFEST_NAME}`]: JSON.stringify({
        version: 1,
        files: { 'notebook-bodies/note-gone.body': { size: 1, mtimeMs: 1 } },
        lastBackupAt: 1,
        noteCount: 2,
      }),
    },
  });
  // The file exists only in the stale manifest, not in any listing: gone.
  assert.equal(await resumeRestoreIfIncomplete(env), null);
});

test('EDGE: stub titles heal from the backup catalog even when all bodies are present', async () => {
  // The device race running the other way: bodies synced first, catalog was
  // cloud-only during the first restore, reconciliation created stubs.
  const local = JSON.parse(catalogRaw(['note-a']));
  local.notes[0].title = RECOVERED_NOTE_TITLE;
  const env = makeEnv({
    local: { 'notebook-bodies/note-a.body': localFile('a') },
    localCatalog: JSON.stringify(local),
    backup: {
      [`${BACKUP_DIR}/${BACKUP_CATALOG_NAME}`]: catalogRaw(['note-a']),
      [`${BACKUP_DIR}/notebook-bodies/note-a.body`]: 'a',
    },
  });
  const result = await resumeRestoreIfIncomplete(env);
  assert.equal(result.status, 'ok');
  assert.equal(JSON.parse(env.localCatalog).notes[0].title, 'Title note-a');
});

test('EDGE: an env that throws unexpectedly yields partial, not a crash', async () => {
  const env = makeEnv({ local: { 'notebook-bodies/a.body': localFile('a') } });
  env.listLocalDataFiles = async () => {
    throw new Error('filesystem exploded');
  };
  const result = await syncBackup(env);
  assert.equal(result.status, 'partial');
});
