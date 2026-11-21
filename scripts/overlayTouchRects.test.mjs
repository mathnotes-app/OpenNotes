import assert from 'node:assert/strict';
import test from 'node:test';
import {selectedOverlayTouchRects} from '../src/utils/overlayTouchRects.ts';
const layout = {pageWidth: 820, pageHeight: 1061, contentPadding: 16, containerWidth: 1020};
const pages = [{id: 'one'}, {id: 'two', insertedElements: [{id: 'image', x: 280, y: -70, width: 180, height: 140, rotation: 90}],
  textBoxes: [{id: 'text', x: 200, y: -100, width: 240, height: 140}]}];
test('a rotated crossing image excludes its body and controls while leaving the right margin scrollable', () => {
  const [rect] = selectedOverlayTouchRects(pages, {type: 'image', pageIndex: 1, id: 'image'}, layout);
  assert.deepEqual(rect, {left: 364, right: 576, top: 891, bottom: 1203});
  assert.ok(rect.right < layout.containerWidth - 50);
});
test('text above its owner page blocks the actual body rather than the owner page', () => {
  const [rect] = selectedOverlayTouchRects(pages, {type: 'text', pageIndex: 1, id: 'text'}, layout);
  assert.equal(rect.left, 264);
  assert.equal(rect.top, 881);
  assert.equal(rect.bottom, 1153);
});
test('no selection and missing/deleted selections do not block navigation', () => {
  assert.deepEqual(selectedOverlayTouchRects(pages, null, layout), []);
  assert.deepEqual(selectedOverlayTouchRects(pages, {type: 'image', pageIndex: 1, id: 'missing'}, layout), []);
});
