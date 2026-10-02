import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert, Pressable, Share, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { CrashReportBanner } from '../src/components/CrashReportBanner';
import * as Linking from 'expo-linking';
import { darkColors, lightColors } from '../src/theme/colors';
import { radius, spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
import { useTheme } from '../src/hooks/useTheme';
import { createPdfNoteFromUri } from '../src/services/pdfImportService';
import {
  installCrashCapture,
  recordCrash,
  takePendingCrashReport,
} from '../src/services/crashCapture';
import { formatCrashReport, type CrashReport } from '../src/services/crashReport';
import { t } from '../src/i18n';

installCrashCapture();
// Read once per launch; reading also removes the stored report.
const reportFromPreviousRun = takePendingCrashReport();

const handledPdfUrls = new Set<string>();

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  useOpenInPdfImport();
  const [pendingReport, setPendingReport] = useState<CrashReport | null>(reportFromPreviousRun);
  const dismissReport = useCallback(() => setPendingReport(null), []);
  const shareReport = useCallback(() => {
    if (pendingReport) shareCrashReport(pendingReport);
    setPendingReport(null);
  }, [pendingReport]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'default',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="folder/[id]" />
            <Stack.Screen
              name="note/[id]"
              options={{
                animation: 'none',
                gestureEnabled: false,
              }}
            />
          </Stack>
          {pendingReport ? (
            <CrashReportBanner onShare={shareReport} onDismiss={dismissReport} />
          ) : null}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function shareCrashReport(report: CrashReport) {
  Share.share({ message: formatCrashReport(report) }).catch((error: unknown) => {
    if (__DEV__) console.warn('[RootLayout] sharing error report failed', error);
  });
}

/** Render errors anywhere in the app land here instead of closing it. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  useEffect(() => {
    recordCrash(error, 'render');
  }, [error]);
  const tryAgain = () => {
    // Recovered in place: the app did not close, so don't offer the report
    // again on next launch. "Share error details" remains available here.
    takePendingCrashReport();
    void retry();
  };
  const shareDetails = () => {
    const report = takePendingCrashReport();
    if (report) shareCrashReport(report);
  };
  return (
    <View style={[styles.errorScreen, { backgroundColor: theme.colors.background }]}>
      <Text style={[typography.title, styles.centered, { color: theme.colors.text }]}>
        {t.crash.screenTitle}
      </Text>
      <Text style={[typography.callout, styles.errorBody, { color: theme.colors.textSecondary }]}>
        {t.crash.screenBody}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={tryAgain}
        style={[styles.errorButton, { backgroundColor: theme.colors.accent }]}
      >
        <Text style={[typography.headline, styles.errorButtonLabel]}>{t.editor.tryAgain}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={shareDetails} style={styles.errorLink}>
        <Text style={[typography.subhead, { color: theme.colors.accent }]}>{t.crash.shareDetails}</Text>
      </Pressable>
    </View>
  );
}

function useOpenInPdfImport() {
  const router = useRouter();
  const importingRef = useRef(false);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url || !looksLikePdfUrl(url) || handledPdfUrls.has(url) || importingRef.current) {
        return;
      }
      handledPdfUrls.add(url);
      importingRef.current = true;
      try {
        const note = await createPdfNoteFromUri(url);
        if (note) router.replace(`/note/${note.id}`);
      } catch (error) {
        if (__DEV__) console.warn('[RootLayout] open-in PDF import failed', error);
        Alert.alert('Could not import PDF', 'Please try importing it from the library.');
      } finally {
        importingRef.current = false;
      }
    };

    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', (event) => {
      void handleUrl(event.url);
    });
    return () => subscription.remove();
  }, [router]);
}

function looksLikePdfUrl(url: string): boolean {
  const withoutFragment = url.split('#')[0];
  const withoutQuery = withoutFragment.split('?')[0];
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    decoded = withoutQuery;
  }
  const lower = decoded.toLowerCase();
  if (lower.startsWith('content://')) return true;
  return (
    lower.startsWith('file://') &&
    (lower.endsWith('.pdf') || lower.includes('.pdf/'))
  );
}

const styles = StyleSheet.create({
  errorScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  centered: { textAlign: 'center' },
  errorBody: { marginTop: spacing.xs, maxWidth: 320, textAlign: 'center' },
  errorButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.md,
    minWidth: 220,
    alignItems: 'center',
  },
  errorButtonLabel: { color: '#FFFFFF' },
  errorLink: { marginTop: spacing.xl, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
