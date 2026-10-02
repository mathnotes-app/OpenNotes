import { NativeModules } from 'react-native';

/** The app's own native PDF helpers (ios/OpenNotes and android PDFUtilsModule). */
export type PDFUtilsModuleType = {
  getPageCount?: (filePath: string) => Promise<number>;
  copySecurityScopedFileToTmp?: (sourceUrl: string) => Promise<string>;
  mergePdfFiles?: (fileUris: string[]) => Promise<string>;
};

export const PDFUtilsModule = NativeModules.PDFUtilsModule as PDFUtilsModuleType | undefined;
