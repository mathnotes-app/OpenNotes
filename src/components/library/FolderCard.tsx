import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { FolderMetadata } from '../../types/note';

export interface FolderCardProps {
  folder: FolderMetadata;
  noteCount: number;
  onPress: () => void;
  onLongPress: () => void;
  onMenuPress: () => void;
}

export function FolderCard({ folder, noteCount, onPress, onLongPress, onMenuPress }: FolderCardProps) {
  const theme = useTheme();
  const tileWidth = useLibraryTileWidth();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        [styles.tile, { width: tileWidth }],
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <View
        style={[
          styles.folderPreview,
          {
            backgroundColor: theme.colors.surface,
            shadowColor: theme.colors.cardShadow,
          },
        ]}
      >
        <View style={[styles.folderBack, { backgroundColor: theme.colors.accentMuted }]}>
          <View style={[styles.folderTab, { backgroundColor: theme.colors.accent }]} />
          <View style={[styles.folderFront, { backgroundColor: theme.colors.accent }]} />
        </View>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onMenuPress();
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.menuButton,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.divider,
              opacity: pressed ? 0.72 : 0.95,
            },
          ]}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
      <Text
        style={[typography.footnote, styles.title, { color: theme.colors.text }]}
        numberOfLines={2}
      >
        {folder.name}
      </Text>
      <Text
        style={[typography.caption, styles.meta, { color: theme.colors.textTertiary }]}
        numberOfLines={1}
      >
        {noteCount === 0 ? 'Empty' : `${noteCount} note${noteCount === 1 ? '' : 's'}`}
      </Text>
    </Pressable>
  );
}

function useLibraryTileWidth(): number {
  const { width } = useWindowDimensions();
  const availableWidth = Math.max(320, width - spacing.lg * 2);
  const gap = spacing.md;
  const minWidth = 126;
  const maxWidth = 164;
  const columns = Math.max(2, Math.floor((availableWidth + gap) / (minWidth + gap)));
  return Math.min(maxWidth, Math.floor((availableWidth - gap * (columns - 1)) / columns));
}

const styles = StyleSheet.create({
  tile: {
    flexShrink: 0,
  },
  folderPreview: {
    width: '100%',
    aspectRatio: 0.92,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 2,
  },
  folderBack: {
    width: '58%',
    aspectRatio: 1.25,
    borderRadius: radius.sm,
  },
  folderTab: {
    position: 'absolute',
    top: -6,
    left: 0,
    width: '42%',
    height: 14,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    opacity: 0.92,
  },
  folderFront: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '72%',
    borderRadius: radius.sm,
  },
  menuButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 28,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  meta: {
    marginTop: 1,
  },
});
