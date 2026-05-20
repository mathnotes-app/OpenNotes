import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ToolButton } from './ToolButton';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { TOOL_DESCRIPTORS } from '../../utils/toolPalette';
import type { SupportedTool, ToolDescriptor } from '../../utils/toolPalette';

const TOOLBAR_PAD = 6;
const EDGE_MARGIN = 12;
const DRAG_ACTIVATE_DISTANCE = 8;
const BUTTON_FRAME = 38;
const ACTION_BUTTON_COUNT = 3;
const DIVIDER_FRAME = spacing.xs * 2 + StyleSheet.hairlineWidth;
const ESTIMATED_HORIZONTAL_WIDTH =
  TOOLBAR_PAD * 2 +
  (TOOL_DESCRIPTORS.length + ACTION_BUTTON_COUNT) * BUTTON_FRAME +
  DIVIDER_FRAME;
const ESTIMATED_HORIZONTAL_HEIGHT = TOOLBAR_PAD * 2 + BUTTON_FRAME;
const ESTIMATED_VERTICAL_WIDTH = ESTIMATED_HORIZONTAL_HEIGHT;
const ESTIMATED_VERTICAL_HEIGHT = ESTIMATED_HORIZONTAL_WIDTH;

const EDGE_TOP = 0;
const EDGE_RIGHT = 1;
const EDGE_BOTTOM = 2;
const EDGE_LEFT = 3;

type DockedEdgeIndex =
  | typeof EDGE_TOP
  | typeof EDGE_RIGHT
  | typeof EDGE_BOTTOM
  | typeof EDGE_LEFT;

export type DockedEdge = 'top' | 'bottom' | 'left' | 'right';
export type ToolbarOrientation = 'horizontal' | 'vertical';

function orientationForEdge(edge: DockedEdge): ToolbarOrientation {
  return edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal';
}

function edgeIndexFor(edge: DockedEdge): DockedEdgeIndex {
  switch (edge) {
    case 'top':
      return EDGE_TOP;
    case 'right':
      return EDGE_RIGHT;
    case 'bottom':
      return EDGE_BOTTOM;
    case 'left':
      return EDGE_LEFT;
  }
}

function edgeForIndex(edgeIndex: number): DockedEdge {
  switch (edgeIndex) {
    case EDGE_RIGHT:
      return 'right';
    case EDGE_BOTTOM:
      return 'bottom';
    case EDGE_LEFT:
      return 'left';
    case EDGE_TOP:
    default:
      return 'top';
  }
}

function clampToRange(value: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function nearestEdgeIndexForCenter(
  centerX: number,
  centerY: number,
  screenWidth: number,
  screenHeight: number,
  topInset: number,
  bottomInset: number,
): DockedEdgeIndex {
  'worklet';
  const distLeft = centerX;
  const distRight = screenWidth - centerX;
  const distTop = centerY - topInset;
  const distBottom = screenHeight - bottomInset - centerY;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);
  if (minDist === distRight) return EDGE_RIGHT;
  if (minDist === distBottom) return EDGE_BOTTOM;
  if (minDist === distLeft) return EDGE_LEFT;
  return EDGE_TOP;
}

function centeredPositionForEdgeIndex(
  edgeIndex: number,
  barWidth: number,
  barHeight: number,
  screenWidth: number,
  screenHeight: number,
  topInset: number,
  bottomInset: number,
) {
  'worklet';
  const minX = EDGE_MARGIN;
  const maxX = Math.max(minX, screenWidth - barWidth - EDGE_MARGIN);
  const minY = topInset + EDGE_MARGIN;
  const maxY = Math.max(
    minY,
    screenHeight - bottomInset - barHeight - EDGE_MARGIN,
  );
  const centeredX = clampToRange((screenWidth - barWidth) / 2, minX, maxX);
  const centeredY = clampToRange((minY + maxY) / 2, minY, maxY);

  if (edgeIndex === EDGE_BOTTOM) {
    return { x: centeredX, y: maxY };
  }
  if (edgeIndex === EDGE_LEFT) {
    return { x: minX, y: centeredY };
  }
  if (edgeIndex === EDGE_RIGHT) {
    return { x: maxX, y: centeredY };
  }
  return { x: centeredX, y: minY };
}

