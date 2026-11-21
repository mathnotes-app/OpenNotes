import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDriveStatus } from '../../hooks/useICloudDrive';
import { useTheme } from '../../hooks/useTheme';
import { t } from '../../i18n';
import { driveSupported, isDriveEnabled, setDriveEnabled } from '../../services/iCloudDrive';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export function ICloudDriveSettings({ visible }: { visible: boolean }) {
  const theme = useTheme();
  const status = useDriveStatus();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible || !driveSupported) return;
    let active = true;
    void isDriveEnabled().then(value => { if (active) setEnabled(value); })
      .catch(() => { if (active) setEnabled(null); });
    return () => { active = false; };
  }, [visible]);
  if (!driveSupported) return null;

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await setDriveEnabled(next);
      setEnabled(next);
    } catch {
      Alert.alert(t.drive.title, t.drive.unavailable);
    } finally {
      setBusy(false);
    }
  };
  const details = !enabled ? t.drive.details :
    status === 'unavailable' ? t.drive.unavailable : status === 'pending' ? t.drive.pending : t.drive.enabled;

  return (
    <View style={[styles.row, { borderColor: theme.colors.divider }]}>
      <Ionicons name="folder-outline" size={20} color={theme.colors.accent} />
      <View style={styles.copy}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>{t.drive.title}</Text>
        <Text style={[typography.footnote, { color: theme.colors.textSecondary }]}>{details}</Text>
      </View>
      {enabled !== null && <Switch testID="icloud-drive-switch" accessibilityLabel={t.drive.title}
        value={enabled} disabled={busy} onValueChange={value => void toggle(value)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center',
    padding: spacing.lg, gap: spacing.md,
  },
  copy: { flex: 1, gap: spacing.xs },
});
