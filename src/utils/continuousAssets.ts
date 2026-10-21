import type { InkTextBox, InsertedElement, NotebookPage } from '@mathnotes/mobile-ink';

/** Assets retain one owner page; editing uses notebook coordinates. */
export function assetInNotebook<T extends { y?: number }>(asset: T, owner: number, pageHeight: number): T {
  return { ...asset, y: (asset.y ?? 0) + owner * pageHeight };
}

export function patchForOwner<T extends { y?: number }>(patch: T, owner: number, pageHeight: number): T {
  return patch.y === undefined ? patch : { ...patch, y: patch.y - owner * pageHeight };
}

type AssetBounds = { y?: number; width?: number; height?: number; rotation?: number };
type PageAssets = { insertedElements: InsertedElement[]; textBoxes: InkTextBox[] };

function verticalBounds(asset: AssetBounds, defaultWidth: number, defaultHeight: number) {
  const width = asset.width ?? defaultWidth;
  const height = asset.height ?? defaultHeight;
  const angle = (asset.rotation ?? 0) * Math.PI / 180;
  const halfExtent = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height) / 2;
  const center = (asset.y ?? 0) + height / 2;
  return { top: center - halfExtent, bottom: center + halfExtent };
}

/** Index once per export: cost follows assets and overlaps, not pages × assets. */
export function indexAssetsByPage(pages: NotebookPage[], pageHeight: number): PageAssets[] {
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) throw new Error('Invalid page height');
  const indexed: PageAssets[] = pages.map(() => ({ insertedElements: [], textBoxes: [] }));
  function project<T extends AssetBounds>(
    asset: T, owner: number, defaultWidth: number, defaultHeight: number,
    append: (target: number, local: T) => void,
  ) {
    const global = assetInNotebook(asset, owner, pageHeight);
    const bounds = verticalBounds(global, defaultWidth, defaultHeight);
    if (!Number.isFinite(bounds.top) || !Number.isFinite(bounds.bottom)) {
      throw new Error('Cannot export an asset with invalid geometry');
    }
    const first = Math.max(0, Math.floor(bounds.top / pageHeight));
    const last = Math.min(pages.length - 1, Math.ceil(bounds.bottom / pageHeight) - 1);
    for (let target = first; target <= last; target += 1) {
      append(target, assetInNotebook(asset, owner - target, pageHeight));
    }
  }
  pages.forEach((page, owner) => {
    for (const asset of page.insertedElements ?? []) {
      project(asset, owner, 240, 240, (target, local) => indexed[target].insertedElements.push(local));
    }
    for (const asset of page.textBoxes ?? []) {
      project(asset, owner, 200, 100, (target, local) => indexed[target].textBoxes.push(local));
    }
  });
  return indexed;
}

/** Export projections only: never persist these copies or give them new IDs. */
export function assetsForPage(pages: NotebookPage[], target: number, pageHeight: number): PageAssets {
  return indexAssetsByPage(pages, pageHeight)[target] ?? { insertedElements: [], textBoxes: [] };
}

export function duplicateAssetPosition(
  asset: { x: number; y: number; width?: number; height?: number },
  owner: number,
  pageWidth: number,
  pageHeight: number,
  pageCount: number,
) {
  const globalY = owner * pageHeight + asset.y;
  return {
    x: Math.max(0, Math.min(pageWidth - (asset.width ?? 80), asset.x + 20)),
    y: Math.max(0, Math.min(
      pageCount * pageHeight - (asset.height ?? 80), globalY + 20,
    )) - owner * pageHeight,
  };
}
