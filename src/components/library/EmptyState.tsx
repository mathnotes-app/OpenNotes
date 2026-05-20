import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export interface EmptyStateProps {
  title: string;
  subtitle: string;
  iconName?: keyof typeof Ionicons.glyphMap;
}

export function EmptyState({ title, subtitle, iconName = 'document-outline' }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Ionicons name={iconName} size={56} color={theme.colors.textTertiary} />
      <Text
        style={[
          typography.title,
          { color: theme.colors.text, marginTop: spacing.md, textAlign: 'center' },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          typography.callout,
          {
            color: theme.colors.textSecondary,
            marginTop: spacing.xs,
            textAlign: 'center',
            maxWidth: 280,
          },
        ]}
      >
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
