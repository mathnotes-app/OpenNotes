import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
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
  type SharedValue,
} from 'react-native-reanimated';
import type { InsertedElement } from '@mathnotes/mobile-ink';
import { useTheme } from '../../hooks/useTheme';

const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 240;
const DEFAULT_MIN_SIZE = 50;
const HANDLE_SIZE = 24;
const HANDLE_OFFSET = -HANDLE_SIZE / 2;
const MIN_CROP_SIZE = 36;

type ResizeHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type CropHandle =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

type CropRect = NonNullable<InsertedElement['cropRect']>;

export interface ImageInsertOverlayProps {
  element: InsertedElement;
  pageScale: number;
  screenLeft: number;
  screenTop: number;
  pageWidth: number;
  pageHeight: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<InsertedElement>) => void;
  onUpdateCrop: (
    cropRect: CropRect | undefined,
    width: number,
    height: number,
    x: number,
    y: number,
  ) => void;
  onDuplicate?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onRemove: () => void;
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function resizeFromCorner(
  direction: ResizeHandle,
  baseX: number,
  baseY: number,
  baseWidth: number,
  baseHeight: number,
  dx: number,
  dy: number,
  pageWidth: number,
  pageHeight: number,
  preserveAspectRatio: boolean,
) {
  'worklet';
  const aspectRatio = baseHeight > 0 ? baseWidth / baseHeight : 1;
  let nextX = baseX;
  let nextY = baseY;
  let nextWidth = baseWidth;
  let nextHeight = baseHeight;

  if (preserveAspectRatio) {
    const rawWidth = direction.includes('left') ? baseWidth - dx : baseWidth + dx;
    const rawHeight = direction.includes('top') ? baseHeight - dy : baseHeight + dy;
    const widthScale = rawWidth / baseWidth;
    const heightScale = rawHeight / baseHeight;
    const minScale = Math.max(DEFAULT_MIN_SIZE / baseWidth, DEFAULT_MIN_SIZE / baseHeight);
    const uniformScale = Math.max(minScale, Math.max(widthScale, heightScale));

    nextWidth = Math.min(pageWidth, baseWidth * uniformScale);
    nextHeight = Math.min(pageHeight, nextWidth / aspectRatio);

    if (direction.includes('left')) nextX = baseX + (baseWidth - nextWidth);
    if (direction.includes('top')) nextY = baseY + (baseHeight - nextHeight);
  } else {
    if (direction.includes('right')) {
      nextWidth = Math.max(DEFAULT_MIN_SIZE, baseWidth + dx);
    }
    if (direction.includes('left')) {
      const widthDelta = Math.min(dx, baseWidth - DEFAULT_MIN_SIZE);
      nextWidth = baseWidth - widthDelta;
      nextX = baseX + widthDelta;
    }
    if (direction.includes('bottom')) {
      nextHeight = Math.max(DEFAULT_MIN_SIZE, baseHeight + dy);
    }
    if (direction.includes('top')) {
      const heightDelta = Math.min(dy, baseHeight - DEFAULT_MIN_SIZE);
      nextHeight = baseHeight - heightDelta;
      nextY = baseY + heightDelta;
    }
  }

  nextX = clamp(nextX, 0, Math.max(0, pageWidth - nextWidth));
  nextY = clamp(nextY, 0, Math.max(0, pageHeight - nextHeight));
  nextWidth = Math.min(nextWidth, pageWidth - nextX);
  nextHeight = Math.min(nextHeight, pageHeight - nextY);

  return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
}

