import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export interface RenameDialogProps {
  visible: boolean;
  title: string;
  initialValue: string;
  placeholder?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export function RenameDialog({
  visible,
  title,
  initialValue,
  placeholder,
  confirmLabel = 'Save',
  onCancel,
  onConfirm,
}: RenameDialogProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [initialValue, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={[styles.scrim, { backgroundColor: theme.colors.overlayScrim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceElevated,
                shadowColor: theme.colors.cardShadow,
              },
            ]}
          >
            <Text style={[typography.headline, { color: theme.colors.text }]}>{title}</Text>
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textTertiary}
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.divider,
                },
                typography.body,
              ]}
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={() => onConfirm(value)}
            />
            <View style={styles.row}>
              <Pressable
                style={[styles.button, { backgroundColor: theme.colors.surfaceMuted }]}
                onPress={onCancel}
              >
                <Text style={[typography.headline, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: theme.colors.accent }]}
                onPress={() => onConfirm(value)}
              >
                <Text style={[typography.headline, { color: '#FFFFFF' }]}>{confirmLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 24,
  },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
