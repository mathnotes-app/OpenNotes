import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { PixelRatio, Platform } from 'react-native';
import { batchExportPages, projectDocumentPages, splitProjectedPageByLayers, type SerializedNotebookData } from '@mathnotes/mobile-ink';
import {
  buildPdfHtml,
  NOTE_PAGE_HEIGHT,
  NOTE_PAGE_WIDTH,
  PDF_PAGE_HEIGHT,
  PDF_PAGE_WIDTH,
  type PrintablePage,
} from './pdfExportHtml';
import { PDFUtilsModule } from './pdfUtilsModule';
import { indexAssetsByPage } from '../utils/continuousAssets';
import { overlayLayerBoundaries } from '../utils/visualLayerOrder';

const EXPORT_SCALE = 1.0;
const DEFAULT_NATIVE_BATCH_SIZE = 8;
const NATIVE_BATCH_PAUSE_MS = 16;
// Pages rendered, embedded as base64 and printed per pass. Each page raster
// is several MB of base64 in the JS heap, so printing a whole notebook in
// one HTML document exhausted Hermes memory on long notebooks. Printing in
// fixed-size passes and merging the PDFs natively keeps memory bounded.
const PRINT_PASS_PAGES = 8;

export interface ExportOptions {
  data: SerializedNotebookData;
  pdfBackgroundUri?: string | null;
  filename: string;
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

function mimeTypeForImage(uri: string): string {
  const extension = uri.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    default:
      throw new Error('Unsupported inserted image format');
  }
}

async function embedInsertedImage(uri: string): Promise<string> {
  if (/^data:image\/(?:png|jpeg|gif|webp|heic|heif);base64,[A-Za-z0-9+/=]+$/.test(uri)) {
    return uri;
  }
  if (!uri.startsWith('file://')) {
    throw new Error('Inserted image is not stored in a readable file');
  }
  const mimeType = mimeTypeForImage(uri);
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) throw new Error('Inserted image file is empty');
  return 'data:' + mimeType + ';base64,' + base64;
}

async function preparePrintablePages(
  indexedAssets: ReturnType<typeof indexAssetsByPage>,
  rasters: RenderedPage[],
  pageIndexes: number[],
): Promise<PrintablePage[]> {
  const cachedImages = new Map<string, string>();
  const pages: PrintablePage[] = [];
  for (let index = 0; index < pageIndexes.length; index += 1) {
    const page = indexedAssets[pageIndexes[index]];
    const images: PrintablePage['images'] = [];
    for (const element of page.insertedElements ?? []) {
      const sourceUri = element.sourceUri ?? element.renderedImageUri;
      if (!sourceUri) {
        if (element.type === 'image') throw new Error('Inserted image has no source');
        continue;
      }
      let dataUri = cachedImages.get(sourceUri);
      if (!dataUri) {
        dataUri = await embedInsertedImage(sourceUri);
        cachedImages.set(sourceUri, dataUri);
      }
      images.push({ element, dataUri });
    }
    pages.push({
      rasterUri: rasters[index].background,
      inkUri: rasters[index].ink,
      inkGroups: rasters[index].inkGroups,
      layerBoundaries: rasters[index].boundaries,
      images,
      textBoxes: page.textBoxes ?? [],
    });
  }
  return pages;
}

type RenderedPage = { background: string; ink?: string; inkGroups?: (string | null)[]; boundaries?: number[] };

