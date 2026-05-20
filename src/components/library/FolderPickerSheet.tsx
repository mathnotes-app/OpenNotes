import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Sheet } from '../ui/Sheet';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { FolderMetadata } from '../../types/note';

export interface FolderPickerSheetProps {
  visible: boolean;
  folders: FolderMetadata[];
  currentFolderId: string | null;
  allowMoveToRoot?: boolean;
  onPick: (folderId: string | null) => void;
  onClose: () => void;
}

export function FolderPickerSheet({
  visible,
  folders,
  currentFolderId,
  allowMoveToRoot = true,
  onPick,
  onClose,
}: FolderPickerSheetProps) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text
        style={[
          typography.title,
          { color: theme.colors.text, marginBottom: spacing.md },
        ]}
      >
        Move to
      </Text>
      <ScrollView
        style={{ maxHeight: 380 }}
        contentContainerStyle={{ paddingBottom: spacing.sm }}
      >
        {allowMoveToRoot ? (
          <Row
            label="Root"
            iconName="folder-open"
            active={currentFolderId === null}
            onPress={() => {
              onPick(null);
              onClose();
            }}
            theme={theme}
          />
        ) : null}
        {folders.map((folder) => (
          <Row
            key={folder.id}
            label={folder.name}
            iconName="folder"
            active={currentFolderId === folder.id}
            onPress={() => {
              onPick(folder.id);
              onClose();
            }}
            theme={theme}
          />
        ))}
        {folders.length === 0 && !allowMoveToRoot ? (
          <Text
            style={[
              typography.callout,
              { color: theme.colors.textSecondary, padding: spacing.md },
            ]}
          >
            No folders yet. Create one from the library.
          </Text>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

function Row({
  label,
  iconName,
  active,
  onPress,
  theme,
}: {
  label: string;
  iconName: keyof typeof MaterialIcons.glyphMap;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: active
            ? theme.colors.accentMuted
            : pressed
              ? theme.colors.surfaceMuted
              : 'transparent',
        },
      ]}
    >
      <MaterialIcons
        name={iconName}
        size={22}
        color={active ? theme.colors.accent : theme.colors.textSecondary}
      />
      <Text
        style={[
          typography.body,
          {
            color: active ? theme.colors.accent : theme.colors.text,
            marginLeft: spacing.md,
            flex: 1,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {active ? (
        <MaterialIcons name="check" size={20} color={theme.colors.accent} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
});
