import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLibraryLayout } from '../src/utils/libraryLayoutPreference.ts';

test('moves older installs to the compact layout', () => {
  assert.deepEqual(resolveLibraryLayout({ libraryLayout: 'grid' }), { layout: 'columns', migrate: true });
  assert.deepEqual(resolveLibraryLayout({}), { layout: 'columns', migrate: true });
});

test('keeps a layout explicitly chosen after migration', () => {
  assert.deepEqual(resolveLibraryLayout({ libraryLayout: 'grid', libraryLayoutVersion: 1 }), { layout: 'grid', migrate: false });
  assert.deepEqual(resolveLibraryLayout({ libraryLayout: 'columns', libraryLayoutVersion: 1 }), { layout: 'columns', migrate: false });
});