export function ImageInsertOverlay({
  element,
  pageScale,
  screenLeft,
  screenTop,
  pageWidth,
  pageHeight,
  isSelected,
  onSelect,
  onUpdate,
  onUpdateCrop,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onRemove,
}: ImageInsertOverlayProps) {
  const theme = useTheme();
  const [isCropMode, setIsCropMode] = useState(false);

  const initialWidth = element.width ?? DEFAULT_WIDTH;
  const initialHeight = element.height ?? DEFAULT_HEIGHT;
  const locked = Boolean(element.locked);
  const sourceUri = element.sourceUri ?? element.renderedImageUri;
  const canCrop = element.type === 'image' && Boolean(sourceUri);
  const preserveAspectRatio = element.type === 'latex-figure';

  const x = useSharedValue(element.x);
  const y = useSharedValue(element.y);
  const width = useSharedValue(initialWidth);
  const height = useSharedValue(initialHeight);
  const rotation = useSharedValue(element.rotation ?? 0);
  const savedX = useSharedValue(element.x);
  const savedY = useSharedValue(element.y);
  const savedWidth = useSharedValue(initialWidth);
  const savedHeight = useSharedValue(initialHeight);
  const savedRotation = useSharedValue(element.rotation ?? 0);
  const cropX = useSharedValue(element.cropRect?.x ?? 0);
  const cropY = useSharedValue(element.cropRect?.y ?? 0);
  const cropWidth = useSharedValue(element.cropRect?.width ?? 1);
  const cropHeight = useSharedValue(element.cropRect?.height ?? 1);
  const savedCropX = useSharedValue(element.cropRect?.x ?? 0);
  const savedCropY = useSharedValue(element.cropRect?.y ?? 0);
  const savedCropWidth = useSharedValue(element.cropRect?.width ?? 1);
  const savedCropHeight = useSharedValue(element.cropRect?.height ?? 1);
  const rotateCenterX = useSharedValue(0);
  const rotateCenterY = useSharedValue(0);
  const rotateStartPointerAngle = useSharedValue(0);
  const hasMoved = useSharedValue(false);

  useEffect(() => {
    x.value = element.x;
    y.value = element.y;
    width.value = element.width ?? DEFAULT_WIDTH;
    height.value = element.height ?? DEFAULT_HEIGHT;
    rotation.value = element.rotation ?? 0;
    savedX.value = element.x;
    savedY.value = element.y;
    savedWidth.value = element.width ?? DEFAULT_WIDTH;
    savedHeight.value = element.height ?? DEFAULT_HEIGHT;
    savedRotation.value = element.rotation ?? 0;
    cropX.value = element.cropRect?.x ?? 0;
    cropY.value = element.cropRect?.y ?? 0;
    cropWidth.value = element.cropRect?.width ?? 1;
    cropHeight.value = element.cropRect?.height ?? 1;
    savedCropX.value = element.cropRect?.x ?? 0;
    savedCropY.value = element.cropRect?.y ?? 0;
    savedCropWidth.value = element.cropRect?.width ?? 1;
    savedCropHeight.value = element.cropRect?.height ?? 1;
  }, [
    cropHeight,
    cropWidth,
    cropX,
    cropY,
    element.cropRect,
    element.height,
    element.rotation,
    element.width,
    element.x,
    element.y,
    height,
    rotation,
    savedCropHeight,
    savedCropWidth,
    savedCropX,
    savedCropY,
    savedHeight,
    savedRotation,
    savedWidth,
    savedX,
    savedY,
    width,
    x,
    y,
  ]);

  useEffect(() => {
    if (!isSelected) setIsCropMode(false);
  }, [isSelected]);

  const commitPosition = useCallback(
    (nextX: number, nextY: number) => {
      onUpdate({ x: nextX, y: nextY });
    },
    [onUpdate],
  );

  const commitSize = useCallback(
    (nextWidth: number, nextHeight: number, nextX: number, nextY: number) => {
      onUpdate({
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      });
    },
    [onUpdate],
  );

  const commitRotation = useCallback(
    (nextRotation: number) => {
      onUpdate({ rotation: nextRotation });
    },
    [onUpdate],
  );

  const selectFromFinger = useCallback(() => {
    onSelect();
  }, [onSelect]);

  const handleFingerPointerDown = useCallback((event: any) => {
    const pointerType = event.nativeEvent.pointerType;
    if (pointerType === 'pen' || pointerType === 'stylus') return;
    event.stopPropagation();
    onSelect();
  }, [onSelect]);

  const handleResetCrop = useCallback(() => {
    if (!element.cropRect) {
      setIsCropMode(false);
      return;
    }

    const fullWidth = (element.width ?? DEFAULT_WIDTH) / Math.max(0.001, element.cropRect.width);
    const fullHeight = (element.height ?? DEFAULT_HEIGHT) / Math.max(0.001, element.cropRect.height);
    const fullX = element.x - element.cropRect.x * fullWidth;
    const fullY = element.y - element.cropRect.y * fullHeight;

    x.value = fullX;
    y.value = fullY;
    width.value = fullWidth;
    height.value = fullHeight;
    cropX.value = 0;
    cropY.value = 0;
    cropWidth.value = 1;
    cropHeight.value = 1;
    savedCropX.value = 0;
    savedCropY.value = 0;
    savedCropWidth.value = 1;
    savedCropHeight.value = 1;
    onUpdateCrop(undefined, fullWidth, fullHeight, fullX, fullY);
    setIsCropMode(false);
  }, [
    cropHeight,
    cropWidth,
    cropX,
    cropY,
    element.cropRect,
    element.height,
    element.width,
    element.x,
    element.y,
    height,
    onUpdateCrop,
    savedCropHeight,
    savedCropWidth,
    savedCropX,
    savedCropY,
    width,
    x,
    y,
  ]);

  const dragGesture = Gesture.Pan()
    .enabled(isSelected && !isCropMode)
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
      hasMoved.value = false;
      if (locked) return;
      savedX.value = x.value;
      savedY.value = y.value;
      hasMoved.value = true;
    })
    .onUpdate((evt) => {
      'worklet';
      if (locked || !hasMoved.value) return;
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
      if (hasMoved.value) {
        runOnJS(commitPosition)(x.value, y.value);
      }
    });

  const tapGesture = Gesture.Tap()
    .enabled(!isCropMode)
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
      if (success) runOnJS(onSelect)();
    });

  const rotateGesture = Gesture.Pan()
    .enabled(isSelected && !locked && !isCropMode)
    .manualActivation(true)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      if (event.pointerType === PointerType.STYLUS) {
        stateManager.fail();
        return;
      }
      stateManager.activate();
    })
    .onStart((evt) => {
      'worklet';
      savedRotation.value = rotation.value;
      rotateCenterX.value = screenLeft + x.value * pageScale + (width.value * pageScale) / 2;
      rotateCenterY.value = screenTop + y.value * pageScale + (height.value * pageScale) / 2;
      rotateStartPointerAngle.value = Math.atan2(
        evt.absoluteY - rotateCenterY.value,
        evt.absoluteX - rotateCenterX.value,
      );
      runOnJS(onSelect)();
    })
    .onUpdate((evt) => {
      'worklet';
      const currentAngle = Math.atan2(
        evt.absoluteY - rotateCenterY.value,
        evt.absoluteX - rotateCenterX.value,
      );
      rotation.value =
        savedRotation.value +
        ((currentAngle - rotateStartPointerAngle.value) * 180) / Math.PI;
    })
    .onEnd(() => {
      'worklet';
      runOnJS(commitRotation)(rotation.value);
    });

  const createResizeGesture = (direction: ResizeHandle) =>
    Gesture.Pan()
      .enabled(isSelected && !locked && !isCropMode)
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
        savedX.value = x.value;
        savedY.value = y.value;
        savedWidth.value = width.value;
        savedHeight.value = height.value;
      })
      .onUpdate((evt) => {
        'worklet';
        const next = resizeFromCorner(
          direction,
          savedX.value,
          savedY.value,
          savedWidth.value,
          savedHeight.value,
          evt.translationX / pageScale,
          evt.translationY / pageScale,
          pageWidth,
          pageHeight,
          preserveAspectRatio,
        );
        x.value = next.x;
        y.value = next.y;
        width.value = next.width;
        height.value = next.height;
      })
      .onEnd(() => {
        'worklet';
        runOnJS(commitSize)(width.value, height.value, x.value, y.value);
      });

  const animatedStyle = useAnimatedStyle(() => ({
    left: screenLeft,
    top: screenTop,
    width: width.value * pageScale,
    height: height.value * pageScale,
    transform: [
      { translateX: x.value * pageScale },
      { translateY: y.value * pageScale },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  if (!sourceUri) return null;

  return (
    <GestureDetector gesture={Gesture.Simultaneous(tapGesture, dragGesture)}>
      <Animated.View
        onPointerDown={handleFingerPointerDown}
        pointerEvents="auto"
        style={[
          styles.host,
          isSelected && styles.selected,
          {
            borderColor: isSelected ? theme.colors.accent : 'transparent',
            zIndex: element.zIndex ?? 1,
          },
          animatedStyle,
        ]}
      >
        <View pointerEvents="none" style={styles.contentLayer}>
          {isCropMode ? (
            <AnimatedCroppedImage
              uri={sourceUri}
              width={width}
              height={height}
              cropX={cropX}
              cropY={cropY}
              cropWidth={cropWidth}
              cropHeight={cropHeight}
            />
          ) : (
            <ImageElementView uri={sourceUri} element={element} />
          )}
        </View>

        {isSelected ? (
          <>
            {!locked && !isCropMode ? (
              <ResizeHandles createResizeGesture={createResizeGesture} />
            ) : null}
            <View
              style={[
                styles.actionBar,
                canCrop ? styles.actionBarWithCrop : null,
                isCropMode ? styles.actionBarCropEditing : null,
                {
                  backgroundColor: theme.colors.surfaceElevated,
                  shadowColor: theme.colors.cardShadow,
                },
              ]}
            >
              {canCrop ? (
                <ActionButton
                  name="crop-outline"
                  color={isCropMode ? theme.colors.accent : theme.colors.textSecondary}
                  onPress={() => setIsCropMode((value) => !value)}
                />
              ) : null}
              {isCropMode ? (
                <>
                  <ActionButton
                    name="refresh"
                    color={theme.colors.textSecondary}
                    onPress={handleResetCrop}
                  />
                  <ActionButton
                    name="checkmark"
                    color={theme.colors.accent}
                    onPress={() => setIsCropMode(false)}
                  />
                </>
              ) : null}
              {onDuplicate ? (
                <ActionButton
                  name="copy-outline"
                  color={theme.colors.textSecondary}
                  onPress={onDuplicate}
                />
              ) : null}
              {onBringToFront ? (
                <ActionButton
                  name="chevron-up"
                  color={theme.colors.textSecondary}
                  onPress={onBringToFront}
                />
              ) : null}
              {onSendToBack ? (
                <ActionButton
                  name="chevron-down"
                  color={theme.colors.textSecondary}
                  onPress={onSendToBack}
                />
              ) : null}
              <ActionButton
                name={locked ? 'lock-closed' : 'lock-open-outline'}
                color={locked ? theme.colors.accent : theme.colors.textSecondary}
                onPress={() => onUpdate({ locked: !locked })}
              />
              <ActionButton
                name="trash-outline"
                color={theme.colors.destructive}
                onPress={onRemove}
              />
            </View>
            {!locked && !isCropMode ? (
              <GestureDetector gesture={rotateGesture}>
                <Animated.View style={[styles.rotateHandle, { backgroundColor: theme.colors.accent }]}>
                  <Ionicons name="sync" size={16} color="#FFFFFF" />
                </Animated.View>
              </GestureDetector>
            ) : null}
            {isCropMode && canCrop ? (
              <CropHandles
                pageScale={pageScale}
                width={width}
                height={height}
                x={x}
                y={y}
                savedWidth={savedWidth}
                savedHeight={savedHeight}
                savedX={savedX}
                savedY={savedY}
                cropX={cropX}
                cropY={cropY}
                cropWidth={cropWidth}
                cropHeight={cropHeight}
                savedCropX={savedCropX}
                savedCropY={savedCropY}
                savedCropWidth={savedCropWidth}
                savedCropHeight={savedCropHeight}
                onUpdateCrop={onUpdateCrop}
              />
            ) : null}
          </>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

function ImageElementView({
  uri,
  element,
}: {
  uri: string;
  element: InsertedElement;
}) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const displayWidth = element.width ?? DEFAULT_WIDTH;
  const displayHeight = element.height ?? DEFAULT_HEIGHT;
  const imageStyle = element.cropRect
    ? {
        width: displayWidth / Math.max(0.001, element.cropRect.width),
        height: displayHeight / Math.max(0.001, element.cropRect.height),
        left: -element.cropRect.x * (displayWidth / Math.max(0.001, element.cropRect.width)),
        top: -element.cropRect.y * (displayHeight / Math.max(0.001, element.cropRect.height)),
      }
    : StyleSheet.absoluteFill;

  return (
    <View style={styles.imageContainer}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#0A84FF" />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.errorContainer}>
          <Ionicons name="image-outline" size={32} color="rgba(142, 142, 147, 0.8)" />
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={[styles.image, imageStyle]}
          resizeMode="cover"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
      )}
    </View>
  );
}

function AnimatedCroppedImage({
  uri,
  width,
  height,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
}: {
  uri: string;
  width: SharedValue<number>;
  height: SharedValue<number>;
  cropX: SharedValue<number>;
  cropY: SharedValue<number>;
  cropWidth: SharedValue<number>;
  cropHeight: SharedValue<number>;
}) {
  const imageStyle = useAnimatedStyle(() => {
    const safeCropWidth = Math.max(0.02, cropWidth.value);
    const safeCropHeight = Math.max(0.02, cropHeight.value);
    const renderedWidth = width.value / safeCropWidth;
    const renderedHeight = height.value / safeCropHeight;

    return {
      width: renderedWidth,
      height: renderedHeight,
      transform: [
        { translateX: -cropX.value * renderedWidth },
        { translateY: -cropY.value * renderedHeight },
      ],
    };
  });

  return (
    <View style={styles.liveCropContainer}>
      <Animated.Image
        source={{ uri }}
        resizeMode="cover"
        style={[styles.liveCropImage, imageStyle]}
      />
    </View>
  );
}

function ResizeHandles({
  createResizeGesture,
}: {
  createResizeGesture: (handle: ResizeHandle) => ReturnType<typeof Gesture.Pan>;
}) {
  return (
    <>
      {RESIZE_HANDLES.map((handle) => (
        <GestureDetector key={handle} gesture={createResizeGesture(handle)}>
          <Animated.View style={[styles.handle, handleStyle(handle)]} />
        </GestureDetector>
      ))}
    </>
  );
}

function CropHandles({
  pageScale,
  width,
  height,
  x,
  y,
  savedWidth,
  savedHeight,
  savedX,
  savedY,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  savedCropX,
  savedCropY,
  savedCropWidth,
  savedCropHeight,
  onUpdateCrop,
}: {
  pageScale: number;
  width: SharedValue<number>;
  height: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  savedWidth: SharedValue<number>;
  savedHeight: SharedValue<number>;
  savedX: SharedValue<number>;
  savedY: SharedValue<number>;
  cropX: SharedValue<number>;
  cropY: SharedValue<number>;
  cropWidth: SharedValue<number>;
  cropHeight: SharedValue<number>;
  savedCropX: SharedValue<number>;
  savedCropY: SharedValue<number>;
  savedCropWidth: SharedValue<number>;
  savedCropHeight: SharedValue<number>;
  onUpdateCrop: (
    cropRect: CropRect | undefined,
    width: number,
    height: number,
    x: number,
    y: number,
  ) => void;
}) {
  const createCropGesture = (edge: CropHandle) =>
    Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((event, stateManager) => {
        'worklet';
        if (event.pointerType === PointerType.STYLUS) {
          stateManager.fail();
          return;
        }
      })
      .onTouchesMove((_event, stateManager) => {
        'worklet';
        stateManager.activate();
      })
      .onStart(() => {
        'worklet';
        savedWidth.value = width.value;
        savedHeight.value = height.value;
        savedX.value = x.value;
        savedY.value = y.value;
        savedCropX.value = cropX.value;
        savedCropY.value = cropY.value;
        savedCropWidth.value = cropWidth.value;
        savedCropHeight.value = cropHeight.value;
      })
      .onUpdate((event) => {
        'worklet';
        const fullWidth = savedWidth.value / Math.max(0.001, savedCropWidth.value);
        const fullHeight = savedHeight.value / Math.max(0.001, savedCropHeight.value);
        const minWidth = Math.min(savedWidth.value, MIN_CROP_SIZE);
        const minHeight = Math.min(savedHeight.value, MIN_CROP_SIZE);
        let nextX = savedX.value;
        let nextY = savedY.value;
        let nextWidth = savedWidth.value;
        let nextHeight = savedHeight.value;
        let nextCropX = savedCropX.value;
        let nextCropY = savedCropY.value;
        let nextCropWidth = savedCropWidth.value;
        let nextCropHeight = savedCropHeight.value;

        if (edge.includes('left')) {
          const maxDelta = Math.min(
            savedWidth.value - minWidth,
            (1 - savedCropX.value) * fullWidth - minWidth,
          );
          const dx = Math.max(
            -savedCropX.value * fullWidth,
            Math.min(maxDelta, event.translationX / pageScale),
          );
          nextX = savedX.value + dx;
          nextWidth = savedWidth.value - dx;
          nextCropX = savedCropX.value + dx / fullWidth;
          nextCropWidth = savedCropWidth.value - dx / fullWidth;
        } else if (edge.includes('right')) {
          const minDelta = minWidth - savedWidth.value;
          const maxDelta = (1 - savedCropX.value - savedCropWidth.value) * fullWidth;
          const dx = Math.max(minDelta, Math.min(maxDelta, event.translationX / pageScale));
          nextWidth = savedWidth.value + dx;
          nextCropWidth = savedCropWidth.value + dx / fullWidth;
        }

        if (edge.includes('top')) {
          const maxDelta = Math.min(
            savedHeight.value - minHeight,
            (1 - savedCropY.value) * fullHeight - minHeight,
          );
          const dy = Math.max(
            -savedCropY.value * fullHeight,
            Math.min(maxDelta, event.translationY / pageScale),
          );
          nextY = savedY.value + dy;
          nextHeight = savedHeight.value - dy;
          nextCropY = savedCropY.value + dy / fullHeight;
          nextCropHeight = savedCropHeight.value - dy / fullHeight;
        } else if (edge.includes('bottom')) {
          const minDelta = minHeight - savedHeight.value;
          const maxDelta = (1 - savedCropY.value - savedCropHeight.value) * fullHeight;
          const dy = Math.max(minDelta, Math.min(maxDelta, event.translationY / pageScale));
          nextHeight = savedHeight.value + dy;
          nextCropHeight = savedCropHeight.value + dy / fullHeight;
        }

        x.value = nextX;
        y.value = nextY;
        width.value = nextWidth;
        height.value = nextHeight;
        cropX.value = Math.max(0, Math.min(1, nextCropX));
        cropY.value = Math.max(0, Math.min(1, nextCropY));
        cropWidth.value = Math.max(0.02, Math.min(1 - cropX.value, nextCropWidth));
        cropHeight.value = Math.max(0.02, Math.min(1 - cropY.value, nextCropHeight));
      })
      .onEnd(() => {
        'worklet';
        const nextCropRect = {
          x: cropX.value,
          y: cropY.value,
          width: cropWidth.value,
          height: cropHeight.value,
        };
        const isFullImage =
          nextCropRect.x <= 0.001 &&
          nextCropRect.y <= 0.001 &&
          nextCropRect.width >= 0.999 &&
          nextCropRect.height >= 0.999;
        runOnJS(onUpdateCrop)(
          isFullImage ? undefined : nextCropRect,
          width.value,
          height.value,
          x.value,
          y.value,
        );
      });

  return (
    <>
      <View pointerEvents="none" style={styles.cropOverlay} />
      {CROP_HANDLES.map((handle) => (
        <GestureDetector key={handle} gesture={createCropGesture(handle)}>
          <Animated.View
            style={[
              handle.includes('-') ? styles.cropCornerHandle : styles.cropEdgeHandle,
              cropHandleStyle(handle),
            ]}
          />
        </GestureDetector>
      ))}
    </>
  );
}

function ActionButton({
  name,
  color,
  onPress,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.actionButton}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.68}
    >
      <Ionicons name={name} size={18} color={color} />
    </TouchableOpacity>
  );
}

const RESIZE_HANDLES: ResizeHandle[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

const CROP_HANDLES: CropHandle[] = [
  'left',
  'right',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

function handleStyle(handle: ResizeHandle) {
  switch (handle) {
    case 'top-left':
      return { top: HANDLE_OFFSET, left: HANDLE_OFFSET };
    case 'top-right':
      return { top: HANDLE_OFFSET, right: HANDLE_OFFSET };
    case 'bottom-left':
      return { bottom: HANDLE_OFFSET, left: HANDLE_OFFSET };
    case 'bottom-right':
      return { bottom: HANDLE_OFFSET, right: HANDLE_OFFSET };
  }
}

function cropHandleStyle(handle: CropHandle) {
  switch (handle) {
    case 'left':
      return styles.cropHandleLeft;
    case 'right':
      return styles.cropHandleRight;
    case 'top':
      return styles.cropHandleTop;
    case 'bottom':
      return styles.cropHandleBottom;
    case 'top-left':
      return styles.cropCornerTopLeft;
    case 'top-right':
      return styles.cropCornerTopRight;
    case 'bottom-left':
      return styles.cropCornerBottomLeft;
    case 'bottom-right':
      return styles.cropCornerBottomRight;
  }
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    overflow: 'visible',
  },
  selected: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  contentLayer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 4,
  },
  imageContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 4,
  },
  image: {
    position: 'absolute',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  actionBar: {
    position: 'absolute',
    top: -64,
    left: '50%',
    transform: [{ translateX: -83 }],
    flexDirection: 'row',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  actionBarWithCrop: {
    transform: [{ translateX: -98 }],
  },
  actionBarCropEditing: {
    transform: [{ translateX: -128 }],
  },
  actionButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: '#FFFFFF',
  },
  rotateHandle: {
    position: 'absolute',
    top: HANDLE_OFFSET - 6,
    left: '50%',
    width: 32,
    height: 32,
    marginLeft: -16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  liveCropContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 4,
  },
  liveCropImage: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  cropOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.035)',
  },
  cropEdgeHandle: {
    position: 'absolute',
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },
  cropCornerHandle: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 9,
    backgroundColor: '#007AFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  cropHandleLeft: {
    left: -5,
    top: '35%',
    width: 10,
    height: '30%',
  },
  cropHandleRight: {
    right: -5,
    top: '35%',
    width: 10,
    height: '30%',
  },
  cropHandleTop: {
    top: -5,
    left: '35%',
    width: '30%',
    height: 10,
  },
  cropHandleBottom: {
    bottom: -5,
    left: '35%',
    width: '30%',
    height: 10,
  },
  cropCornerTopLeft: {
    left: 0,
    top: 0,
  },
  cropCornerTopRight: {
    left: '100%',
    top: 0,
  },
  cropCornerBottomLeft: {
    left: 0,
    top: '100%',
  },
  cropCornerBottomRight: {
    left: '100%',
    top: '100%',
  },
});
