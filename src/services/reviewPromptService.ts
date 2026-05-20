import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

type ReviewSignal = 'note_created' | 'note_opened' | 'note_saved' | 'note_exported';

interface ReviewPromptState {
  firstSeenAt: string;
  lastPromptedAt: string | null;
  promptCount: number;
  notesCreated: number;
  notesOpened: number;
  notesSaved: number;
  notesExported: number;
  pendingPositiveMoment: boolean;
}

const KEY = '@opennotes:reviewPrompt:v1';
const MIN_SESSION_AGE_MS = 15 * 60 * 1000;
const PROMPT_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_PROMPTS = 3;

function initialState(now: string): ReviewPromptState {
  return {
    firstSeenAt: now,
    lastPromptedAt: null,
    promptCount: 0,
    notesCreated: 0,
    notesOpened: 0,
    notesSaved: 0,
    notesExported: 0,
    pendingPositiveMoment: false,
  };
}

async function readState(): Promise<ReviewPromptState> {
  const now = new Date().toISOString();
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return initialState(now);
  try {
    return { ...initialState(now), ...(JSON.parse(raw) as Partial<ReviewPromptState>) };
  } catch {
    return initialState(now);
  }
}

async function writeState(state: ReviewPromptState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export async function recordReviewSignal(signal: ReviewSignal): Promise<void> {
  const state = await readState();
  switch (signal) {
    case 'note_created':
      state.notesCreated += 1;
      break;
    case 'note_opened':
      state.notesOpened += 1;
      break;
    case 'note_saved':
      state.notesSaved += 1;
      break;
    case 'note_exported':
      state.notesExported += 1;
      break;
  }
  state.pendingPositiveMoment = true;
  await writeState(state);
}

export async function requestReviewAfterPositiveMoment(): Promise<void> {
  const state = await readState();
  if (!state.pendingPositiveMoment || state.promptCount >= MAX_PROMPTS) return;

  const now = Date.now();
  const firstSeen = Date.parse(state.firstSeenAt);
  const lastPrompted = state.lastPromptedAt ? Date.parse(state.lastPromptedAt) : 0;
  if (Number.isFinite(firstSeen) && now - firstSeen < MIN_SESSION_AGE_MS) return;
  if (lastPrompted && now - lastPrompted < PROMPT_COOLDOWN_MS) return;

  const steadyUse = state.notesSaved >= 5 && state.notesOpened >= 3;
  const creatorUse = state.notesCreated >= 2 && state.notesSaved >= 3;
  const exportSuccess = state.notesExported >= 1 && state.notesSaved >= 2;
  if (!steadyUse && !creatorUse && !exportSuccess) return;

  const available = await StoreReview.isAvailableAsync();
  if (!available) return;

  const hasAction = await StoreReview.hasAction();
  if (!hasAction) return;

  await StoreReview.requestReview();
  await writeState({
    ...state,
    pendingPositiveMoment: false,
    promptCount: state.promptCount + 1,
    lastPromptedAt: new Date().toISOString(),
  });
}
