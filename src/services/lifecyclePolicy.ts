export const COMMUNITY_NOTE_THRESHOLD = 3;

export type CommunityPromptState = 'pending' | 'joined' | 'dismissed';

export interface LifecycleState {
  firstSeenAt: string;
  lastSuccessfulSaveAt: string | null;
  savedNoteIds: string[];
  communityPromptState: CommunityPromptState;
  communityHandledAt: string | null;
}

export function createLifecycleState(now: string): LifecycleState {
  return {
    firstSeenAt: now,
    lastSuccessfulSaveAt: null,
    savedNoteIds: [],
    communityPromptState: 'pending',
    communityHandledAt: null,
  };
}

export function normalizeLifecycleState(
  value: Partial<LifecycleState> | null | undefined,
  now: string,
): LifecycleState {
  const fallback = createLifecycleState(now);
  if (!value) return fallback;

  const communityPromptState =
    value.communityPromptState === 'joined' ||
    value.communityPromptState === 'dismissed'
      ? value.communityPromptState
      : 'pending';

  return {
    firstSeenAt: isIsoDate(value.firstSeenAt) ? value.firstSeenAt : now,
    lastSuccessfulSaveAt: isIsoDate(value.lastSuccessfulSaveAt)
      ? value.lastSuccessfulSaveAt
      : null,
    savedNoteIds: uniqueStrings(value.savedNoteIds).slice(0, COMMUNITY_NOTE_THRESHOLD),
    communityPromptState,
    communityHandledAt: isIsoDate(value.communityHandledAt)
      ? value.communityHandledAt
      : null,
  };
}

export function recordUniqueNoteSave(
  state: LifecycleState,
  noteId: string,
  now: string,
): LifecycleState {
  const savedNoteIds = state.savedNoteIds.includes(noteId)
    ? state.savedNoteIds
    : [...state.savedNoteIds, noteId].slice(0, COMMUNITY_NOTE_THRESHOLD);

  return {
    ...state,
    lastSuccessfulSaveAt: now,
    savedNoteIds,
  };
}

export function shouldOfferCommunity(state: LifecycleState): boolean {
  return (
    state.communityPromptState === 'pending' &&
    state.savedNoteIds.length >= COMMUNITY_NOTE_THRESHOLD
  );
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
}
