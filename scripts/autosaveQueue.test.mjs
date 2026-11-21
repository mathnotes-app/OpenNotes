import assert from 'node:assert/strict';
import test from 'node:test';
import {createAutosaveQueue} from '../src/hooks/autosaveQueue.ts';

const wait = ms => new Promise(done => setTimeout(done, ms));
const superseded = error => error.message === 'Document changed during capture';
const harness = (save) => {
  const statuses = [];
  const queue = createAutosaveQueue({save, onStatus: s => statuses.push(s), isEnabled: () => true, debounceMs: 5,
    isSuperseded: superseded});
  return {queue, statuses};
};

test('a change during a save waits for it instead of writing concurrently', async () => {
  const order = [];
  let release;
  let calls = 0;
  const {queue} = harness(async () => {
    const call = ++calls;
    order.push(`start ${call}`);
    if (call === 1) await new Promise(done => {release = done;});
    order.push(`end ${call}`);
  });
  queue.schedule();
  await wait(15);
  queue.schedule();
  await wait(15);
  assert.deepEqual(order, ['start 1']);
  release();
  await queue.flushNow();
  assert.deepEqual(order, ['start 1', 'end 1', 'start 2', 'end 2']);
});

test('a save invalidated by newer ink reports pending, then saves the newer ink', async () => {
  let calls = 0;
  let queueRef;
  const {queue, statuses} = harness(async () => {
    if (++calls === 1) {
      queueRef.schedule();
      throw new Error('Document changed during capture');
    }
  });
  queueRef = queue;
  queue.schedule();
  await wait(15);
  assert.equal(statuses.includes('error'), false);
  await wait(15);
  await queue.flushNow();
  assert.equal(calls, 2);
  assert.equal(statuses.at(-1), 'saved');
});

test('a failure with no newer change is reported and retried on flush', async () => {
  let calls = 0;
  const {queue, statuses} = harness(async () => {
    if (++calls === 1) throw new Error('disk full');
  });
  queue.schedule();
  await wait(15);
  assert.equal(statuses.at(-1), 'error');
  assert.equal(await queue.flushNow(), true);
  assert.equal(calls, 2);
  assert.equal(statuses.at(-1), 'saved');
});

test('a real failure is reported even while newer ink is pending', async () => {
  let calls = 0;
  let queueRef;
  const {queue, statuses} = harness(async () => {
    if (++calls === 1) {
      queueRef.schedule();
      throw new Error('disk full');
    }
  });
  queueRef = queue;
  queue.schedule();
  await wait(15);
  assert.ok(statuses.includes('error'));
  await queue.flushNow();
  assert.equal(statuses.at(-1), 'saved');
});

test('flush without changes does not save', async () => {
  let calls = 0;
  const {queue} = harness(async () => { calls++; });
  assert.equal(await queue.flushNow(), true);
  assert.equal(calls, 0);
});
