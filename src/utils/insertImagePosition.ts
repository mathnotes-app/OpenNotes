type Transform = { scale: number; translateX: number; translateY: number; containerWidth: number; containerHeight: number };

/** Center an inserted image in the visible notebook, retaining one page owner. */
export function insertImagePosition(transform: Transform | null, pageWidth: number, pageHeight: number,
  pageCount: number, contentPadding: number, width: number, height: number, fallbackPage: number) {
  const count = Math.max(1, pageCount);
  const valid = transform && [transform.scale, transform.translateX, transform.translateY,
    transform.containerWidth, transform.containerHeight].every(Number.isFinite) && transform.scale > 0;
  const centerX = valid ? pageWidth / 2 - transform.translateX / transform.scale : pageWidth / 2;
  const centerY = valid ? transform.containerHeight / 2 - transform.translateY / transform.scale - contentPadding
    : Math.max(0, Math.min(count - 1, fallbackPage)) * pageHeight + pageHeight / 2;
  const clampedCenterY = Math.max(0, Math.min(count * pageHeight - 0.001, centerY));
  const pageIndex = Math.min(count - 1, Math.floor(clampedCenterY / pageHeight));
  return {
    pageIndex,
    x: Math.max(0, Math.min(Math.max(0, pageWidth - width), centerX - width / 2)),
    y: Math.max(0, Math.min(Math.max(0, count * pageHeight - height), clampedCenterY - height / 2)) - pageIndex * pageHeight,
  };
}
