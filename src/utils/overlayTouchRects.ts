import type {NotebookPage, TouchExclusionRect} from '@mathnotes/mobile-ink';

type Selection = {type: 'image' | 'text'; pageIndex: number; id: string};
type Layout = {pageWidth: number; pageHeight: number; containerWidth: number; contentPadding: number};

/** Keep a selected body, handles and action bar out of the parent pan gesture. */
export function selectedOverlayTouchRects(pages: NotebookPage[], selection: Selection | null,
  layout: Layout): TouchExclusionRect[] {
  if (!selection) return [];
  const page = pages[selection.pageIndex];
  const item = selection.type === 'image' ? page?.insertedElements?.find(value => value.id === selection.id)
    : page?.textBoxes?.find(value => value.id === selection.id);
  if (!item) return [];
  const width = item.width ?? (selection.type === 'image' ? 240 : 200);
  const height = item.height ?? (selection.type === 'image' ? 240 : 100);
  const angle = ('rotation' in item ? item.rotation ?? 0 : 0) * Math.PI / 180;
  if (![item.x, item.y, width, height, angle].every(Number.isFinite) || width <= 0 || height <= 0) return [];
  const rotatedWidth = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
  const rotatedHeight = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
  const centerX = (layout.containerWidth - layout.pageWidth) / 2 + item.x + width / 2;
  const centerY = layout.contentPadding + selection.pageIndex * layout.pageHeight + item.y + height / 2;
  return [{left: centerX - rotatedWidth / 2 - 36, right: centerX + rotatedWidth / 2 + 36,
    top: centerY - rotatedHeight / 2 - 96, bottom: centerY + rotatedHeight / 2 + 36}];
}
