export type ResizeHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const DEFAULT_MIN_SIZE = 50;
function clamp(value: number, min: number, max: number): number {
  'worklet'; return Math.max(min, Math.min(max, value));
}

// Vertical positions are owner-relative and may span neighboring pages.
export function resizeFromCorner(
  direction: ResizeHandle,
  baseX: number,
  baseY: number,
  baseWidth: number,
  baseHeight: number,
  dx: number,
  dy: number,
  pageWidth: number,
  preserveAspectRatio: boolean,
) {
  'worklet';
  const aspectRatio = baseHeight > 0 ? baseWidth / baseHeight : 1;
  let nextX = baseX;
  let nextY = baseY;
  let nextWidth = baseWidth;
  let nextHeight = baseHeight;

  if (preserveAspectRatio) {
    const rawWidth = direction.includes('left') ? baseWidth - dx : baseWidth + dx;
    const rawHeight = direction.includes('top') ? baseHeight - dy : baseHeight + dy;
    const widthScale = rawWidth / baseWidth;
    const heightScale = rawHeight / baseHeight;
    const minScale = Math.max(DEFAULT_MIN_SIZE / baseWidth, DEFAULT_MIN_SIZE / baseHeight);
    const uniformScale = Math.max(minScale, Math.max(widthScale, heightScale));

    nextWidth = Math.min(pageWidth, baseWidth * uniformScale);
    nextHeight = nextWidth / aspectRatio;

    if (direction.includes('left')) nextX = baseX + (baseWidth - nextWidth);
    if (direction.includes('top')) nextY = baseY + (baseHeight - nextHeight);
  } else {
    if (direction.includes('right')) {
      nextWidth = Math.max(DEFAULT_MIN_SIZE, baseWidth + dx);
    }
    if (direction.includes('left')) {
      const widthDelta = Math.min(dx, baseWidth - DEFAULT_MIN_SIZE);
      nextWidth = baseWidth - widthDelta;
      nextX = baseX + widthDelta;
    }
    if (direction.includes('bottom')) {
      nextHeight = Math.max(DEFAULT_MIN_SIZE, baseHeight + dy);
    }
    if (direction.includes('top')) {
      const heightDelta = Math.min(dy, baseHeight - DEFAULT_MIN_SIZE);
      nextHeight = baseHeight - heightDelta;
      nextY = baseY + heightDelta;
    }
  }

  nextX = clamp(nextX, 0, Math.max(0, pageWidth - nextWidth));
  nextWidth = Math.min(nextWidth, pageWidth - nextX);

  return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
}


export type AssetFrame = {x: number; y: number; width: number; height: number};
export type CropRect = AssetFrame;
export type CropHandle = ResizeHandle | 'left' | 'right' | 'top' | 'bottom';

export function localPointerDelta(dx: number, dy: number, scale: number, rotation: number) {
  'worklet';
  const angle = rotation * Math.PI / 180;
  return {x: (dx * Math.cos(angle) + dy * Math.sin(angle)) / scale,
    y: (-dx * Math.sin(angle) + dy * Math.cos(angle)) / scale};
}

/** Convert a local-axis resize to a center-rotated frame, fixing the opposite edge. */
export function anchorRotatedFrame(before: AssetFrame, next: AssetFrame, rotation: number): AssetFrame {
  'worklet';
  const angle = rotation * Math.PI / 180;
  const dx = next.x - before.x + (next.width - before.width) / 2;
  const dy = next.y - before.y + (next.height - before.height) / 2;
  return {...next,
    x: before.x + before.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - next.width / 2,
    y: before.y + before.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - next.height / 2};
}

/** Deltas are local image-axis units; normalized crop and visible size stay in sync. */
export function cropFromEdge(before: AssetFrame, crop: CropRect, edge: CropHandle,
  dx: number, dy: number, rotation: number) {
  'worklet';
  const fullWidth = before.width / Math.max(0.001, crop.width);
  const fullHeight = before.height / Math.max(0.001, crop.height);
  const minWidth = Math.min(before.width, Math.max(36, fullWidth * 0.02));
  const minHeight = Math.min(before.height, Math.max(36, fullHeight * 0.02));
  const next = {...before};
  const nextCrop = {...crop};
  if (edge.includes('left')) {
    const delta = clamp(dx, -crop.x * fullWidth, before.width - minWidth);
    next.x += delta; next.width -= delta;
    nextCrop.x += delta / fullWidth; nextCrop.width -= delta / fullWidth;
  } else if (edge.includes('right')) {
    const delta = clamp(dx, minWidth - before.width, (1 - crop.x - crop.width) * fullWidth);
    next.width += delta; nextCrop.width += delta / fullWidth;
  }
  if (edge.includes('top')) {
    const delta = clamp(dy, -crop.y * fullHeight, before.height - minHeight);
    next.y += delta; next.height -= delta;
    nextCrop.y += delta / fullHeight; nextCrop.height -= delta / fullHeight;
  } else if (edge.includes('bottom')) {
    const delta = clamp(dy, minHeight - before.height, (1 - crop.y - crop.height) * fullHeight);
    next.height += delta; nextCrop.height += delta / fullHeight;
  }
  return {frame: anchorRotatedFrame(before, next, rotation), crop: nextCrop};
}
