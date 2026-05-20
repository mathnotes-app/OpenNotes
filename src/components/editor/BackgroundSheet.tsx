import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../ui/Sheet';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { BACKGROUND_LABELS, BACKGROUND_TYPES } from '../../types/note';
import type { BackgroundType } from '../../types/note';

export interface BackgroundSheetProps {
  visible: boolean;
  current: BackgroundType;
  onPick: (type: BackgroundType) => void;
  onClose: () => void;
}

const ICONS: Record<BackgroundType, keyof typeof Ionicons.glyphMap> = {
  plain: 'document-outline',
  lined: 'reorder-four-outline',
  grid: 'grid-outline',
  dotted: 'ellipsis-horizontal-outline',
  graph: 'analytics-outline',
  pdf: 'document-text-outline',
};

export function BackgroundSheet({
  visible,
  current,
  onPick,
  onClose,
}: BackgroundSheetProps) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={[typography.title, { color: theme.colors.text, marginBottom: spacing.md }]}>
        Background
      </Text>
      <View style={styles.grid}>
        {BACKGROUND_TYPES.map((type) => {
          const active = current === type;
          return (
            <Pressable
              key={type}
              onPress={() => onPick(type)}
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor: active
                    ? theme.colors.accentMuted
                    : pressed
                      ? theme.colors.surfaceMuted
                      : theme.colors.surface,
                  borderColor: active ? theme.colors.accent : theme.colors.divider,
                },
              ]}
            >
              <Ionicons
                name={ICONS[type]}
                size={28}
                color={active ? theme.colors.accent : theme.colors.text}
              />
              <Text
                style={[
                  typography.callout,
                  {
                    color: active ? theme.colors.accent : theme.colors.text,
                    marginTop: spacing.xs,
                    fontWeight: '600',
                  },
                ]}
              >
                {BACKGROUND_LABELS[type]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text
        style={[
          typography.footnote,
          { color: theme.colors.textTertiary, marginTop: spacing.md, textAlign: 'center' },
        ]}
      >
        PDF lets you import a multi-page document as the page background.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cell: {
    width: '31%',
    aspectRatio: 1,
    minWidth: 90,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
});
