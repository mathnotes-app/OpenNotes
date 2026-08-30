import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { t } from '../../i18n';
import { radius, spacing } from '../../theme/spacing';
import { Sheet } from '../ui/Sheet';

export function CommunityInviteSheet({
  visible,
  onClose,
  onJoin,
}: {
  visible: boolean;
  onClose: () => void;
  onJoin: () => void;
}) {
  const theme = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconRow}>
          <View
            style={[styles.icon, { backgroundColor: theme.colors.accentMuted }]}
          >
            <Ionicons name="people-outline" size={24} color={theme.colors.accent} />
          </View>
        </View>
        <Text
          maxFontSizeMultiplier={2}
          style={[styles.title, { color: theme.colors.text }]}
        >
          {t.community.title}
        </Text>
        <Text
          maxFontSizeMultiplier={2}
          style={[styles.body, { color: theme.colors.textSecondary }]}
        >
          {t.community.body}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onJoin}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: theme.colors.accent,
              borderBottomColor: theme.isDark ? '#0056B3' : '#0066CC',
              shadowColor: theme.colors.accent,
            },
            pressed && styles.primaryPressed,
          ]}
        >
          <Text
            maxFontSizeMultiplier={1.5}
            numberOfLines={1}
            style={styles.primaryText}
          >
            {t.community.join}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.laterButton, pressed && styles.pressed]}
        >
          <Text
            maxFontSizeMultiplier={1.5}
            numberOfLines={1}
            style={[styles.laterText, { color: theme.colors.textSecondary }]}
          >
            {t.common.notNow}
          </Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xs },
  iconRow: { marginBottom: spacing.lg },
  icon: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -1,
  },
  body: {
    fontSize: 16,
    marginTop: spacing.md,
    maxWidth: 520,
  },
  primaryButton: {
    alignItems: 'center',
    borderBottomWidth: 4,
    borderRadius: radius.lg,
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  primaryPressed: {
    borderBottomWidth: 2,
    opacity: 0.9,
    transform: [{ translateY: 2 }],
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  laterButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  laterText: {
    fontSize: 15,
    fontWeight: '500',
  },
  pressed: { opacity: 0.62 },
});
