import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export interface MenuAction {
  key: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface ItemActionsMenuProps {
  visible: boolean;
  title?: string;
  actions: MenuAction[];
  onClose: () => void;
}

export function ItemActionsMenu({ visible, title, actions, onClose }: ItemActionsMenuProps) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      {title ? (
        <Text
          style={[
            typography.footnote,
            { color: theme.colors.textSecondary, marginBottom: spacing.sm },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      ) : null}
      <View style={styles.list}>
        {actions.map((action, idx) => (
          <Pressable
            key={action.key}
            onPress={() => {
              onClose();
              action.onPress();
            }}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed
                  ? theme.colors.surfaceMuted
                  : theme.colors.surface,
                borderBottomWidth:
                  idx === actions.length - 1 ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: theme.colors.divider,
              },
            ]}
          >
            <Text
              style={[
                typography.body,
                {
                  color: action.destructive
                    ? theme.colors.destructive
                    : theme.colors.text,
                  fontWeight: '500',
                },
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
});
