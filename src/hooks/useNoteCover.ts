import { useCallback, useRef } from 'react';
import { Alert, InteractionManager, Platform } from 'react-native';
import { pickFromLibrary } from '../services/imageInsertStorage';
import { updateMetadata } from '../services/notesRepo';
import type { NoteMetadata } from '../types/note';
import { t } from '../i18n';

export function useNoteCover(refresh: () => Promise<void>) {
  const pendingCover = useRef<NoteMetadata | null>(null);
  const presentPendingCover = useCallback(() => {
    const note = pendingCover.current;
    pendingCover.current = null;
    if (!note) return;
      void (async () => {
        try {
          const image = await pickFromLibrary(note.id);
          if (!image) return;
          const updated = await updateMetadata(note.id, { customCoverUri: image.uri });
          if (!updated) throw new Error('Note no longer exists');
          await refresh();
        } catch (error) {
          if (__DEV__) console.warn('[NoteCover] choose failed', error);
          Alert.alert(t.preferences.coverError,
            error instanceof Error && error.message === 'photo-access-denied' ? t.preferences.photoAccess : t.common.pleaseTryAgain);
        }
      })();
  }, [refresh]);
  const chooseCover = useCallback((note: NoteMetadata) => {
    pendingCover.current = note;
    // iOS waits for the native modal's onDismiss callback. Android does not
    // provide that callback, so wait for its interaction to finish instead.
    if (Platform.OS !== 'ios') InteractionManager.runAfterInteractions(presentPendingCover);
  }, [presentPendingCover]);
  const removeCover = useCallback(async (note: NoteMetadata) => {
    try {
      const updated = await updateMetadata(note.id, { customCoverUri: null });
      if (!updated) throw new Error('Note no longer exists');
      await refresh();
    } catch (error) {
      if (__DEV__) console.warn('[NoteCover] remove failed', error);
      Alert.alert(t.preferences.coverError, t.common.pleaseTryAgain);
    }
  }, [refresh]);
  return { chooseCover, removeCover, presentPendingCover };
}
