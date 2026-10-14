import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real Pressable handler; native locationX/Y are already local
// to the transformed overlay, regardless of the viewport zoom and scroll.
function harness(transform, pageCount = 3) {
  const created = [];
  const selected = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useCallback: (fn) => fn,
    useEffect: () => {},
    useRef: (current) => ({ current }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  };
  react.default = react;
  function load(relative, dependencies = {}) {
    const exports = {};
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText, {
      exports,
      require(name) {
        if (name === 'react') return react;
        if (name in dependencies) return dependencies[name];
        throw new Error('Unexpected import: ' + name);
      },
    });
    return exports;
  }
  const viewport = load('../src/hooks/useViewportTransform.ts');
  const { OverlayLayer } = load('../src/components/editor/OverlayLayer.tsx', {
    'react-native': {
      View: 'View', Pressable: 'Pressable', Keyboard: { dismiss() {} },
      StyleSheet: { absoluteFill: {}, create: (styles) => styles },
    },
    './TextBoxOverlay': { TextBoxOverlay: 'TextBoxOverlay' },
    './ImageInsertOverlay': { ImageInsertOverlay: 'ImageInsertOverlay' },
    '../../hooks/useViewportTransform': viewport,
  });
  const tree = OverlayLayer({
    store: { getSnapshot: () => transform },
    pages: Array.from({ length: pageCount }, (_, i) => ({ id: String(i) })),
    pageWidth: 820, pageHeight: 1061, activeTool: 'text', activeColor: '#123456',
    selection: null,
    onCreateTextBoxId: () => 'new-text',
    onCreateTextBox: (pageIndex, box) => created.push({ pageIndex, x: box.x, y: box.y }),
    onSelectionChange: (value) => selected.push(value),
  });
  return {
    created, selected,
    tap: (x, y) => tree.children[0].props.onPress({ nativeEvent: { locationX: x, locationY: y } }),
  };
}

for (const transform of [
  { scale: 1, translateX: 0, translateY: 0 },
  { scale: 0.5, translateX: 16, translateY: -500 },
  { scale: 2, translateX: -240, translateY: -1700 },
]) {
  test(`text stays at the tapped page position at zoom ${transform.scale}`, () => {
    const h = harness(transform);
    h.tap(200, 200);
    h.tap(300, 1061 + 400);
    h.tap(400, 2 * 1061 + 500);
    assert.deepEqual(h.created, [
      { pageIndex: 0, x: 194, y: 188 },
      { pageIndex: 1, x: 294, y: 388 },
      { pageIndex: 2, x: 394, y: 488 },
    ]);
    assert.equal(h.selected[2].pageIndex, 2);
    assert.equal(h.selected[2].editing, true);
  });
}

test('page boundaries select the following page and edge offsets stay nonnegative', () => {
  const h = harness({ scale: 0.5, translateX: 16, translateY: -500 });
  h.tap(0, 0);
  h.tap(820, 1061);
  assert.deepEqual(h.created, [{ pageIndex: 0, x: 0, y: 0 }, { pageIndex: 1, x: 814, y: 0 }]);
});

test('taps outside the page content or with invalid coordinates do not create text', () => {
  const h = harness({ scale: 1, translateX: 0, translateY: 0 });
  for (const [x, y] of [[-1, 200], [821, 200], [200, -1], [200, 3183], [NaN, 20], [20, Infinity]]) h.tap(x, y);
  assert.equal(h.created.length, 0);
  assert.equal(h.selected.length, 0);
  const empty = harness({ scale: 1, translateX: 0, translateY: 0 }, 0);
  empty.tap(10, 10);
  assert.equal(empty.created.length, 0);
});
