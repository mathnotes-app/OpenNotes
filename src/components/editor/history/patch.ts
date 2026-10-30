import type { NotebookPage } from '@mathnotes/mobile-ink';

type Collection = 'insertedElements' | 'textBoxes';
type Item = { id: string; [key: string]: unknown };
type Change = { pageId: string; collection: Collection; id: string; index: number;
  replace?: Item | null; set?: Record<string, unknown>; unset?: string[] };
type Patch = { format: 'opennotes-overlay-1'; changes: Change[] };
const collections: Collection[] = ['insertedElements', 'textBoxes'];
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const items = (page: NotebookPage, key: Collection) => (page[key] ?? []) as unknown as Item[];

/** History records only changed overlay fields; ink and derived metadata stay current. */
export function overlayPatches(before: NotebookPage[], after: NotebookPage[]): {before: string; after: string} | null {
  if (before.length !== after.length || before.some((page, i) => page.id !== after[i]?.id)) {
    throw new Error('Overlay edits cannot change notebook pages');
  }
  const backward: Change[] = [], forward: Change[] = [];
  before.forEach((page, pageIndex) => {
    for (const collection of collections) {
      const oldItems = items(page, collection), newItems = items(after[pageIndex], collection);
      if (oldItems === newItems) continue;
      if (new Set(oldItems.map(item => item.id)).size !== oldItems.length ||
          new Set(newItems.map(item => item.id)).size !== newItems.length) {
        throw new Error('Overlay IDs must be unique within a page');
      }
      const oldMap = new Map(oldItems.map((item, index) => [item.id, {item, index}]));
      const newMap = new Map(newItems.map((item, index) => [item.id, {item, index}]));
      const retainedBefore = oldItems.filter(item => newMap.has(item.id)).map(item => item.id);
      const retainedAfter = newItems.filter(item => oldMap.has(item.id)).map(item => item.id);
      if (!same(retainedBefore, retainedAfter)) throw new Error('Overlay ordering must use zIndex');
      for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
        const old = oldMap.get(id), next = newMap.get(id);
        if (old?.item === next?.item) continue;
        const common = {pageId: page.id, collection, id, index: old?.index ?? next!.index};
        if (!old || !next) {
          backward.push({...common, replace: old?.item ?? null});
          forward.push({...common, replace: next?.item ?? null});
          continue;
        }
        const toBefore: Change = {...common, set: {}, unset: []};
        const toAfter: Change = {...common, set: {}, unset: []};
        for (const key of new Set([...Object.keys(old.item), ...Object.keys(next.item)])) {
          if (key === 'updatedAt' || key === 'id' || same(old.item[key], next.item[key])) continue;
          if (forbidden.has(key)) throw new Error('Invalid overlay property');
          if (old.item[key] === undefined) toBefore.unset!.push(key);
          else toBefore.set![key] = old.item[key];
          if (next.item[key] === undefined) toAfter.unset!.push(key);
          else toAfter.set![key] = next.item[key];
        }
        if (Object.keys(toAfter.set!).length || toAfter.unset!.length) {
          backward.push(toBefore); forward.push(toAfter);
        }
      }
    }
  });
  return forward.length ? {
    before: JSON.stringify({format: 'opennotes-overlay-1', changes: backward}),
    after: JSON.stringify({format: 'opennotes-overlay-1', changes: forward}),
  } : null;
}

export function applyOverlayPatch(pages: NotebookPage[], payload: string): NotebookPage[] {
  const patch: Patch = JSON.parse(payload);
  if (patch?.format !== 'opennotes-overlay-1' || !Array.isArray(patch.changes)) {
    throw new Error('Unrecognized overlay history');
  }
  let next = pages;
  for (const change of patch.changes) {
    if (!change || !collections.includes(change.collection) || typeof change.id !== 'string' ||
        typeof change.pageId !== 'string' || !Number.isSafeInteger(change.index) || change.index < 0) {
      throw new Error('Invalid overlay history entry');
    }
    const pageIndex = next.findIndex(page => page.id === change.pageId);
    if (pageIndex < 0) throw new Error('Overlay history refers to a removed page');
    const existing = items(next[pageIndex], change.collection);
    const index = existing.findIndex(item => item.id === change.id);
    const updated = [...existing];
    if ('replace' in change) {
      if (change.replace === null) {
        if (index >= 0) updated.splice(index, 1);
      } else {
        if (!isRecord(change.replace) || change.replace.id !== change.id ||
            Object.keys(change.replace).some(key => forbidden.has(key))) throw new Error('Invalid overlay replacement');
        const value = {...change.replace};
        // A restored in-flight figure must restart compilation, not wait on a cancelled job.
        if (value.type === 'latex-figure' && value.renderStatus === 'rendering') value.renderStatus = 'pending';
        if (index >= 0) updated[index] = value;
        else updated.splice(Math.min(change.index, updated.length), 0, value);
      }
    } else {
      if (index < 0 || !isRecord(change.set) || !Array.isArray(change.unset)) throw new Error('Overlay history target is missing');
      const keys = [...Object.keys(change.set), ...change.unset];
      if (keys.some(key => typeof key !== 'string' || forbidden.has(key) || key === 'id')) throw new Error('Invalid overlay property');
      const value = {...updated[index], ...change.set};
      for (const key of change.unset) delete value[key];
      updated[index] = value;
    }
    next = next.map((page, i) => i === pageIndex ? {...page, [change.collection]: updated} as NotebookPage : page);
  }
  return next;
}
