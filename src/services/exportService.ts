import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { PixelRatio } from 'react-native';
import { batchExportPages, type SerializedNotebookData } from '@mathnotes/mobile-ink';

const PAGE_WIDTH = 820;
const PAGE_HEIGHT = 1061;
const EXPORT_SCALE = 1.0;
const DEFAULT_NATIVE_BATCH_SIZE = 8;
const LARGE_NATIVE_BATCH_SIZE = 1;
const LARGE_NOTEBOOK_PREVIEW_THRESHOLD = 150;
const NATIVE_BATCH_PAUSE_MS = 16;

export interface ExportOptions {
  data: SerializedNotebookData;
  pdfBackgroundUri?: string | null;
  filename: string;
}

function buildHtml(pngDataUris: string[]): string {
  const pageHtml = pngDataUris
    .map(
      (uri) => `
      <div class="page"><img src="${uri}" /></div>
    `,
    )
    .join('');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: letter; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #FFFFFF;
    }
    .page {
      position: relative;
      width: 100%;
      height: 792px;
      page-break-after: avoid;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .page img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: block;
      object-fit: fill;
    }
  </style>
</head>
<body>${pageHtml}</body>
</html>`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPdfPageIndex(
  page: SerializedNotebookData['pages'][number],
  pageIndex: number,
): number {
  return typeof page.pdfPageNumber === 'number' && page.pdfPageNumber > 0
    ? page.pdfPageNumber - 1
    : pageIndex;
}

async function toPrintableImageUri(uri: string | undefined): Promise<string | null> {
  if (!uri) return null;
  if (uri.startsWith('data:image/')) return uri;
  if (!uri.startsWith('file://')) return null;

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64 ? `data:image/png;base64,${base64}` : null;
  } catch (error) {
    if (__DEV__) console.warn('[exportService] could not read preview image', uri, error);
    return null;
  }
}

async function renderNativePagesInChunks(options: {
  data: SerializedNotebookData;
  pageIndexes: number[];
  exportWidth: number;
  exportHeight: number;
  pdfBackgroundUri?: string | null;
  batchSize: number;
}): Promise<Map<number, string>> {
  const {
    data,
    pageIndexes,
    exportWidth,
    exportHeight,
    pdfBackgroundUri,
    batchSize,
  } = options;
  const rendered = new Map<number, string>();

  for (let start = 0; start < pageIndexes.length; start += batchSize) {
    const chunkPageIndexes = pageIndexes.slice(start, start + batchSize);
    const chunkPages = chunkPageIndexes.map((pageIndex) => data.pages[pageIndex]);
    const pngUris = await batchExportPages(
      chunkPages.map((p) => p?.data ?? '{"pages":{}}'),
      chunkPages.map((p) => p?.pageType ?? 'plain'),
      exportWidth,
      exportHeight,
      EXPORT_SCALE,
      pdfBackgroundUri ?? undefined,
      chunkPages.map((page, offset) =>
        getPdfPageIndex(page, chunkPageIndexes[offset]),
      ),
    );

    for (let offset = 0; offset < chunkPageIndexes.length; offset += 1) {
      const uri = pngUris[offset];
      if (typeof uri === 'string' && uri.length > 0) {
        rendered.set(chunkPageIndexes[offset], uri);
      }
    }

    if (start + batchSize < pageIndexes.length) {
      await delay(NATIVE_BATCH_PAUSE_MS);
    }
  }

  return rendered;
}

async function collectExportImages(options: {
  data: SerializedNotebookData;
  exportWidth: number;
  exportHeight: number;
  pdfBackgroundUri?: string | null;
}): Promise<string[]> {
  const { data, exportWidth, exportHeight, pdfBackgroundUri } = options;
  const pageCount = data.pages.length;
  const images: Array<string | undefined> = new Array(pageCount);
  const nativePageIndexes: number[] = [];
  const preferStoredPreviews = pageCount >= LARGE_NOTEBOOK_PREVIEW_THRESHOLD;

  if (preferStoredPreviews) {
    let previewCount = 0;
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const previewUri = await toPrintableImageUri(data.pages[pageIndex]?.previewUri);
      if (previewUri) {
        images[pageIndex] = previewUri;
        previewCount += 1;
      } else {
        nativePageIndexes.push(pageIndex);
      }
    }
    if (__DEV__) {
      console.log(
        `[exportService] using stored previews for ${previewCount}/${pageCount} export pages`,
      );
    }
  } else {
    nativePageIndexes.push(...data.pages.map((_, index) => index));
  }

  if (nativePageIndexes.length > 0) {
    const rendered = await renderNativePagesInChunks({
      data,
      pageIndexes: nativePageIndexes,
      exportWidth,
      exportHeight,
      pdfBackgroundUri,
      batchSize: preferStoredPreviews ? LARGE_NATIVE_BATCH_SIZE : DEFAULT_NATIVE_BATCH_SIZE,
    });
    for (const [pageIndex, uri] of rendered) {
      images[pageIndex] = uri;
    }
  }

  return images.filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
}

export async function exportNotebookAsPdf(
  options: ExportOptions,
): Promise<{ ok: boolean; uri?: string; error?: string }> {
  const { data, pdfBackgroundUri, filename } = options;
  if (!data.pages || data.pages.length === 0) {
    return { ok: false, error: 'Empty notebook' };
  }

  try {
    const pixelRatio = PixelRatio.get();
    const nativeScale = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    const exportWidth = Math.round(PAGE_WIDTH * nativeScale);
    const exportHeight = Math.round(PAGE_HEIGHT * nativeScale);
    const pages = await collectExportImages({
      data,
      exportWidth,
      exportHeight,
      pdfBackgroundUri,
    });
    if (pages.length === 0) {
      return { ok: false, error: 'Native export returned no pages' };
    }
    if (pages.length !== data.pages.length) {
      return {
        ok: false,
        error: `Export rendered ${pages.length} of ${data.pages.length} pages`,
      };
    }

    const html = buildHtml(pages);
    const printed = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const available = await Sharing.isAvailableAsync();
    if (!available) {
      return { ok: true, uri: printed.uri };
    }

    await Sharing.shareAsync(printed.uri, {
      mimeType: 'application/pdf',
      dialogTitle: filename,
      UTI: 'com.adobe.pdf',
    });
    return { ok: true, uri: printed.uri };
  } catch (error) {
    if (__DEV__) console.warn('[exportService] export failed', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
