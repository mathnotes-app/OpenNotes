import assert from 'node:assert/strict';
import test from 'node:test';
import { assetInNotebook, patchForOwner, assetsForPage, indexAssetsByPage, duplicateAssetPosition } from '../src/utils/continuousAssets.ts';

test('moving an asset across its owner boundary preserves its identity and local storage', () => {
  const original = { id: 'image', y: 950, height: 200 };
  const view = assetInNotebook(original, 2, 1000);
  assert.equal(view.y, 2950);
  const patch = patchForOwner({ y: 1850, width: 120 }, 2, 1000);
  assert.deepEqual(patch, { y: -150, width: 120 });
  assert.equal(assetInNotebook({ ...original, ...patch }, 2, 1000).y, 1850);
  assert.equal(original.y, 950);
  assert.deepEqual(patchForOwner({ width: 40 }, 2, 1000), { width: 40 });
});

test('a crossing image projects into both pages without changing the saved object', () => {
  const image = { id: 'a', x: 50, y: 900, width: 100, height: 200, type: 'image' };
  const pages = [{ insertedElements: [image] }, {}, {}];
  assert.equal(assetsForPage(pages, 0, 1000).insertedElements[0].y, 900);
  assert.equal(assetsForPage(pages, 1, 1000).insertedElements[0].y, -100);
  assert.equal(assetsForPage(pages, 2, 1000).insertedElements.length, 0);
  assert.equal(image.y, 900);
  assert.equal(pages[1].insertedElements, undefined);
});

test('rotation can cross a boundary even when the unrotated rectangle does not', () => {
  const pages = [{ insertedElements: [{ id: 'r', y: 880, width: 400, height: 80, rotation: 90 }] }, {}];
  assert.equal(assetsForPage(pages, 1, 1000).insertedElements.length, 1);
});

test('text moved above its owner exports on the earlier page and across its seam', () => {
  const box = { id: 't', y: -100, height: 200, width: 100, content: 'hello' };
  const pages = [{}, { textBoxes: [box] }];
  assert.equal(assetsForPage(pages, 0, 1000).textBoxes[0].y, 900);
  assert.equal(assetsForPage(pages, 1, 1000).textBoxes[0].y, -100);
});


test('large export indexing visits each asset once and preserves exact seam boundaries', () => {
  let widthReads = 0;
  const pages = Array.from({ length: 1000 }, (_, i) => ({ insertedElements: [{
    id: String(i), y: 900, height: 100,
    get width() { widthReads++; return 100; },
  }] }));
  const indexed = indexAssetsByPage(pages, 1000);
  assert.equal(indexed.length, 1000);
  assert.ok(widthReads <= 4000, 'indexing must not revisit all assets for each page');
  assert.ok(indexed.every((page) => page.insertedElements.length === 1));
  assert.equal(indexed[999].insertedElements[0].id, '999');
});

test('invalid geometry fails explicitly instead of producing an incomplete PDF', () => {
  assert.throws(() => indexAssetsByPage([{ insertedElements: [{ y: NaN }] }], 1000), /invalid geometry/);
});


test('duplication keeps cross-page and negative-owner positions, bounded by the notebook', () => {
  assert.deepEqual(duplicateAssetPosition({ x: 20, y: 950, width: 100, height: 200 }, 0, 600, 1000, 3), { x: 40, y: 970 });
  assert.deepEqual(duplicateAssetPosition({ x: 20, y: -150, width: 100, height: 200 }, 2, 600, 1000, 3), { x: 40, y: -130 });
  assert.deepEqual(duplicateAssetPosition({ x: 550, y: 900, width: 100, height: 200 }, 2, 600, 1000, 3), { x: 500, y: 800 });
});
