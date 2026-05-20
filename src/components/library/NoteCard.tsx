import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { formatRelative } from '../../utils/relativeTime';
import type { NoteMetadata } from '../../types/note';

export interface NoteCardProps {
  note: NoteMetadata;
  onPress: () => void;
  onLongPress: () => void;
  onMenuPress: () => void;
}

export function NoteCard({ note, onPress, onLongPress, onMenuPress }: NoteCardProps) {
  const theme = useTheme();
  const tileWidth = useLibraryTileWidth();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        [styles.tile, { width: tileWidth }],
        {
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View
        style={[
          styles.thumbnail,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.divider,
            shadowColor: theme.colors.cardShadow,
          },
        ]}
      >
        {note.thumbnailUri ? (
          <Image
            source={{ uri: note.thumbnailUri }}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
        ) : (
          <PaperPlaceholder
            type={note.backgroundType}
            color={theme.colors.textTertiary}
            accent={accentColorForBackground(note.backgroundType, theme.colors.accent)}
          />
        )}
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
        {note.title || 'Untitled'}
      </Text>
      <Text
        style={[typography.caption, styles.meta, { color: theme.colors.textTertiary }]}
        numberOfLines={1}
      >
        {formatRelative(note.updatedAt)}
      </Text>
    </Pressable>
  );
}

function PaperPlaceholder({
  type,
  color,
  accent,
}: {
  type: NoteMetadata['backgroundType'];
  color: string;
  accent: string;
}) {
  if (type === 'pdf') {
    return (
      <View style={styles.placeholderCenter}>
        <View style={[styles.pdfLogo, { borderColor: accent }]}>
          <View style={[styles.pdfFold, { borderLeftColor: `${accent}24` }]} />
          <View style={[styles.pdfBand, { backgroundColor: accent }]}>
            <Text style={styles.pdfText}>PDF</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.paper}>
      {type === 'plain' ? null : Array.from({ length: 7 }, (_, index) => (
        <View
          key={index}
          style={[
            type === 'dotted' ? styles.dotRow : styles.line,
            {
              backgroundColor:
                type === 'lined' && index === 0 ? accent : color,
              opacity: type === 'graph' || type === 'grid' ? 0.38 : 0.55,
            },
          ]}
        />
      ))}
      {type === 'grid' || type === 'graph' ? (
        <View pointerEvents="none" style={styles.gridLines}>
          {Array.from({ length: 5 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.gridLineVertical,
                { left: `${(index + 1) * 16}%`, backgroundColor: color },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function accentColorForBackground(type: NoteMetadata['backgroundType'], fallback: string): string {
  switch (type) {
    case 'lined':
      return '#34C759';
    case 'grid':
      return '#0A84FF';
    case 'dotted':
      return '#FF9500';
    case 'graph':
      return '#AF52DE';
    case 'pdf':
      return '#FF3B30';
    default:
      return fallback;
  }
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
  thumbnail: {
    width: '100%',
    aspectRatio: 0.73,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 2,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  placeholderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfLogo: {
    width: '45%',
    aspectRatio: 0.75,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  pdfFold: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderLeftWidth: 18,
    borderBottomWidth: 18,
    borderBottomColor: 'transparent',
  },
  pdfBand: {
    paddingVertical: 5,
    alignItems: 'center',
  },
  pdfText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
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
  paper: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  line: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  dotRow: {
    width: 4,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  gridLines: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    opacity: 0.38,
  },
  title: {
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  meta: {
    marginTop: 1,
  },
});