function clampedFreePosition(
  x: number,
  y: number,
  barWidth: number,
  barHeight: number,
  screenWidth: number,
  screenHeight: number,
  topInset: number,
  bottomInset: number,
) {
  'worklet';
  const minX = EDGE_MARGIN;
  const maxX = Math.max(minX, screenWidth - barWidth - EDGE_MARGIN);
  const minY = topInset + EDGE_MARGIN;
  const maxY = Math.max(
    minY,
    screenHeight - bottomInset - barHeight - EDGE_MARGIN,
  );
  return {
    x: clampToRange(x, minX, maxX),
    y: clampToRange(y, minY, maxY),
  };
}

export interface ToolbarButtonAnchor {
  toolType: SupportedTool;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  dockedEdge: DockedEdge;
}

export interface FloatingToolbarProps {
  activeTool: SupportedTool;
  toolColors: Record<SupportedTool, string>;
  topInset: number;
  onToolPress: (tool: ToolDescriptor, alreadyActive: boolean, anchor: ToolbarButtonAnchor) => void;
  onToolLongPress: (tool: ToolDescriptor, anchor: ToolbarButtonAnchor) => void;
  fingerDrawingEnabled: boolean;
  onToggleFingerDrawing: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

interface ButtonLayout {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

type ToolbarLayout = { width: number; height: number };

export function FloatingToolbar({
  activeTool,
  toolColors,
  topInset,
  onToolPress,
  onToolLongPress,
  fingerDrawingEnabled,
  onToggleFingerDrawing,
  onUndo,
  onRedo,
}: FloatingToolbarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [dockedEdge, setDockedEdge] = useState<DockedEdge>('top');
  const orientation = orientationForEdge(dockedEdge);
  const isVertical = orientation === 'vertical';
  const isCompactHorizontal = !isVertical && screenWidth < 430;
  const dockedEdgeRef = useRef(dockedEdge);
  const draggingRef = useRef(false);
  const pillLayoutRef = useRef<ToolbarLayout>({
    width: ESTIMATED_HORIZONTAL_WIDTH,
    height: ESTIMATED_HORIZONTAL_HEIGHT,
  });
  const measuredLayoutsRef = useRef<Record<ToolbarOrientation, ToolbarLayout | null>>({
    horizontal: null,
    vertical: null,
  });
  const buttonLayoutsRef = useRef<Map<string, ButtonLayout>>(new Map());

  const initialPosition = centeredPositionForEdgeIndex(
    EDGE_TOP,
    ESTIMATED_HORIZONTAL_WIDTH,
    ESTIMATED_HORIZONTAL_HEIGHT,
    screenWidth,
    screenHeight,
    topInset,
    insets.bottom,
  );

  const translateX = useSharedValue(initialPosition.x);
  const translateY = useSharedValue(initialPosition.y);
  const dragStartX = useSharedValue(initialPosition.x);
  const dragStartY = useSharedValue(initialPosition.y);
  const barWidth = useSharedValue(ESTIMATED_HORIZONTAL_WIDTH);
  const barHeight = useSharedValue(ESTIMATED_HORIZONTAL_HEIGHT);
  const activeEdgeIndex = useSharedValue<DockedEdgeIndex>(EDGE_TOP);

  const layoutForEdge = useCallback((edge: DockedEdge): ToolbarLayout => {
    const nextOrientation = orientationForEdge(edge);
    const measured = measuredLayoutsRef.current[nextOrientation];
    if (measured) return measured;
    return nextOrientation === 'vertical'
      ? { width: ESTIMATED_VERTICAL_WIDTH, height: ESTIMATED_VERTICAL_HEIGHT }
      : { width: ESTIMATED_HORIZONTAL_WIDTH, height: ESTIMATED_HORIZONTAL_HEIGHT };
  }, []);

  const snapToEdge = useCallback(
    (edge: DockedEdge, animated = true) => {
      const layout = layoutForEdge(edge);
      const edgeIndex = edgeIndexFor(edge);
      const next = centeredPositionForEdgeIndex(
        edgeIndex,
        layout.width,
        layout.height,
        screenWidth,
        screenHeight,
        topInset,
        insets.bottom,
      );
      activeEdgeIndex.value = edgeIndex;
      dragStartX.value = next.x;
      dragStartY.value = next.y;
      if (animated) {
        translateX.value = withSpring(next.x, { damping: 26, stiffness: 260 });
        translateY.value = withSpring(next.y, { damping: 26, stiffness: 260 });
      } else {
        translateX.value = next.x;
        translateY.value = next.y;
      }
    },
    [
      activeEdgeIndex,
      dragStartX,
      dragStartY,
      insets.bottom,
      layoutForEdge,
      screenHeight,
      screenWidth,
      topInset,
      translateX,
      translateY,
    ],
  );

  const commitDockedEdge = useCallback((edgeIndex: number) => {
    const nextEdge = edgeForIndex(edgeIndex);
    dockedEdgeRef.current = nextEdge;
    setDockedEdge((prev) => (prev === nextEdge ? prev : nextEdge));
  }, []);

  const startDrag = useCallback(() => {
    draggingRef.current = true;
  }, []);

  const finishDrag = useCallback(
    (edgeIndex: number) => {
      draggingRef.current = false;
      commitDockedEdge(edgeIndex);
      triggerSnapHaptic();
    },
    [commitDockedEdge],
  );

  const cancelDrag = useCallback(() => {
    draggingRef.current = false;
    snapToEdge(dockedEdgeRef.current);
  }, [snapToEdge]);

  useEffect(() => {
    dockedEdgeRef.current = dockedEdge;
    activeEdgeIndex.value = edgeIndexFor(dockedEdge);
    buttonLayoutsRef.current.clear();
  }, [activeEdgeIndex, dockedEdge]);

  useEffect(() => {
    if (!draggingRef.current) {
      snapToEdge(dockedEdge);
    }
  }, [dockedEdge, screenWidth, screenHeight, topInset, insets.bottom, snapToEdge]);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(DRAG_ACTIVATE_DISTANCE)
        .onBegin(() => {
          'worklet';
          dragStartX.value = translateX.value;
          dragStartY.value = translateY.value;
          runOnJS(startDrag)();
        })
        .onUpdate((evt) => {
          'worklet';
          const width = barWidth.value || ESTIMATED_HORIZONTAL_WIDTH;
          const height = barHeight.value || ESTIMATED_HORIZONTAL_HEIGHT;
          const next = clampedFreePosition(
            dragStartX.value + evt.translationX,
            dragStartY.value + evt.translationY,
            width,
            height,
            screenWidth,
            screenHeight,
            topInset,
            insets.bottom,
          );
          translateX.value = next.x;
          translateY.value = next.y;
        })
        .onEnd(() => {
          'worklet';
          const width = barWidth.value || ESTIMATED_HORIZONTAL_WIDTH;
          const height = barHeight.value || ESTIMATED_HORIZONTAL_HEIGHT;
          const centerX = translateX.value + width / 2;
          const centerY = translateY.value + height / 2;
          const nextEdgeIndex = nearestEdgeIndexForCenter(
            centerX,
            centerY,
            screenWidth,
            screenHeight,
            topInset,
            insets.bottom,
          );
          const next = centeredPositionForEdgeIndex(
            nextEdgeIndex,
            width,
            height,
            screenWidth,
            screenHeight,
            topInset,
            insets.bottom,
          );
          activeEdgeIndex.value = nextEdgeIndex;
          dragStartX.value = next.x;
          dragStartY.value = next.y;
          translateX.value = withSpring(next.x, { damping: 26, stiffness: 260 });
          translateY.value = withSpring(next.y, { damping: 26, stiffness: 260 });
          runOnJS(finishDrag)(nextEdgeIndex);
        })
        .onFinalize((_evt, success) => {
          'worklet';
          if (!success) {
            runOnJS(cancelDrag)();
          }
        }),
    [
      activeEdgeIndex,
      barHeight,
      barWidth,
      cancelDrag,
      dragStartX,
      dragStartY,
      finishDrag,
      insets.bottom,
      screenHeight,
      screenWidth,
      startDrag,
      topInset,
      translateX,
      translateY,
    ],
  );

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const handlePillLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!width || !height) return;
    const layout = { width, height };
    pillLayoutRef.current = layout;
    measuredLayoutsRef.current[width >= height ? 'horizontal' : 'vertical'] = layout;
    barWidth.value = width;
    barHeight.value = height;
    if (!draggingRef.current) {
      snapToEdge(dockedEdgeRef.current);
    }
  };

  const registerButtonLayout = useCallback((key: string, layout: ButtonLayout) => {
    buttonLayoutsRef.current.set(key, layout);
  }, []);

  const anchorFor = useCallback(
    (toolType: SupportedTool): ToolbarButtonAnchor => {
      const layout = buttonLayoutsRef.current.get(toolType);
      const pill = pillLayoutRef.current;
      const x = translateX.value;
      const y = translateY.value;
      const edge = dockedEdgeRef.current;
      if (!layout) {
        return {
          toolType,
          screenX: x + pill.width / 2,
          screenY: y + pill.height / 2,
          width: 0,
          height: 0,
          dockedEdge: edge,
        };
      }
      return {
        toolType,
        screenX: x + layout.offsetX,
        screenY: y + layout.offsetY,
        width: layout.width,
        height: layout.height,
        dockedEdge: edge,
      };
    },
    [translateX, translateY],
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="box-none" style={[styles.host, containerStyle]}>
        <GestureDetector gesture={dragGesture}>
          <View
            onLayout={handlePillLayout}
            style={[
              styles.pill,
              isVertical ? styles.pillVertical : styles.pillHorizontal,
              isCompactHorizontal && styles.pillCompact,
              {
                backgroundColor: theme.colors.toolbarBackground,
                borderColor: theme.colors.toolbarBorder,
                shadowColor: theme.colors.toolbarShadow,
              },
            ]}
          >
            {TOOL_DESCRIPTORS.map((tool) => {
              const isActive = activeTool === tool.type;
              const tint = tool.supportsColor ? toolColors[tool.type] : undefined;
              return (
                <View
                  key={tool.type}
                  onLayout={(e) => {
                    const { x, y, width, height } = e.nativeEvent.layout;
                    registerButtonLayout(tool.type, {
                      offsetX: x,
                      offsetY: y,
                      width,
                      height,
                    });
                  }}
                >
                  <ToolButton
                    descriptor={tool}
                    active={isActive}
                    color={tint}
                    compact={isCompactHorizontal}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      onToolPress(tool, isActive, anchorFor(tool.type));
                    }}
                    onLongPress={() => {
                      if (!tool.supportsColor && !tool.supportsWidth) return;
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      onToolLongPress(tool, anchorFor(tool.type));
                    }}
                  />
                </View>
              );
            })}

            <View
              style={[
                isVertical ? styles.horizontalLineDivider : styles.verticalLineDivider,
                { backgroundColor: theme.colors.divider },
              ]}
            />

            <SmallIconButton
              iconName="hand-left-outline"
              active={fingerDrawingEnabled}
              compact={isCompactHorizontal}
              accessibilityLabel={
                fingerDrawingEnabled ? 'Disable finger drawing' : 'Enable finger drawing'
              }
              onPress={onToggleFingerDrawing}
              theme={theme}
            />
            <SmallIconButton
              iconName="arrow-undo-outline"
              compact={isCompactHorizontal}
              accessibilityLabel="Undo"
              onPress={onUndo}
              theme={theme}
            />
            <SmallIconButton
              iconName="arrow-redo-outline"
              compact={isCompactHorizontal}
              accessibilityLabel="Redo"
              onPress={onRedo}
              theme={theme}
            />
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

function SmallIconButton({
  iconName,
  active = false,
  compact = false,
  accessibilityLabel,
  onPress,
  theme,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  compact?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.smallButton,
        compact && styles.smallButtonCompact,
        {
          backgroundColor: active
            ? theme.colors.accentMuted
            : pressed
              ? theme.colors.surfaceMuted
              : 'transparent',
        },
      ]}
    >
      <Ionicons
        name={iconName}
        size={compact ? 18 : 20}
        color={active ? theme.colors.accent : theme.colors.text}
      />
    </Pressable>
  );
}

function triggerSnapHaptic() {
  if (Platform.OS === 'ios') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: TOOLBAR_PAD,
    paddingVertical: TOOLBAR_PAD,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  pillCompact: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  pillHorizontal: {
    flexDirection: 'row',
  },
  pillVertical: {
    flexDirection: 'column',
  },
  verticalLineDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    marginHorizontal: spacing.xs,
  },
  horizontalLineDivider: {
    height: StyleSheet.hairlineWidth,
    width: 24,
    marginVertical: spacing.xs,
  },
  smallButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    margin: 1,
  },
  smallButtonCompact: {
    width: 30,
    height: 30,
  },
});
