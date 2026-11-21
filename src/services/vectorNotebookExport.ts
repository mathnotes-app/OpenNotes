import {
  createPdfInkProjector, splitProjectedPageByLayers, writeVectorPdf,
  type SerializedNotebookData, type VectorPdfLayer,
} from '@mathnotes/mobile-ink';
import { indexAssetsByPage } from '../utils/continuousAssets';
import { imageLayerOrder, textLayerOrder } from '../utils/visualLayerOrder';
import { pageBackgroundType } from '../utils/paperSpacing';
import { NOTE_PAGE_HEIGHT, NOTE_PAGE_WIDTH } from './pdfExportHtml';

export async function exportVectorNotebook(
  data: SerializedNotebookData,
  pdfUri: string | undefined,
  backgroundType: string | undefined,
  density: number,
): Promise<string> {
  const width = Math.round(NOTE_PAGE_WIDTH * density);
  const height = Math.round(NOTE_PAGE_HEIGHT * density);
  const assets = indexAssetsByPage(data.pages, NOTE_PAGE_HEIGHT);
  const payloads = data.pages.map(page => page.data ?? '{"pages":{}}');
  const projectInk = createPdfInkProjector(payloads, height);
  return writeVectorPdf(pdfUri, data.pages.length, async index => {
    const page = data.pages[index];
    const paper = pageBackgroundType(backgroundType, page.pageType, page.pdfPageNumber);
    const overlays: { order: number; zIndex: number; layer: VectorPdfLayer }[] = [];
    for (const element of assets[index].insertedElements ?? []) {
      const uri = element.sourceUri ?? element.renderedImageUri;
      if (!uri) {
        if (element.type === 'image') throw new Error('Inserted image has no source');
        continue;
      }
      overlays.push({
        order: imageLayerOrder(element),
        zIndex: element.zIndex ?? 1,
        layer: {
          kind: 'image', uri, x: element.x * density, y: element.y * density,
          width: (element.width ?? 240) * density, height: (element.height ?? 240) * density,
          rotation: element.rotation, crop: element.cropRect, cornerRadius: 4 * density,
        },
      });
    }
    for (const box of assets[index].textBoxes ?? []) {
      if (!box.content) continue;
      overlays.push({
        order: textLayerOrder(box),
        zIndex: 0,
        layer: {
          kind: 'text', text: box.content, color: box.color,
          fontSize: (box.fontSize ?? 18) * density, padding: 8 * density,
          x: box.x * density, y: box.y * density,
          width: box.width * density, height: (box.height ?? 100) * density,
        },
      });
    }
    const ink = await projectInk(index);
    if (!ink) throw new Error('Could not project the saved notebook page');
    const boundaries = [...new Set(overlays.map(item => item.order))].sort((a, b) => a - b);
    const groups = boundaries.length ? await splitProjectedPageByLayers(ink, boundaries) : [ink];
    if (groups.length !== boundaries.length + 1) throw new Error('Could not split notebook layers');
    const layers: VectorPdfLayer[] = [{ kind: 'ink', drawing: groups[0] }];
    boundaries.forEach((order, group) => {
      for (const entry of overlays.filter(item => item.order === order).sort((a, b) => a.zIndex - b.zIndex)) {
        layers.push(entry.layer);
      }
      layers.push({ kind: 'ink', drawing: groups[group + 1] });
    });
    return {
      width, height, density: 2, pageIndex: index, layers,
      ...(paper === 'pdf' ? { pdfPage: page.pdfPageNumber ?? index + 1 } : { paper }),
    };
  });
}
