import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Sheet } from '../ui/Sheet';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { BACKGROUND_LABELS, BACKGROUND_TYPES } from '../../types/note';
import type { BackgroundType } from '../../types/note';

export interface CreateNoteBackgroundSheetProps {
  visible: boolean;
  onPick: (type: BackgroundType, title: string) => void;
  onClose: () => void;
}

export function CreateNoteBackgroundSheet({
  visible,
  onPick,
  onClose,
}: CreateNoteBackgroundSheetProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [title, setTitle] = useState('');
  const cellWidth = Math.max(
    104,
    Math.min(148, Math.floor((width - spacing.lg * 2 - spacing.sm * 2) / 3)),
  );

  useEffect(() => {
    if (visible) setTitle('');
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <Text style={[typography.title, styles.title, { color: theme.colors.text }]}>
          New note
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={theme.colors.textTertiary}
          returnKeyType="done"
          style={[
            typography.body,
            styles.input,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.divider,
            },
          ]}
        />
      </View>
      <View style={styles.grid}>
        {BACKGROUND_TYPES.map((type) => (
          <Pressable
            key={type}
            onPress={() => onPick(type, title)}
            style={({ pressed }) => [
              styles.cell,
              { width: cellWidth },
              {
                backgroundColor: pressed
                  ? theme.colors.accentMuted
                  : theme.colors.surface,
                borderColor: pressed ? theme.colors.accent : theme.colors.divider,
              },
            ]}
          >
            <BackgroundThumbnail type={type} />
            <Text
              style={[
                typography.callout,
                styles.label,
                { color: theme.colors.text },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {BACKGROUND_LABELS[type]}
            </Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

function BackgroundThumbnail({ type }: { type: BackgroundType }) {
  if (type === 'pdf') {
    return (
      <View style={styles.pdfLogo}>
        <View style={styles.pdfFold} />
        <View style={styles.pdfBand}>
          <Text style={styles.pdfText}>PDF</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.paperPreview}>
      {type === 'plain' ? null : Array.from({ length: type === 'dotted' ? 6 : 7 }, (_, index) => (
        <View
          key={index}
          style={[
            type === 'dotted' ? styles.dotRow : styles.paperLine,
            type === 'lined' && index === 0 ? styles.marginLine : null,
          ]}
        />
      ))}
      {type === 'grid' || type === 'graph' ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {Array.from({ length: 5 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.paperLineVertical,
                { left: `${(index + 1) * 16}%` },
              ]}
            />
          ))}
          {type === 'graph' ? (
            <>
              <View style={styles.graphAxisX} />
              <View style={styles.graphAxisY} />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  title: {
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    maxWidth: 460,
    alignSelf: 'center',
  },
  cell: {
    height: 122,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  paperPreview: {
    width: 66,
    height: 86,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60, 60, 67, 0.16)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingTop: 14,
    gap: 7,
  },
  paperLine: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    backgroundColor: 'rgba(10, 132, 255, 0.42)',
  },
  marginLine: {
    backgroundColor: 'rgba(255, 59, 48, 0.46)',
  },
  paperLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(10, 132, 255, 0.26)',
  },
  dotRow: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(10, 132, 255, 0.48)',
    alignSelf: 'center',
  },
  graphAxisX: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 59, 48, 0.45)',
  },
  graphAxisY: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 59, 48, 0.45)',
  },
  pdfLogo: {
    width: 66,
    height: 86,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 59, 48, 0.28)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  pdfFold: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 15,
    height: 15,
    borderLeftWidth: 15,
    borderBottomWidth: 15,
    borderLeftColor: 'rgba(255, 59, 48, 0.14)',
    borderBottomColor: 'transparent',
  },
  pdfBand: {
    backgroundColor: '#FF3B30',
    paddingVertical: 4,
    alignItems: 'center',
  },
  pdfText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  label: {
    marginTop: spacing.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
});
