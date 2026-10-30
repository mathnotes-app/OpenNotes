import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as continuousAssets from '../src/utils/continuousAssets.ts';

// Exercise the real Pressable handler; native locationX/Y are already local
// to the transformed overlay, regardless of the viewport zoom and scroll.
function harness(transform, pageCount = 3, customPages) {
  const created = [];
  const selected = [];
  const updates = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
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
    'react-native-reanimated': {useSharedValue: value => ({value})},
    'react-native': {
      View: 'View', Pressable: 'Pressable', Keyboard: { dismiss() {} },
      StyleSheet: { absoluteFill: {}, create: (styles) => styles },
    },
    './TextBoxOverlay': { TextBoxOverlay: 'TextBoxOverlay' },
    './ImageInsertOverlay': { ImageInsertOverlay: 'ImageInsertOverlay' },
    '../../hooks/useViewportTransform': viewport,
    '../../utils/continuousAssets': continuousAssets,
  });
  const tree = OverlayLayer({
    store: { getSnapshot: () => transform },
    pages: customPages ?? Array.from({ length: pageCount }, (_, i) => ({ id: String(i) })),
    pageWidth: 820, pageHeight: 1061, activeTool: 'text', activeColor: '#123456',
    selection: null,
    onCreateTextBoxId: () => 'new-text',
    onCreateTextBox: (pageIndex, box) => created.push({ pageIndex, x: box.x, y: box.y }),
    onSelectionChange: (value) => selected.push(value),
    onUpdateInsertedElement: (owner, id, patch) => updates.push({ owner, id, patch }),
    onUpdateTextBox: (owner, id, patch) => updates.push({ owner, id, patch }),
  });
  return {
    created, selected, tree, updates,
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


test('cross-page overlays edit the original asset through notebook coordinates', () => {
  const pages = [{ id: '0' }, { id: '1', insertedElements: [
    { id: 'image', type: 'image', x: 10, y: 1000, width: 200, height: 200 },
  ], textBoxes: [{ id: 'text', x: 10, y: -50, width: 200, height: 100 }] }, { id: '2' }];
  const h = harness({ scale: 1, translateX: 0, translateY: 0 }, 3, pages);
  const host = h.tree.children[1][1];
  const image = host.children[0][0];
  const text = host.children[1][0];
  assert.equal(image.props.element.y, 2061);
  assert.equal(text.props.textBox.y, 1011);
  assert.equal(image.props.pageHeight, 3183);
  image.props.onUpdate({ y: 900 });
  text.props.onCommit({ y: 2000, isEditing: false });
  assert.equal(h.updates[0].owner, 1);
  assert.equal(h.updates[0].id, 'image');
  assert.equal(h.updates[0].patch.y, -161);
  assert.equal(h.updates[1].patch.y, 939);
  assert.equal(pages[1].insertedElements[0].y, 1000);
});

test('image layering compares every owner page and does not add page clipping views', () => {
  const pages = [
    { id: '0', insertedElements: [{ id: 'a', type: 'image', zIndex: -4 }] },
    { id: '1', insertedElements: [{ id: 'b', type: 'image', zIndex: 20 }] },
  ];
  const h = harness({ scale: 1 }, 2, pages);
  assert.equal(h.tree.children[0].props.style[1].zIndex, -5);
  const first = h.tree.children[1][0];
  assert.equal(first.props.style, undefined);
  first.children[0][0].props.onBringToFront();
  assert.equal(h.updates[0].patch.zIndex, 21);
  const second = h.tree.children[1][1];
  second.children[0][0].props.onSendToBack();
  assert.equal(h.updates[1].patch.zIndex, -5);
});
