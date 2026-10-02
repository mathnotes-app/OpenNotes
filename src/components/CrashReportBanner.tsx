import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { t } from '../i18n';
import { hairline, radius, spacing } from '../theme/spacing';

interface CrashReportBannerProps {
  onShare: () => void;
  onDismiss: () => void;
}

/**
 * Offered once after a crash. A plain view rather than an Alert: sharing
 * from an Alert button fails on iOS because the share sheet would be
 * presented on the alert while it is still being dismissed.
 */
export function CrashReportBanner({ onShare, onDismiss }: CrashReportBannerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          bottom: insets.bottom + spacing.lg,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.divider,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>{t.crash.promptTitle}</Text>
      <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{t.crash.promptBody}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.action}>
          <Text style={{ color: theme.colors.textSecondary }}>{t.common.notNow}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onShare}
          style={[styles.action, { backgroundColor: theme.colors.accent }]}
        >
          <Text style={styles.primaryLabel}>{t.crash.share}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    width: '92%',
    maxWidth: 480,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: hairline,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 14, marginTop: spacing.xs, lineHeight: 19 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.md },
  action: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginLeft: spacing.sm,
  },
  primaryLabel: { color: '#FFFFFF', fontWeight: '600' },
});
