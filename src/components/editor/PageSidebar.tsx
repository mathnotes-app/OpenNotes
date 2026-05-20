import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NotebookPage } from '@mathnotes/mobile-ink';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

const SIDEBAR_WIDTH = 136;
const THUMBNAIL_WIDTH = 78;
const THUMBNAIL_HEIGHT = 102;

export interface PageSidebarProps {
  visible: boolean;
  pages: NotebookPage[];
  currentPage: number;
  topInset: number;
  bottomInset: number;
  onClose: () => void;
  onJumpToPage: (pageIndex: number) => void;
}

function clampPageNumber(value: number, pageCount: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(pageCount, value));
}

export function PageSidebar({
  visible,
  pages,
  currentPage,
  topInset,
  bottomInset,
  onClose,
  onJumpToPage,
}: PageSidebarProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const pageCount = Math.max(1, pages.length);
  const [draftPage, setDraftPage] = useState(String(currentPage + 1));

  useEffect(() => {
    setDraftPage(String(currentPage + 1));
  }, [currentPage]);

  useEffect(() => {
    if (!visible) return;
    const y = Math.max(0, currentPage * (THUMBNAIL_HEIGHT + spacing.lg) - spacing.lg);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y, animated: true });
    });
  }, [currentPage, visible]);

  const jumpToPageNumber = useCallback(
    (pageNumber: number) => {
      const nextPage = clampPageNumber(pageNumber, pageCount);
      setDraftPage(String(nextPage));
      Keyboard.dismiss();
      onJumpToPage(nextPage - 1);
    },
    [onJumpToPage, pageCount],
  );

  const submitDraft = useCallback(() => {
    const parsed = Number.parseInt(draftPage, 10);
    jumpToPageNumber(parsed);
  }, [draftPage, jumpToPageNumber]);

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close page sidebar"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { top: topInset }]}
      />
      <View
        style={[
          styles.sidebar,
          {
            top: topInset,
            bottom: bottomInset,
            backgroundColor: theme.colors.toolbarBackground,
            borderColor: theme.colors.toolbarBorder,
            shadowColor: theme.colors.toolbarShadow,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={[typography.footnote, styles.headerText, { color: theme.colors.text }]}>
            Pages
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close pages"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.jumpRow}>
          <TextInput
            accessibilityLabel="Jump to page"
            value={draftPage}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            maxLength={String(pageCount).length}
            onChangeText={(value) => setDraftPage(value.replace(/[^0-9]/g, ''))}
            onBlur={submitDraft}
            onSubmitEditing={submitDraft}
            style={[
              typography.footnote,
              styles.jumpInput,
              {
                color: theme.colors.text,
                borderColor: theme.colors.divider,
                backgroundColor: theme.colors.surface,
              },
            ]}
          />
          <Text style={[typography.caption, styles.jumpTotal, { color: theme.colors.textSecondary }]}>
            / {pageCount}
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.thumbList}
        >
          {pages.map((page, index) => {
            const active = index === currentPage;
            return (
              <Pressable
                key={page.id}
                accessibilityRole="button"
                accessibilityLabel={`Go to page ${index + 1}`}
                onPress={() => jumpToPageNumber(index + 1)}
                style={({ pressed }) => [
                  styles.thumbButton,
                  pressed && { opacity: 0.72 },
                ]}
              >
                <View
                  style={[
                    styles.thumbnail,
                    page.previewUri ? styles.thumbnailWithPreview : null,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: active ? theme.colors.accent : theme.colors.divider,
                    },
                    active && { shadowColor: theme.colors.accent },
                  ]}
                >
                  {page.previewUri ? (
                    <Image
                      source={{ uri: page.previewUri }}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <>
                      <View style={[styles.fakeLine, { backgroundColor: theme.colors.divider }]} />
                      <View style={[styles.fakeLineShort, { backgroundColor: theme.colors.divider }]} />
                      <View style={[styles.fakeLine, { backgroundColor: theme.colors.divider }]} />
                    </>
                  )}
                  <Text
                    style={[
                      typography.caption,
                      styles.pageNumber,
                      page.previewUri && [
                        styles.pageNumberPill,
                        {
                          backgroundColor: theme.colors.toolbarBackground,
                          color: active ? theme.colors.accent : theme.colors.text,
                        },
                      ],
                      !page.previewUri && {
                        color: active ? theme.colors.accent : theme.colors.textSecondary,
                      },
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    paddingBottom: spacing.md,
    position: 'absolute',
    right: 0,
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    width: SIDEBAR_WIDTH,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  headerText: {
    fontWeight: '600',
    letterSpacing: 0,
  },
  closeButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  jumpRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  jumpInput: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    fontWeight: '600',
    height: 30,
    letterSpacing: 0,
    minWidth: 40,
    paddingHorizontal: spacing.xs,
    paddingVertical: 0,
    textAlign: 'center',
  },
  jumpTotal: {
    letterSpacing: 0,
    marginLeft: spacing.xs,
  },
  thumbList: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    rowGap: spacing.md,
  },
  thumbButton: {
    alignItems: 'center',
  },
  thumbnail: {
    borderRadius: radius.sm,
    borderWidth: 1.5,
    height: THUMBNAIL_HEIGHT,
    overflow: 'hidden',
    padding: spacing.sm,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    width: THUMBNAIL_WIDTH,
  },
  thumbnailWithPreview: {
    padding: 0,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  fakeLine: {
    borderRadius: radius.pill,
    height: 3,
    marginBottom: spacing.xs,
    opacity: 0.62,
    width: '100%',
  },
  fakeLineShort: {
    borderRadius: radius.pill,
    height: 3,
    marginBottom: spacing.xs,
    opacity: 0.45,
    width: '68%',
  },
  pageNumber: {
    bottom: spacing.xs,
    fontWeight: '600',
    letterSpacing: 0,
    position: 'absolute',
    right: spacing.xs,
  },
  pageNumberPill: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
});
