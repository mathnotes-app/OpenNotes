import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCanvasAudit } from './verify-canvas-audit.mjs';
const names = ['testDensePagesAndKeyboardInteractionAudit', 'testDensePanZoomInteractionAudit',
  'testDenseWritingDuringAutosaveInteractionAudit'];
const report = (scenario, phase) => ({scenario, phase, completed: true, initialLoadPresented: true,
  renderFrameCount: 60, mainQueueDelayMs: {count: 100, max: 2}, mainQueueStallCount: 0,
  renderMs: {count: 60, max: 12, p95: 8}});
const recordings = () => names.flatMap(scenario => [report(scenario, 'startup'),
  ...Array.from({length: scenario.includes('PagesAndKeyboard') ? 12 : 1}, () => report(scenario, 'interaction'))]);
const pan = reports => reports.find(r => r.scenario === names[1] && r.phase === 'interaction');
test('requires complete startup and every interaction window, including confirmed first presentation', () => {
  assert.throws(() => verifyCanvasAudit([]), /Missing native/);
  const reports = recordings();
  reports.splice(1, 1);
  assert.throws(() => verifyCanvasAudit(reports), /Missing native/);
  const unpresented = recordings();
  unpresented[0].initialLoadPresented = false;
  assert.throws(() => verifyCanvasAudit(unpresented), /Incomplete/);
  const cancelled = recordings();
  cancelled[0].completed = false;
  assert.throws(() => verifyCanvasAudit(cancelled), /Incomplete/);
});
test('rejects stalls and slow pan/zoom rendering even when UI assertions passed', () => {
  const stalled = recordings();
  stalled[0].mainQueueStallCount = 1;
  assert.throws(() => verifyCanvasAudit(stalled), /stall exceeded/);
  const delayed = recordings();
  delayed[0].mainQueueDelayMs.max = 101;
  assert.throws(() => verifyCanvasAudit(delayed), /stall exceeded/);
  const slow = recordings();
  pan(slow).renderMs = {count: 60, max: 40, p95: 25};
  assert.throws(() => verifyCanvasAudit(slow), /frame budget/);
  const slowWriting = recordings();
  slowWriting.at(-1).renderMs = {count: 60, max: 40, p95: 25};
  assert.throws(() => verifyCanvasAudit(slowWriting), /frame budget/);
});
test('accepts measured UI-only windows without inventing ink frames', () => {
  const reports = recordings();
  for (const r of reports.filter(r => r.scenario === names[0] && r.phase === 'interaction')) {
    r.renderFrameCount = 0;
    r.renderMs = {count: 0, max: 0, p95: 0};
  }
  assert.equal(verifyCanvasAudit(reports).length, 17);
});