async function renderNativePagesInChunks(options: {
  data: SerializedNotebookData;
  pageIndexes: number[];
  exportWidth: number;
  exportHeight: number;
  pdfBackgroundUri?: string | null;
  batchSize: number;
  layerBoundaries: Map<number, number[]>;
}): Promise<Map<number, RenderedPage>> {
  const {
    data,
    pageIndexes,
    exportWidth,
    exportHeight,
    pdfBackgroundUri,
    batchSize,
    layerBoundaries,
  } = options;
  const rendered = new Map<number, RenderedPage>();

  for (let start = 0; start < pageIndexes.length; start += batchSize) {
    const chunkPageIndexes = pageIndexes.slice(start, start + batchSize);
    const chunkPages = chunkPageIndexes.map((pageIndex) => data.pages[pageIndex]);
    const inkPayloads = await projectDocumentPages(
      data.pages.map(page => page.data ?? '{"pages":{}}'),
      exportHeight,
      chunkPageIndexes,
    );
    const pngUris = await batchExportPages(
      inkPayloads.map((payload, offset) => layerBoundaries.has(chunkPageIndexes[offset]) ? '{"pages":{}}' : payload),
      chunkPages.map((p) => p?.pageType ?? 'plain'),
      exportWidth,
      exportHeight,
      EXPORT_SCALE,
      pdfBackgroundUri ?? undefined,
      chunkPages.map((page, offset) =>
        getPdfPageIndex(page, chunkPageIndexes[offset]),
      ),
    );

    const overlayOffsets = chunkPageIndexes.map((index, offset) => layerBoundaries.has(index) ? offset : -1)
      .filter(offset => offset >= 0);
    const inkUris = Platform.OS !== 'ios' && overlayOffsets.length ? await batchExportPages(
      overlayOffsets.map(offset => inkPayloads[offset]),
      overlayOffsets.map(() => 'pdf'),
      exportWidth, exportHeight, EXPORT_SCALE, undefined,
      overlayOffsets.map(offset => getPdfPageIndex(chunkPages[offset], chunkPageIndexes[offset])),
    ) : [];
    const inkByOffset = new Map(overlayOffsets.map((offset, index) => [offset, inkUris[index]]));
    const groupedInk = new Map<number, (string | null)[]>();
    if (Platform.OS === 'ios') {
      for (const offset of overlayOffsets) {
        const boundaries = layerBoundaries.get(chunkPageIndexes[offset])!;
        const groups = await splitProjectedPageByLayers(inkPayloads[offset], boundaries);
        if (groups.length !== boundaries.length + 1) throw new Error('Native export returned an invalid layer count');
        const result: (string | null)[] = groups.map(() => null);
        const nonempty = groups.map((payload, index) => ({ payload, index }))
          .filter(({payload}) => Object.keys(JSON.parse(payload).pages ?? {}).length > 0);
        for (let first = 0; first < nonempty.length; first += batchSize) {
          const group = nonempty.slice(first, first + batchSize);
          const uris = await batchExportPages(group.map(item => item.payload), group.map(() => 'pdf'),
            exportWidth, exportHeight, EXPORT_SCALE, undefined,
            group.map(() => getPdfPageIndex(chunkPages[offset], chunkPageIndexes[offset])));
          for (let i = 0; i < group.length; i++) {
            if (!uris[i]) throw new Error(`Native export omitted ink for page ${chunkPageIndexes[offset] + 1}`);
            result[group[i].index] = uris[i];
          }
        }
        groupedInk.set(offset, result);
      }
    }

    for (let offset = 0; offset < chunkPageIndexes.length; offset += 1) {
      const uri = pngUris[offset];
      if (typeof uri === 'string' && uri.length > 0) {
        const ink = inkByOffset.get(offset);
        if (Platform.OS !== 'ios' && layerBoundaries.has(chunkPageIndexes[offset]) && !ink) {
          throw new Error(`Native export omitted ink for page ${chunkPageIndexes[offset] + 1}`);
        }
        rendered.set(chunkPageIndexes[offset], { background: uri, ink, inkGroups: groupedInk.get(offset),
          boundaries: layerBoundaries.get(chunkPageIndexes[offset]) });
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
  pageIndexes: number[];
  exportWidth: number;
  exportHeight: number;
  pdfBackgroundUri?: string | null;
  layerBoundaries: Map<number, number[]>;
}): Promise<RenderedPage[]> {
  const { data, pageIndexes, exportWidth, exportHeight, pdfBackgroundUri, layerBoundaries } = options;
  // Saved thumbnails may omit ink owned by a neighboring page. Always render
  // the canonical document, in bounded batches, for the exported PDF.
  const rendered = await renderNativePagesInChunks({
    data, pageIndexes, exportWidth, exportHeight, pdfBackgroundUri, layerBoundaries,
    batchSize: DEFAULT_NATIVE_BATCH_SIZE,
  });
  return pageIndexes.map(index => {
    const uri = rendered.get(index);
    if (!uri) throw new Error(`Native export omitted page ${index + 1}`);
    return uri;
  });
}

async function mergePrintedPasses(passUris: string[]): Promise<string> {
  if (passUris.length === 1) return passUris[0];
  const merge = PDFUtilsModule?.mergePdfFiles;
  if (!merge) throw new Error('PDF merging is unavailable on this device');
  return merge(passUris);
}

async function deleteFiles(uris: string[]): Promise<void> {
  await Promise.all(
    uris.map((uri) =>
      FileSystem.deleteAsync(uri, { idempotent: true }).catch((error: unknown) => {
        if (__DEV__) console.warn('[exportService] could not delete export pass', uri, error);
      }),
    ),
  );
}

export async function exportNotebookAsPdf(
  options: ExportOptions,
): Promise<{ ok: boolean; uri?: string; error?: string }> {
  const { data, pdfBackgroundUri, filename } = options;
  if (!data.pages || data.pages.length === 0) {
    return { ok: false, error: 'Empty notebook' };
  }

  const passUris: string[] = [];
  let mergedUri: string | null = null;
  try {
    const pixelRatio = PixelRatio.get();
    const nativeScale = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    const exportWidth = Math.round(NOTE_PAGE_WIDTH * nativeScale);
    const exportHeight = Math.round(NOTE_PAGE_HEIGHT * nativeScale);
    const pageCount = data.pages.length;
    const indexedAssets = indexAssetsByPage(data.pages, NOTE_PAGE_HEIGHT);
    const layerBoundaries = new Map(indexedAssets.flatMap((page, index) =>
      (page.insertedElements?.length || page.textBoxes?.length)
        ? [[index, overlayLayerBoundaries(page.insertedElements, page.textBoxes)] as const] : []));

    for (let start = 0; start < pageCount; start += PRINT_PASS_PAGES) {
      const pageIndexes = Array.from(
        { length: Math.min(PRINT_PASS_PAGES, pageCount - start) },
        (_, offset) => start + offset,
      );
      const rasterUris = await collectExportImages({
        data,
        pageIndexes,
        exportWidth,
        exportHeight,
        pdfBackgroundUri,
        layerBoundaries,
      });
      if (rasterUris.length !== pageIndexes.length) {
        return {
          ok: false,
          error: `Export rendered ${start + rasterUris.length} of ${pageCount} pages`,
        };
      }

      const printablePages = await preparePrintablePages(
        indexedAssets,
        rasterUris,
        pageIndexes,
      );
      const printed = await Print.printToFileAsync({
        html: buildPdfHtml(printablePages),
        width: PDF_PAGE_WIDTH,
        height: PDF_PAGE_HEIGHT,
        base64: false,
      });
      passUris.push(printed.uri);
    }

    const pdfUri = await mergePrintedPasses(passUris);
    if (pdfUri !== passUris[0]) mergedUri = pdfUri;
    await deleteFiles(passUris.filter((uri) => uri !== pdfUri));

    const available = await Sharing.isAvailableAsync();
    if (!available) {
      return { ok: true, uri: pdfUri };
    }

    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: filename,
      UTI: 'com.adobe.pdf',
    });
    return { ok: true, uri: pdfUri };
  } catch (error) {
    await deleteFiles(mergedUri ? [...passUris, mergedUri] : passUris);
    if (__DEV__) console.warn('[exportService] export failed', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
