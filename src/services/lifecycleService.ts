import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createLifecycleState,
  normalizeLifecycleState,
  recordUniqueNoteSave,
  shouldOfferCommunity,
  type CommunityPromptState,
  type LifecycleState,
} from './lifecyclePolicy';
import { createPromiseQueue } from '../utils/promiseQueue';

const LIFECYCLE_KEY = '@opennotes:lifecycle:v1';

const stateQueue = createPromiseQueue();
let communityPromptClaimedThisSession = false;

function withStateLock<T>(operation: () => Promise<T>): Promise<T> {
  return stateQueue.enqueue(operation);
}

async function readStateUnlocked(): Promise<LifecycleState> {
  const now = new Date().toISOString();
  const raw = await AsyncStorage.getItem(LIFECYCLE_KEY);
  if (!raw) return createLifecycleState(now);

  try {
    return normalizeLifecycleState(
      JSON.parse(raw) as Partial<LifecycleState>,
      now,
    );
  } catch (error) {
    if (__DEV__) console.warn('[lifecycleService] invalid stored state', error);
    return createLifecycleState(now);
  }
}

async function writeStateUnlocked(state: LifecycleState): Promise<void> {
  await AsyncStorage.setItem(LIFECYCLE_KEY, JSON.stringify(state));
}

export async function recordSuccessfulNoteSave(noteId: string): Promise<void> {
  if (!noteId) return;
  await withStateLock(async () => {
    const state = await readStateUnlocked();
    const next = recordUniqueNoteSave(state, noteId, new Date().toISOString());
    await writeStateUnlocked(next);
  });
}

export async function claimCommunityPrompt(): Promise<boolean> {
  return withStateLock(async () => {
    if (communityPromptClaimedThisSession) return false;
    const state = await readStateUnlocked();
    if (!shouldOfferCommunity(state)) return false;
    communityPromptClaimedThisSession = true;
    return true;
  });
}

export async function resolveCommunityPrompt(
  resolution: Extract<CommunityPromptState, 'joined' | 'dismissed'>,
): Promise<void> {
  await withStateLock(async () => {
    const state = await readStateUnlocked();
    await writeStateUnlocked({
      ...state,
      communityPromptState: resolution,
      communityHandledAt: new Date().toISOString(),
    });
  });
}
