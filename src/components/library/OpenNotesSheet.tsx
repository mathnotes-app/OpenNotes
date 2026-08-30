import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { Sheet } from '../ui/Sheet';
import { OPEN_NOTES_LINKS, openExternalLink } from '../../services/externalLinks';

interface OpenNotesSheetProps {
  visible: boolean;
  onClose: () => void;
  onJoinCommunity: () => void;
  onRate: () => void;
  onViewIntroduction: () => void;
  /** Hides the backup row entirely on unsupported platforms. */
  backupSupported: boolean;
  /** null while loading; the switch is hidden until known. */
  backupEnabled: boolean | null;
  backupSubtitle: string;
  onToggleBackup: (enabled: boolean) => void;
}

export function OpenNotesSheet({
  visible,
  onClose,
  onJoinCommunity,
  onRate,
  onViewIntroduction,
  backupSupported,
  backupEnabled,
  backupSubtitle,
  onToggleBackup,
}: OpenNotesSheetProps) {
  const theme = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text
          maxFontSizeMultiplier={2}
          style={[styles.title, { color: theme.colors.text }]}
        >
          Free notes need a little help.
        </Text>
        <Text
          maxFontSizeMultiplier={2}
          style={[styles.subtitle, { color: theme.colors.textSecondary }]}
        >
          Everything here is optional. Writing notes never depends on it.
        </Text>

        <View
          style={[
            styles.actions,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.divider,
            },
          ]}
        >
          <SupportRow
            icon="people-outline"
            title="Join the community"
            subtitle="Ideas, updates, and conversations"
            onPress={onJoinCommunity}
          />
          <SupportRow
            icon="star-outline"
            title="Rate OpenNotes"
            subtitle="Leave an App Store review"
            onPress={onRate}
          />
          <SupportRow
            icon="logo-github"
            title="Star on GitHub"
            subtitle="Follow the open-source project"
            onPress={() => {
              void openExternalLink(OPEN_NOTES_LINKS.github, 'OpenNotesSheet');
            }}
          />
          <SupportRow
            icon="book-outline"
            title="Our mission"
            subtitle="Why OpenNotes stays free and private"
            onPress={onViewIntroduction}
            isLast
          />
        </View>

        {backupSupported ? (
          <View
            style={[
              styles.actions,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.divider,
              },
            ]}
          >
          <SupportRow
            icon="cloud-outline"
            title="iCloud backup"
            subtitle={backupSubtitle}
            isLast
            trailing={
              backupEnabled !== null ? (
                <Switch
                  accessibilityLabel="iCloud backup"
                  value={backupEnabled}
                  onValueChange={onToggleBackup}
                />
              ) : null
            }
          />
          </View>
        ) : null}

        <View style={styles.utilityLinks}>
          <UtilityLink
            label="Privacy"
            onPress={() => {
              void openExternalLink(OPEN_NOTES_LINKS.privacy, 'OpenNotesSheet');
            }}
          />
          <UtilityLink
            label="Terms"
            onPress={() => {
              void openExternalLink(OPEN_NOTES_LINKS.terms, 'OpenNotesSheet');
            }}
          />
          <UtilityLink
            label="Support"
            onPress={() => {
              void openExternalLink(OPEN_NOTES_LINKS.support, 'OpenNotesSheet');
            }}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

function SupportRow({
  icon,
  title,
  subtitle,
  onPress,
  isLast = false,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress?: () => void;
  isLast?: boolean;
  /** Right-side accessory; defaults to a chevron for pressable rows. */
  trailing?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        !isLast && {
          borderBottomColor: theme.colors.divider,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && onPress && { backgroundColor: theme.colors.surfaceMuted },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.colors.accent }]}>
        <Ionicons name={icon} color="#FFFFFF" size={18} />
      </View>
      <View style={styles.rowCopy}>
        <Text
          maxFontSizeMultiplier={1.8}
          style={[styles.rowTitle, { color: theme.colors.text }]}
        >
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={1.8}
          style={[styles.rowSubtitle, { color: theme.colors.textSecondary }]}
        >
          {subtitle}
        </Text>
      </View>
      {trailing !== undefined ? (
        trailing
      ) : (
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      )}
    </Pressable>
  );
}

function UtilityLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.utilityLink, pressed && { opacity: 0.62 }]}
    >
      <Text
        maxFontSizeMultiplier={1.5}
        numberOfLines={1}
        style={[typography.footnote, { color: theme.colors.textSecondary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xs },
  title: {
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    marginTop: spacing.sm,
  },
  actions: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xl,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowIcon: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  rowCopy: { flex: 1 },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  utilityLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  utilityLink: {
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
});
