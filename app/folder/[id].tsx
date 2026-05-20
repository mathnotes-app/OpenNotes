import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LibraryHeader } from '../../src/components/library/LibraryHeader';
import { NewItemFAB } from '../../src/components/library/NewItemFAB';
import { NoteCard } from '../../src/components/library/NoteCard';
import { EmptyState } from '../../src/components/library/EmptyState';
import { ItemActionsMenu } from '../../src/components/library/ItemActionsMenu';
import { RenameDialog } from '../../src/components/library/RenameDialog';
import { FolderPickerSheet } from '../../src/components/library/FolderPickerSheet';
import { CreateNoteBackgroundSheet } from '../../src/components/library/CreateNoteBackgroundSheet';
import { useTheme } from '../../src/hooks/useTheme';
import { spacing } from '../../src/theme/spacing';
import {
  createNote,
  deleteNote,
  listNotes,
  moveNote,
  renameNote,
} from '../../src/services/notesRepo';
import { createPdfNoteFromPicker } from '../../src/services/pdfImportService';
import {
  getFolder,
  listFolders,
  renameFolder,
} from '../../src/services/foldersRepo';
import { recordReviewSignal } from '../../src/services/reviewPromptService';
import type { BackgroundType, FolderMetadata, NoteMetadata } from '../../src/types/note';

type Action =
  | { kind: 'createNoteBackground' }
  | { kind: 'noteMenu'; note: NoteMetadata }
  | { kind: 'renameNote'; note: NoteMetadata }
  | { kind: 'renameFolder' }
  | { kind: 'moveNote'; note: NoteMetadata };

export default function FolderScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [folder, setFolder] = useState<FolderMetadata | null>(null);
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [allFolders, setAllFolders] = useState<FolderMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const creatingNoteRef = React.useRef(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [f, n, folders] = await Promise.all([
      getFolder(id),
      listNotes(id),
      listFolders(),
    ]);
    setFolder(f);
    setNotes(n.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
    setAllFolders(folders);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const handleCreateNote = useCallback(async (backgroundType: BackgroundType, title: string) => {
    if (!folder || creatingNoteRef.current) return;
    creatingNoteRef.current = true;
    setAction(null);
    void Haptics.selectionAsync();
    try {
      if (backgroundType !== 'pdf') {
        const meta = await createNote({
          folderId: folder.id,
          backgroundType,
          title: title.trim() || undefined,
        });
        void recordReviewSignal('note_created');
        router.push(`/note/${meta.id}`);
        return;
      }

      const meta = await createPdfNoteFromPicker({ folderId: folder.id, title });
      if (meta) {
        void recordReviewSignal('note_created');
        router.push(`/note/${meta.id}`);
      }
    } catch (error) {
      if (__DEV__) console.warn('[FolderScreen] create note failed', error);
      Alert.alert('Could not create note', 'Please try again.');
    } finally {
      creatingNoteRef.current = false;
    }
  }, [folder, router]);

  const confirmDeleteNote = useCallback((note: NoteMetadata) => {
    Alert.alert(
      'Delete note?',
      `"${note.title}" will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote(note.id);
              await refresh();
            } catch (error) {
              if (__DEV__) console.warn('[FolderScreen] delete note failed', error);
              Alert.alert('Could not delete note', 'Please try again.');
            }
          },
        },
      ],
    );
  }, [refresh]);

  if (!id || (loading && !folder)) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.flex, { backgroundColor: theme.colors.background }]}
      >
        <LibraryHeader
          title="Folder"
          showBack
          onBack={() => router.replace('/')}
        />
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <LibraryHeader
        title={folder?.name ?? 'Folder'}
        showBack
        onBack={() => router.replace('/')}
        rightIcon="create-outline"
        onRightPress={() => setAction({ kind: 'renameFolder' })}
      />

      {notes.length === 0 ? (
        <EmptyState
          title="Empty folder"
          subtitle={`Tap the plus button to add a note to ${folder?.name ?? 'this folder'}.`}
          iconName="folder-open-outline"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.list}>
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onPress={() => {
                  void recordReviewSignal('note_opened');
                  router.push(`/note/${note.id}`);
                }}
                onLongPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setAction({ kind: 'noteMenu', note });
                }}
                onMenuPress={() => setAction({ kind: 'noteMenu', note })}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <NewItemFAB onPress={() => setAction({ kind: 'createNoteBackground' })} />

      <CreateNoteBackgroundSheet
        visible={action?.kind === 'createNoteBackground'}
        onPick={(type, title) => void handleCreateNote(type, title)}
        onClose={() => setAction(null)}
      />

      <ItemActionsMenu
        visible={action?.kind === 'noteMenu'}
        title={action?.kind === 'noteMenu' ? action.note.title : undefined}
        actions={
          action?.kind === 'noteMenu'
            ? [
                {
                  key: 'rename',
                  label: 'Rename',
                  onPress: () => setAction({ kind: 'renameNote', note: action.note }),
                },
                {
                  key: 'moveRoot',
                  label: 'Move to Root',
                  onPress: async () => {
                    await moveNote(action.note.id, null);
                    await refresh();
                  },
                },
                {
                  key: 'move',
                  label: 'Move to Folder',
                  onPress: () => setAction({ kind: 'moveNote', note: action.note }),
                },
                {
                  key: 'delete',
                  label: 'Delete',
                  destructive: true,
                  onPress: () => confirmDeleteNote(action.note),
                },
              ]
            : []
        }
        onClose={() => setAction(null)}
      />

      <RenameDialog
        visible={action?.kind === 'renameNote'}
        title="Rename note"
        initialValue={action?.kind === 'renameNote' ? action.note.title : ''}
        placeholder="Note title"
        onCancel={() => setAction(null)}
        onConfirm={async (value) => {
          if (action?.kind === 'renameNote') {
            await renameNote(action.note.id, value);
            await refresh();
          }
          setAction(null);
        }}
      />

      <RenameDialog
        visible={action?.kind === 'renameFolder'}
        title="Rename folder"
        initialValue={folder?.name ?? ''}
        placeholder="Folder name"
        onCancel={() => setAction(null)}
        onConfirm={async (value) => {
          if (folder) {
            await renameFolder(folder.id, value);
            await refresh();
          }
          setAction(null);
        }}
      />

      <FolderPickerSheet
        visible={action?.kind === 'moveNote'}
        folders={allFolders.filter((f) => f.id !== folder?.id)}
        currentFolderId={action?.kind === 'moveNote' ? action.note.folderId : null}
        allowMoveToRoot
        onPick={async (folderId) => {
          if (action?.kind === 'moveNote') {
            await moveNote(action.note.id, folderId);
            await refresh();
          }
        }}
        onClose={() => setAction(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
    paddingHorizontal: spacing.lg,
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    columnGap: spacing.md,
    rowGap: spacing.lg,
  },
});
