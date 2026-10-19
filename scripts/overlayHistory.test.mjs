import assert from 'node:assert/strict';
import test from 'node:test';
import {overlayPatches, applyOverlayPatch} from '../src/components/editor/history/patch.ts';
import {createOverlayTransactions} from '../src/components/editor/history/transactions.ts';
const fixture = () => [{id: 'page', title: 'Page', rotation: 0, data: 'ink', textBoxes: [
  {id: 'text', x: 0, y: -30, width: 100, content: 'Note'}]}];
const move = y => pages => pages.map(page => ({...page, textBoxes: page.textBoxes.map(box => ({...box, y}))}));

test('undo/redo across a page boundary does not revert newly captured ink', () => {
  const before = fixture(), after = move(90)(before);
  const patch = overlayPatches(before, after);
  const newer = after.map(page => ({...page, data: 'new ink'}));
  const undone = applyOverlayPatch(newer, patch.before);
  assert.equal(undone[0].textBoxes[0].y, -30);
  assert.equal(undone[0].data, 'new ink');
  assert.deepEqual(applyOverlayPatch(undone, patch.after), newer);
});
test('save waits for two queued native edits in order', async () => {
  let pages = fixture(), resolve;
  const first = new Promise(done => {resolve = done;});
  let calls = 0;
  const queue = createOverlayTransactions({read: () => pages, write: next => {pages = next;},
    record: async () => ++calls === 1 ? first : true});
  const a = queue.commit(move(10));
  const saved = queue.flush();
  await Promise.resolve();
  const b = queue.commit(move(20));
  assert.equal(pages[0].textBoxes[0].y, -30);
  resolve(true);
  await saved;
  assert.equal(pages[0].textBoxes[0].y, 20);
  assert.equal(queue.hasPending(), false);
  await Promise.all([a, b]);
});
test('rejected native edits leave the saved overlay unchanged', async () => {
  let pages = fixture();
  const before = pages;
  const queue = createOverlayTransactions({read: () => pages, write: next => {pages = next;}, record: async () => false});
  await assert.rejects(queue.commit(move(20)), /could not record/);
  assert.equal(pages, before);
});
test('invalid patches do not partially mutate source objects', () => {
  const pages = fixture();
  const patch = {format: 'opennotes-overlay-1', changes: [
    {pageId: 'page', collection: 'textBoxes', id: 'text', index: 0, set: {y: 20}, unset: []},
    {pageId: 'page', collection: 'textBoxes', id: 'missing', index: 0, set: {y: 20}, unset: []},
  ]};
  assert.throws(() => applyOverlayPatch(pages, JSON.stringify(patch)), /missing/);
  assert.equal(pages[0].textBoxes[0].y, -30);
});
