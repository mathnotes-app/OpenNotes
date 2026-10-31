import { useCallback } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { pickFromLibrary } from '../services/imageInsertStorage';
import { updateMetadata } from '../services/notesRepo';
import type { NoteMetadata } from '../types/note';
import { t } from '../i18n';

export function useNoteCover(refresh: () => Promise<void>) {
  const chooseCover = useCallback((note: NoteMetadata) => {
    // Let the action sheet finish dismissing before presenting the picker.
    InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const image = await pickFromLibrary(note.id);
          if (!image) return;
          const updated = await updateMetadata(note.id, { customCoverUri: image.uri });
          if (!updated) throw new Error('Note no longer exists');
          await refresh();
        } catch (error) {
          if (__DEV__) console.warn('[NoteCover] choose failed', error);
          Alert.alert(t.preferences.coverError, t.common.pleaseTryAgain);
        }
      })();
    });
  }, [refresh]);
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
  return { chooseCover, removeCover };
}
