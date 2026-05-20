import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from '@expo/vector-icons';
import type { ToolDescriptor } from '../../utils/toolPalette';
import { useTheme } from '../../hooks/useTheme';
import { radius } from '../../theme/spacing';

export interface ToolButtonProps {
  descriptor: ToolDescriptor;
  active: boolean;
  color?: string;
  onPress: () => void;
  onLongPress?: () => void;
}

export function ToolButton({
  descriptor,
  active,
  color,
  onPress,
  onLongPress,
}: ToolButtonProps) {
  const theme = useTheme();
  const tint =
    descriptor.supportsColor && color
      ? visibleToolTint(color, theme.colors.toolbarBackground, theme.colors.text)
      : theme.colors.text;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: active
            ? theme.colors.accentMuted
            : pressed
              ? theme.colors.surfaceMuted
              : 'transparent',
          shadowColor: active ? theme.colors.accent : 'transparent',
          opacity: pressed ? 0.82 : 1,
        },
        active && styles.buttonActive,
      ]}
    >
      <ToolIcon family={descriptor.iconFamily} name={descriptor.iconName} color={tint} />
      {descriptor.supportsColor && color ? (
        <View
          style={[
            styles.colorPip,
            {
              backgroundColor: color,
              borderColor: theme.colors.toolbarBorder,
            },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

function visibleToolTint(color: string, background: string, fallback: string): string {
  const colorLum = luminance(color);
  const backgroundLum = luminance(background);
  if (colorLum === null || backgroundLum === null) return fallback;
  if (contrastRatio(colorLum, backgroundLum) < 2.4) return fallback;
  return color;
}

function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(input: string): number | null {
  const rgb = parseColor(input);
  if (!rgb) return null;
  const channels = rgb.map((channel) => {
    const raw = channel / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function parseColor(input: string): [number, number, number] | null {
  const value = input.trim();
  const shortHex = value.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    return shortHex[1].split('').map((part) => parseInt(part + part, 16)) as [
      number,
      number,
      number,
    ];
  }

  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return [0, 2, 4].map((start) => parseInt(hex[1].slice(start, start + 2), 16)) as [
      number,
      number,
      number,
    ];
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return null;
  const channels = rgb[1]
    .split(',')
    .slice(0, 3)
    .map((part) => Number.parseFloat(part.trim()));
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    return null;
  }
  return channels.map((channel) => Math.max(0, Math.min(255, channel))) as [
    number,
    number,
    number,
  ];
}

function ToolIcon({
  family,
  name,
  color,
}: {
  family: ToolDescriptor['iconFamily'];
  name: string;
  color: string;
}) {
  switch (family) {
    case 'ion':
      return <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={22} color={color} />;
    case 'material':
      return (
        <MaterialIcons
          name={name as keyof typeof MaterialIcons.glyphMap}
          size={22}
          color={color}
        />
      );
    case 'mci':
      return (
        <MaterialCommunityIcons
          name={name as keyof typeof MaterialCommunityIcons.glyphMap}
          size={22}
          color={color}
        />
      );
    case 'feather':
      return <Feather name={name as keyof typeof Feather.glyphMap} size={22} color={color} />;
  }
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    margin: 1,
  },
  buttonActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
  },
  colorPip: {
    position: 'absolute',
    bottom: 3,
    width: 13,
    height: 4,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

export { ToolIcon };
