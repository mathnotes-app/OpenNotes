import type { BackgroundType, LineSpacing } from '../types/note';

export function resolveLineSpacing(value: unknown): LineSpacing {
  return value === 'narrow' || value === 'compact' ? value : 'standard';
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
