import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMUNITY_NOTE_THRESHOLD,
  createLifecycleState,
  normalizeLifecycleState,
  recordUniqueNoteSave,
  shouldOfferCommunity,
} from '../src/services/lifecyclePolicy.ts';

const startedAt = '2026-01-01T00:00:00.000Z';

function stateWithSaves(count) {
  let state = createLifecycleState(startedAt);
  for (let index = 0; index < count; index += 1) {
    state = recordUniqueNoteSave(
      state,
      `note-${index}`,
      new Date(Date.parse(startedAt) + index * 1000).toISOString(),
    );
  }
  return state;
}

test('community prompt becomes eligible on the third unique saved note', () => {
  assert.equal(shouldOfferCommunity(stateWithSaves(COMMUNITY_NOTE_THRESHOLD - 1)), false);
  assert.equal(shouldOfferCommunity(stateWithSaves(COMMUNITY_NOTE_THRESHOLD)), true);
});

test('repeated saves of one note do not advance milestones', () => {
  let state = createLifecycleState(startedAt);
  for (let index = 0; index < 20; index += 1) {
    state = recordUniqueNoteSave(state, 'same-note', startedAt);
  }
  assert.deepEqual(state.savedNoteIds, ['same-note']);
  assert.equal(shouldOfferCommunity(state), false);
});

test('community prompt never returns after it is resolved', () => {
  const eligible = stateWithSaves(COMMUNITY_NOTE_THRESHOLD);
  for (const communityPromptState of ['joined', 'dismissed']) {
    assert.equal(
      shouldOfferCommunity({ ...eligible, communityPromptState }),
      false,
    );
  }
});

test('normalization repairs corrupt fields and bounds saved note ids', () => {
  const normalized = normalizeLifecycleState(
    {
      firstSeenAt: 'not-a-date',
      savedNoteIds: ['a', 'a', 'b', 'c', 'd', 'e', 'f'],
      communityPromptState: 'unexpected',
    },
    startedAt,
  );

  assert.equal(normalized.firstSeenAt, startedAt);
  assert.equal(normalized.savedNoteIds.length, COMMUNITY_NOTE_THRESHOLD);
  assert.equal(normalized.communityPromptState, 'pending');
});

test('normalization recovers the legacy shown state after an interrupted prompt', () => {
  const normalized = normalizeLifecycleState(
    {
      ...stateWithSaves(COMMUNITY_NOTE_THRESHOLD),
      communityPromptState: 'shown',
    },
    startedAt,
  );

  assert.equal(normalized.communityPromptState, 'pending');
  assert.equal(shouldOfferCommunity(normalized), true);
});
