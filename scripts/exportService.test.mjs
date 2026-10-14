import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { buildPdfHtml } from '../src/services/pdfExportHtml.ts';

const source = ts.transpileModule(
  readFileSync(new URL('../src/services/exportService.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function notebook(pages) {
  return {
    version: '1.0',
    pages: pages.map((page, index) => ({
      id: 'page-' + (index + 1),
      title: 'Page ' + (index + 1),
      data: '{"pages":{}}',
      rotation: 0,
      pageType: 'plain',
      ...page,
    })),
  };
}

function harness(files = {}, { mergePdfFiles } = {}) {
  const printCalls = [];
  const batchCalls = [];
  const fileReads = [];
  const deletedFiles = [];
  const mergeCalls = [];
  const exports = {};
  const fileSystem = {
    EncodingType: { Base64: 'base64' },
    async readAsStringAsync(uri) {
      fileReads.push(uri);
      if (!(uri in files)) throw new Error('File not found');
      return files[uri];
    },
    async deleteAsync(uri) {
      deletedFiles.push(uri);
    },
  };
  const print = {
    async printToFileAsync(options) {
      printCalls.push(options);
      return { uri: 'file:///export-' + printCalls.length + '.pdf' };
    },
  };
  const mobileInk = {
    async batchExportPages(...args) {
      batchCalls.push(args);
      return args[0].map((_, index) => 'data:image/png;base64,' + (index + 1));
    },
  };
  vm.runInNewContext(source, {
    exports,
    __DEV__: false,
    require(name) {
      if (name === 'expo-file-system/legacy') return fileSystem;
      if (name === 'expo-print') return print;
      if (name === 'expo-sharing') {
        return { isAvailableAsync: async () => false };
      }
      if (name === 'react-native') return { PixelRatio: { get: () => 2 } };
      if (name === './pdfUtilsModule') {
        return {
          PDFUtilsModule: mergePdfFiles === null
            ? {}
            : {
                mergePdfFiles: async (uris) => {
                  mergeCalls.push(uris);
                  return mergePdfFiles ? mergePdfFiles(uris) : 'file:///merged.pdf';
                },
              },
        };
      }
      if (name === '@mathnotes/mobile-ink') return mobileInk;
      if (name === './pdfExportHtml') {
        return {
          buildPdfHtml,
          NOTE_PAGE_WIDTH: 820,
          NOTE_PAGE_HEIGHT: 1061,
          PDF_PAGE_WIDTH: 612,
          PDF_PAGE_HEIGHT: 792,
        };
      }
      throw new Error('Unexpected import: ' + name);
    },
  });
  return {
    exportNotebookAsPdf: exports.exportNotebookAsPdf,
    printCalls,
    batchCalls,
    fileReads,
    deletedFiles,
    mergeCalls,
  };
}

test('a three-page PDF includes a photo and typed text on their original page', async () => {
  const photo = 'file:///notes/photo.jpg';
  const h = harness({ [photo]: 'cGhvdG8=' });
  const data = notebook([
    {},
    {
      insertedElements: [{
        id: 'photo',
        type: 'image',
        x: 40,
        y: 70,
        width: 250,
        height: 150,
        rotation: 15,
        zIndex: 2,
        cropRect: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
        sourceUri: photo,
      }],
      textBoxes: [{
        id: 'caption',
        x: 45,
        y: 240,
        width: 300,
        height: 100,
        content: 'Photo <one> & two',
        color: '#123456',
        fontSize: 18,
      }],
    },
    {},
  ]);

  const result = await h.exportNotebookAsPdf({ data, filename: 'three-page' });
  assert.equal(result.ok, true);
  assert.equal(h.batchCalls.length, 1);
  assert.equal(h.batchCalls[0][0].length, 3);
  assert.deepEqual(h.fileReads, [photo]);
  assert.equal(h.printCalls.length, 1);
  const { html, width, height } = h.printCalls[0];
  assert.equal(width, 612);
  assert.equal(height, 792);
  assert.equal((html.match(/<section class="page">/g) ?? []).length, 3);
  const sections = html.split('<section class="page">');
  assert.doesNotMatch(sections[1], /data:image\/jpeg/);
  assert.match(sections[2], /data:image\/jpeg;base64,cGhvdG8=/);
  assert.match(sections[2], /transform:rotate\(15deg\)/);
  assert.match(sections[2], /left:-50px;top:-60px;width:500px;height:300px/);
  assert.match(sections[2], /Photo &lt;one&gt; &amp; two/);
  assert.doesNotMatch(sections[3], /data:image\/jpeg/);
});

test('export fails before printing when a saved photo cannot be read', async () => {
  const h = harness();
  const data = notebook([{
    insertedElements: [{
      id: 'missing',
      type: 'image',
      x: 0,
      y: 0,
      sourceUri: 'file:///notes/missing.png',
    }],
  }]);
  const result = await h.exportNotebookAsPdf({ data, filename: 'missing-photo' });
  assert.equal(result.ok, false);
  assert.match(result.error, /File not found/);
  assert.equal(h.printCalls.length, 0);
});

test('page HTML preserves a uniform scale and escapes typed text', () => {
  const html = buildPdfHtml([{
    rasterUri: 'data:image/png;base64,QQ==',
    images: [],
    textBoxes: [{
      id: 'text',
      x: 20,
      y: 30,
      width: 200,
      height: 100,
      content: '<script>alert("x")</script>',
      color: '#000000',
    }],
  }]);
  assert.match(html, /transform:scale\(0\.995\d+/);
  assert.match(html, /@page\{size:letter;margin:0\}/);
  assert.match(html, /width:8\.5in;height:11in/);
  assert.match(html, /object-fit:contain/);
  assert.doesNotMatch(html, /object-fit:fill/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /page-break-after:always/);
});

test('a long notebook prints in bounded passes that are merged into one PDF', async () => {
  const h = harness();
  const data = notebook(Array.from({ length: 20 }, () => ({})));

  const result = await h.exportNotebookAsPdf({ data, filename: 'long' });

  assert.equal(result.ok, true);
  assert.equal(result.uri, 'file:///merged.pdf');
  assert.deepEqual(
    h.printCalls.map(({ html }) => (html.match(/<section class="page">/g) ?? []).length),
    [8, 8, 4],
  );
  assert.ok(h.batchCalls.every((call) => call[0].length <= 8));
  assert.deepEqual(h.mergeCalls.map((uris) => [...uris]), [['file:///export-1.pdf', 'file:///export-2.pdf', 'file:///export-3.pdf']]);
  assert.deepEqual(h.deletedFiles.sort(), ['file:///export-1.pdf', 'file:///export-2.pdf', 'file:///export-3.pdf']);
});

test('a notebook that fits one pass is printed once and never merged', async () => {
  const h = harness();

  const result = await h.exportNotebookAsPdf({ data: notebook([{}, {}]), filename: 'short' });

  assert.equal(result.ok, true);
  assert.equal(result.uri, 'file:///export-1.pdf');
  assert.equal(h.mergeCalls.length, 0);
  assert.deepEqual(h.deletedFiles, []);
});

test('a failed merge reports the error and removes the partial pass files', async () => {
  const h = harness({}, {
    mergePdfFiles: async () => {
      throw new Error('Could not read export-2.pdf');
    },
  });

  const result = await h.exportNotebookAsPdf({
    data: notebook(Array.from({ length: 9 }, () => ({}))),
    filename: 'broken',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /Could not read export-2\.pdf/);
  assert.deepEqual(h.deletedFiles.sort(), ['file:///export-1.pdf', 'file:///export-2.pdf']);
});

test('a long export fails clearly when the native merge is missing', async () => {
  const h = harness({}, { mergePdfFiles: null });

  const result = await h.exportNotebookAsPdf({
    data: notebook(Array.from({ length: 9 }, () => ({}))),
    filename: 'no-merge',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /PDF merging is unavailable/);
});

test('base64 page rasters are embedded verbatim instead of escaped copies', () => {
  const raster = 'data:image/png;base64,' + 'A'.repeat(64) + '+/=';
  const html = buildPdfHtml([{ rasterUri: raster, images: [], textBoxes: [] }]);

  assert.ok(html.includes('src="' + raster + '"'));
  const unsafe = buildPdfHtml([{ rasterUri: 'file:///a"b.png', images: [], textBoxes: [] }]);
  assert.ok(unsafe.includes('file:///a&quot;b.png'));
});
