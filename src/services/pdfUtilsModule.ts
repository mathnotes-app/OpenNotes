import { NativeModules } from 'react-native';

/** The app's own native PDF helpers (ios/OpenNotes and android PDFUtilsModule). */
export type PDFUtilsModuleType = {
  getPageCount?: (filePath: string) => Promise<number>;
  copySecurityScopedFileToTmp?: (sourceUrl: string) => Promise<string>;
  mergePdfFiles?: (fileUris: string[]) => Promise<string>;
  preparePdfForRendering?: (fileUri: string) => Promise<string>;
  readImageForThumbnail?: (fileUri: string) => Promise<string>;
};

export const PDFUtilsModule = NativeModules.PDFUtilsModule as PDFUtilsModuleType | undefined;

export async function resolvePdfRenderUri(uri: string | null | undefined): Promise<string | undefined> {
  if (!uri) return undefined;
  return PDFUtilsModule?.preparePdfForRendering?.(uri) ?? uri;
}
