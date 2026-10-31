import { resolveInkDisplayAppearance, inkDisplayColor } from '@mathnotes/mobile-ink';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
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
import { t } from '../../i18n';

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

  const estimatedHeight = 90 + (descriptor.supportsColor ? 76 : 0) + (toolType === 'eraser' ? 48 : 0) + (descriptor.supportsWidth ? 88 : 0);
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
                      {mode === 'pixel' ? t.editor.eraserPixel : t.editor.eraserObject}
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
                      backgroundColor: inkDisplayColor(swatch, resolveInkDisplayAppearance(theme.isDark ? 'dark' : 'light')),
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
            <WidthControl
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

function WidthControl({
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
  const [trackWidth, setTrackWidth] = useState(0);
  const [preview, setPreview] = useState(value);
  const latest = useRef({ min, max, trackWidth, onChange, preview, value });
  latest.current = { min, max, trackWidth, onChange, preview, value };
  const startX = useRef(0);
  useEffect(() => { setPreview(value); }, [value, min, max]);
  const positionToValue = (x: number) => {
    const state = latest.current;
    const fraction = Math.max(0, Math.min(1, (x - 12) / Math.max(1, state.trackWidth - 24)));
    return Math.round((state.min + fraction * (state.max - state.min)) * 2) / 2;
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => {
      startX.current = event.nativeEvent.locationX;
      const next = positionToValue(startX.current);
      latest.current.preview = next;
      setPreview(next);
    },
    onPanResponderMove: (_event, gesture) => {
      const next = positionToValue(startX.current + gesture.dx);
      latest.current.preview = next;
      setPreview(next);
    },
    onPanResponderRelease: () => latest.current.onChange(latest.current.preview),
    onPanResponderTerminate: () => setPreview(latest.current.value),
  }), []);
  const steps = 6;
  const stride = (max - min) / (steps - 1);
  const stops = Array.from({ length: steps }, (_, i) => Math.round(min + i * stride));
  const maxVisual = 28;
  const fraction = Math.max(0, Math.min(1, (preview - min) / Math.max(1, max - min)));
  return <View>
    <View style={styles.sliderRow}>
      {stops.map((w) => {
        const active = Math.abs(w - value) < 0.01;
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
    <View style={styles.widthLabel}>
      <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>{t.preferences.size}</Text>
      <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>{preview}</Text>
    </View>
    <View testID="tool-width-slider" accessibilityRole="adjustable" accessibilityLabel={t.preferences.size}
      accessibilityValue={{ min, max, now: preview }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => onChange(Math.max(min, Math.min(max, value + (nativeEvent.actionName === 'increment' ? 0.5 : -0.5))))}
      onLayout={event => setTrackWidth(event.nativeEvent.layout.width)} {...pan.panHandlers} style={styles.sliderTouch}>
      <View style={[styles.sliderTrack, { backgroundColor: theme.colors.divider }]} />
      <View style={[styles.sliderFill, { width: Math.max(0, (trackWidth - 24) * fraction), backgroundColor: theme.colors.accent }]} />
      <View style={[styles.sliderThumb, { left: Math.max(0, (trackWidth - 24) * fraction), backgroundColor: theme.colors.accent }]} />
    </View>
  </View>;
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
  widthLabel: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  sliderTouch: { height: 40, justifyContent: 'center' },
  sliderTrack: { position: 'absolute', left: 12, right: 12, height: 4, borderRadius: 2 },
  sliderFill: { position: 'absolute', left: 12, height: 4, borderRadius: 2 },
  sliderThumb: { position: 'absolute', width: 24, height: 24, borderRadius: 12 },
});
