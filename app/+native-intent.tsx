// "Open In" launches the app with the PDF's file:// (or Android content://)
// URL. That is not a screen route: map it to the library before routing so
// expo-router never shows its "Unmatched Route" page. RootLayout's Open-In
// handler still receives the original URL through expo-linking and imports
// the PDF.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const lower = path.toLowerCase();
  return lower.startsWith('file:') || lower.startsWith('content:') ? '/' : path;
}
