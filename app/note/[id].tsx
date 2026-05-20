import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  InfiniteInkCanvas,
  type InfiniteInkCanvasRef,
  type InkTextBox,
  type InsertedElement,
  type NotebookPage,
  type SerializedNotebookData,
} from '@mathnotes/mobile-ink';
import {
  EditorHeader,
  EDITOR_HEADER_BAR_HEIGHT,
} from '../../src/components/editor/EditorHeader';
import {
  FloatingToolbar,
  type ToolbarButtonAnchor,
} from '../../src/components/editor/FloatingToolbar';
import { PageSidebar } from '../../src/components/editor/PageSidebar';
import { ToolSettingsPopover } from '../../src/components/editor/ToolSettingsPopover';
import { ItemActionsMenu } from '../../src/components/library/ItemActionsMenu';
import { RenameDialog } from '../../src/components/library/RenameDialog';
import { OverlayLayer, type OverlaySelection } from '../../src/components/editor/OverlayLayer';
import { useTheme } from '../../src/hooks/useTheme';
import { useToolState } from '../../src/hooks/useToolState';
import { useAutosave, type AutosaveStatus } from '../../src/hooks/useAutosave';
import { useViewportTransformStore } from '../../src/hooks/useViewportTransform';
import {
  getNote,
  readNoteBody,
  renameNote,
  saveNoteBody,
} from '../../src/services/notesRepo';
import {
  pickFromCamera,
  pickFromLibrary,
  type PickedImageResult,
} from '../../src/services/imageInsertStorage';
import { exportNotebookAsPdf } from '../../src/services/exportService';
import { textBoxId, insertedElementId } from '../../src/utils/id';
import type { NoteMetadata } from '../../src/types/note';
import type { ToolDescriptor } from '../../src/utils/toolPalette';

const PAGE_WIDTH = 820;
const PAGE_HEIGHT = 1061;

type EditorAction =
  | { kind: 'insertImage' }
  | { kind: 'rename' };

interface PageOverlayState {
  textBoxes: InkTextBox[];
  insertedElements: InsertedElement[];
}

interface PagePreviewSnapshot {
  previewUri: string;
  previewDataSignature?: string;
}

function emptyOverlay(): PageOverlayState {
  return { textBoxes: [], insertedElements: [] };
}

function overlayFromPage(page: NotebookPage): PageOverlayState {
  return {
    textBoxes: page.textBoxes ? page.textBoxes.map((b) => ({ ...b })) : [],
    insertedElements: page.insertedElements
      ? page.insertedElements.map((el) => ({ ...el }))
      : [],
  };
}

function previewFromPage(page: NotebookPage): PagePreviewSnapshot | null {
  if (!page.previewUri) return null;
  return {
    previewUri: page.previewUri,
    previewDataSignature: page.previewDataSignature,
  };
}

function mergePreviewIntoPage(
  page: NotebookPage,
  preview?: PagePreviewSnapshot | null,
): NotebookPage {
  if (page.previewUri || !preview?.previewUri) return page;
  const signaturesConflict =
    Boolean(page.dataSignature) &&
    Boolean(preview.previewDataSignature) &&
    page.dataSignature !== preview.previewDataSignature;
  if (signaturesConflict) return page;
  return {
    ...page,
    previewUri: preview.previewUri,
    previewDataSignature: preview.previewDataSignature,
  };
}

