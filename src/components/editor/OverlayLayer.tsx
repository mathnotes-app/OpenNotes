import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type {
  InfiniteInkViewportTransform,
  InkTextBox,
  InsertedElement,
  NotebookPage,
} from '@mathnotes/mobile-ink';
import { TextBoxOverlay } from './TextBoxOverlay';
import { ImageInsertOverlay } from './ImageInsertOverlay';
import type { ViewportTransformStore } from '../../hooks/useViewportTransform';
import { screenToPageCoord } from '../../hooks/useViewportTransform';
import type { SupportedTool } from '../../utils/toolPalette';

const CONTENT_PADDING = 16;
const PAGE_GAP = 0;

export interface OverlaySelection {
  type: 'text' | 'image';
  pageIndex: number;
  id: string;
  editing?: boolean;
}

export interface OverlayLayerProps {
  store: ViewportTransformStore;
  pages: NotebookPage[];
  pageWidth: number;
  pageHeight: number;
  activeTool: SupportedTool;
  activeColor: string;
  selection: OverlaySelection | null;
  onSelectionChange: (next: OverlaySelection | null) => void;
  onCreateTextBox: (pageIndex: number, box: InkTextBox) => void;
  onUpdateTextBox: (pageIndex: number, boxId: string, patch: Partial<InkTextBox>) => void;
  onRemoveTextBox: (pageIndex: number, boxId: string) => void;
  onUpdateInsertedElement: (
    pageIndex: number,
    elementId: string,
    patch: Partial<InsertedElement>,
  ) => void;
  onDuplicateInsertedElement: (pageIndex: number, elementId: string) => void;
  onRemoveInsertedElement: (pageIndex: number, elementId: string) => void;
  onCreateTextBoxId: () => string;
}

