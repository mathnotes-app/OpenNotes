import type { InkTextBox, InsertedElement, NotebookPage } from '@mathnotes/mobile-ink';

function validOrder(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) return fallback;
  return value;
}

export function imageLayerOrder(image: InsertedElement): number {
  return validOrder(image.layerOrder, (image.zIndex ?? 1) <= 0 ? 2 : 4);
}

/** Resolve a finger tap through the viewport to the topmost image. */
export function imageAtContentPoint(
  pages: NotebookPage[], point: {x: number; y: number},
  layout: {pageWidth: number; pageHeight: number; contentPadding: number; containerWidth: number},
): {pageIndex: number; id: string} | null {
  const x = point.x - (layout.containerWidth - layout.pageWidth) / 2;
  const y = point.y - layout.contentPadding;
  if (![x, y, layout.pageHeight].every(Number.isFinite) || layout.pageHeight <= 0) return null;
  let hit: {pageIndex: number; id: string; order: number; zIndex: number} | null = null;
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    for (const element of pages[pageIndex].insertedElements ?? []) {
      if (!(element.sourceUri ?? element.renderedImageUri)) continue;
      const width = element.width ?? 240, height = element.height ?? 240;
      const angle = (element.rotation ?? 0) * Math.PI / 180;
      if (![element.x, element.y, width, height, angle].every(Number.isFinite) || width <= 0 || height <= 0) continue;
      const dx = x - element.x - width / 2;
      const dy = y - (element.y + pageIndex * layout.pageHeight) - height / 2;
      const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
      const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
      if (Math.abs(localX) > width / 2 || Math.abs(localY) > height / 2) continue;
      const order = imageLayerOrder(element), zIndex = element.zIndex ?? 1;
      if (!hit || order > hit.order || (order === hit.order && zIndex >= hit.zIndex))
        hit = {pageIndex, id: element.id, order, zIndex};
    }
  }
  return hit && {pageIndex: hit.pageIndex, id: hit.id};
}

export function textLayerOrder(text: InkTextBox): number {
  return validOrder(text.layerOrder, 3);
}

export function overlayLayerBoundaries(images: InsertedElement[], textBoxes: InkTextBox[]): number[] {
  return [...new Set([...images.map(imageLayerOrder), ...textBoxes.map(textLayerOrder)])].sort((a, b) => a - b);
}

export function documentVisualLayers(
  pages: NotebookPage[], pageHeight: number,
  selection: {type: 'image' | 'text'; pageIndex: number; id: string} | null,
  interactive: boolean, displayColor: (color: string) => number,
  currentPageIndex = 0, pixelRatio = 2,
) {
  // Eight pages of prefetch on either side covers the maximum overview zoom,
  // while avoiding decoding every image in a long notebook on open.
  const top = (currentPageIndex - 8) * pageHeight;
  const bottom = (currentPageIndex + 9) * pageHeight;
  const nearViewport = (y: number, width: number, height: number, rotation = 0) => {
    const angle = rotation * Math.PI / 180;
    const half = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height) / 2;
    return y + height / 2 + half >= top && y + height / 2 - half <= bottom;
  };
  const activeCount = pages.reduce((count, page, pageIndex) => count +
    (page.insertedElements ?? []).filter(element => Boolean(element.sourceUri ?? element.renderedImageUri) &&
      nearViewport(element.y + pageIndex * pageHeight, element.width ?? 240, element.height ?? 240, element.rotation)).length +
    (page.textBoxes ?? []).filter(box => nearViewport(box.y + pageIndex * pageHeight, box.width, box.height ?? 100)).length, 0);
  const bytesPerLayer = 128 * 1024 * 1024 / Math.max(1, activeCount);
  const limit = Math.max(32, Math.min(4096, Math.sqrt(bytesPerLayer / 4)));
  const maxPixelSize = 2 ** Math.floor(Math.log2(limit));
  const images = pages.flatMap((page, pageIndex) =>
    (page.insertedElements ?? []).map(element => ({element, pageIndex})))
    .sort((a, b) => (a.element.zIndex ?? 1) - (b.element.zIndex ?? 1))
    .filter(({element}) => Boolean(element.sourceUri ?? element.renderedImageUri))
    .map(({element, pageIndex}) => ({
      id: 'image:' + pages[pageIndex].id + ':' + element.id, uri: element.sourceUri ?? element.renderedImageUri,
      x: element.x, y: element.y + pageIndex * pageHeight,
      width: element.width ?? 240, height: element.height ?? 240,
      rotation: element.rotation ?? 0, crop: element.cropRect,
      layerOrder: imageLayerOrder(element),
      hidden: interactive && selection?.type === 'image' && selection.id === element.id && selection.pageIndex === pageIndex,
      defer: !nearViewport(element.y + pageIndex * pageHeight, element.width ?? 240, element.height ?? 240, element.rotation),
      maxPixelSize,
    }));
  const text = pages.flatMap((page, pageIndex) => (page.textBoxes ?? []).map(box => {
    const hidden = interactive && selection?.type === 'text' && selection.id === box.id && selection.pageIndex === pageIndex;
    return {
      type: 'text', id: 'text:' + page.id + ':' + box.id, text: hidden ? '' : box.content,
      x: box.x, y: box.y + pageIndex * pageHeight, width: box.width, height: box.height ?? 100,
      fontSize: box.fontSize ?? 18, color: displayColor(box.color), layerOrder: textLayerOrder(box), hidden,
      defer: !nearViewport(box.y + pageIndex * pageHeight, box.width, box.height ?? 100),
      textScale: Math.max(0.05, Math.min(pixelRatio * 5,
        Math.sqrt(bytesPerLayer / (4 * Math.max(1, box.width) * Math.max(1, box.height ?? 100))))),
    };
  }));
  return [...images, ...text];
}
