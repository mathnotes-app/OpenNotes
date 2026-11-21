import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as paperSpacing from '../src/utils/paperSpacing.ts';

const source = ts.transpileModule(
  readFileSync(new URL('../src/services/notesRepo.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const ink = 'data:image/png;base64,aW5r';
const composite = 'data:image/png;base64,cGhvdG8=';
const photo = { id: 'photo', type: 'image', sourceUri: 'file:///photo.jpg', x: 20, y: 30, width: 100, height: 80 };
const body = () => ({ version: '1.0', pages: [{ id: 'page-1', data: '{"pages":{}}', previewUri: ink, insertedElements: [photo] }] });

function harness({ writeOk = true, renderFails = false, render = async () => composite, readKind = 'ok' } = {}) {
  let catalog = { notes: [{ id: 'note', createdAt: '2026-01-01', updatedAt: '2026-01-02', thumbnailUri: ink, backgroundType: 'plain' }] };
  let stored = body();
  let reads = 0;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name === './catalogEnv') return { catalogStore: {
        getCatalog: async () => structuredClone(catalog),
        mutate: async fn => { catalog = fn(catalog) ?? catalog; return catalog; },
      } };
      if (name === './noteBodyStorage') return {
        writeBody: async (_id, data) => { if (writeOk) stored = structuredClone(data); return writeOk; },
        readBody: async () => { reads += 1; return { kind: readKind, data: structuredClone(stored) }; },
      };
      if (name === './thumbnailService') return {
        THUMBNAIL_VERSION: 1,
        createPageThumbnail: async (...args) => {
          if (renderFails) throw new Error('Image decoder unavailable');
          return render(...args);
        },
      };
      if (name === '../i18n') return { t: { common: { untitled: 'Untitled' } } };
      if (name === '../utils/id') return {};
      if (name === '../utils/paperSpacing') return paperSpacing;
      if (name === './catalogStore') return {};
      if (name === './pdfStorage' || name === './imageInsertStorage') return {};
      throw new Error('Unexpected import: ' + name);
    },
  });
  return { ...exports, note: () => catalog.notes[0], stored: () => stored, reads: () => reads,
    removeNote: () => { catalog.notes = []; } };
}

test('saving uses a composed cover without flattening overlays into the note body', async () => {
  const h = harness();
  const original = body();
  const result = await h.saveNoteBody('note', original);
  assert.equal(result.ok, true);
  assert.equal(h.note().thumbnailUri, ink);
  assert.equal(h.note().thumbnailVersion, undefined);
  assert.equal(await h.getNoteThumbnail(h.note()), composite);
  assert.equal(h.note().thumbnailUri, composite);
  assert.equal(h.note().thumbnailVersion, 1);
  assert.deepEqual(h.stored(), original);
  assert.equal(h.stored().pages[0].previewUri, ink);
});

test('failed body writes leave the previous cover and metadata untouched', async () => {
  const h = harness({ writeOk: false });
  const before = structuredClone(h.note());
  assert.equal((await h.saveNoteBody('note', body())).ok, false);
  assert.deepEqual(h.note(), before);
});

test('thumbnail failure cannot fail a note save or discard its images', async () => {
  const h = harness({ renderFails: true });
  assert.equal((await h.saveNoteBody('note', body())).ok, true);
  assert.equal(h.stored().pages[0].insertedElements[0].sourceUri, photo.sourceUri);
  assert.equal(await h.getNoteThumbnail(h.note()), ink);
  assert.equal(h.note().thumbnailUri, ink);
  assert.notEqual(h.note().thumbnailVersion, 1);
});

test('legacy thumbnail repair leaves the note body and modification date untouched', async () => {
  const h = harness();
  const before = structuredClone(h.stored());
  assert.equal(await h.getNoteThumbnail(h.note()), composite);
  assert.equal(h.note().updatedAt, '2026-01-02');
  assert.equal(h.note().thumbnailVersion, 1);
  assert.deepEqual(h.stored(), before);
});

test('failed legacy thumbnail repair keeps the existing cover eligible for retry', async () => {
  const h = harness({ renderFails: true });
  assert.equal(await h.getNoteThumbnail(h.note()), ink);
  assert.notEqual(h.note().thumbnailVersion, 1);
});

test('image-only saves compose the first page even when no ink preview exists', async () => {
  const h = harness({ render: async page => page.insertedElements?.length ? composite : null });
  const original = body();
  delete original.pages[0].previewUri;
  assert.equal((await h.saveNoteBody('note', original)).ok, true);
  await h.getNoteThumbnail(h.note());
  assert.equal(h.note().thumbnailUri, composite);
  assert.equal(h.stored().pages[0].previewUri, undefined);
});

test('saving an image-only edit uses the new overlay data instead of the previous body', async () => {
  const h = harness({ render: async page => page.insertedElements[0].x === 300 ? composite : ink });
  const original = body();
  original.pages[0].insertedElements = [{ ...photo, x: 300 }];
  await h.saveNoteBody('note', original);
  await h.getNoteThumbnail(h.note());
  assert.equal(h.note().thumbnailUri, composite);
});

