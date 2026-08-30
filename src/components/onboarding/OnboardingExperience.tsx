import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ListRenderItemInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme/spacing';

interface OnboardingSlideItem {
  key: string;
  title: string;
  body: string;
  image: number;
  imageLabel: string;
}

const SLIDES: OnboardingSlideItem[] = [
  {
    key: 'free',
    title: 'Notes should\nbe free.',
    body: 'So OpenNotes is. Write by hand, mark up PDFs, and keep every page without a subscription.',
    image: require('../../../assets/onboarding/write-freely.png'),
    imageLabel: 'Paper and an aluminum stylus drawing a blue line',
  },
  {
    key: 'privacy',
    title: 'And they should\nstay yours.',
    body: 'No account. No tracking. Your notes stay on your device until you decide otherwise.',
    image: require('../../../assets/onboarding/private-by-design.png'),
    imageLabel: 'A note secured inside a glass archival case',
  },
  {
    key: 'mission',
    title: 'Built for everyone.',
    body: 'OpenNotes is free, private, and built in the open. That is the promise.',
    image: require('../../../assets/onboarding/help-it-grow.png'),
    imageLabel: 'An open notebook with three woven bookmarks meeting at its binding',
  },
];

const BACKUP_SLIDE: OnboardingSlideItem = {
  key: 'backup',
  title: 'Safe, even from\ndisasters.',
  body: 'A lost iPad, a hard crash, a deleted app — with iCloud backup your notes survive them all, in your own iCloud. Nothing ever leaves your Apple account.',
  image: require('../../../assets/onboarding/private-by-design.png'),
  imageLabel: 'A note protected inside a clear case, safe from harm',
};

export interface OnboardingExperienceProps {
  visible: boolean;
  onComplete: () => void | Promise<void>;
  /** Shows the iCloud backup question as the final slide (iOS only). */
  showBackupSlide?: boolean;
  /** Called with the user's explicit choice on the backup slide. */
  onChooseBackup?: (enabled: boolean) => void;
}

