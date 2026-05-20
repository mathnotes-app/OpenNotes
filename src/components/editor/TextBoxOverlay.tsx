import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Gesture,
  GestureDetector,
  PointerType,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { InkTextBox } from '@mathnotes/mobile-ink';
import { useTheme } from '../../hooks/useTheme';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 100;
const MAX_WIDTH = 2000;
const MAX_HEIGHT = 2000;
const HANDLE_SIZE = 28;
const HANDLE_OFFSET = -HANDLE_SIZE / 2;

type ResizeHandle =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left';

export interface TextBoxOverlayProps {
  textBox: InkTextBox;
  pageScale: number;
  screenLeft: number;
  screenTop: number;
  pageWidth: number;
  pageHeight: number;
  isEditing: boolean;
  isSelected: boolean;
  onStartEdit: () => void;
  onSelect: () => void;
  onCommit: (next: Partial<InkTextBox>) => void;
  onRemove: () => void;
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function resizeFromHandle(
  handle: ResizeHandle,
  baseX: number,
  baseY: number,
  baseWidth: number,
  baseHeight: number,
  dx: number,
  dy: number,
  pageWidth: number,
  pageHeight: number,
) {
  'worklet';
  let nextX = baseX;
  let nextY = baseY;
  let nextWidth = baseWidth;
  let nextHeight = baseHeight;

  if (handle.includes('left')) {
    const widthDelta = clamp(dx, baseWidth - MAX_WIDTH, baseWidth - MIN_WIDTH);
    nextWidth = baseWidth - widthDelta;
    nextX = baseX + widthDelta;
  }
  if (handle.includes('right')) {
    nextWidth = clamp(baseWidth + dx, MIN_WIDTH, MAX_WIDTH);
  }
  if (handle.includes('top')) {
    const heightDelta = clamp(dy, baseHeight - MAX_HEIGHT, baseHeight - MIN_HEIGHT);
    nextHeight = baseHeight - heightDelta;
    nextY = baseY + heightDelta;
  }
  if (handle.includes('bottom')) {
    nextHeight = clamp(baseHeight + dy, MIN_HEIGHT, MAX_HEIGHT);
  }

  nextX = clamp(nextX, 0, Math.max(0, pageWidth - nextWidth));
  nextY = clamp(nextY, 0, Math.max(0, pageHeight - nextHeight));
  nextWidth = Math.min(nextWidth, pageWidth - nextX);
  nextHeight = Math.min(nextHeight, pageHeight - nextY);

  return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
}

export function TextBoxOverlay({
  textBox,
  pageScale,
  screenLeft,
  screenTop,
  pageWidth,
  pageHeight,
  isEditing,
  isSelected,
  onStartEdit,
  onSelect,
  onCommit,
  onRemove,
}: TextBoxOverlayProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [localContent, setLocalContent] = useState(textBox.content);
  const wasEditingRef = useRef(false);
  const isSelectedRef = useRef(isSelected);
  const suppressEditUntilRef = useRef(0);
  isSelectedRef.current = isSelected;

  const baseWidth = textBox.width || MIN_WIDTH;
  const baseHeight = textBox.height || MIN_HEIGHT;
  const x = useSharedValue(textBox.x);
  const y = useSharedValue(textBox.y);
  const width = useSharedValue(baseWidth);
  const height = useSharedValue(baseHeight);
  const savedX = useSharedValue(textBox.x);
  const savedY = useSharedValue(textBox.y);
  const savedWidth = useSharedValue(baseWidth);
  const savedHeight = useSharedValue(baseHeight);
  const isDragging = useSharedValue(false);
  const isResizing = useSharedValue(false);

  useEffect(() => {
    const enteredEditing = isEditing && !wasEditingRef.current;
    if (enteredEditing || !isEditing) {
      setLocalContent(textBox.content);
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, textBox.content]);

  useEffect(() => {
    if (isEditing) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [isEditing]);

  useEffect(() => {
    x.value = textBox.x;
    y.value = textBox.y;
    width.value = baseWidth;
    height.value = baseHeight;
    savedX.value = textBox.x;
    savedY.value = textBox.y;
    savedWidth.value = baseWidth;
    savedHeight.value = baseHeight;
  }, [
    baseHeight,
    baseWidth,
    height,
    savedHeight,
    savedWidth,
    savedX,
    savedY,
    textBox.x,
    textBox.y,
    width,
    x,
    y,
  ]);

  const commitLayout = useCallback(
    (nextX: number, nextY: number, nextWidth: number, nextHeight: number) => {
      onCommit({
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      });
    },
    [onCommit],
  );

  const selectFromFinger = useCallback(() => {
    if (!isSelectedRef.current) {
      suppressEditUntilRef.current = Date.now() + 250;
    }
    onSelect();
  }, [onSelect]);

  const handleFingerPointerDown = useCallback((event: any) => {
    const pointerType = event.nativeEvent.pointerType;
    if (isEditing || pointerType === 'pen' || pointerType === 'stylus') return;
    event.stopPropagation();
    selectFromFinger();
  }, [isEditing, selectFromFinger]);

  const handleTap = useCallback(() => {
    if (isSelectedRef.current) {
      if (Date.now() < suppressEditUntilRef.current) return;
      onStartEdit();
    } else {
      suppressEditUntilRef.current = Date.now() + 250;
      onSelect();
    }
  }, [onSelect, onStartEdit]);

  const handleContentChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      onCommit({ content, isEditing: true });
    },
    [onCommit],
  );

  const dragGesture = Gesture.Pan()
    .enabled(isSelected && !isEditing)
    .manualActivation(true)
    .minDistance(2)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      if (event.pointerType === PointerType.STYLUS) {
        stateManager.fail();
        return;
      }
      runOnJS(selectFromFinger)();
    })
    .onTouchesMove((_event, stateManager) => {
      'worklet';
      stateManager.activate();
    })
    .onStart(() => {
      'worklet';
      runOnJS(selectFromFinger)();
      isDragging.value = true;
      savedX.value = x.value;
      savedY.value = y.value;
    })
    .onUpdate((evt) => {
      'worklet';
      x.value = clamp(
        savedX.value + evt.translationX / pageScale,
        0,
        Math.max(0, pageWidth - width.value),
      );
      y.value = clamp(
        savedY.value + evt.translationY / pageScale,
        0,
        Math.max(0, pageHeight - height.value),
      );
    })
    .onEnd(() => {
      'worklet';
      isDragging.value = false;
      runOnJS(commitLayout)(x.value, y.value, width.value, height.value);
    });

  const tapGesture = Gesture.Tap()
    .enabled(!isEditing)
    .maxDistance(18)
    .maxDuration(450)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      if (event.pointerType === PointerType.STYLUS) {
        stateManager.fail();
      }
    })
    .onEnd((_evt, success) => {
      'worklet';
      if (success) runOnJS(handleTap)();
    });

  const createResizeGesture = (handle: ResizeHandle) =>
    Gesture.Pan()
      .enabled(isSelected && !isEditing)
      .manualActivation(true)
      .onTouchesDown((event, stateManager) => {
        'worklet';
        if (event.pointerType === PointerType.STYLUS) {
          stateManager.fail();
          return;
        }
        stateManager.activate();
      })
      .onStart(() => {
        'worklet';
        isResizing.value = true;
        savedX.value = x.value;
        savedY.value = y.value;
        savedWidth.value = width.value;
        savedHeight.value = height.value;
      })
      .onUpdate((evt) => {
        'worklet';
        const next = resizeFromHandle(
          handle,
          savedX.value,
          savedY.value,
          savedWidth.value,
          savedHeight.value,
          evt.translationX / pageScale,
          evt.translationY / pageScale,
          pageWidth,
          pageHeight,
        );
        x.value = next.x;
        y.value = next.y;
        width.value = next.width;
        height.value = next.height;
      })
      .onEnd(() => {
        'worklet';
        isResizing.value = false;
        runOnJS(commitLayout)(x.value, y.value, width.value, height.value);
      });

  const animatedStyle = useAnimatedStyle(() => ({
    left: screenLeft,
    top: screenTop,
    width: width.value * pageScale,
    height: height.value * pageScale,
    transform: [
      { translateX: x.value * pageScale },
      { translateY: y.value * pageScale },
      { scale: isDragging.value || isResizing.value ? 1.02 : 1 },
    ],
  }));

  const fontSize = (textBox.fontSize ?? 18) * pageScale;
  const color = textBox.color || theme.colors.text;
  const showChrome = isSelected || isEditing;

  return (
    <GestureDetector gesture={Gesture.Simultaneous(tapGesture, dragGesture)}>
      <Animated.View
        onPointerDown={handleFingerPointerDown}
        pointerEvents="auto"
        style={[
          styles.host,
          animatedStyle,
          {
            borderColor: showChrome ? theme.colors.accent : 'transparent',
            borderWidth: showChrome ? 2 : 0,
            backgroundColor: 'transparent',
          },
        ]}
      >
        <View style={styles.touchArea}>
          {isEditing ? (
            <TextInput
              ref={inputRef}
              value={localContent}
              onChangeText={handleContentChange}
              multiline
              scrollEnabled={false}
              style={[
                styles.input,
                {
                  color,
                  fontSize,
                  lineHeight: fontSize * 1.25,
                  borderColor: theme.colors.divider,
                  backgroundColor: 'transparent',
                },
              ]}
              placeholder="Type..."
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="sentences"
              textAlignVertical="top"
              onBlur={() => {
                if (!localContent.trim()) {
                  onRemove();
                } else {
                  onCommit({ content: localContent, isEditing: false });
                }
              }}
            />
          ) : (
            <View pointerEvents="none" style={styles.contentLayer}>
              <Text
                selectable={false}
                style={{
                  color,
                  fontSize,
                  lineHeight: fontSize * 1.25,
                  fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
                }}
              >
                {textBox.content || 'Tap to add text'}
              </Text>
            </View>
          )}
        </View>

        {showChrome ? (
          <>
            <View style={styles.actionBar}>
              <Pressable
                onPress={onRemove}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.actionButton,
                  pressed && { backgroundColor: theme.colors.surfaceMuted },
                ]}
              >
                <Ionicons name="trash-outline" size={18} color={theme.colors.destructive} />
              </Pressable>
            </View>
            {RESIZE_HANDLES.map((handle) => (
              <ResizeHandleView
                key={handle}
                position={handle}
                gesture={createResizeGesture(handle)}
                accent={theme.colors.accent}
              />
            ))}
          </>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const RESIZE_HANDLES: ResizeHandle[] = [
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left',
];

function ResizeHandleView({
  position,
  gesture,
  accent,
}: {
  position: ResizeHandle;
  gesture: ReturnType<typeof Gesture.Pan>;
  accent: string;
}) {
  const isCorner = position.includes('-');
  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.handleTouchArea, handlePosition(position)]}>
        <View
          style={[
            isCorner ? styles.cornerHandle : styles.edgeHandle,
            { borderColor: accent },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

function handlePosition(position: ResizeHandle): ViewStyle {
  switch (position) {
    case 'top-left':
      return { top: HANDLE_OFFSET, left: HANDLE_OFFSET };
    case 'top':
      return { top: HANDLE_OFFSET, left: '50%', marginLeft: HANDLE_OFFSET };
    case 'top-right':
      return { top: HANDLE_OFFSET, right: HANDLE_OFFSET };
    case 'right':
      return { top: '50%', marginTop: HANDLE_OFFSET, right: HANDLE_OFFSET };
    case 'bottom-right':
      return { bottom: HANDLE_OFFSET, right: HANDLE_OFFSET };
    case 'bottom':
      return { bottom: HANDLE_OFFSET, left: '50%', marginLeft: HANDLE_OFFSET };
    case 'bottom-left':
      return { bottom: HANDLE_OFFSET, left: HANDLE_OFFSET };
    case 'left':
      return { top: '50%', marginTop: HANDLE_OFFSET, left: HANDLE_OFFSET };
  }
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    borderRadius: 8,
    padding: 8,
    overflow: 'visible',
  },
  touchArea: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  contentLayer: {
    flex: 1,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    margin: 0,
  },
  actionBar: {
    position: 'absolute',
    top: -48,
    left: '50%',
    transform: [{ translateX: -14 }],
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleTouchArea: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cornerHandle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  edgeHandle: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
});