export default function NoteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const canvasRef = useRef<InfiniteInkCanvasRef | null>(null);
  const pendingBodyRef = useRef<SerializedNotebookData | null>(null);
  const canvasReadyRef = useRef(false);
  const isMountedRef = useRef(true);
  const navigatingRef = useRef(false);
  const storedPreviewByPageIdRef = useRef(new Map<string, PagePreviewSnapshot>());
  const lastPenToolRef = useRef<'pen' | 'highlighter' | 'crayon' | 'calligraphy'>('pen');

  const [metadata, setMetadata] = useState<NoteMetadata | null>(null);
  const [enginePages, setEnginePages] = useState<NotebookPage[]>([]);
  const [overlayMap, setOverlayMap] = useState<Map<string, PageOverlayState>>(
    () => new Map(),
  );
  const overlayMapRef = useRef(overlayMap);
  useEffect(() => {
    overlayMapRef.current = overlayMap;
  }, [overlayMap]);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<OverlaySelection | null>(null);
  const [action, setAction] = useState<EditorAction | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPageSidebarOpen, setIsPageSidebarOpen] = useState(false);
  const [toolPopover, setToolPopover] = useState<{
    descriptor: ToolDescriptor;
    anchor: ToolbarButtonAnchor;
  } | null>(null);

  const { toolState, setToolState, selectTool, toolColors } = useToolState();
  const { store } = useViewportTransformStore();

  const safeStatusChange = useCallback((next: AutosaveStatus) => {
    if (isMountedRef.current) setAutosaveStatus(next);
  }, []);

  const rememberPagePreviews = useCallback((pages: NotebookPage[]) => {
    const next = new Map(storedPreviewByPageIdRef.current);
    for (const page of pages) {
      const preview = previewFromPage(page);
      if (preview) next.set(page.id, preview);
    }
    storedPreviewByPageIdRef.current = next;
  }, []);

  const mergeStoredPreviews = useCallback((pages: NotebookPage[]) => {
    const previews = storedPreviewByPageIdRef.current;
    return pages.map((page) => mergePreviewIntoPage(page, previews.get(page.id)));
  }, []);

  const persistMerged = useCallback(async () => {
    if (!id || !canvasRef.current || navigatingRef.current) return;
    const canvasData = await canvasRef.current.getNotebookData();
    const overlay = overlayMapRef.current;
    const mergedPages = mergeStoredPreviews(canvasData.pages).map((page) => {
      const overlayForPage = overlay.get(page.id);
      if (!overlayForPage) return page;
      return {
        ...page,
        textBoxes: overlayForPage.textBoxes,
        insertedElements: overlayForPage.insertedElements,
      };
    });
    rememberPagePreviews(mergedPages);
    const merged: SerializedNotebookData = {
      ...canvasData,
      pages: mergedPages,
    };
    await saveNoteBody(id, merged);
  }, [id, mergeStoredPreviews, rememberPagePreviews]);

  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const {
    schedule: scheduleAutosave,
    flushNow,
    cancelPending: cancelPendingAutosave,
    waitForIdle: waitForAutosaveIdle,
  } = useAutosave({
    onSave: persistMerged,
    onStatusChange: safeStatusChange,
    enabled: Boolean(id) && autosaveEnabled,
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    storedPreviewByPageIdRef.current = new Map();
    setEnginePages([]);
    setCurrentPageIndex(0);
    (async () => {
      try {
        const meta = await getNote(id);
        if (!cancelled && meta) setMetadata(meta);
        const body = await readNoteBody(id);
        if (cancelled) return;
        if (body) {
          rememberPagePreviews(body.pages);
          setEnginePages(mergeStoredPreviews(body.pages));
          const initialMap = new Map<string, PageOverlayState>();
          for (const page of body.pages) {
            initialMap.set(page.id, overlayFromPage(page));
          }
          setOverlayMap(initialMap);
          if (canvasReadyRef.current) {
            void canvasRef.current?.loadNotebookData(body);
          } else {
            pendingBodyRef.current = body;
          }
        }
      } catch (error) {
        if (__DEV__) console.warn('[NoteScreen] load failed', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, mergeStoredPreviews, rememberPagePreviews]);

  const handleCanvasReady = useCallback(() => {
    canvasReadyRef.current = true;
    const pending = pendingBodyRef.current;
    if (pending) {
      pendingBodyRef.current = null;
      void canvasRef.current?.loadNotebookData(pending);
    }
  }, []);

  const handlePagesChange = useCallback((next: NotebookPage[]) => {
    if (!isMountedRef.current || navigatingRef.current) return;
    rememberPagePreviews(next);
    const pagesWithPreviews = mergeStoredPreviews(next);
    setEnginePages(pagesWithPreviews);
    // Make sure every page id has an overlay slot; drop overlays for removed pages.
    setOverlayMap((prev) => {
      let changed = false;
      const nextMap = new Map(prev);
      const idsInPages = new Set(pagesWithPreviews.map((p) => p.id));
      for (const page of pagesWithPreviews) {
        if (!nextMap.has(page.id)) {
          nextMap.set(page.id, overlayFromPage(page));
          changed = true;
        }
      }
      for (const key of Array.from(nextMap.keys())) {
        if (!idsInPages.has(key)) {
          nextMap.delete(key);
          changed = true;
        }
      }
      return changed ? nextMap : prev;
    });
  }, [mergeStoredPreviews, rememberPagePreviews]);

  const handleDrawingChange = useCallback(() => {
    if (navigatingRef.current) return;
    scheduleAutosave();
  }, [scheduleAutosave]);

  const handleTransform = useCallback(
    (t: Parameters<typeof store.onTransformChange>[0]) => {
      if (navigatingRef.current) return;
      store.onTransformChange(t);
    },
    [store],
  );

  const handleCurrentPageChange = useCallback((nextPageIndex: number) => {
    if (!isMountedRef.current || navigatingRef.current) return;
    setCurrentPageIndex(nextPageIndex);
  }, []);

  // Push tool state to canvas whenever it changes
  useEffect(() => {
    canvasRef.current?.setTool(toolState);
  }, [toolState]);

  const handleToolPress = useCallback(
    (tool: ToolDescriptor, alreadyActive: boolean, anchor: ToolbarButtonAnchor) => {
      if (
        tool.type === 'pen' ||
        tool.type === 'highlighter' ||
        tool.type === 'crayon' ||
        tool.type === 'calligraphy'
      ) {
        lastPenToolRef.current = tool.type;
      }
      if (alreadyActive) {
        if (tool.supportsColor || tool.supportsWidth) {
          setToolPopover({ descriptor: tool, anchor });
        } else if (tool.type === 'insert') {
          setAction({ kind: 'insertImage' });
        }
        return;
      }
      selectTool(tool.type);
      setSelection(null);
      setToolPopover(null);
      if (tool.type === 'insert') {
        setAction({ kind: 'insertImage' });
      }
    },
    [selectTool],
  );

  const handleToolLongPress = useCallback(
    (tool: ToolDescriptor, anchor: ToolbarButtonAnchor) => {
      if (!tool.supportsColor && !tool.supportsWidth) return;
      setToolPopover({ descriptor: tool, anchor });
    },
    [],
  );

  const handleChangeToolSettings = useCallback(
    (patch: { width?: number; color?: string; eraserMode?: string }) => {
      setToolState((prev) => ({
        ...prev,
        width: patch.width ?? prev.width,
        color: patch.color ?? prev.color,
        eraserMode: patch.eraserMode ?? prev.eraserMode,
      }));
    },
    [setToolState],
  );

  const handleUndo = useCallback(() => {
    canvasRef.current?.undo();
    scheduleAutosave();
  }, [scheduleAutosave]);
  const handleRedo = useCallback(() => {
    canvasRef.current?.redo();
    scheduleAutosave();
  }, [scheduleAutosave]);

  const handleJumpToPage = useCallback(
    (pageIndex: number) => {
      const boundedPageIndex = Math.max(
        0,
        Math.min(Math.max(0, enginePages.length - 1), pageIndex),
      );
      void Haptics.selectionAsync();
      canvasRef.current?.scrollToPage(boundedPageIndex, true);
      setCurrentPageIndex(boundedPageIndex);
      setSelection(null);
      setToolPopover(null);
      setIsPageSidebarOpen(false);
    },
    [enginePages.length],
  );

  const handlePencilDoubleTap = useCallback(() => {
    if (toolState.toolType === 'eraser') {
      selectTool(lastPenToolRef.current);
    } else {
      selectTool('eraser');
    }
  }, [selectTool, toolState.toolType]);

  const mutateOverlay = useCallback(
    (
      pageIndex: number,
      updater: (state: PageOverlayState) => PageOverlayState,
    ) => {
      setOverlayMap((prev) => {
        const page = enginePages[pageIndex];
        if (!page) return prev;
        const current = prev.get(page.id) ?? emptyOverlay();
        const next = updater(current);
        const nextMap = new Map(prev);
        nextMap.set(page.id, next);
        return nextMap;
      });
      scheduleAutosave();
    },
    [enginePages, scheduleAutosave],
  );

  const applyInsertedImage = useCallback(
    (picked: PickedImageResult) => {
      const pageIdx = Math.min(currentPageIndex, enginePages.length - 1);
      if (pageIdx < 0) return;
      const aspect = picked.width / Math.max(1, picked.height);
      const maxDim = 360;
      let w = picked.width;
      let h = picked.height;
      if (w > maxDim) {
        w = maxDim;
        h = w / aspect;
      }
      if (h > maxDim) {
        h = maxDim;
        w = h * aspect;
      }
      const element: InsertedElement = {
        id: insertedElementId(),
        type: 'image',
        x: Math.max(0, (PAGE_WIDTH - w) / 2),
        y: Math.max(0, (PAGE_HEIGHT - h) / 2),
        width: w,
        height: h,
        aspectRatio: aspect,
        rotation: 0,
        sourceUri: picked.uri,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mutateOverlay(pageIdx, (state) => ({
        ...state,
        insertedElements: [
          ...state.insertedElements,
          {
            ...element,
            zIndex: Math.max(0, ...state.insertedElements.map((el) => el.zIndex ?? 0)) + 1,
          },
        ],
      }));
      setSelection({ type: 'image', pageIndex: pageIdx, id: element.id });
    },
    [currentPageIndex, enginePages.length, mutateOverlay],
  );

  const handleInsertFromLibrary = useCallback(async () => {
    if (!id) return;
    setAction(null);
    try {
      const picked = await pickFromLibrary(id);
      if (picked) applyInsertedImage(picked);
    } catch (error) {
      if (__DEV__) console.warn('[NoteScreen] insert from library failed', error);
    }
    selectTool('pen');
  }, [applyInsertedImage, id, selectTool]);

  const handleInsertFromCamera = useCallback(async () => {
    if (!id) return;
    setAction(null);
    try {
      const picked = await pickFromCamera(id);
      if (picked) applyInsertedImage(picked);
    } catch (error) {
      if (__DEV__) console.warn('[NoteScreen] insert from camera failed', error);
    }
    selectTool('pen');
  }, [applyInsertedImage, id, selectTool]);

  const handleCreateTextBox = useCallback(
    (pageIndex: number, box: InkTextBox) => {
      mutateOverlay(pageIndex, (state) => ({
        ...state,
        textBoxes: [...state.textBoxes, box],
      }));
    },
    [mutateOverlay],
  );

  const handleUpdateTextBox = useCallback(
    (pageIndex: number, boxId: string, patch: Partial<InkTextBox>) => {
      mutateOverlay(pageIndex, (state) => ({
        ...state,
        textBoxes: state.textBoxes.map((b) =>
          b.id === boxId ? { ...b, ...patch } : b,
        ),
      }));
    },
    [mutateOverlay],
  );

  const handleRemoveTextBox = useCallback(
    (pageIndex: number, boxId: string) => {
      mutateOverlay(pageIndex, (state) => ({
        ...state,
        textBoxes: state.textBoxes.filter((b) => b.id !== boxId),
      }));
    },
    [mutateOverlay],
  );

  const handleUpdateInsertedElement = useCallback(
    (pageIndex: number, elementId: string, patch: Partial<InsertedElement>) => {
      const now = new Date().toISOString();
      mutateOverlay(pageIndex, (state) => ({
        ...state,
        insertedElements: state.insertedElements.map((el) =>
          el.id === elementId ? { ...el, ...patch, updatedAt: now } : el,
        ),
      }));
    },
    [mutateOverlay],
  );

  const handleDuplicateInsertedElement = useCallback(
    (pageIndex: number, elementId: string) => {
      const page = enginePages[pageIndex];
      if (!page) return;
      const state = overlayMapRef.current.get(page.id) ?? emptyOverlay();
      const element = state.insertedElements.find((el) => el.id === elementId);
      if (!element) return;

      const now = new Date().toISOString();
      const nextId = insertedElementId();
      const maxZIndex = Math.max(0, ...state.insertedElements.map((el) => el.zIndex ?? 0));
      const duplicated: InsertedElement = {
        ...element,
        id: nextId,
        x: Math.max(0, Math.min(PAGE_WIDTH - (element.width ?? 80), element.x + 20)),
        y: Math.max(0, Math.min(PAGE_HEIGHT - (element.height ?? 80), element.y + 20)),
        zIndex: maxZIndex + 1,
        createdAt: now,
        updatedAt: now,
      };

      mutateOverlay(pageIndex, (current) => ({
        ...current,
        insertedElements: [...current.insertedElements, duplicated],
      }));
      setSelection({ type: 'image', pageIndex, id: nextId });
    },
    [enginePages, mutateOverlay],
  );

  const handleRemoveInsertedElement = useCallback(
    (pageIndex: number, elementId: string) => {
      mutateOverlay(pageIndex, (state) => ({
        ...state,
        insertedElements: state.insertedElements.filter((el) => el.id !== elementId),
      }));
    },
    [mutateOverlay],
  );

  const handleRename = useCallback(
    async (value: string) => {
      if (!id) {
        setAction(null);
        return;
      }
      try {
        const next = await renameNote(id, value);
        if (next && isMountedRef.current) setMetadata(next);
      } catch (error) {
        if (__DEV__) console.warn('[NoteScreen] rename failed', error);
      }
      setAction(null);
    },
    [id],
  );

  const handleExport = useCallback(async () => {
    if (!id || !canvasRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await flushNow();
      const canvasData = await canvasRef.current.getNotebookData();
      const overlay = overlayMapRef.current;
      const mergedPages = mergeStoredPreviews(canvasData.pages).map((page) => {
        const overlayForPage = overlay.get(page.id);
        if (!overlayForPage) return page;
        return {
          ...page,
          textBoxes: overlayForPage.textBoxes,
          insertedElements: overlayForPage.insertedElements,
        };
      });
      rememberPagePreviews(mergedPages);
      const filename = (metadata?.title || 'note').replace(/[^\w\s.-]/g, '_');
      const result = await exportNotebookAsPdf({
        data: { ...canvasData, pages: mergedPages },
        pdfBackgroundUri: metadata?.pdfUri ?? null,
        filename,
      });
      if (!result.ok) {
        Alert.alert(
          'Export failed',
          result.error ?? 'Could not generate a PDF. Please try again.',
        );
      }
    } catch (error) {
      if (__DEV__) console.warn('[NoteScreen] export failed', error);
      Alert.alert('Export failed', 'Could not generate a PDF. Please try again.');
    } finally {
      if (isMountedRef.current) setIsExporting(false);
    }
  }, [
    flushNow,
    id,
    isExporting,
    mergeStoredPreviews,
    metadata?.pdfUri,
    metadata?.title,
    rememberPagePreviews,
  ]);

  const handleBack = useCallback(async () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    Keyboard.dismiss();
    setAction(null);
    setSelection(null);
    setToolPopover(null);
    void Haptics.selectionAsync();
    if (!isMountedRef.current) return;
    cancelPendingAutosave();
    setAutosaveEnabled(false);
    try {
      await waitForAutosaveIdle();
    } catch (error) {
      if (__DEV__) console.warn('[NoteScreen] pending save failed before navigation', error);
    }
    if (!isMountedRef.current) return;
    try {
      router.replace('/');
    } catch (error) {
      navigatingRef.current = false;
      if (__DEV__) console.warn('[NoteScreen] navigation failed', error);
    }
  }, [cancelPendingAutosave, router, waitForAutosaveIdle]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        void handleBack();
        return true;
      });
      return () => subscription.remove();
    }, [handleBack]),
  );

  const allowFingerDrawing = useMemo(() => false, []);
  const headerHeight = insets.top + EDITOR_HEADER_BAR_HEIGHT;

  const pagesForOverlay = useMemo(() => {
    return enginePages.map((page) => {
      const overlay = overlayMap.get(page.id);
      if (!overlay) return page;
      return {
        ...page,
        textBoxes: overlay.textBoxes,
        insertedElements: overlay.insertedElements,
      };
    });
  }, [enginePages, overlayMap]);

  if (!id) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]} />
    );
  }

  if (loading) {
    return (
      <View
        style={[styles.flex, styles.center, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <EditorHeader
        title={metadata?.title ?? 'Untitled'}
        status={autosaveStatus}
        currentPage={currentPageIndex}
        pageCount={Math.max(1, enginePages.length)}
        isExporting={isExporting}
        isPageSidebarOpen={isPageSidebarOpen}
        onBack={() => void handleBack()}
        onRename={() => setAction({ kind: 'rename' })}
        onTogglePageSidebar={() => setIsPageSidebarOpen((value) => !value)}
        onExport={() => void handleExport()}
      />

      <View style={styles.canvasArea}>
        <InfiniteInkCanvas
          ref={canvasRef}
          style={styles.flex}
          initialPageCount={1}
          pageWidth={PAGE_WIDTH}
          pageHeight={PAGE_HEIGHT}
          toolState={toolState}
          backgroundType={metadata?.backgroundType ?? 'plain'}
          pdfBackgroundBaseUri={metadata?.pdfUri ?? undefined}
          fingerDrawingEnabled={allowFingerDrawing}
          onReady={handleCanvasReady}
          onDrawingChange={handleDrawingChange}
          onCurrentPageChange={handleCurrentPageChange}
          onPagesChange={handlePagesChange}
          onPencilDoubleTap={handlePencilDoubleTap}
          onTransformChange={handleTransform}
        />

        <OverlayLayer
          store={store}
          pages={pagesForOverlay}
          pageWidth={PAGE_WIDTH}
          pageHeight={PAGE_HEIGHT}
          activeTool={toolState.toolType as ToolDescriptor['type']}
          activeColor={toolState.color}
          selection={selection}
          onSelectionChange={setSelection}
          onCreateTextBox={handleCreateTextBox}
          onUpdateTextBox={handleUpdateTextBox}
          onRemoveTextBox={handleRemoveTextBox}
          onUpdateInsertedElement={handleUpdateInsertedElement}
          onDuplicateInsertedElement={handleDuplicateInsertedElement}
          onRemoveInsertedElement={handleRemoveInsertedElement}
          onCreateTextBoxId={textBoxId}
        />
      </View>

      <FloatingToolbar
        activeTool={toolState.toolType as ToolDescriptor['type']}
        toolColors={toolColors}
        topInset={headerHeight}
        onToolPress={handleToolPress}
        onToolLongPress={handleToolLongPress}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <PageSidebar
        visible={isPageSidebarOpen}
        pages={enginePages}
        currentPage={currentPageIndex}
        topInset={headerHeight}
        bottomInset={insets.bottom}
        onClose={() => setIsPageSidebarOpen(false)}
        onJumpToPage={handleJumpToPage}
      />

      <ToolSettingsPopover
        visible={toolPopover !== null}
        toolType={(toolPopover?.descriptor.type ?? 'pen') as ToolDescriptor['type']}
        width={toolState.width}
        color={toolState.color}
        eraserMode={toolState.eraserMode}
        anchor={
          toolPopover
            ? {
                screenX: toolPopover.anchor.screenX,
                screenY: toolPopover.anchor.screenY,
                width: toolPopover.anchor.width,
                height: toolPopover.anchor.height,
                dockedEdge: toolPopover.anchor.dockedEdge,
              }
            : null
        }
        onChange={handleChangeToolSettings}
        onClose={() => setToolPopover(null)}
      />

      <ItemActionsMenu
        visible={action?.kind === 'insertImage'}
        title="Insert image"
        actions={[
          {
            key: 'library',
            label: 'Choose from Photos',
            onPress: () => void handleInsertFromLibrary(),
          },
          {
            key: 'camera',
            label: 'Take Photo',
            onPress: () => void handleInsertFromCamera(),
          },
        ]}
        onClose={() => {
          setAction(null);
          selectTool('pen');
        }}
      />

      <RenameDialog
        visible={action?.kind === 'rename'}
        title="Rename note"
        initialValue={metadata?.title ?? ''}
        placeholder="Note title"
        onCancel={() => setAction(null)}
        onConfirm={(value) => void handleRename(value)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  canvasArea: { flex: 1, position: 'relative' },
});
