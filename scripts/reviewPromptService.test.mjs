import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createPromiseQueue } from '../src/utils/promiseQueue.ts';

const key = '@opennotes:reviewPrompt:v1';
const minute = 60 * 1000;
const day = 24 * 60 * minute;
const source = ts.transpileModule(
  readFileSync(new URL('../src/services/reviewPromptService.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function harness(initial) {
  let now = Date.parse('2026-01-01T00:00:00Z');
  let raw = initial ? JSON.stringify(initial) : null;
  const calls = [];
  const store = {
    available: true,
    action: true,
    fail: false,
    async isAvailableAsync() { return this.available; },
    async hasAction() { return this.action; },
    async requestReview() {
      if (this.fail) throw new Error('native request failed');
      calls.push(now);
    },
  };
  const storage = {
    async getItem(requestedKey) {
      assert.equal(requestedKey, key);
      return raw;
    },
    async setItem(requestedKey, value) {
      assert.equal(requestedKey, key);
      raw = value;
    },
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    __DEV__: false,
    Date: Clock,
    require(name) {
      if (name === '@react-native-async-storage/async-storage') return { default: storage };
      if (name === 'expo-store-review') return store;
      if (name === '../utils/promiseQueue') return { createPromiseQueue };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return {
    ...exports, calls, store,
    advance(ms) { now += ms; },
    state() { return JSON.parse(raw); },
    async signals(...signals) {
      await Promise.all(signals.map(exports.recordReviewSignal));
    },
  };
}

test('creator use prompts at 15 minutes without five unique notes or Discord', async () => {
  const h = harness();
  await h.signals('note_created', 'note_created', 'note_saved', 'note_saved', 'note_saved');
  h.advance(15 * minute - 1);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 0);
  h.advance(1);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 1);
  assert.equal(h.state().pendingPositiveMoment, false);
});

test('steady use and successful export independently qualify', async () => {
  for (const signals of [
    [...Array(5).fill('note_saved'), ...Array(3).fill('note_opened')],
    ['note_exported', 'note_saved', 'note_saved'],
  ]) {
    const h = harness();
    await h.signals(...signals);
    h.advance(15 * minute);
    await h.requestReviewAfterPositiveMoment();
    assert.equal(h.calls.length, 1);
  }
});

test('insufficient usage does not prompt even after seven days', async () => {
  const h = harness();
  await h.signals('note_created', 'note_opened', 'note_saved');
  h.advance(7 * day);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 0);
});

test('concurrent signals and requests preserve counts and request only once', async () => {
  const h = harness();
  await h.signals('note_created', 'note_created', ...Array(8).fill('note_saved'));
  assert.equal(h.state().notesSaved, 8);
  h.advance(15 * minute);
  await Promise.all(Array.from({ length: 5 }, () => h.requestReviewAfterPositiveMoment()));
  assert.equal(h.calls.length, 1);
});

test('cooldown requires 120 days and a new action, with a three-request cap', async () => {
  const h = harness();
  await h.signals('note_exported', 'note_saved', 'note_saved');
  h.advance(15 * minute);
  await h.requestReviewAfterPositiveMoment();
  h.advance(120 * day);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 1);
  await h.signals('note_saved');
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 2);
  await h.signals('note_saved');
  h.advance(120 * day - 1);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 2);
  h.advance(1);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 3);
  await h.signals('note_saved');
  h.advance(120 * day);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 3);
});

test('unavailable or failed native requests remain eligible for retry', async () => {
  const h = harness();
  await h.signals('note_exported', 'note_saved', 'note_saved');
  h.advance(15 * minute);
  h.store.available = false;
  await h.requestReviewAfterPositiveMoment();
  h.store.available = true;
  h.store.action = false;
  await h.requestReviewAfterPositiveMoment();
  h.store.action = true;
  h.store.fail = true;
  await assert.rejects(h.requestReviewAfterPositiveMoment(), /native request failed/);
  assert.equal(h.state().promptCount, 0);
  assert.equal(h.state().pendingPositiveMoment, true);
  h.store.fail = false;
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 1);
});

test('restored service honors review history from the original release', async () => {
  const h = harness({
    firstSeenAt: '2025-01-01T00:00:00Z',
    lastPromptedAt: '2025-12-31T00:00:00Z',
    promptCount: 1,
    notesCreated: 2,
    notesSaved: 3,
    pendingPositiveMoment: true,
  });
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 0);
  h.advance(119 * day);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 1);
  assert.equal(h.state().promptCount, 2);
});

test('manual rating works immediately and starts the automatic cooldown', async () => {
  const h = harness();
  assert.equal(await h.requestManualReview(), true);
  await h.signals('note_exported', 'note_saved', 'note_saved');
  h.advance(15 * minute);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 1);
  h.advance(120 * day);
  await h.requestReviewAfterPositiveMoment();
  assert.equal(h.calls.length, 2);
});
