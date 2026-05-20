import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LibraryHeader } from '../src/components/library/LibraryHeader';
import { NewItemFAB } from '../src/components/library/NewItemFAB';
import { FolderCard } from '../src/components/library/FolderCard';
import { NoteCard } from '../src/components/library/NoteCard';
import { EmptyState } from '../src/components/library/EmptyState';
import { ItemActionsMenu } from '../src/components/library/ItemActionsMenu';
import { RenameDialog } from '../src/components/library/RenameDialog';
import { FolderPickerSheet } from '../src/components/library/FolderPickerSheet';
import { CreateNoteBackgroundSheet } from '../src/components/library/CreateNoteBackgroundSheet';
import { Sheet } from '../src/components/ui/Sheet';
import { useTheme } from '../src/hooks/useTheme';
import { spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
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
import type { BackgroundType, FolderMetadata, NoteMetadata } from '../src/types/note';

type Action =
  | { kind: 'newItem' }
  | { kind: 'about' }
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
        openNote(meta.id);
        return;
      }

      const meta = await createPdfNoteFromPicker({ folderId: null, title });
      if (meta) openNote(meta.id);
    } catch (error) {
      if (__DEV__) console.warn('[LibraryScreen] create note failed', error);
      Alert.alert('Could not create note', 'Please try again.');
    } finally {
      creatingNoteRef.current = false;
    }
  }, [openNote]);

  const handleCreateFolder = useCallback(() => {
    setAction({ kind: 'createFolder' });
  }, []);

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
              if (__DEV__) console.warn('[LibraryScreen] delete note failed', error);
              Alert.alert('Could not delete note', 'Please try again.');
            }
          },
        },
      ],
    );
  }, [refresh]);

  const confirmDeleteFolderKeepNotes = useCallback((folder: FolderMetadata) => {
    Alert.alert(
      'Delete folder?',
      `"${folder.name}" will be deleted. Its notes will stay in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Folder',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolder(folder.id, 'orphan-notes');
              await refresh();
            } catch (error) {
              if (__DEV__) console.warn('[LibraryScreen] delete folder failed', error);
              Alert.alert('Could not delete folder', 'Please try again.');
            }
          },
        },
      ],
    );
  }, [refresh]);

  const confirmDeleteFolderAndNotes = useCallback((folder: FolderMetadata, noteCount: number) => {
    const noteText = noteCount === 1 ? '1 note' : `${noteCount} notes`;
    Alert.alert(
      'Delete folder and notes?',
      `"${folder.name}" and ${noteText} inside it will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolder(folder.id, 'delete-notes');
              await refresh();
            } catch (error) {
              if (__DEV__) console.warn('[LibraryScreen] delete folder notes failed', error);
              Alert.alert('Could not delete folder', 'Please try again.');
            }
          },
        },
      ],
    );
  }, [refresh]);

  const openUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      if (__DEV__) console.warn('[LibraryScreen] open link failed', error);
      Alert.alert('Could not open link', 'Please try again.');
    }
  }, []);

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <LibraryHeader
        title="simplenotes"
        rightActions={[
          {
            key: 'github',
            icon: 'logo-github',
            accessibilityLabel: 'Open simplenotes on GitHub',
            onPress: () => void openUrl('https://github.com/mathnotes-app/simplenotes'),
          },
          {
            key: 'x',
            icon: 'logo-x',
            accessibilityLabel: 'Open Mark Miller on X',
            onPress: () => void openUrl('https://x.com/markpm39'),
          },
          {
            key: 'about',
            icon: 'information-circle-outline',
            accessibilityLabel: 'About simplenotes',
            onPress: () => setAction({ kind: 'about' }),
          },
        ]}
      />
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : sortedFolders.length === 0 && rootNotes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          subtitle="Tap the plus button to create your first note or folder."
          iconName="document-outline"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {sortedFolders.length > 0 ? (
            <Section title="Folders" theme={theme}>
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
            </Section>
          ) : null}

          {rootNotes.length > 0 ? (
            <Section title={sortedFolders.length > 0 ? 'Notes' : ''} theme={theme}>
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
            </Section>
          ) : null}
        </ScrollView>
      )}

      <NewItemFAB onPress={() => setAction({ kind: 'newItem' })} />

      <AboutSheet
        visible={action?.kind === 'about'}
        onClose={() => setAction(null)}
      />

      <ItemActionsMenu
        visible={action?.kind === 'newItem'}
        title="Create"
        actions={[
          {
            key: 'note',
            label: 'New Note',
            onPress: () => setAction({ kind: 'createNoteBackground' }),
          },
          {
            key: 'folder',
            label: 'New Folder',
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
                  label: 'Rename',
                  onPress: () => setAction({ kind: 'renameNote', note: action.note }),
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

      <ItemActionsMenu
        visible={action?.kind === 'folderMenu'}
        title={action?.kind === 'folderMenu' ? action.folder.name : undefined}
        actions={
          action?.kind === 'folderMenu'
            ? [
                {
                  key: 'rename',
                  label: 'Rename',
                  onPress: () =>
                    setAction({ kind: 'renameFolder', folder: action.folder }),
                },
                {
                  key: 'orphan',
                  label: 'Delete (keep notes)',
                  destructive: true,
                  onPress: () => confirmDeleteFolderKeepNotes(action.folder),
                },
                {
                  key: 'deleteNotes',
                  label: 'Delete folder and all notes',
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
        initialValue={action?.kind === 'renameFolder' ? action.folder.name : ''}
        placeholder="Folder name"
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
        title="New folder"
        initialValue=""
        placeholder="Folder name"
        confirmLabel="Create"
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

function AboutSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.aboutHeader}>
        <View style={[styles.aboutIcon, { backgroundColor: theme.colors.accentMuted }]}>
          <Ionicons name="information-circle-outline" size={22} color={theme.colors.accent} />
        </View>
        <View style={styles.aboutTitleBlock}>
          <Text style={[typography.title, { color: theme.colors.text }]}>
            About simplenotes
          </Text>
          <Text style={[typography.footnote, { color: theme.colors.textSecondary }]}>
            Simple notes, open foundations.
          </Text>
        </View>
      </View>

      <Text style={[typography.callout, styles.aboutBody, { color: theme.colors.text }]}>
        simplenotes is meant to be a no-bloat, simple, free, open source notes
        app. Most notes apps collect years of extra features, put important
        tools behind a subscription, and keep the underlying ink technology
        closed source.
      </Text>
      <Text style={[typography.callout, styles.aboutBody, { color: theme.colors.text }]}>
        It is also local and privacy focused: we do not collect anything, and
        your notes never leave your device.
      </Text>
      <Text style={[typography.callout, styles.aboutBody, { color: theme.colors.text }]}>
        This app is starting from the opposite idea: keep the experience focused,
        make the core technology inspectable, and build only what actually helps
        people write.
      </Text>
      <Text style={[typography.footnote, styles.aboutBody, { color: theme.colors.textSecondary }]}>
        simplenotes is powered by the open source Mobile Ink engine.
      </Text>
    </Sheet>
  );
}

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {title ? (
        <Text
          style={[
            typography.footnote,
            {
              color: theme.colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: 1,
              paddingHorizontal: spacing.lg,
              marginBottom: spacing.sm,
            },
          ]}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </View>
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
  aboutHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  aboutIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 36,
  },
  aboutTitleBlock: {
    flex: 1,
  },
  aboutBody: {
    lineHeight: 22,
    marginBottom: spacing.md,
  },
});
