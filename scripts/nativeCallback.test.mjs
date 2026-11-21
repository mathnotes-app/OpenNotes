import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeCallback} from '../src/hooks/native-callback/index.ts';

test('retained native dispatchers use the latest consumer and release closed editors', () => {
  const bridge = createNativeCallback();
  const retained = bridge.invoke;
  const first = [], second = [];
  bridge.update(value => first.push(value));
  retained(1);
  bridge.update(value => second.push(value));
  retained(2);
  bridge.update(null);
  retained(3);
  assert.deepEqual(first, [1]);
  assert.deepEqual(second, [2]);
});

test('callback failures propagate rather than being silently ignored', () => {
  const bridge = createNativeCallback();
  bridge.update(() => { throw new Error('save failed'); });
  assert.throws(() => bridge.invoke(), /save failed/);
});
