import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { createPromiseQueue } from '../utils/promiseQueue';

const stateQueue = createPromiseQueue();

interface ReviewPromptState {
  lastPromptedAt: string | null;
  promptCount: number;
  notesSaved: number;
  pendingPositiveMoment: boolean;
}

const KEY = '@opennotes:reviewPrompt:v1';
const PROMPT_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_PROMPTS = 3;

function initialState(): ReviewPromptState {
  return {
    lastPromptedAt: null,
    promptCount: 0,
    notesSaved: 0,
    pendingPositiveMoment: false,
  };
}

async function readState(): Promise<ReviewPromptState> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return initialState();
  try {
    return { ...initialState(), ...(JSON.parse(raw) as Partial<ReviewPromptState>) };
  } catch (error) {
    if (__DEV__) console.warn('[reviewPromptService] invalid stored state', error);
    return initialState();
  }
}

async function writeState(state: ReviewPromptState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

async function requestAutomaticReview(): Promise<void> {
  const state = await readState();
  if (!state.pendingPositiveMoment || state.notesSaved < 1 || state.promptCount >= MAX_PROMPTS) return;

  const now = Date.now();
  const lastPrompted = state.lastPromptedAt ? Date.parse(state.lastPromptedAt) : 0;
  if (lastPrompted && now - lastPrompted < PROMPT_COOLDOWN_MS) return;

  await requestReview(state);
}

async function requestReview(state: ReviewPromptState): Promise<boolean> {
  const available = await StoreReview.isAvailableAsync();
  if (!available) return false;

  const hasAction = await StoreReview.hasAction();
  if (!hasAction) return false;

  await StoreReview.requestReview();
  await writeState({
    ...state,
    pendingPositiveMoment: false,
    promptCount: state.promptCount + 1,
    lastPromptedAt: new Date().toISOString(),
  });
  return true;
}

export function recordReviewSave(): Promise<void> {
  return stateQueue.enqueue(async () => {
    const state = await readState();
    await writeState({
      ...state,
      notesSaved: state.notesSaved + 1,
      pendingPositiveMoment: true,
    });
  }).catch((error) => {
    if (__DEV__) console.warn('[reviewPromptService] save tracking failed', error);
  });
}

export function requestReviewAfterPositiveMoment(): Promise<void> {
  return stateQueue.enqueue(requestAutomaticReview);
}

export function requestManualReview(): Promise<boolean> {
  return stateQueue.enqueue(async () => requestReview(await readState()));
}
