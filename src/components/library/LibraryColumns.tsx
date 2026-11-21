import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NoteCard } from './NoteCard';
import { useTheme } from '../../hooks/useTheme';
import { t } from '../../i18n';
import { spacing } from '../../theme/spacing';
import type { FolderMetadata, NoteMetadata } from '../../types/note';

export type LibrarySelection = { kind: 'all' } | { kind: 'unfiled' } | { kind: 'folder'; id: string };

export function LibraryColumns({ folders, notes, selection, onSelect, onOpenNote, onNoteMenu, onFolderMenu }: {
  folders: FolderMetadata[];
  notes: NoteMetadata[];
  selection: LibrarySelection;
  onSelect: (selection: LibrarySelection) => void;
  onOpenNote: (note: NoteMetadata) => void;
  onNoteMenu: (note: NoteMetadata) => void;
  onFolderMenu: (folder: FolderMetadata) => void;
}) {
  const theme = useTheme();
  const selectedNotes = notes.filter(note => selection.kind === 'all' ||
    (selection.kind === 'unfiled' ? !note.folderId : selection.kind === 'folder' && note.folderId === selection.id));
  const title = selection.kind === 'all' ? t.preferences.allNotes : selection.kind === 'unfiled'
    ? t.preferences.unfiled : folders.find(folder => folder.id === selection.id)?.name ?? t.preferences.allNotes;
  const row = (label: string, selected: boolean, press: () => void, folder?: FolderMetadata) => (
    <Pressable onPress={press} onLongPress={folder ? () => onFolderMenu(folder) : undefined}
      accessibilityRole="button" accessibilityState={{ selected }}
      style={[styles.folder, { backgroundColor: selected ? theme.colors.accentMuted : 'transparent' }]}>
      <Ionicons name={folder ? 'folder-outline' : 'documents-outline'} size={19}
        color={selected ? theme.colors.accent : theme.colors.textSecondary} />
      <Text numberOfLines={1} style={[styles.folderLabel, { color: selected ? theme.colors.accent : theme.colors.text }]}>{label}</Text>
      {folder ? <Pressable accessibilityRole="button" accessibilityLabel={t.preferences.folderActions}
        hitSlop={8} onPress={event => { event.stopPropagation(); onFolderMenu(folder); }}>
        <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textSecondary} />
      </Pressable> : null}
    </Pressable>
  );
  return <View style={styles.columns}>
    <View style={[styles.sidebar, { borderRightColor: theme.colors.divider }]}>
      <FlatList data={folders} keyExtractor={folder => folder.id}
        ListHeaderComponent={<>
          <Text style={[styles.section, { color: theme.colors.textSecondary }]}>{t.library.foldersSection}</Text>
          {row(t.preferences.allNotes, selection.kind === 'all', () => onSelect({ kind: 'all' }))}
          {row(t.preferences.unfiled, selection.kind === 'unfiled', () => onSelect({ kind: 'unfiled' }))}
        </>}
        renderItem={({ item }) => row(item.name, selection.kind === 'folder' && selection.id === item.id,
          () => onSelect({ kind: 'folder', id: item.id }), item)} />
    </View>
    <View style={styles.notes}>
      <Text style={[styles.section, { color: theme.colors.textSecondary }]} numberOfLines={1}>{title}</Text>
      <FlatList data={selectedNotes} keyExtractor={note => note.id}
        contentContainerStyle={styles.noteList}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.colors.textSecondary }]}>{t.library.emptyFolderTitle}</Text>}
        renderItem={({ item }) => <NoteCard compact note={item} onPress={() => onOpenNote(item)}
          onLongPress={() => onNoteMenu(item)} onMenuPress={() => onNoteMenu(item)} />} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  columns: { flex: 1, flexDirection: 'row' },
  sidebar: { width: '34%', maxWidth: 260, minWidth: 120, borderRightWidth: StyleSheet.hairlineWidth },
  notes: { flex: 1 },
  section: { fontSize: 13, fontWeight: '600', paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  folder: { minHeight: 46, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  folderLabel: { flex: 1, fontSize: 15 },
  noteList: { paddingBottom: 100 },
  empty: { padding: spacing.lg, fontSize: 14 },
});
