import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { t } from '../../i18n';
import { OPEN_NOTES_LINKS, openExternalLink } from '../../services/externalLinks';

const DISMISSED_KEY = '@opennotes:mathnotes-invitation-dismissed:v1';

/** An optional, local-only invitation. No note content or identifier leaves OpenNotes. */
export function MathNotesInvitation({ noteCount }: { noteCount: number }) {
  const theme = useTheme();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DISMISSED_KEY).then(value => {
      if (active) setDismissed(value === 'true');
    }).catch(error => {
      // Fail closed if the preference cannot be read, so it never becomes a nag.
      if (__DEV__) console.warn('[MathNotesInvitation] could not read dismissal', error);
      if (active) setDismissed(true);
    });
    return () => { active = false; };
  }, []);

  const dismiss = useCallback(async () => {
    setDismissed(true);
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, 'true');
    } catch (error) {
      if (__DEV__) console.warn('[MathNotesInvitation] could not save dismissal', error);
    }
  }, []);

  if (Platform.OS !== 'ios' || dismissed !== false || noteCount < 3) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t.mathNotes.title}. ${t.mathNotes.description}`}
        style={styles.content}
        onPress={() => {
          void (async () => {
            if (await openExternalLink(OPEN_NOTES_LINKS.mathNotes, 'MathNotesInvitation')) await dismiss();
          })();
        }}
      >
        <Ionicons name="calculator-outline" size={21} color={theme.colors.accent} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t.mathNotes.title}</Text>
          <Text style={[styles.description, { color: theme.colors.textSecondary }]}>{t.mathNotes.description}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t.mathNotes.dismiss}
        hitSlop={8} onPress={() => void dismiss()} style={styles.dismiss}>
        <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, marginHorizontal: 12, marginTop: 8, borderRadius: 12 },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingVertical: 9, paddingLeft: 12 },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  description: { fontSize: 13, marginTop: 2 },
  dismiss: { padding: 12 },
});