export function OverlayLayer({
  store,
  pages,
  pageWidth,
  pageHeight,
  activeTool,
  activeColor,
  selection,
  onSelectionChange,
  onCreateTextBox,
  onUpdateTextBox,
  onRemoveTextBox,
  onUpdateInsertedElement,
  onDuplicateInsertedElement,
  onRemoveInsertedElement,
  onCreateTextBoxId,
}: OverlayLayerProps) {
  const transformRef = useRef<InfiniteInkViewportTransform | null>(store.getSnapshot());
  const [hasTransform, setHasTransform] = useState(() => transformRef.current !== null);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      const next = store.getSnapshot();
      if (!next) return;
      transformRef.current = next;
      setHasTransform(true);
    });
    return unsub;
  }, [store]);

  const handleTextToolTap = useCallback(
    (event: GestureResponderEvent) => {
      const transform = transformRef.current;
      if (!transform || activeTool !== 'text') return;
      const { locationX, locationY } = event.nativeEvent;
      const coord = screenToPageCoord(
        transform,
        locationX,
        locationY,
        pageWidth,
        pageHeight,
        CONTENT_PADDING,
        PAGE_GAP,
        pages.length,
      );
      if (!coord) return;
      const id = onCreateTextBoxId();
      const box: InkTextBox = {
        id,
        x: Math.max(0, coord.x - 6),
        y: Math.max(0, coord.y - 12),
        width: 240,
        // Give a new note enough room for several lines before its internal
        // editor needs to scroll.
        height: 120,
        content: '',
        color: activeColor,
        fontSize: 18,
        isEditing: true,
      };
      onCreateTextBox(coord.pageIndex, box);
      onSelectionChange({ type: 'text', pageIndex: coord.pageIndex, id, editing: true });
    },
    [
      activeColor,
      activeTool,
      onCreateTextBox,
      onCreateTextBoxId,
      onSelectionChange,
      pageHeight,
      pageWidth,
      pages.length,
    ],
  );

  const handleBlankTap = useCallback(
    (event: GestureResponderEvent) => {
      if (selection) {
        Keyboard.dismiss();
        onSelectionChange(null);
        return;
      }
      if (activeTool === 'text') {
        handleTextToolTap(event);
      }
    },
    [activeTool, handleTextToolTap, onSelectionChange, selection],
  );

  if (!hasTransform) {
    return null;
  }

  const captureTaps = activeTool === 'text' || selection !== null;

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      {captureTaps ? (
        <Pressable
          onPress={handleBlankTap}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {pages.map((page, pageIndex) => {
        const textBoxes = page.textBoxes ?? [];
        const elements = [...(page.insertedElements ?? [])].sort(
          (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0),
        );
        return (
          <View
            key={page.id}
            pointerEvents="box-none"
            style={[
              styles.pageHost,
              {
                left: 0,
                top: pageIndex * (pageHeight + PAGE_GAP),
                width: pageWidth,
                height: pageHeight,
              },
            ]}
          >
            {elements.map((el) => {
              const canRenderElement =
                el.type === 'image' ||
                typeof el.sourceUri === 'string' ||
                typeof el.renderedImageUri === 'string';
              const isSelected =
                selection?.type === 'image' &&
                selection.pageIndex === pageIndex &&
                selection.id === el.id;
              return canRenderElement ? (
                <ImageInsertOverlay
                  key={el.id}
                  element={el}
                  pageScale={transformRef.current?.scale ?? 1}
                  screenLeft={0}
                  screenTop={0}
                  pageWidth={pageWidth}
                  pageHeight={pageHeight}
                  isSelected={isSelected}
                  onSelect={() =>
                    onSelectionChange({ type: 'image', pageIndex, id: el.id })
                  }
                  onUpdate={(patch) => onUpdateInsertedElement(pageIndex, el.id, patch)}
                  onUpdateCrop={(cropRect, width, height, x, y) =>
                    onUpdateInsertedElement(pageIndex, el.id, {
                      cropRect,
                      width,
                      height,
                      x,
                      y,
                    })
                  }
                  onDuplicate={() => onDuplicateInsertedElement(pageIndex, el.id)}
                  onBringToFront={() => {
                    const nextZIndex =
                      Math.max(0, ...elements.map((candidate) => candidate.zIndex ?? 0)) + 1;
                    onUpdateInsertedElement(pageIndex, el.id, { zIndex: nextZIndex });
                  }}
                  onSendToBack={() => {
                    const nextZIndex =
                      Math.min(0, ...elements.map((candidate) => candidate.zIndex ?? 0)) - 1;
                    onUpdateInsertedElement(pageIndex, el.id, { zIndex: nextZIndex });
                  }}
                  onRemove={() => {
                    onRemoveInsertedElement(pageIndex, el.id);
                    onSelectionChange(null);
                  }}
                />
              ) : null;
            })}
            {textBoxes.map((tb) => {
              const isSelected =
                selection?.type === 'text' &&
                selection.pageIndex === pageIndex &&
                selection.id === tb.id;
              return (
                <TextBoxOverlay
                  key={tb.id}
                  textBox={tb}
                  pageScale={transformRef.current?.scale ?? 1}
                  screenLeft={0}
                  screenTop={0}
                  pageWidth={pageWidth}
                  pageHeight={pageHeight}
                  isEditing={Boolean(isSelected && selection?.editing)}
                  isSelected={isSelected}
                  onSelect={() =>
                    onSelectionChange({ type: 'text', pageIndex, id: tb.id })
                  }
                  onStartEdit={() =>
                    onSelectionChange({
                      type: 'text',
                      pageIndex,
                      id: tb.id,
                      editing: true,
                    })
                  }
                  onCommit={(patch) => {
                    onUpdateTextBox(pageIndex, tb.id, patch);
                    if (patch.isEditing === false) {
                      onSelectionChange({ type: 'text', pageIndex, id: tb.id });
                    }
                  }}
                  onRemove={() => {
                    onRemoveTextBox(pageIndex, tb.id);
                    onSelectionChange(null);
                  }}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pageHost: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
