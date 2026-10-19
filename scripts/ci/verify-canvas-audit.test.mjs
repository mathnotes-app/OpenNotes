import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCanvasAudit } from './verify-canvas-audit.mjs';
const report = scenario => ({scenario, renderFrameCount: 60, mainQueueDelayMs: {count: 100, max: 2},
  mainQueueStallCount: 0, renderMs: {count: 60, max: 12, p95: 8}});
const pages = () => report('testDensePagesAndKeyboardInteractionAudit');
const pan = () => report('testDensePanZoomInteractionAudit');
const writing = () => report('testDenseWritingDuringAutosaveInteractionAudit');
test('requires real recordings from every interaction workload', () => {
  assert.throws(() => verifyCanvasAudit([]), /Missing native recording/);
  assert.throws(() => verifyCanvasAudit([pages()]), /Missing native recording/);
  assert.throws(() => verifyCanvasAudit([pages(), pan()]), /Missing native recording/);
  assert.throws(() => verifyCanvasAudit([pages(), {...pan(), mainQueueDelayMs: undefined}]), /Incomplete/);
});
test('rejects stalls and slow pan/zoom rendering even when UI assertions passed', () => {
  assert.throws(() => verifyCanvasAudit([{...pages(), mainQueueStallCount: 1}, pan()]), /stall exceeded/);
  assert.throws(() => verifyCanvasAudit([{...pages(), mainQueueDelayMs: {count: 100, max: 101}}, pan()]), /stall exceeded/);
  assert.throws(() => verifyCanvasAudit([pages(), {...pan(), renderMs: {count: 60, max: 40, p95: 25}}]), /frame budget/);
});
test('accepts complete native timing evidence inside the budgets', () => {
  assert.equal(verifyCanvasAudit([pages(), pan(), writing()]).length, 3);
});
