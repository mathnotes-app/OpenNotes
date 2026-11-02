import assert from 'node:assert/strict';
import test from 'node:test';
import { insertImagePosition } from '../src/utils/insertImagePosition.ts';

test('inserts at the visible position after scrolling and zooming', () => {
  const transform = { scale: 2, translateX: -100, translateY: -2000, containerWidth: 1024, containerHeight: 1000 };
  assert.deepEqual(insertImagePosition(transform, 820, 1000, 4, 16, 200, 200, 0),
    { pageIndex: 1, x: 360, y: 384 });
});

test('clamps image placement to the notebook and handles a missing transform', () => {
  assert.deepEqual(insertImagePosition(null, 820, 1000, 3, 16, 200, 200, 2),
    { pageIndex: 2, x: 310, y: 400 });
  const transform = { scale: 1, translateX: 10000, translateY: 10000, containerWidth: 800, containerHeight: 1000 };
  assert.deepEqual(insertImagePosition(transform, 820, 1000, 3, 16, 200, 200, 0),
    { pageIndex: 0, x: 0, y: 0 });
});
