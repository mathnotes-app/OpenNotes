import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert, useColorScheme, View } from 'react-native';
import * as Linking from 'expo-linking';
import { darkColors, lightColors } from '../src/theme/colors';
import { createPdfNoteFromUri } from '../src/services/pdfImportService';

const handledPdfUrls = new Set<string>();

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  useOpenInPdfImport();
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
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
