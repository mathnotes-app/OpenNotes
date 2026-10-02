import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCrashReport,
  formatCrashReport,
  parseCrashReport,
} from '../src/services/crashReport.ts';

const env = {
  appVersion: '1.3.3 (16)',
  platform: 'ios',
  osVersion: '26.6',
  deviceIdiom: 'pad',
  now: new Date('2026-10-02T12:00:00.000Z'),
};

test('a thrown TypeError is recorded with its name, message and stack', () => {
  const error = new TypeError("Cannot read property 'id' of undefined");

  const report = buildCrashReport(error, 'global', env);

  assert.equal(report.message, "TypeError: Cannot read property 'id' of undefined");
  assert.match(report.stack, /TypeError/);
  assert.equal(report.occurredAt, '2026-10-02T12:00:00.000Z');
  assert.equal(report.appVersion, '1.3.3 (16)');
});

test('a thrown non-Error value is still recorded', () => {
  const report = buildCrashReport('plain string', 'render', env);

  assert.equal(report.message, 'string: plain string');
  assert.equal(report.stack, null);
  assert.equal(report.source, 'render');
});

test('very long stacks are truncated so the report stays small', () => {
  const error = new Error('deep');
  error.stack = 'x'.repeat(10000);

  const report = buildCrashReport(error, 'global', env);

  assert.equal(report.stack.length, 4000);
});

test('a stored report round-trips, and corrupt files are ignored', () => {
  const report = buildCrashReport(new RangeError('Invalid array length'), 'global', env);

  assert.deepEqual(parseCrashReport(JSON.stringify(report)), report);
  assert.equal(parseCrashReport('{not json'), null);
  assert.equal(parseCrashReport('{"stack":"no message"}'), null);
  assert.equal(parseCrashReport('null'), null);
});

test('the shared text names the app version, system and error', () => {
  const report = buildCrashReport(new Error('boom'), 'render', env);

  const text = formatCrashReport(report);

  assert.match(text, /^OpenNotes error report/);
  assert.match(text, /App: 1\.3\.3 \(16\)/);
  assert.match(text, /System: ios 26\.6 \(pad\)/);
  assert.match(text, /Where: screen rendering/);
  assert.match(text, /Error: boom/);
});

test('an error message carrying a large payload is capped in the shared report', () => {
  const report = buildCrashReport(new Error('x'.repeat(50000)), 'global', env);

  assert.equal(report.message.length, 1000);
});
