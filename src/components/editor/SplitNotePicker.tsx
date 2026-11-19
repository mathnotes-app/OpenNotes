import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { useTheme } from '../../hooks/useTheme';
import { listAllMetadata } from '../../services/notesRepo';
import { t } from '../../i18n';
import type { NoteMetadata } from '../../types/note';

export function SplitNotePicker({ visible, excludeId, onChoose, onClose }: {
  visible: boolean; excludeId: string; onChoose: (id: string) => void; onClose: () => void;
}) {
  const theme = useTheme();
  const [notes, setNotes] = useState<NoteMetadata[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setNotes(null);
    void listAllMetadata().then(items => {
      if (!cancelled) setNotes(items.filter(item => item.id !== excludeId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }).catch(() => {
      if (!cancelled) { onClose(); Alert.alert(t.editor.couldNotOpenTitle, t.common.pleaseTryAgain); }
    });
    return () => { cancelled = true; };
  }, [visible, excludeId, onClose]);
  return <Sheet visible={visible} onClose={onClose}>
    <Text style={[styles.title, {color: theme.colors.text}]}>{t.editor.chooseSplitNote}</Text>
    {notes === null ? <ActivityIndicator color={theme.colors.accent} /> : notes.length === 0
      ? <Text style={{color: theme.colors.textSecondary}}>{t.editor.noOtherNotes}</Text>
      : <FlatList style={styles.list} data={notes} keyExtractor={note => note.id} keyboardShouldPersistTaps="handled"
        renderItem={({item: note}) => <Pressable accessibilityRole="button" testID={`split-note-${note.id}`}
          onPress={() => onChoose(note.id)} style={[styles.row, {borderBottomColor: theme.colors.divider}]}>
          <Text numberOfLines={1} style={{color: theme.colors.text}}>{note.title || t.common.untitled}</Text>
        </Pressable>} />}
  </Sheet>;
}
const styles = StyleSheet.create({
  title: {fontSize: 20, fontWeight: '600', marginBottom: 16},
  list: {maxHeight: 420},
  row: {minHeight: 48, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth},
});
