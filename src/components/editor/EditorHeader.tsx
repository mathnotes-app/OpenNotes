import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { AutosaveStatus } from '../../hooks/useAutosave';
import { t } from '../../i18n';

export const EDITOR_HEADER_BAR_HEIGHT = 48;

export interface EditorHeaderProps {
  title: string;
  status: AutosaveStatus;
  currentPage: number;
  pageCount: number;
  isExporting: boolean;
  isPageSidebarOpen: boolean;
  onBack: () => void;
  onRename: () => void;
  onTogglePageSidebar: () => void;
  onExport: () => void;
  onPreferences: () => void;
}

export function EditorHeader({
  title,
  status,
  currentPage,
  pageCount,
  isExporting,
  isPageSidebarOpen,
  onBack,
  onRename,
  onTogglePageSidebar,
  onExport,
  onPreferences,
}: EditorHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.host,
        {
          paddingTop: insets.top,
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.divider,
        },
      ]}
    >
      <View style={[styles.bar, { height: EDITOR_HEADER_BAR_HEIGHT }]}>
        <Pressable
          testID="editor-back"
          accessibilityRole="button"
          accessibilityLabel={t.library.backLabel}
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => [styles.sideButton, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.accent} />
          <Text style={[typography.body, { color: theme.colors.accent }]}>{t.library.backLabel}</Text>
        </Pressable>

        <Pressable
          onPress={onRename}
          hitSlop={6}
          style={styles.titleWrap}
        >
          <Text
            style={[typography.headline, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {title || 'Untitled'}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: theme.colors.textSecondary, marginTop: 1 },
            ]}
            numberOfLines={1}
          >
            {t.preferences.pagePosition(currentPage + 1, pageCount)}
            {status === 'error' ? ` · ${t.editor.statusError}` : ''}
          </Text>
        </Pressable>

        <View style={styles.rightActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.preferences.title}
            testID="editor-preferences" onPress={onPreferences} hitSlop={10} style={styles.iconButton}>
            <Ionicons name="settings-outline" size={22} color={theme.colors.accent} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.editor.pagesA11y}
            onPress={onTogglePageSidebar}
            disabled={pageCount < 2}
            hitSlop={10}
            style={({ pressed }) => [
              styles.iconButton,
              isPageSidebarOpen && { backgroundColor: theme.colors.accentMuted },
              pageCount < 2 && { opacity: 0.35 },
              pressed && pageCount >= 2 && { opacity: 0.5 },
            ]}
          >
            <Ionicons name="albums-outline" size={22} color={theme.colors.accent} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.editor.exportA11y}
            onPress={onExport}
            disabled={isExporting}
            hitSlop={10}
            style={({ pressed }) => [
              styles.iconButton,
              (pressed || isExporting) && { opacity: 0.5 },
            ]}
          >
            <Ionicons
              name={isExporting ? 'hourglass-outline' : 'share-outline'}
              size={22}
              color={theme.colors.accent}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  sideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 84,
    height: '100%',
    marginLeft: -6,
  },
  rightActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: -6,
    minWidth: 84,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    height: '100%',
  },
});
