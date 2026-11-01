import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { t } from '../../i18n';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { formatRelative } from '../../utils/relativeTime';
import type { NoteMetadata } from '../../types/note';
import { getNoteThumbnail } from '../../services/notesRepo';
import { rebaseAppDocumentUri } from '../../utils/appDocumentUri';
import * as FileSystem from 'expo-file-system/legacy';

export interface NoteCardProps {
  note: NoteMetadata;
  onPress: () => void;
  onLongPress: () => void;
  onMenuPress: () => void;
  compact?: boolean;
}

export function NoteCard({ note, onPress, onLongPress, onMenuPress, compact = false }: NoteCardProps) {
  const theme = useTheme();
  const tileWidth = useLibraryTileWidth();
  const [cover, setCover] = useState<{ note: NoteMetadata; uri: string | null } | null>(null);
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const useCustomCover = Boolean(note.customCoverUri && failedCover !== note.customCoverUri);
  const requestedUri = useCustomCover && note.customCoverUri
    ? rebaseAppDocumentUri(note.customCoverUri, FileSystem.documentDirectory ?? '')
    : cover?.note === note ? cover.uri : note.thumbnailUri;
  const thumbnailUri = !useCustomCover && requestedUri === failedThumbnail ? null : requestedUri;
  useEffect(() => {
    let active = true;
    if (useCustomCover) return () => { active = false; };
    void getNoteThumbnail(note).then(uri => {
      if (active) setCover({ note, uri });
    });
    return () => { active = false; };
  }, [note, useCustomCover]);
  const onCoverError = () => {
    if (useCustomCover && note.customCoverUri) { setFailedCover(note.customCoverUri); return; }
    if (!requestedUri || requestedUri === failedThumbnail) return;
    setFailedThumbnail(requestedUri);
    void getNoteThumbnail(note, true).then(uri => setCover({ note, uri }));
  };
  if (compact) return (
    <View style={[styles.compactRow, { borderBottomColor: theme.colors.divider }]}>
    <Pressable testID={`note-${note.id}`} onPress={onPress} onLongPress={onLongPress}
      delayLongPress={350} style={({ pressed }) => [styles.compactContent, { backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent' }]}>
      <View style={[styles.compactThumbnail, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}>
        {thumbnailUri ? <Image source={{ uri: thumbnailUri }} onError={onCoverError} style={styles.thumbnailImage} resizeMode="cover" />
          : <Ionicons name="document-text-outline" size={23} color={theme.colors.textTertiary} />}
      </View>
      <View style={styles.compactCopy}>
        <Text style={[typography.body, { color: theme.colors.text, fontWeight: '600' }]} numberOfLines={1}>{note.title || t.common.untitled}</Text>
        <Text style={[typography.caption, { color: theme.colors.textTertiary }]} numberOfLines={1}>{formatRelative(note.updatedAt)}</Text>
      </View>
    </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t.preferences.noteActions} hitSlop={8}
        testID={`note-menu-${note.id}`}
        onPress={onMenuPress} style={styles.compactMenu}>
        <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
  return (
    <View style={[styles.tile, { width: tileWidth }]}>
    <Pressable
      testID={`note-${note.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
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
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            onError={onCoverError}
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
      </View>
      <Text
        style={[typography.footnote, styles.title, { color: theme.colors.text }]}
        numberOfLines={2}
      >
        {note.title || t.common.untitled}
      </Text>
      <Text
        style={[typography.caption, styles.meta, { color: theme.colors.textTertiary }]}
        numberOfLines={1}
      >
        {formatRelative(note.updatedAt)}
      </Text>
    </Pressable>
    <Pressable
      testID={`note-menu-${note.id}`}
      accessibilityRole="button"
      accessibilityLabel={t.preferences.noteActions}
      onPress={onMenuPress}
      hitSlop={8}
      style={({ pressed }) => [styles.menuButton, {
        backgroundColor: theme.colors.surfaceElevated,
        borderColor: theme.colors.divider,
        opacity: pressed ? 0.72 : 0.95,
      }]}
    >
      <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.textSecondary} />
    </Pressable>
    </View>
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
  compactRow: { flexDirection: 'row', alignItems: 'center', minHeight: 70, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  compactContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  compactThumbnail: { width: 40, height: 52, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  compactCopy: { flex: 1, gap: 4 },
  compactMenu: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
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
