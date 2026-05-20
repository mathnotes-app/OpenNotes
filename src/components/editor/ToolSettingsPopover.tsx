import React, { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { HIGHLIGHTER_COLORS, STROKE_COLORS } from '../../theme/colors';
import { TOOL_BY_TYPE, WIDTH_RANGE } from '../../utils/toolPalette';
import type { SupportedTool } from '../../utils/toolPalette';
import type { DockedEdge } from './FloatingToolbar';

const CARD_WIDTH = 288;
const CARD_PADDING = 12;
const GAP_FROM_ANCHOR = 10;

export interface ToolSettingsAnchor {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  dockedEdge: DockedEdge;
}

export interface ToolSettingsPopoverProps {
  visible: boolean;
  toolType: SupportedTool;
  width: number;
  color: string;
  eraserMode: string;
  anchor: ToolSettingsAnchor | null;
  onChange: (next: { width?: number; color?: string; eraserMode?: string }) => void;
  onClose: () => void;
}

export function ToolSettingsPopover({
  visible,
  toolType,
  width,
  color,
  eraserMode,
  anchor,
  onChange,
  onClose,
}: ToolSettingsPopoverProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const descriptor = TOOL_BY_TYPE[toolType];
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, visible]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + progress.value * 0.08 }],
  }));

  if (!visible || !anchor) {
    return null;
  }

  const palette = toolType === 'highlighter' ? HIGHLIGHTER_COLORS : STROKE_COLORS;
  const [minWidth, maxWidth] = WIDTH_RANGE[toolType];

  const estimatedHeight = 180;
  let left = anchor.screenX + anchor.width / 2 - CARD_WIDTH / 2;
  let top = anchor.screenY + anchor.height + GAP_FROM_ANCHOR;

  if (anchor.dockedEdge === 'bottom') {
    top = anchor.screenY - estimatedHeight - GAP_FROM_ANCHOR;
  } else if (anchor.dockedEdge === 'left') {
    left = anchor.screenX + anchor.width + GAP_FROM_ANCHOR;
    top = anchor.screenY + anchor.height / 2 - estimatedHeight / 2;
  } else if (anchor.dockedEdge === 'right') {
    left = anchor.screenX - CARD_WIDTH - GAP_FROM_ANCHOR;
    top = anchor.screenY + anchor.height / 2 - estimatedHeight / 2;
  }

  // Clamp to screen
  left = Math.max(spacing.md, Math.min(screenWidth - CARD_WIDTH - spacing.md, left));
  top = Math.max(
    insets.top + spacing.sm,
    Math.min(screenHeight - estimatedHeight - insets.bottom - spacing.md, top),
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View
          style={[
            styles.card,
            {
              left,
              top,
              width: CARD_WIDTH,
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.divider,
              shadowColor: theme.colors.cardShadow,
            },
            cardStyle,
          ]}
        >
          <Text style={[typography.footnote, { color: theme.colors.textSecondary }]}>
            {descriptor.label}
          </Text>

          {toolType === 'eraser' ? (
            <View style={styles.segment}>
              {(['pixel', 'object'] as const).map((mode) => {
                const active = eraserMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => onChange({ eraserMode: mode })}
                    style={[
                      styles.segmentItem,
                      {
                        backgroundColor: active
                          ? theme.colors.accent
                          : theme.colors.surfaceMuted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.callout,
                        {
                          color: active ? '#FFFFFF' : theme.colors.text,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {mode === 'pixel' ? 'Pixel' : 'Object'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {descriptor.supportsColor ? (
            <View style={styles.colorsRow}>
              {palette.map((swatch) => (
                <Pressable
                  key={swatch}
                  onPress={() => onChange({ color: swatch })}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: swatch,
                      borderColor:
                        swatch.toLowerCase() === color.toLowerCase()
                          ? theme.colors.accent
                          : theme.colors.divider,
                      borderWidth:
                        swatch.toLowerCase() === color.toLowerCase()
                          ? 2
                          : StyleSheet.hairlineWidth,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}

          {descriptor.supportsWidth ? (
            <WidthStops
              value={width}
              min={minWidth}
              max={maxWidth}
              onChange={(v) => onChange({ width: v })}
              theme={theme}
            />
          ) : null}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function WidthStops({
  value,
  min,
  max,
  onChange,
  theme,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const steps = 6;
  const stride = (max - min) / (steps - 1);
  const stops = Array.from({ length: steps }, (_, i) => Math.round(min + i * stride));
  const maxVisual = 28;
  return (
    <View style={styles.sliderRow}>
      {stops.map((w) => {
        const active = Math.abs(w - value) <= stride / 2;
        const t = (w - min) / Math.max(1, max - min);
        const size = 6 + t * maxVisual;
        return (
          <Pressable
            key={w}
            onPress={() => onChange(w)}
            style={({ pressed }) => [
              styles.widthStop,
              {
                backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
                borderColor: active ? theme.colors.accent : 'transparent',
              },
            ]}
          >
            <View
              style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: theme.colors.text,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    padding: CARD_PADDING,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 16,
  },
  segment: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
  },
  colorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 999,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  widthStop: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 2,
  },
});
