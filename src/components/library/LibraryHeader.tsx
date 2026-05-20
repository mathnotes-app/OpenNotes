import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export interface LibraryHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightLabel?: string;
  onRightPress?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightActions?: Array<{
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label?: string;
    accessibilityLabel: string;
    onPress: () => void;
  }>;
}

export function LibraryHeader({
  title,
  showBack,
  onBack,
  rightLabel,
  onRightPress,
  rightIcon,
  rightActions,
}: LibraryHeaderProps) {
  const theme = useTheme();
  const actions = rightActions && rightActions.length > 0
    ? rightActions
    : onRightPress
      ? [{
          key: 'primary',
          icon: rightIcon,
          label: rightLabel,
          accessibilityLabel: rightLabel ?? 'Header action',
          onPress: onRightPress,
        }]
      : [];

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.divider,
        },
      ]}
    >
      <View style={styles.side}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={28} color={theme.colors.accent} />
            <Text style={[typography.body, { color: theme.colors.accent }]}>Library</Text>
          </Pressable>
        ) : null}
      </View>

      <Text
        style={[typography.headline, styles.title, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {title}
      </Text>

      <View style={[styles.side, styles.right]}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            hitSlop={8}
            style={({ pressed }) => [
              styles.rightTouchable,
              action.label && styles.rightTouchableWithLabel,
              pressed && { opacity: 0.6 },
            ]}
          >
            {action.icon ? (
              <Ionicons name={action.icon} size={22} color={theme.colors.accent} />
            ) : null}
            {action.label ? (
              <Text style={[typography.body, { color: theme.colors.accent }]}>
                {action.label}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  side: {
    minWidth: 112,
    flexDirection: 'row',
    alignItems: 'center',
  },
  right: {
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -6,
  },
  rightTouchable: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  rightTouchableWithLabel: {
    gap: spacing.xs,
    width: 'auto',
  },
});
