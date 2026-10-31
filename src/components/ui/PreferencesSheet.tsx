import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { usePreferences, type Appearance } from '../../hooks/Preferences';
import { useTheme } from '../../hooks/useTheme';
import { t } from '../../i18n';
import { radius, spacing } from '../../theme/spacing';

export function PreferencesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const { appearance, setAppearance, returnToPen, setReturnToPen, libraryLayout, setLibraryLayout, holdToShape, setHoldToShape } = usePreferences();
  const choices: Array<{ value: Appearance; label: string }> = [
    { value: 'system', label: t.preferences.system },
    { value: 'light', label: t.preferences.light },
    { value: 'dark', label: t.preferences.dark },
  ];
  return <Sheet visible={visible} onClose={onClose}>
    <ScrollView bounces={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t.preferences.title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t.preferences.done} onPress={onClose}>
          <Text style={[styles.done, { color: theme.colors.accent }]}>{t.preferences.done}</Text>
        </Pressable>
      </View>
      <Text style={[styles.label, { color: theme.colors.text }]}>{t.preferences.appearance}</Text>
      <View style={[styles.segment, { backgroundColor: theme.colors.surfaceMuted }]}>
        {choices.map(choice => <Pressable key={choice.value} accessibilityRole="radio"
          accessibilityState={{ checked: appearance === choice.value }}
          testID={`appearance-${choice.value}`} onPress={() => setAppearance(choice.value)}
          style={[styles.choice, appearance === choice.value && { backgroundColor: theme.colors.surfaceElevated }]}>
          <Text style={{ color: theme.colors.text, fontWeight: appearance === choice.value ? '600' : '400' }}>{choice.label}</Text>
        </Pressable>)}
      </View>
      <Text style={[styles.label, { color: theme.colors.text, marginTop: spacing.lg }]}>{t.preferences.libraryView}</Text>
      <View style={[styles.segment, { backgroundColor: theme.colors.surfaceMuted }]}>
        {(['grid', 'columns'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
          accessibilityState={{ checked: libraryLayout === value }} testID={`library-layout-${value}`}
          onPress={() => setLibraryLayout(value)}
          style={[styles.choice, libraryLayout === value && { backgroundColor: theme.colors.surfaceElevated }]}>
          <Text style={{ color: theme.colors.text, fontWeight: libraryLayout === value ? '600' : '400' }}>
            {value === 'grid' ? t.preferences.grid : t.preferences.columns}
          </Text>
        </Pressable>)}
      </View>
      <View style={[styles.row, { borderTopColor: theme.colors.divider }]}>
        <View style={styles.copy}>
          <Text style={[styles.label, { color: theme.colors.text }]}>{t.preferences.returnToPen}</Text>
          <Text style={[styles.caption, { color: theme.colors.textSecondary }]}>{t.preferences.returnToPenDetail}</Text>
        </View>
        <Switch testID="return-to-pen" accessibilityLabel={t.preferences.returnToPen}
          value={returnToPen} onValueChange={setReturnToPen} />
      </View>
      <View style={[styles.row, { borderTopColor: theme.colors.divider }]}>
        <View style={styles.copy}>
          <Text style={[styles.label, { color: theme.colors.text }]}>{t.preferences.holdToShape}</Text>
          <Text style={[styles.caption, { color: theme.colors.textSecondary }]}>{t.preferences.holdToShapeDetail}</Text>
        </View>
        <Switch testID="hold-to-shape" accessibilityLabel={t.preferences.holdToShape}
          value={holdToShape} onValueChange={setHoldToShape} />
      </View>
    </ScrollView>
  </Sheet>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  title: { fontSize: 26, fontWeight: '600' },
  done: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 16, fontWeight: '600' },
  segment: { flexDirection: 'row', padding: 3, borderRadius: radius.md, marginTop: spacing.sm },
  choice: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, borderRadius: radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.lg, paddingTop: spacing.lg },
  copy: { flex: 1 },
  caption: { fontSize: 13, marginTop: 4 },
});
