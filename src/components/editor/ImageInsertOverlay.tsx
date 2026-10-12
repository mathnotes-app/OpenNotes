import {useNativeCallback} from '../../hooks/native-callback';
import {resizeFromCorner, localPointerDelta, anchorRotatedFrame, cropFromEdge, type ResizeHandle} from './overlayGeometry';
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
const HANDLE_SIZE = 24;
const HANDLE_OFFSET = -HANDLE_SIZE / 2;

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
  gestureScale?: SharedValue<number>;
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


export function ImageInsertOverlay({
  element,
  pageScale,
  gestureScale,
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
  const nativeSelect = useNativeCallback(onSelect);
  const theme = useTheme();
  const [isCropMode, setIsCropMode] = useState(false);

  const initialWidth = element.width ?? DEFAULT_WIDTH;
  const initialHeight = element.height ?? DEFAULT_HEIGHT;
  const locked = Boolean(element.locked);
  const sourceUri = element.sourceUri ?? element.renderedImageUri;
  const canCrop = element.type === 'image' && Boolean(sourceUri) && !locked;
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
    element.rotation,
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

  const commitPosition = useNativeCallback(
    (nextX: number, nextY: number) => {
      onUpdate({ x: nextX, y: nextY });
    },
  );

  const commitSize = useNativeCallback(
    (nextWidth: number, nextHeight: number, nextX: number, nextY: number) => {
      onUpdate({
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      });
    },
  );

  const commitRotation = useNativeCallback(
    (nextRotation: number) => {
      onUpdate({ rotation: nextRotation });
    },
  );

  const selectFromFinger = useNativeCallback(() => {
    onSelect();
  });

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
    const fullFrame = anchorRotatedFrame({x: element.x, y: element.y,
      width: element.width ?? DEFAULT_WIDTH, height: element.height ?? DEFAULT_HEIGHT},
      {x: element.x - element.cropRect.x * fullWidth, y: element.y - element.cropRect.y * fullHeight,
        width: fullWidth, height: fullHeight}, element.rotation ?? 0);
    const fullX = fullFrame.x, fullY = fullFrame.y;

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
    element.rotation,
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

  const dragOriginX = useSharedValue(0);
  const dragOriginY = useSharedValue(0);
  const dragGesture = Gesture.Pan().maxPointers(1)
    .enabled(isSelected && !isCropMode)
    .manualActivation(true)
    .minDistance(2)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      if (event.pointerType === PointerType.STYLUS || event.numberOfTouches > 1) {
        stateManager.fail();
        return;
      }
      const touch = event.allTouches[0];
      if (touch) {dragOriginX.value = touch.absoluteX; dragOriginY.value = touch.absoluteY;}
      hasMoved.value = false;
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
        savedX.value + (evt.absoluteX - dragOriginX.value) / (gestureScale?.value ?? pageScale),
        0,
        Math.max(0, pageWidth - width.value),
      );
      // The owner page remains stable when an asset crosses a page boundary.
      y.value = savedY.value + (evt.absoluteY - dragOriginY.value) / (gestureScale?.value ?? pageScale);
    })
    .onEnd((_event, success) => {
      'worklet';
      if (success && hasMoved.value) {runOnJS(commitPosition)(x.value, y.value);}
    })
    .onFinalize((_event, success) => {
      'worklet';
      if (!success && hasMoved.value) {x.value = savedX.value; y.value = savedY.value;}
      hasMoved.value = false;
    });

  const tapGesture = Gesture.Tap()
    .enabled(!isCropMode)
    .maxDistance(18)
    .maxDuration(450)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      if (event.pointerType === PointerType.STYLUS || event.numberOfTouches > 1) {
        stateManager.fail();
      }
    })
    .onEnd((_evt, success) => {
      'worklet';
      if (success) runOnJS(nativeSelect)();
    });

  const rotateGesture = Gesture.Pan().maxPointers(1)
    .enabled(isSelected && !locked && !isCropMode)
    .manualActivation(true)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      if (event.pointerType === PointerType.STYLUS || event.numberOfTouches > 1) {
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
      runOnJS(nativeSelect)();
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
    .onEnd((_event, success) => {
      'worklet';
      if (success) runOnJS(commitRotation)(rotation.value);
      else rotation.value = savedRotation.value;
    });

  const resizeOriginX = useSharedValue(0);
  const resizeOriginY = useSharedValue(0);
  const createResizeGesture = (direction: ResizeHandle) =>
    Gesture.Pan().maxPointers(1)
      .enabled(isSelected && !locked && !isCropMode)
      .manualActivation(true)
      .onTouchesDown((event, stateManager) => {
        'worklet';
        if (event.pointerType === PointerType.STYLUS || event.numberOfTouches > 1) {
          stateManager.fail();
          return;
        }
        const touch = event.allTouches[0];
        if (touch) {resizeOriginX.value = touch.absoluteX; resizeOriginY.value = touch.absoluteY;}
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
        const delta = localPointerDelta(evt.absoluteX - resizeOriginX.value,
          evt.absoluteY - resizeOriginY.value, gestureScale?.value ?? pageScale, rotation.value);
        const resized = resizeFromCorner(
          direction,
          savedX.value,
          savedY.value,
          savedWidth.value,
          savedHeight.value,
          delta.x,
          delta.y,
          pageWidth,
          preserveAspectRatio,
        );
        const next = anchorRotatedFrame({x: savedX.value, y: savedY.value,
          width: savedWidth.value, height: savedHeight.value}, resized, rotation.value);
        x.value = next.x;
        y.value = next.y;
        width.value = next.width;
        height.value = next.height;
      })
      .onEnd((_event, success) => {
        'worklet';
        if (success) runOnJS(commitSize)(width.value, height.value, x.value, y.value);
        else { x.value = savedX.value; y.value = savedY.value; width.value = savedWidth.value; height.value = savedHeight.value; }
      });

  const animatedStyle = useAnimatedStyle(() => ({
    left: screenLeft,
    top: screenTop,
    // InfiniteInkCanvas already transforms this overlay with the page. Keep
    // its layout in page units; pageScale is for screen-space gesture deltas.
    width: width.value,
    height: height.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  if (!sourceUri) return null;

  return (
    <GestureDetector gesture={Gesture.Simultaneous(tapGesture, dragGesture)}>
      <Animated.View
        testID={`inserted-image-${element.id}`}
        collapsable={false}
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
              <ResizeHandles elementId={element.id} createResizeGesture={createResizeGesture} />
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
                  testID={`image-crop-toggle-${element.id}`}
                  name="crop-outline"
                  color={isCropMode ? theme.colors.accent : theme.colors.textSecondary}
                  onPress={() => setIsCropMode((value) => !value)}
                />
              ) : null}
              {isCropMode ? (
                <>
                  <ActionButton
                    testID={`image-crop-reset-${element.id}`}
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
                testID={`image-lock-${element.id}`}
                name={locked ? 'lock-closed' : 'lock-open-outline'}
                color={locked ? theme.colors.accent : theme.colors.textSecondary}
                onPress={() => { setIsCropMode(false); onUpdate({ locked: !locked }); }}
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
                elementId={element.id}
                rotation={rotation}
                pageScale={pageScale}
                gestureScale={gestureScale}
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
  elementId,
  createResizeGesture,
}: {
  elementId: string;
  createResizeGesture: (handle: ResizeHandle) => ReturnType<typeof Gesture.Pan>;
}) {
  return (
    <>
      {RESIZE_HANDLES.map((handle) => (
        <GestureDetector key={handle} gesture={createResizeGesture(handle)}>
          <Animated.View testID={`image-resize-${elementId}-${handle}`} collapsable={false} style={[styles.handle, handleStyle(handle)]} />
        </GestureDetector>
      ))}
    </>
  );
}

function CropHandles({
  elementId,
  rotation,
  pageScale,
  gestureScale,
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
  elementId: string;
  rotation: SharedValue<number>;
  pageScale: number;
  gestureScale?: SharedValue<number>;
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
  const nativeCrop = useNativeCallback(onUpdateCrop);
  const touchStart = useSharedValue({x: 0, y: 0});
  const createCropGesture = (edge: CropHandle) =>
    Gesture.Pan().maxPointers(1)
      .manualActivation(true)
      .onTouchesDown((event, stateManager) => {
        'worklet';
        const touch = event.allTouches[0];
        if (touch) touchStart.value = {x: touch.absoluteX, y: touch.absoluteY};
        if (event.pointerType === PointerType.STYLUS || event.numberOfTouches > 1) {
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
        const delta = localPointerDelta(event.absoluteX - touchStart.value.x,
          event.absoluteY - touchStart.value.y, gestureScale?.value ?? pageScale, rotation.value);
        const next = cropFromEdge({x: savedX.value, y: savedY.value,
          width: savedWidth.value, height: savedHeight.value},
          {x: savedCropX.value, y: savedCropY.value, width: savedCropWidth.value, height: savedCropHeight.value},
          edge, delta.x, delta.y, rotation.value);
        x.value = next.frame.x; y.value = next.frame.y;
        width.value = next.frame.width; height.value = next.frame.height;
        cropX.value = next.crop.x; cropY.value = next.crop.y;
        cropWidth.value = next.crop.width; cropHeight.value = next.crop.height;
      })
      .onEnd((_event, success) => {
        'worklet';
        if (!success) {
          x.value = savedX.value; y.value = savedY.value; width.value = savedWidth.value; height.value = savedHeight.value;
          cropX.value = savedCropX.value; cropY.value = savedCropY.value;
          cropWidth.value = savedCropWidth.value; cropHeight.value = savedCropHeight.value;
          return;
        }
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
        runOnJS(nativeCrop)(
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
          <Animated.View testID={`image-crop-${elementId}-${handle}`} collapsable={false}
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
  testID,
  name,
  color,
  onPress,
}: {
  testID?: string;
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      testID={testID}
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
