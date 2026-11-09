import type { BackgroundType, LineSpacing } from '../types/note';

export function resolveLineSpacing(value: unknown): LineSpacing {
  return isLineSpacing(value) ? value : 'standard';
}

export function isLineSpacing(value: unknown): value is LineSpacing {
  return value === 'standard' || value === 'narrow' || value === 'compact' ||
    (typeof value === 'string' && /^custom-(?:1[2-9]|[2-5][0-9]|60)$/.test(value));
}

export function lineCount(value: LineSpacing): number {
  if (value === 'narrow') return 24;
  if (value === 'compact') return 36;
  if (value.startsWith('custom-')) return Number(value.slice(7));
  return 18;
}

export function customLineSpacing(count: number): LineSpacing {
  return `custom-${Number.isFinite(count) ? Math.max(12, Math.min(60, Math.round(count))) : 18}`;
}

/** The stored background remains compatible with older versions of the app. */
export function paperBackgroundType(type: BackgroundType, spacing: unknown): string {
  const resolved = resolveLineSpacing(spacing);
  return type === 'lined' && resolved !== 'standard' ? `lined-${resolved}` : type;
}

/** Imported PDF pages retain their background; other pages use the note paper. */
export function pageBackgroundType(noteType: string | undefined, pageType: string | undefined): string {
  if (pageType === 'pdf') return 'pdf';
  return noteType === 'pdf' ? (pageType ?? 'plain') : (noteType ?? pageType ?? 'plain');
}