test('deleting all overlays restores the original ink-only cover', async () => {
  const h = harness({ render: async page => page.insertedElements?.length ? composite : page.previewUri });
  await h.saveNoteBody('note', body());
  await h.getNoteThumbnail(h.note());
  const original = body();
  original.pages[0].insertedElements = [];
  await h.saveNoteBody('note', original);
  await h.getNoteThumbnail(h.note());
  assert.equal(h.note().thumbnailUri, ink);
});

for (const readKind of ['unreadable', 'missing']) {
  test(`${readKind} legacy bodies retain their last thumbnail without being rewritten`, async () => {
    const h = harness({ readKind });
    const before = structuredClone(h.note());
    assert.equal(await h.getNoteThumbnail(h.note()), ink);
    assert.deepEqual(h.note(), before);
  });
}

test('current thumbnail versions do not re-read or rewrite legacy bodies', async () => {
  const h = harness();
  await h.updateMetadata('note', { thumbnailVersion: 1, thumbnailUri: composite });
  assert.equal(await h.getNoteThumbnail(h.note()), composite);
  assert.equal(h.reads(), 0);
});

test('a missing current-version thumbnail is regenerated', async () => {
  const h = harness();
  await h.updateMetadata('note', { thumbnailVersion: 1, thumbnailUri: null });
  assert.equal(await h.getNoteThumbnail(h.note()), composite);
  assert.equal(h.reads(), 1);
});

test('a new note without a saved body gets a blank page thumbnail', async () => {
  const h = harness({ readKind: 'missing', render: async page => page.data === '{"pages":{}}' ? composite : null });
  await h.updateMetadata('note', { thumbnailUri: null });
  assert.equal(await h.getNoteThumbnail(h.note()), composite);
});

test('changing a page background regenerates its thumbnail', async () => {
  const h = harness({ render: async (_page, background) => background === 'grid' ? composite : ink });
  await h.updateMetadata('note', { thumbnailVersion: 1, thumbnailUri: ink });
  await h.setNoteBackground('note', 'grid', null);
  assert.equal(h.note().thumbnailVersion, undefined);
  assert.equal(await h.getNoteThumbnail(h.note()), composite);
});

test('saving does not render thumbnails during drawing', async () => {
  let renders = 0;
  const h = harness({ render: async () => { renders++; return composite; } });
  await h.saveNoteBody('note', body());
  await h.saveNoteBody('note', body());
  assert.equal(renders, 0);
  await h.getNoteThumbnail(h.note());
  assert.equal(renders, 1);
});

test('an in-flight repair cannot replace a newer save even if its timestamp matches', async () => {
  let finishRender, startRender;
  const started = new Promise(resolve => { startRender = resolve; });
  const h = harness({ render: () => new Promise(resolve => { finishRender = resolve; startRender(); }) });
  const prior = structuredClone(h.note());
  const repairing = h.getNoteThumbnail(prior);
  await started;
  await h.saveNoteBody('note', body());
  await h.updateMetadata('note', { updatedAt: prior.updatedAt });
  finishRender(composite);
  assert.equal(await repairing, ink);
  assert.notEqual(h.note().thumbnailVersion, 1);
});

test('opening an editor cancels library thumbnail repairs without changing the note', async () => {
  let finishRender, startRender;
  const started = new Promise(resolve => { startRender = resolve; });
  const h = harness({ render: () => new Promise(resolve => { finishRender = resolve; startRender(); }) });
  const repairing = h.getNoteThumbnail(h.note());
  await started;
  h.cancelThumbnailRepairs();
  finishRender(composite);
  assert.equal(await repairing, ink);
  assert.notEqual(h.note().thumbnailVersion, 1);
});

test('an old thumbnail repair cannot overwrite a newer note save', async () => {
  let finishRender;
  let startRender;
  const started = new Promise(resolve => { startRender = resolve; });
  const h = harness({ render: () => new Promise(resolve => { finishRender = resolve; startRender(); }) });
  const repairing = h.getNoteThumbnail(structuredClone(h.note()));
  await started;
  await h.updateMetadata('note', { updatedAt: '2026-10-22', thumbnailUri: 'new-cover', thumbnailVersion: 1 });
  finishRender(composite);
  assert.equal(await repairing, 'new-cover');
  assert.equal(h.note().thumbnailUri, 'new-cover');
});

test('a repair completing after note deletion cannot resurrect the note', async () => {
  let finishRender;
  let startRender;
  const started = new Promise(resolve => { startRender = resolve; });
  const h = harness({ render: () => new Promise(resolve => { finishRender = resolve; startRender(); }) });
  const repairing = h.getNoteThumbnail(h.note());
  await started;
  h.removeNote();
  finishRender(composite);
  assert.equal(await repairing, null);
  assert.equal(h.note(), undefined);
});

test('duplicate card requests share a single repair of the same legacy cover', async () => {
  const h = harness();
  const first = h.getNoteThumbnail(h.note());
  const second = h.getNoteThumbnail(h.note());
  assert.equal(await first, composite);
  assert.equal(await second, composite);
  assert.equal(h.reads(), 1);
});
