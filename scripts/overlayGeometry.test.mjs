import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeFromCorner} from '../src/components/editor/overlayGeometry.ts';

test('resizing overflow retains its owner-relative negative top', () => {
  assert.deepEqual(resizeFromCorner('bottom-right', 280, -70, 180, 140, 25, 20, 820, false),
    {x: 280, y: -70, width: 205, height: 160});
});
test('top-left resizing preserves opposite corner across a page break', () => {
  const next = resizeFromCorner('top-left', 280, -70, 180, 140, -20, -30, 820, false);
  assert.deepEqual(next, {x: 260, y: -100, width: 200, height: 170});
  assert.equal(next.y + next.height, 70);
});
test('aspect-ratio resize can span more than one page', () => {
  const next = resizeFromCorner('bottom-right', 0, -100, 400, 1000, 400, 1000, 820, true);
  assert.equal(next.y, -100);
  assert.equal(next.width, 800);
  assert.equal(next.height, 2000);
});
test('minimum size and horizontal boundary remain enforced', () => {
  const next = resizeFromCorner('top-left', 280, -70, 180, 140, 1000, 1000, 820, false);
  assert.equal(next.width, 50); assert.equal(next.height, 50);
  assert.equal(next.x + next.width, 460); assert.equal(next.y + next.height, 70);
});

import {localPointerDelta, anchorRotatedFrame, cropFromEdge} from '../src/components/editor/overlayGeometry.ts';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function corner(frame, u, v, degrees) {
  const angle = degrees * Math.PI / 180;
  const x = (u - .5) * frame.width, y = (v - .5) * frame.height;
  return {x: frame.x + frame.width / 2 + x * Math.cos(angle) - y * Math.sin(angle),
    y: frame.y + frame.height / 2 + x * Math.sin(angle) + y * Math.cos(angle)};
}
for (const angle of [0, 45, 90, 180, 270]) {
  test(`rotated resize at ${angle} degrees fixes the opposite corner`, () => {
    const before = {x: 280, y: -70, width: 180, height: 140};
    for (const handle of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
      const dx = handle.includes('left') ? -25 : 25, dy = handle.includes('top') ? -20 : 20;
      const radians = angle * Math.PI / 180;
      const delta = localPointerDelta((dx * Math.cos(radians) - dy * Math.sin(radians)) * 2,
        (dx * Math.sin(radians) + dy * Math.cos(radians)) * 2, 2, angle);
      near(delta.x, dx); near(delta.y, dy);
      const local = resizeFromCorner(handle, before.x, before.y, before.width, before.height, delta.x, delta.y, 820, false);
      const next = anchorRotatedFrame(before, local, angle);
      const u = handle.includes('left') ? 1 : 0, v = handle.includes('top') ? 1 : 0;
      const oldCorner = corner(before, u, v, angle), newCorner = corner(next, u, v, angle);
      near(oldCorner.x, newCorner.x); near(oldCorner.y, newCorner.y);
      near(next.width, 205); near(next.height, 160);
    }
  });
  test(`crop and uncrop at ${angle} degrees preserve image alignment`, () => {
    const before = {x: 280, y: -70, width: 180, height: 140};
    const cropped = cropFromEdge(before, {x: 0, y: 0, width: 1, height: 1}, 'top-left', 25, 20, angle);
    const oldCorner = corner(before, 1, 1, angle), newCorner = corner(cropped.frame, 1, 1, angle);
    near(oldCorner.x, newCorner.x); near(oldCorner.y, newCorner.y);
    near(cropped.crop.width * 180, cropped.frame.width);
    near(cropped.crop.height * 140, cropped.frame.height);
    const restored = cropFromEdge(cropped.frame, cropped.crop, 'top-left', -1000, -1000, angle);
    for (const key of ['x', 'y', 'width', 'height']) near(restored.frame[key], before[key]);
    near(restored.crop.x, 0); near(restored.crop.y, 0);
    near(restored.crop.width, 1); near(restored.crop.height, 1);
  });
}
test('crop minimum stays synchronized with normalized crop for large assets', () => {
  const next = cropFromEdge({x: 0, y: -20, width: 4000, height: 3000},
    {x: 0, y: 0, width: 1, height: 1}, 'bottom-right', -10000, -10000, 0);
  near(next.crop.width, .02); near(next.crop.height, .02);
  near(next.frame.width, 80); near(next.frame.height, 60);
});
