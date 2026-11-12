import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createPromiseQueue } from '../src/utils/promiseQueue.ts';

const require = createRequire(import.meta.url);
const initCanvasKit = require('canvaskit-wasm/bin/full/canvaskit.js');
const kit = await initCanvasKit({ locateFile: file => require.resolve('canvaskit-wasm/bin/full/' + file) });
const { JsiSkApi } = require('../node_modules/@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia.js');
const Skia = JsiSkApi(kit);
const fonts = Skia.TypefaceFontProvider.Make();
const fontData = Skia.Data.fromBytes(readFileSync(require.resolve(
  '@shopify/react-native-skia/src/skia/__tests__/assets/Roboto-Regular.ttf',
)));
const font = Skia.Typeface.MakeFreeTypeFaceFromData(fontData);
fonts.registerFont(font, 'Roboto');
const makeParagraph = Skia.ParagraphBuilder.Make.bind(Skia.ParagraphBuilder);
Skia.ParagraphBuilder.Make = style => {
  const builder = makeParagraph(style, fonts);
  const pushStyle = builder.pushStyle.bind(builder);
  builder.pushStyle = textStyle => pushStyle({ ...textStyle, fontFamilies: ['Roboto'] });
  return builder;
};
const source = ts.transpileModule(
  readFileSync(new URL('../src/services/thumbnailService.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function solid(color, width = 20, height = 20) {
  const surface = Skia.Surface.Make(width, height);
  surface.getCanvas().clear(Skia.Color(color));
  const image = surface.makeImageSnapshot();
  const uri = 'data:image/png;base64,' + image.encodeToBase64();
  image.dispose();
  surface.dispose();
  return uri;
}

const white = solid('#ffffff');
const red = solid('#ff0000');
const blue = solid('#0000ff');
const black = solid('#000000');

function harness({
  nativeFails = false, nativeParagraphBuilder = false, nativeImage, density = 2,
  preparePdfForRendering, render = () => white,
} = {}) {
  const exports = {};
  const nativeCalls = [];
  vm.runInNewContext(source, { exports, require(name) {
    if (name === '../utils/promiseQueue') return { createPromiseQueue };
    if (name === 'react-native') return { PixelRatio: { get: () => density } };
    if (name === './pdfUtilsModule') return {
      PDFUtilsModule: nativeImage ? { readImageForThumbnail: nativeImage } : undefined,
      resolvePdfRenderUri: async uri => uri ? preparePdfForRendering?.(uri) ?? uri : undefined,
    };
    if (name === '@shopify/react-native-skia') return { Skia: nativeParagraphBuilder ? {
      ...Skia, ParagraphBuilder: { Make: (...args) => {
        const builder = Skia.ParagraphBuilder.Make(...args);
        builder.dispose = undefined;
        return builder;
      } },
    } : Skia, ClipOp: { Intersect: 1 } };
    if (name === '@mathnotes/mobile-ink') return { batchExportPages: async (...args) => {
      nativeCalls.push(args);
      if (nativeFails) throw new Error('Native renderer unavailable');
      return [render(...args)];
    } };
    throw new Error('Unexpected import: ' + name);
  } });
  return { ...exports, nativeCalls };
}

function page(elements = [], extra = {}) {
  return { id: 'page-1', data: '{"pages":{}}', previewUri: white, insertedElements: elements, ...extra };
}
function photo(sourceUri = red, extra = {}) {
  return { id: 'photo', type: 'image', sourceUri, x: 100, y: 100, width: 200, height: 200, rotation: 0, ...extra };
}
let lastRaster;
function pixel(uri, x, y) {
  if (lastRaster?.uri !== uri) {
    const data = Skia.Data.fromBase64(uri.split(',')[1]);
    const image = Skia.Image.MakeImageFromEncoded(data);
    lastRaster = { uri, width: image.width(), pixels: image.readPixels(0, 0, {
      width: image.width(), height: image.height(), colorType: 4, alphaType: 1,
    }) };
    image.dispose();
    data.dispose();
  }
  const offset = (y * lastRaster.width + x) * 4;
  return [...lastRaster.pixels.subarray(offset, offset + 4)];
}

test('legacy ink-only previews are returned byte-for-byte without rendering', async () => {
  const h = harness();
  assert.equal(await h.createPageThumbnail(page()), white);
  assert.equal(h.nativeCalls.length, 0);
  assert.equal(await h.createPageThumbnail(undefined), null);
});

test('a photo is visible at its page coordinates over the background', async () => {
  const result = await harness().createPageThumbnail(page([photo()]));
  assert.deepEqual(pixel(result, 100, 100), [255, 0, 0, 255]);
  assert.deepEqual(pixel(result, 10, 10), [255, 255, 255, 255]);
});

test('image-only notes acquire a background even without an ink preview', async () => {
  const h = harness();
  const result = await h.createPageThumbnail(page([photo()], { previewUri: undefined }), 'grid');
  assert.deepEqual(pixel(result, 100, 100), [255, 0, 0, 255]);
  assert.equal(h.nativeCalls[0][1][0], 'grid');
});

test('a moved or deleted photo does not remain in the composed thumbnail', async () => {
  const h = harness();
  const result = await h.createPageThumbnail(page([photo(red, { x: 400 })]));
  assert.deepEqual(pixel(result, 100, 100), [255, 255, 255, 255]);
  assert.deepEqual(pixel(result, 250, 100), [255, 0, 0, 255]);
  assert.equal(await h.createPageThumbnail(page()), white);
});

test('overlapping images respect their z-order', async () => {
  const result = await harness().createPageThumbnail(page([
    photo(blue, { id: 'front', zIndex: 5 }), photo(red, { id: 'back', zIndex: 1 }),
  ]));
  assert.deepEqual(pixel(result, 100, 100), [0, 0, 255, 255]);
});

test('legacy images without zIndex retain the editor sibling order beside explicit index one', async () => {
  const result = await harness().createPageThumbnail(page([
    photo(red, { id: 'front', zIndex: 1 }), photo(blue, { id: 'legacy' }),
  ]));
  assert.deepEqual(pixel(result, 100, 100), [255, 0, 0, 255]);
});

test('rotation is applied around the image center', async () => {
  const result = await harness().createPageThumbnail(page([photo(red, { width: 200, height: 100, rotation: 90 })]));
  assert.deepEqual(pixel(result, 100, 110), [255, 0, 0, 255]);
  assert.deepEqual(pixel(result, 60, 75), [255, 255, 255, 255]);
});

test('crop rectangles select the requested portion of an image', async () => {
  const surface = Skia.Surface.Make(20, 20);
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#ff0000'));
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#0000ff'));
  canvas.drawRect(Skia.XYWHRect(10, 0, 10, 20), paint);
  const image = surface.makeImageSnapshot();
  const uri = 'data:image/png;base64,' + image.encodeToBase64();
  const result = await harness().createPageThumbnail(page([photo(uri, {
    width: 100, height: 200, cropRect: { x: 0.5, y: 0, width: 0.5, height: 1 },
  })]));
  assert.deepEqual(pixel(result, 75, 100), [0, 0, 255, 255]);
  image.dispose(); surface.dispose(); paint.dispose();
});

test('handwriting remains below inserted images', async () => {
  const result = await harness().createPageThumbnail(page([photo()], { previewUri: black }));
  assert.deepEqual(pixel(result, 10, 10), [0, 0, 0, 255]);
  assert.deepEqual(pixel(result, 100, 100), [255, 0, 0, 255]);
});

test('rendering preserves the original notebook data including unknown legacy fields', async () => {
  const original = page([photo()], { legacyField: { original: true } });
  const snapshot = structuredClone(original);
  await harness().createPageThumbnail(original);
  assert.deepEqual(original, snapshot);
});

test('unreadable image assets report failure instead of caching an incomplete cover', async () => {
  await assert.rejects(harness().createPageThumbnail(page([photo('data:image/png;base64,invalid')])));
});

test('legacy HEIC files use the native decoder when Skia cannot read them', async () => {
  const h = harness({ nativeImage: async uri => {
    assert.equal(uri, 'file:///legacy/photo.heic');
    return blue;
  } });
  const result = await h.createPageThumbnail(page([photo('file:///legacy/photo.heic')]));
  assert.deepEqual(pixel(result, 100, 100), [0, 0, 255, 255]);
});

test('a failed native image fallback does not cache an incomplete thumbnail', async () => {
  const h = harness({ nativeImage: async () => { throw new Error('Image missing'); } });
  await assert.rejects(h.createPageThumbnail(page([photo('file:///missing/photo.heic')])), /Image missing/);
});

test('PDF thumbnails without a preview request the correct background page', async () => {
  const h = harness();
  await h.createPageThumbnail(page([photo()], { previewUri: undefined, pdfPageNumber: 3 }), 'pdf', 'file:///lecture.pdf', 1);
  assert.equal(h.nativeCalls[0][5], 'file:///lecture.pdf');
  assert.equal(h.nativeCalls[0][6][0], 2);
});

const savedPdfInk = '{"pages":{"0":"c2F2ZWQ="}}';
const preparedPdf = 'file:///cache/lecture.pdf';

function pdfRaster(payloads, _types, width, height, scale, uri) {
  // Mirror the native raster bounds and fixed device-pixel ink coordinates.
  const surface = Skia.Surface.Make(Math.floor(width * scale), Math.floor(height * scale));
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color(uri === preparedPdf ? '#0000ff' : '#ffffff'));
  canvas.scale(scale, scale);
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#000000'));
  if (payloads[0] === savedPdfInk) {
    canvas.drawRect(Skia.XYWHRect(400, 800, 80, 24), paint);
    canvas.drawRect(Skia.XYWHRect(400, 2120, 80, 2), paint);
  }
  const image = surface.makeImageSnapshot();
  try {
    return 'data:image/png;base64,' + image.encodeToBase64();
  } finally {
    image.dispose();
    paint.dispose();
    surface.dispose();
  }
}

test('PDF covers use saved ink over the prepared background even when a preview exists', async () => {
  const h = harness({ preparePdfForRendering: async () => preparedPdf, render: pdfRaster });
  const result = await h.createPageThumbnail(
    page([], { data: savedPdfInk, previewUri: red, pageType: 'pdf', pdfPageNumber: 3 }),
    'pdf', 'file:///lecture.pdf',
  );
  assert.deepEqual(pixel(result, 10, 10), [0, 0, 255, 255]);
  assert.deepEqual(pixel(result, 110, 202), [0, 0, 0, 255]);
  assert.deepEqual(pixel(result, 210, 405), [0, 0, 255, 255]);
  assert.equal(h.nativeCalls[0][6][0], 2);
});

test('a PDF cover retains bottom-edge ink and composites overlays at page coordinates', async () => {
  const h = harness({ preparePdfForRendering: async () => preparedPdf, render: pdfRaster });
  const result = await h.createPageThumbnail(
    page([photo()], { data: savedPdfInk, previewUri: red, pageType: 'pdf' }),
    'pdf', 'file:///lecture.pdf',
  );
  assert.deepEqual(pixel(result, 100, 100), [255, 0, 0, 255]);
  assert.deepEqual(pixel(result, 180, 100), [0, 0, 255, 255]);
  const bottom = pixel(result, 110, 530);
  assert.equal(bottom[3], 255);
  assert.ok(bottom[2] < 200, 'Expected ink in the final thumbnail row');
});

test('a PDF with no handwriting or stored preview still produces a cover', async () => {
  const h = harness({ preparePdfForRendering: async () => preparedPdf, render: pdfRaster });
  const result = await h.createPageThumbnail(page([], { data: '', previewUri: undefined, pageType: 'pdf' }),
    'pdf', 'file:///lecture.pdf');
  assert.ok(result);
  assert.deepEqual(pixel(result, 10, 10), [0, 0, 255, 255]);
});

test('typed text is included and clipped to its original text box', async () => {
  const result = await harness().createPageThumbnail(page([], { textBoxes: [{
    id: 'caption', content: 'Visible text\nSecond line\nHidden line', color: '#000000',
    x: 100, y: 100, width: 300, height: 70, fontSize: 40,
  }] }));
  let darkPixels = 0;
  for (let y = 55; y < 85; y += 2) {
    for (let x = 55; x < 190; x += 2) {
      if (pixel(result, x, y)[0] < 128) darkPixels += 1;
    }
  }
  assert.ok(darkPixels > 30, 'Expected visible text glyphs inside the text box');
  assert.deepEqual(pixel(result, 60, 95), [255, 255, 255, 255]);
});

test('native paragraph builders without an explicit dispose method still produce a complete cover', async () => {
  const result = await harness({ nativeParagraphBuilder: true }).createPageThumbnail(page([photo()], {
    textBoxes: [{ id: 'caption', content: 'Caption', color: '#123456',
      x: 100, y: 400, width: 300, height: 100, fontSize: 40 }],
  }));
  assert.deepEqual(pixel(result, 100, 100), [255, 0, 0, 255]);
});

test('legacy renderedImageUri assets are supported without sourceUri', async () => {
  const result = await harness().createPageThumbnail(page([photo(undefined, {
    sourceUri: undefined, renderedImageUri: blue,
  })]));
  assert.deepEqual(pixel(result, 100, 100), [0, 0, 255, 255]);
});

test('a failed background render does not manufacture a blank completed preview', async () => {
  await assert.rejects(harness({ nativeFails: true }).createPageThumbnail(
    page([photo()], { previewUri: undefined }),
  ), /Native renderer unavailable/);
});

test('malformed numeric bounds cannot poison the graphics context', async () => {
  const result = await harness().createPageThumbnail(page([photo(red, {
    x: NaN, y: Infinity, width: NaN, height: undefined, rotation: Infinity,
  })]));
  assert.deepEqual(pixel(result, 20, 20), [255, 0, 0, 255]);
});

test('ordinary image overlays cover text just as they do in the editor', async () => {
  const result = await harness().createPageThumbnail(page([photo()], { textBoxes: [{
    id: 'behind-photo', content: 'Hidden text', color: '#000000',
    x: 100, y: 100, width: 200, height: 200, fontSize: 40,
  }] }));
  for (let y = 55; y < 85; y += 3) {
    for (let x = 55; x < 145; x += 3) {
      assert.deepEqual(pixel(result, x, y), [255, 0, 0, 255]);
    }
  }
});

test('text is visible above images explicitly sent behind it', async () => {
  const result = await harness().createPageThumbnail(page([photo(red, { zIndex: -1 })], { textBoxes: [{
    id: 'above-photo', content: 'Visible text', color: '#000000',
    x: 100, y: 100, width: 200, height: 200, fontSize: 40,
  }] }));
  let darkPixels = 0;
  for (let y = 55; y < 85; y += 3) {
    for (let x = 55; x < 145; x += 3) {
      if (pixel(result, x, y)[0] < 128) darkPixels += 1;
    }
  }
  assert.ok(darkPixels > 10);
});

test('cancelled queued sidebar previews skip native capture instead of delaying later saves', async () => {
  const h = harness();
  assert.equal(await h.createPageThumbnail(page([photo()], { previewUri: undefined }), 'plain', null, 0, () => true), null);
  assert.equal(h.nativeCalls.length, 0);
  const saved = await h.createPageThumbnail(page([photo()]));
  assert.deepEqual(pixel(saved, 100, 100), [255, 0, 0, 255]);
});
