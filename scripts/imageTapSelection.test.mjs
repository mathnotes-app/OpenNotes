import assert from 'node:assert/strict';
import test from 'node:test';
import { imageAtContentPoint } from '../src/utils/visualLayerOrder.ts';

const layout = {pageWidth: 820, pageHeight: 1000, contentPadding: 16, containerWidth: 1020};
const page = images => ({id: 'p', title: '', data: '', rotation: 0, insertedElements: images});
const image = (id, x, y, extra = {}) => ({id, type: 'image', x, y, width: 100, height: 80,
  sourceUri: 'file:///image.png', ...extra});

test('selects a finger-tapped image in viewport content coordinates', () => {
  const pages = [page([image('a', 200, 300)])];
  assert.deepEqual(imageAtContentPoint(pages, {x: 350, y: 356}, layout), {pageIndex: 0, id: 'a'});
  assert.equal(imageAtContentPoint(pages, {x: 250, y: 356}, layout), null);
});

test('chooses the visible top image and handles images crossing a page', () => {
  const pages = [page([image('old', 200, 970, {layerOrder: 5}), image('front', 200, 970, {layerOrder: 8})]), page([])];
  assert.deepEqual(imageAtContentPoint(pages, {x: 350, y: 1026}, layout), {pageIndex: 0, id: 'front'});
});

test('uses rotated image geometry and ignores missing images', () => {
  const pages = [page([image('rotated', 200, 300, {width: 200, height: 40, rotation: 90}),
    image('missing', 280, 270, {sourceUri: undefined, layerOrder: 999})])];
  assert.deepEqual(imageAtContentPoint(pages, {x: 400, y: 246}, layout), {pageIndex: 0, id: 'rotated'});
  assert.equal(imageAtContentPoint(pages, {x: 320, y: 336}, layout), null);
});
