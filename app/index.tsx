import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LibraryHeader } from '../src/components/library/LibraryHeader';
import { NewItemFAB } from '../src/components/library/NewItemFAB';
import { FolderCard } from '../src/components/library/FolderCard';
import { NoteCard } from '../src/components/library/NoteCard';
import { EmptyState } from '../src/components/library/EmptyState';
import { ItemActionsMenu } from '../src/components/library/ItemActionsMenu';
import { RenameDialog } from '../src/components/library/RenameDialog';
import { FolderPickerSheet } from '../src/components/library/FolderPickerSheet';
import { CreateNoteBackgroundSheet } from '../src/components/library/CreateNoteBackgroundSheet';
import { OnboardingExperience } from '../src/components/onboarding/OnboardingExperience';
import { CommunityInviteSheet } from '../src/components/library/CommunityInviteSheet';
import { OpenNotesSheet } from '../src/components/library/OpenNotesSheet';
import { LibrarySection } from '../src/components/library/LibrarySection';
import { useOnboarding } from '../src/hooks/useOnboarding';
import { useBackup } from '../src/hooks/useBackup';
import { useLibrarySupport } from '../src/hooks/useLibrarySupport';
import { useTheme } from '../src/hooks/useTheme';
import { spacing } from '../src/theme/spacing';
import {
  createNote,
  deleteNote,
  listAllMetadata,
  moveNote,
  renameNote,
} from '../src/services/notesRepo';
import { createPdfNoteFromPicker } from '../src/services/pdfImportService';
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
} from '../src/services/foldersRepo';
import { recordReviewSignal } from '../src/services/reviewPromptService';
import type { BackgroundType, FolderMetadata, NoteMetadata } from '../src/types/note';
import { t } from '../src/i18n';

