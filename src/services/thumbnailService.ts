import { ClipOp, Skia, type SkImage } from '@shopify/react-native-skia';
import { batchExportPages, type InsertedElement, type NotebookPage } from '@mathnotes/mobile-ink';
import { PixelRatio } from 'react-native';
import { createPromiseQueue } from '../utils/promiseQueue';
import { PDFUtilsModule, resolvePdfRenderUri } from './pdfUtilsModule';

export const THUMBNAIL_VERSION = 2;
const PAGE_WIDTH = 820;
const PAGE_HEIGHT = 1061;
const SCALE = 0.5;
const THUMBNAIL_HEIGHT = Math.ceil(PAGE_HEIGHT * SCALE);
const renderQueue = createPromiseQueue();

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function decodeImage(uri: string): Promise<SkImage> {
  try {
    return await readSkiaImage(uri);
  } catch (error) {
    if (!uri.startsWith('file://') || !PDFUtilsModule?.readImageForThumbnail) throw error;
    // ImageIO can decode legacy HEIC photos that Skia's codecs do not support.
    return readSkiaImage(await PDFUtilsModule.readImageForThumbnail(uri));
  }
}

async function readSkiaImage(uri: string): Promise<SkImage> {
  const data = uri.startsWith('data:image/')
    ? Skia.Data.fromBase64(uri.slice(uri.indexOf(',') + 1))
    : await Skia.Data.fromURI(uri);
  try {
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) throw new Error('Thumbnail image could not be decoded');
    return image;
  } finally {
    data.dispose();
  }
}

/** Composes a separate cover; engine previews must stay free of host overlays. */
export function createPageThumbnail(
  page: NotebookPage | undefined,
  backgroundType = 'plain',
  pdfUri?: string | null,
  pageIndex = 0,
  shouldCancel?: () => boolean,
): Promise<string | null> {
  return renderQueue.enqueue(async () => shouldCancel?.()
    ? null : composePageThumbnail(page, backgroundType, pdfUri, pageIndex));
}

async function composePageThumbnail(
  page: NotebookPage | undefined,
  backgroundType: string,
  pdfUri: string | null | undefined,
  pageIndex: number,
): Promise<string | null> {
  if (!page) return null;
  const elements = [...(page.insertedElements ?? [])]
    .filter(element => element.type === 'image' || element.sourceUri || element.renderedImageUri)
    .sort((a, b) => finite(a.zIndex, 1) - finite(b.zIndex, 1)
      || finite(a.zIndex, 0) - finite(b.zIndex, 0));
  const textBoxes = (page.textBoxes ?? []).filter(box => Boolean(box.content));
  const pageType = page.pageType ?? backgroundType;
  const isPdf = pageType === 'pdf';
  const hasOverlays = elements.length > 0 || textBoxes.length > 0;
  if (!isPdf && !hasOverlays) return page.previewUri ?? null;

  // Round the PDF raster up to a full thumbnail row so the native renderer cannot clip the page edge.
  const rasterHeight = isPdf ? THUMBNAIL_HEIGHT / SCALE : PAGE_HEIGHT;
  // The editor preview can contain stale PDF content or mis-scaled ink.
  let raster = isPdf ? undefined : page.previewUri;
  if (!raster) {
    const renderPdfUri = isPdf ? await resolvePdfRenderUri(pdfUri) : undefined;
    if (isPdf && !renderPdfUri) throw new Error('Thumbnail PDF background is missing');
    const density = isPdf ? PixelRatio.get() : 1;
    const nativeScale = Number.isFinite(density) && density > 0 ? density : 1;
    // Mobile Ink stores ink in device pixels.
    const width = Math.ceil(PAGE_WIDTH * nativeScale);
    const height = Math.ceil(rasterHeight * nativeScale);
    [raster] = await batchExportPages(
      [page.data || '{"pages":{}}'], [pageType], width, height, SCALE / nativeScale,
      renderPdfUri, [page.pdfPageNumber ? page.pdfPageNumber - 1 : pageIndex],
    );
    if (!raster) throw new Error('Thumbnail background could not be rendered');
  }
  if (!hasOverlays) return raster;

  const surface = Skia.Surface.Make(PAGE_WIDTH * SCALE, THUMBNAIL_HEIGHT);
  if (!surface) throw new Error('Thumbnail surface could not be allocated');
  const paint = Skia.Paint();
  try {
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('white'));
    canvas.scale(SCALE, SCALE);
    const base = await decodeImage(raster);
    try {
      canvas.drawImageRect(base, Skia.XYWHRect(0, 0, base.width(), base.height()),
        Skia.XYWHRect(0, 0, PAGE_WIDTH, rasterHeight), paint);
    } finally {
      base.dispose();
    }

    const drawElement = async (element: InsertedElement) => {
      const uri = element.sourceUri ?? element.renderedImageUri;
      if (!uri) throw new Error('Thumbnail image has no source');
      const image = await decodeImage(uri);
      try {
        const x = finite(element.x, 0);
        const y = finite(element.y, 0);
        const width = Math.max(1, finite(element.width, 240));
        const height = Math.max(1, finite(element.height, 240));
        const crop = element.cropRect;
        const fullWidth = width / Math.max(0.001, finite(crop?.width, 1));
        const fullHeight = height / Math.max(0.001, finite(crop?.height, 1));
        // Match ImageInsertOverlay's resizeMode="cover" before applying its crop.
        const coverScale = Math.max(fullWidth / image.width(), fullHeight / image.height());
        const sourceWidth = fullWidth / coverScale;
        const sourceHeight = fullHeight / coverScale;
        canvas.save();
        canvas.rotate(finite(element.rotation, 0), x + width / 2, y + height / 2);
        canvas.clipRect(Skia.XYWHRect(x, y, width, height), ClipOp.Intersect, true);
        canvas.drawImageRect(image,
          Skia.XYWHRect((image.width() - sourceWidth) / 2, (image.height() - sourceHeight) / 2, sourceWidth, sourceHeight),
          Skia.XYWHRect(x - finite(crop?.x, 0) * fullWidth, y - finite(crop?.y, 0) * fullHeight, fullWidth, fullHeight), paint);
        canvas.restore();
      } finally {
        image.dispose();
      }
    };

    // Text siblings have zIndex 0; image siblings default to zIndex 1.
    for (const element of elements.filter(element => finite(element.zIndex, 1) <= 0)) {
      await drawElement(element);
    }

    for (const box of textBoxes) {
      const builder = Skia.ParagraphBuilder.Make();
      builder.pushStyle({
        color: Skia.Color(box.color || '#000000'), fontSize: Math.max(1, finite(box.fontSize, 18)),
        heightMultiplier: 1.25,
      });
      const paragraph = builder.addText(box.content).build();
      try {
        const x = finite(box.x, 0);
        const y = finite(box.y, 0);
        const width = Math.max(1, finite(box.width, 200));
        const height = Math.max(1, finite(box.height, 100));
        paragraph.layout(Math.max(1, width - 16));
        canvas.save();
        canvas.clipRect(Skia.XYWHRect(x, y, width, height), ClipOp.Intersect, true);
        paragraph.paint(canvas, x + 8, y + 8);
        canvas.restore();
      } finally {
        paragraph.dispose();
        // Skia 2.2's native builder is garbage-collected and omits this method.
        builder.dispose?.();
      }
    }
    for (const element of elements.filter(element => finite(element.zIndex, 1) > 0)) {
      await drawElement(element);
    }
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      return 'data:image/png;base64,' + image.encodeToBase64();
    } finally {
      image.dispose();
    }
  } finally {
    paint.dispose();
    surface.dispose();
  }
}