export function OnboardingExperience({
  visible,
  onComplete,
  showBackupSlide = false,
  onChooseBackup,
}: OnboardingExperienceProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const listRef = useRef<FlatList<OnboardingSlideItem>>(null);
  const [page, setPage] = useState(0);

  const slides = useMemo(
    () => (showBackupSlide ? [...SLIDES, BACKUP_SLIDE] : SLIDES),
    [showBackupSlide],
  );
  const isLastPage = page === slides.length - 1;
  const isBackupPage = showBackupSlide && isLastPage;

  useEffect(() => {
    if (!visible) return;
    setPage(0);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [visible]);

  const finish = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void onComplete();
  }, [onComplete]);

  const next = useCallback(() => {
    if (isLastPage) {
      if (isBackupPage) onChooseBackup?.(true);
      finish();
      return;
    }
    const nextPage = page + 1;
    void Haptics.selectionAsync();
    setPage(nextPage);
    listRef.current?.scrollToIndex({ index: nextPage, animated: true });
  }, [finish, isBackupPage, isLastPage, onChooseBackup, page]);

  const declineBackup = useCallback(() => {
    onChooseBackup?.(false);
    finish();
  }, [finish, onChooseBackup]);

  const renderSlide = useCallback(
    ({ item, index }: ListRenderItemInfo<OnboardingSlideItem>) => (
      <OnboardingSlide
        active={page === index}
        fontScale={fontScale}
        item={item}
        viewportHeight={height - insets.top - insets.bottom}
        width={width}
      />
    ),
    [fontScale, height, insets.bottom, insets.top, page, width],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={finish}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.colors.background,
            paddingBottom: Math.max(insets.bottom, spacing.md),
            paddingTop: Math.max(insets.top, spacing.md),
          },
        ]}
      >
        <View style={styles.header}>
          <View
            accessibilityRole="tablist"
            accessibilityLabel="Introduction progress"
            style={styles.progress}
          >
            {slides.map((slide, index) => (
              <View
                key={slide.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: page === index }}
                style={[
                  styles.progressSegment,
                  {
                    backgroundColor:
                      index <= page ? theme.colors.accent : theme.colors.divider,
                  },
                ]}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
            onPress={finish}
            hitSlop={10}
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
          >
            <Text
              maxFontSizeMultiplier={1.5}
              numberOfLines={1}
              style={[styles.skipText, { color: theme.colors.textSecondary }]}
            >
              Skip
            </Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            setPage(Math.round(event.nativeEvent.contentOffset.x / width));
          }}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
        />

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={next}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: theme.colors.accent,
                borderBottomColor: theme.isDark ? '#0056B3' : '#0066CC',
                shadowColor: theme.colors.accent,
              },
              pressed && styles.primaryPressed,
            ]}
          >
            <Text
              maxFontSizeMultiplier={1.5}
              numberOfLines={1}
              style={styles.primaryButtonText}
            >
              {isBackupPage
                ? 'Enable iCloud backup'
                : isLastPage
                  ? 'Start writing'
                  : 'Continue'}
            </Text>
            <Ionicons
              name={
                isBackupPage
                  ? 'cloud-outline'
                  : isLastPage
                    ? 'checkmark'
                    : 'arrow-forward'
              }
              color="#FFFFFF"
              size={19}
            />
          </Pressable>
          {isBackupPage ? (
            <Pressable
              accessibilityRole="button"
              onPress={declineBackup}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text
                maxFontSizeMultiplier={1.5}
                numberOfLines={1}
                style={[styles.secondaryButtonText, { color: theme.colors.textSecondary }]}
              >
                Continue without backup
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function OnboardingSlide({
  active,
  fontScale,
  item,
  viewportHeight,
  width,
}: {
  active: boolean;
  fontScale: number;
  item: OnboardingSlideItem;
  viewportHeight: number;
  width: number;
}) {
  const theme = useTheme();
  const isAccessibilityLayout = fontScale >= 1.5;
  const isLandscape = width > viewportHeight && !isAccessibilityLayout;
  const artHeight = useMemo(
    () =>
      isAccessibilityLayout
        ? Math.min(width * 0.28, viewportHeight * 0.28, 220)
        : isLandscape
        ? Math.min(width * 0.38, viewportHeight * 0.62, 300)
        : Math.min(width - spacing.xl * 2, viewportHeight * 0.5, 440),
    [isAccessibilityLayout, isLandscape, viewportHeight, width],
  );

  return (
    <ScrollView
      key={`${item.key}-${isAccessibilityLayout ? 'accessible' : 'standard'}`}
      accessibilityElementsHidden={!active}
      bounces={false}
      contentContainerStyle={[
        styles.slideContent,
        isLandscape && styles.landscapeSlideContent,
      ]}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      showsVerticalScrollIndicator={isAccessibilityLayout}
      style={{ width }}
    >
      <View
        style={[
          styles.artwork,
          isLandscape && styles.landscapeArtwork,
          { height: artHeight },
        ]}
      >
        <Image
          source={item.image}
          resizeMode="contain"
          accessibilityLabel={item.imageLabel}
          style={styles.image}
        />
      </View>
      <View style={[styles.copy, isLandscape && styles.landscapeCopy]}>
        <Text
          maxFontSizeMultiplier={2}
          style={[
            styles.title,
            isLandscape && styles.landscapeTitle,
            { color: theme.colors.text },
          ]}
        >
          {item.title}
        </Text>
        <Text
          maxFontSizeMultiplier={2}
          style={[
            styles.body,
            isLandscape && styles.landscapeBody,
            { color: theme.colors.textSecondary },
          ]}
        >
          {item.body}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
  },
  progress: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  progressSegment: {
    borderRadius: radius.pill,
    flex: 1,
    height: 4,
  },
  skip: {
    justifyContent: 'center',
    minHeight: 44,
    paddingLeft: spacing.sm,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '500',
  },
  pressed: { opacity: 0.62 },
  slideContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
  },
  landscapeSlideContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
    justifyContent: 'center',
  },
  artwork: {
    alignSelf: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    width: '100%',
  },
  landscapeArtwork: {
    flex: 1,
    marginBottom: 0,
    maxWidth: 420,
  },
  image: { height: '100%', width: '100%' },
  copy: {
    marginTop: 'auto',
    maxWidth: 520,
    paddingBottom: spacing.xl,
    width: '100%',
  },
  landscapeCopy: {
    flex: 1,
    marginTop: 0,
    maxWidth: 440,
    paddingBottom: 0,
  },
  title: {
    fontSize: 39,
    fontWeight: '600',
    letterSpacing: -1.5,
  },
  landscapeTitle: {
    fontSize: 31,
    letterSpacing: -1,
  },
  body: {
    fontSize: 17,
    marginTop: spacing.md,
    maxWidth: 480,
  },
  landscapeBody: {
    fontSize: 15,
  },
  footer: {
    paddingHorizontal: spacing.xl,
  },
  primaryButton: {
    alignItems: 'center',
    borderBottomWidth: 4,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  primaryPressed: {
    borderBottomWidth: 2,
    opacity: 0.9,
    transform: [{ translateY: 2 }],
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