type Action =
  | { kind: 'newItem' }
  | { kind: 'openNotes' }
  | { kind: 'community' }
  | { kind: 'createNoteBackground' }
  | { kind: 'noteMenu'; note: NoteMetadata }
  | { kind: 'folderMenu'; folder: FolderMetadata }
  | { kind: 'renameNote'; note: NoteMetadata }
  | { kind: 'renameFolder'; folder: FolderMetadata }
  | { kind: 'createFolder' }
  | { kind: 'moveNote'; note: NoteMetadata };

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [folders, setFolders] = useState<FolderMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const creatingNoteRef = useRef(false);
  const onboarding = useOnboarding();

  const refresh = useCallback(async () => {
    const [allNotes, allFolders] = await Promise.all([
      listAllMetadata(),
      listFolders(),
    ]);
    setNotes(allNotes);
    setFolders(allFolders);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const closeSupport = useCallback(() => setAction(null), []);
  const showCommunity = useCallback(
    () => setAction({ kind: 'community' }),
    [],
  );
  const {
    backupSupported,
    backupEnabled,
    backupSubtitle,
    toggleBackup,
    setBackupPreference,
  } = useBackup(refresh, onboarding.ready && !onboarding.visible);
  const { dismissCommunity, joinCommunity, rateOpenNotes } = useLibrarySupport({
    canShowAutomaticPrompt:
      onboarding.ready && !onboarding.visible && action === null,
    onClose: closeSupport,
    onShowCommunity: showCommunity,
  });

  const rootNotes = useMemo(
    () =>
      notes
        .filter((n) => n.folderId === null)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [notes],
  );
  const noteCountByFolder = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      if (n.folderId) map.set(n.folderId, (map.get(n.folderId) ?? 0) + 1);
    }
    return map;
  }, [notes]);
  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [folders],
  );

  const openNote = useCallback(
    (id: string) => {
      void Haptics.selectionAsync();
      void recordReviewSignal('note_opened');
      router.push(`/note/${id}`);
    },
    [router],
  );

  const openFolder = useCallback(
    (id: string) => {
      void Haptics.selectionAsync();
      router.push(`/folder/${id}`);
    },
    [router],
  );

  const handleCreateNote = useCallback(async (backgroundType: BackgroundType, title: string) => {
    if (creatingNoteRef.current) return;
    creatingNoteRef.current = true;
    setAction(null);
    try {
      if (backgroundType !== 'pdf') {
        const meta = await createNote({
          folderId: null,
          backgroundType,
          title: title.trim() || undefined,
        });
        void recordReviewSignal('note_created');
        openNote(meta.id);
        return;
      }

      const meta = await createPdfNoteFromPicker({ folderId: null, title });
      if (meta) {
        void recordReviewSignal('note_created');
        openNote(meta.id);
      }
    } catch (error) {
      if (__DEV__) console.warn('[LibraryScreen] create note failed', error);
      Alert.alert(t.library.couldNotCreateNote, t.common.pleaseTryAgain);
    } finally {
      creatingNoteRef.current = false;
    }
  }, [openNote]);

  const handleCreateFolder = useCallback(() => {
    setAction({ kind: 'createFolder' });
  }, []);

  const confirmDeleteNote = useCallback((note: NoteMetadata) => {
    Alert.alert(
      t.library.deleteNoteTitle,
      t.library.deleteNoteMessage(note.title),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote(note.id);
              await refresh();
            } catch (error) {
              if (__DEV__) console.warn('[LibraryScreen] delete note failed', error);
              Alert.alert(t.library.couldNotDeleteNote, t.common.pleaseTryAgain);
            }
          },
        },
      ],
    );
  }, [refresh]);

  const confirmDeleteFolderKeepNotes = useCallback((folder: FolderMetadata) => {
    Alert.alert(
      t.library.deleteFolderTitle,
      t.library.deleteFolderMessage(folder.name),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.library.deleteFolderLabel,
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolder(folder.id, 'orphan-notes');
              await refresh();
            } catch (error) {
              if (__DEV__) console.warn('[LibraryScreen] delete folder failed', error);
              Alert.alert(t.library.couldNotDeleteFolder, t.common.pleaseTryAgain);
            }
          },
        },
      ],
    );
  }, [refresh]);

  const confirmDeleteFolderAndNotes = useCallback((folder: FolderMetadata, noteCount: number) => {
    Alert.alert(
      t.library.deleteFolderAndNotesTitle,
      t.library.deleteFolderAndNotesMessage(folder.name, t.library.noteCount(noteCount)),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.library.deleteAllLabel,
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolder(folder.id, 'delete-notes');
              await refresh();
            } catch (error) {
              if (__DEV__) console.warn('[LibraryScreen] delete folder notes failed', error);
              Alert.alert(t.library.couldNotDeleteFolder, t.common.pleaseTryAgain);
            }
          },
        },
      ],
    );
  }, [refresh]);

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <LibraryHeader
        title="OpenNotes"
        rightActions={[
          {
            key: 'openNotes',
            icon: 'heart-outline',
            accessibilityLabel: t.library.supportA11y,
            onPress: () => setAction({ kind: 'openNotes' }),
          },
        ]}
      />
      {loading || !onboarding.ready ? (
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : sortedFolders.length === 0 && rootNotes.length === 0 ? (
        <EmptyState
          title={t.library.emptyTitle}
          subtitle={t.library.emptySubtitle}
          iconName="document-outline"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {sortedFolders.length > 0 ? (
            <LibrarySection title={t.library.foldersSection}>
              <View style={styles.list}>
                {sortedFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    noteCount={noteCountByFolder.get(folder.id) ?? 0}
                    onPress={() => openFolder(folder.id)}
                    onLongPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setAction({ kind: 'folderMenu', folder });
                    }}
                    onMenuPress={() => setAction({ kind: 'folderMenu', folder })}
                  />
                ))}
              </View>
            </LibrarySection>
          ) : null}

          {rootNotes.length > 0 ? (
            <LibrarySection title={sortedFolders.length > 0 ? t.library.notesSection : ''}>
              <View style={styles.list}>
                {rootNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onPress={() => openNote(note.id)}
                    onLongPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setAction({ kind: 'noteMenu', note });
                    }}
                    onMenuPress={() => setAction({ kind: 'noteMenu', note })}
                  />
                ))}
              </View>
            </LibrarySection>
          ) : null}
        </ScrollView>
      )}

      <NewItemFAB onPress={() => setAction({ kind: 'newItem' })} />

      <OpenNotesSheet
        visible={action?.kind === 'openNotes'}
        onClose={() => setAction(null)}
        onJoinCommunity={() => void joinCommunity()}
        onRate={() => void rateOpenNotes()}
        onViewIntroduction={() => {
          setAction(null);
          onboarding.show();
        }}
        backupSupported={backupSupported}
        backupEnabled={backupEnabled}
        backupSubtitle={backupSubtitle}
        onToggleBackup={toggleBackup}
      />

      <CommunityInviteSheet
        visible={action?.kind === 'community'}
        onClose={() => void dismissCommunity()}
        onJoin={() => void joinCommunity()}
      />

      <OnboardingExperience
        visible={onboarding.ready && onboarding.visible}
        onComplete={onboarding.finish}
        showBackupSlide={backupSupported}
        onChooseBackup={setBackupPreference}
      />

      <ItemActionsMenu
        visible={action?.kind === 'newItem'}
        title={t.library.createTitle}
        actions={[
          {
            key: 'note',
            label: t.library.newNote,
            onPress: () => setAction({ kind: 'createNoteBackground' }),
          },
          {
            key: 'folder',
            label: t.library.newFolder,
            onPress: handleCreateFolder,
          },
        ]}
        onClose={() => setAction(null)}
      />

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
                  label: t.common.rename,
                  onPress: () => setAction({ kind: 'renameNote', note: action.note }),
                },
                {
                  key: 'move',
                  label: t.library.moveToFolder,
                  onPress: () => setAction({ kind: 'moveNote', note: action.note }),
                },
                {
                  key: 'delete',
                  label: t.common.delete,
                  destructive: true,
                  onPress: () => confirmDeleteNote(action.note),
                },
              ]
            : []
        }
        onClose={() => setAction(null)}
      />

      <ItemActionsMenu
        visible={action?.kind === 'folderMenu'}
        title={action?.kind === 'folderMenu' ? action.folder.name : undefined}
        actions={
          action?.kind === 'folderMenu'
            ? [
                {
                  key: 'rename',
                  label: t.common.rename,
                  onPress: () =>
                    setAction({ kind: 'renameFolder', folder: action.folder }),
                },
                {
                  key: 'orphan',
                  label: t.library.deleteKeepNotesLabel,
                  destructive: true,
                  onPress: () => confirmDeleteFolderKeepNotes(action.folder),
                },
                {
                  key: 'deleteNotes',
                  label: t.library.deleteFolderAndNotesLabel,
                  destructive: true,
                  onPress: () =>
                    confirmDeleteFolderAndNotes(
                      action.folder,
                      noteCountByFolder.get(action.folder.id) ?? 0,
                    ),
                },
              ]
            : []
        }
        onClose={() => setAction(null)}
      />

      <RenameDialog
        visible={action?.kind === 'renameNote'}
        title={t.library.renameNoteTitle}
        initialValue={action?.kind === 'renameNote' ? action.note.title : ''}
        placeholder={t.library.noteTitlePlaceholder}
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
        title={t.library.renameFolderTitle}
        initialValue={action?.kind === 'renameFolder' ? action.folder.name : ''}
        placeholder={t.library.folderNamePlaceholder}
        onCancel={() => setAction(null)}
        onConfirm={async (value) => {
          if (action?.kind === 'renameFolder') {
            await renameFolder(action.folder.id, value);
            await refresh();
          }
          setAction(null);
        }}
      />

      <RenameDialog
        visible={action?.kind === 'createFolder'}
        title={t.library.newFolderTitle}
        initialValue=""
        placeholder={t.library.folderNamePlaceholder}
        confirmLabel={t.common.create}
        onCancel={() => setAction(null)}
        onConfirm={async (value) => {
          if (!value.trim()) {
            setAction(null);
            return;
          }
          await createFolder(value);
          await refresh();
          setAction(null);
        }}
      />

      <FolderPickerSheet
        visible={action?.kind === 'moveNote'}
        folders={sortedFolders}
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
