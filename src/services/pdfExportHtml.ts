import type { InkTextBox, InsertedElement } from '@mathnotes/mobile-ink';

export const NOTE_PAGE_WIDTH = 820;
export const NOTE_PAGE_HEIGHT = 1061;
export const PDF_PAGE_WIDTH = 612;
export const PDF_PAGE_HEIGHT = 792;
// expo-print uses PDF points for page size, while HTML uses 96 CSS pixels per inch.
const CSS_PIXELS_PER_POINT = 96 / 72;
const CSS_PAGE_WIDTH = PDF_PAGE_WIDTH * CSS_PIXELS_PER_POINT;
const CSS_PAGE_HEIGHT = PDF_PAGE_HEIGHT * CSS_PIXELS_PER_POINT;

export interface PrintableImage {
  element: InsertedElement;
  dataUri: string;
}

export interface PrintablePage {
  rasterUri: string;
  images: PrintableImage[];
  textBoxes: InkTextBox[];
}

const CONTENT_SCALE = Math.min(
  CSS_PAGE_WIDTH / NOTE_PAGE_WIDTH,
  CSS_PAGE_HEIGHT / NOTE_PAGE_HEIGHT,
);
const CONTENT_LEFT = (CSS_PAGE_WIDTH - NOTE_PAGE_WIDTH * CONTENT_SCALE) / 2;
const CONTENT_TOP = (CSS_PAGE_HEIGHT - NOTE_PAGE_HEIGHT * CONTENT_SCALE) / 2;

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Base64 image data URIs cannot contain HTML-special characters, so they are
// emitted as-is: escaping a multi-megabyte page raster would allocate five
// full copies of it. Anything else is escaped.
const BASE64_IMAGE_DATA_URI = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]*$/i;

function imageSrc(uri: string): string {
  return BASE64_IMAGE_DATA_URI.test(uri) ? uri : escapeHtml(uri);
}

function safeColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#000000';
}

function imageHtml(image: PrintableImage, order: number): string {
  const { element, dataUri } = image;
  const x = finite(element.x, 0);
  const y = finite(element.y, 0);
  const width = Math.max(1, finite(element.width, 240));
  const height = Math.max(1, finite(element.height, 240));
  const rotation = finite(element.rotation, 0);
  const crop = element.cropRect;
  const cropWidth = Math.max(0.001, finite(crop?.width, 1));
  const cropHeight = Math.max(0.001, finite(crop?.height, 1));
  const fullWidth = width / cropWidth;
  const fullHeight = height / cropHeight;
  const imageLeft = -finite(crop?.x, 0) * fullWidth;
  const imageTop = -finite(crop?.y, 0) * fullHeight;

  return '<div class="inserted-image" style="left:' + x + 'px;top:' + y +
    'px;width:' + width + 'px;height:' + height + 'px;z-index:' + order +
    ';transform:rotate(' + rotation + 'deg)">' +
    '<img src="' + imageSrc(dataUri) + '" style="left:' + imageLeft +
    'px;top:' + imageTop + 'px;width:' + fullWidth + 'px;height:' +
    fullHeight + 'px" /></div>';
}

function textBoxHtml(box: InkTextBox, order: number): string {
  if (!box.content) return '';
  const x = finite(box.x, 0);
  const y = finite(box.y, 0);
  const width = Math.max(1, finite(box.width, 200));
  const height = Math.max(1, finite(box.height, 100));
  const fontSize = Math.max(1, finite(box.fontSize, 18));

  return '<div class="text-box" style="left:' + x + 'px;top:' + y +
    'px;width:' + width + 'px;height:' + height + 'px;z-index:' + order +
    ';font-size:' + fontSize + 'px;color:' + safeColor(box.color) + '">' +
    escapeHtml(box.content) + '</div>';
}

export function buildPdfHtml(pages: PrintablePage[]): string {
  const pageHtml = pages.map((page) => {
    const images = [...page.images]
      .sort((a, b) => finite(a.element.zIndex, 0) - finite(b.element.zIndex, 0))
      .map((image, index) => imageHtml(image, index + 1))
      .join('');
    const textBoxes = page.textBoxes
      .map((box, index) => textBoxHtml(box, page.images.length + index + 1))
      .join('');
    return '<section class="page"><div class="content" style="left:' +
      CONTENT_LEFT + 'px;top:' + CONTENT_TOP + 'px;transform:scale(' +
      CONTENT_SCALE + ')"><img class="raster" src="' +
      imageSrc(page.rasterUri) + '" />' + images + textBoxes +
      '</div></section>';
  }).join('');

  return '<!doctype html><html><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<style>' +
    '*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}' +
    '@page{size:letter;margin:0}' +
    '.page{position:relative;width:' + PDF_PAGE_WIDTH / 72 +
    'in;height:' + PDF_PAGE_HEIGHT / 72 + 'in;margin:0;' +
    'overflow:hidden;page-break-inside:avoid;break-inside:avoid}' +
    '.page:not(:last-child){page-break-after:always;break-after:page}' +
    '.content{position:absolute;width:' + NOTE_PAGE_WIDTH + 'px;height:' +
    NOTE_PAGE_HEIGHT + 'px;transform-origin:top left}' +
    '.raster{position:absolute;left:0;top:0;width:' + NOTE_PAGE_WIDTH +
    'px;height:' + NOTE_PAGE_HEIGHT + 'px;' +
    'object-fit:contain;display:block}' +
    '.inserted-image{position:absolute;overflow:hidden;border-radius:4px}' +
    '.inserted-image img{position:absolute;max-width:none;max-height:none;' +
    'object-fit:cover;display:block}' +
    '.text-box{position:absolute;padding:8px;overflow:hidden;' +
    'white-space:pre-wrap;overflow-wrap:break-word;line-height:1.25;' +
    'font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif}' +
    '</style></head><body>' + pageHtml + '</body></html>';
}
