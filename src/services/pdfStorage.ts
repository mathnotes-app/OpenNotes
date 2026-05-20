import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules, Platform } from 'react-native';
import type { NotebookPage, SerializedNotebookData } from '@mathnotes/mobile-ink';

const PDFS_SUBDIR = 'pdfs/';
const FAST_READ_CHUNK_SIZE = 128 * 1024;
const LARGE_READ_CHUNK_SIZE = 1024 * 1024;
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;
const JS_FALLBACK_SIZE_LIMIT = 100 * 1024 * 1024;
const NATIVE_PAGE_COUNT_TIMEOUT_MS = 15000;

type PDFUtilsModuleType = {
  getPageCount?: (filePath: string) => Promise<number>;
  copySecurityScopedFileToTmp?: (sourceUrl: string) => Promise<string>;
};

const PDFUtilsModule = NativeModules.PDFUtilsModule as PDFUtilsModuleType | undefined;

function pdfsDir(): string {
  return `${FileSystem.documentDirectory ?? ''}${PDFS_SUBDIR}`;
}

function pdfPath(noteId: string): string {
  return `${pdfsDir()}${encodeURIComponent(noteId)}.pdf`;
}

async function ensureDir(): Promise<void> {
  const dir = pdfsDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export interface PickedPdfResult {
  uri: string;
  name: string;
  pageCount: number;
}

export async function importPdf(noteId: string): Promise<PickedPdfResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) return null;

  return importPdfFromUri(noteId, asset.uri, asset.name ?? 'document.pdf');
}

export async function importPdfFromUri(
  noteId: string,
  sourceUri: string,
  name = 'document.pdf',
): Promise<PickedPdfResult | null> {
  try {
    await ensureDir();
    const readableUri = await makeReadableFileUri(sourceUri);
    const sourcePageCount = await extractPdfPageCount(readableUri);
    const dest = pdfPath(noteId);
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: readableUri, to: dest });
    const destPageCount = await extractPdfPageCount(dest);
    const pageCount = Math.max(1, sourcePageCount, destPageCount);
    return { uri: dest, name, pageCount };
  } catch (error) {
    if (__DEV__) console.warn('[pdfStorage] importPdf failed', error);
    return null;
  }
}

export async function deletePdfForNote(noteId: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(pdfPath(noteId), { idempotent: true });
  } catch (error) {
    if (__DEV__) console.log('[pdfStorage] delete failed', noteId, error);
  }
}

export function pdfUriForNote(noteId: string): string {
  return pdfPath(noteId);
}

export function createPdfNotebookData(pageCount: number): SerializedNotebookData {
  const safePageCount = Math.max(1, Math.floor(pageCount) || 1);
  const pages: NotebookPage[] = Array.from({ length: safePageCount }, (_, index) => {
    const pageNumber = index + 1;
    return {
      id: `page-${pageNumber}`,
      title: `Page ${pageNumber}`,
      data: '',
      rotation: 0,
      pdfPageNumber: pageNumber,
      pageType: 'pdf',
    };
  });
  return { version: '1.0', pages };
}

async function makeReadableFileUri(sourceUri: string): Promise<string> {
  const copyToTmp = PDFUtilsModule?.copySecurityScopedFileToTmp;
  if (copyToTmp && shouldUseNativeReadableCopy(sourceUri)) {
    try {
      const readable = await copyToTmp(sourceUri);
      if (readable) return readable;
    } catch (error) {
      if (__DEV__) console.warn('[pdfStorage] security-scoped copy failed', error);
    }
  }
  return sourceUri;
}

function shouldUseNativeReadableCopy(sourceUri: string): boolean {
  if (sourceUri.startsWith('file://')) return true;
  if (Platform.OS === 'android') {
    return sourceUri.startsWith('content://') || sourceUri.startsWith('/');
  }
  return false;
}

async function extractPdfPageCount(fileUri: string): Promise<number> {
  if (PDFUtilsModule?.getPageCount) {
    try {
      const pageCount = await withTimeout(
        PDFUtilsModule.getPageCount(fileUri),
        NATIVE_PAGE_COUNT_TIMEOUT_MS,
        'PDFUtilsModule.getPageCount',
      );
      if (typeof pageCount === 'number' && pageCount > 0) return Math.floor(pageCount);
    } catch (error) {
      if (__DEV__) console.warn('[pdfStorage] native page count failed', error);
    }
  }

  return extractPdfPageCountFallback(fileUri);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function extractPdfPageCountFallback(fileUri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return 1;
    const fileSize = 'size' in info ? info.size ?? 0 : 0;
    if (fileSize > JS_FALLBACK_SIZE_LIMIT) return 1;

    const chunkSize = fileSize > LARGE_FILE_THRESHOLD ? LARGE_READ_CHUNK_SIZE : FAST_READ_CHUNK_SIZE;
    const readSize = Math.min(chunkSize, fileSize);
    const headerBase64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: readSize,
      position: 0,
    });
    const headerCount = extractPageCountFromString(decodeBase64ToString(headerBase64));
    if (headerCount > 0) return headerCount;

    if (fileSize > chunkSize * 2) {
      const tailBase64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
        length: chunkSize,
        position: Math.max(0, fileSize - chunkSize),
      });
      const tailCount = extractPageCountFromString(decodeBase64ToString(tailBase64));
      if (tailCount > 0) return tailCount;
    }
  } catch (error) {
    if (__DEV__) console.warn('[pdfStorage] fallback page count failed', error);
  }
  return 1;
}

function decodeBase64ToString(base64: string): string {
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i += 1) {
      lookup[chars.charCodeAt(i)] = i;
    }

    const cleanBase64 = base64.replace(/[\s=]/g, '');
    const len = cleanBase64.length;
    const bytes = new Uint8Array(Math.floor((len * 3) / 4));
    let p = 0;

    for (let i = 0; i < len; i += 4) {
      const a = lookup[cleanBase64.charCodeAt(i)] || 0;
      const b = lookup[cleanBase64.charCodeAt(i + 1)] || 0;
      const c = lookup[cleanBase64.charCodeAt(i + 2)] || 0;
      const d = lookup[cleanBase64.charCodeAt(i + 3)] || 0;
      bytes[p] = (a << 2) | (b >> 4);
      p += 1;
      if (i + 2 < len) {
        bytes[p] = ((b & 15) << 4) | (c >> 2);
        p += 1;
      }
      if (i + 3 < len) {
        bytes[p] = ((c & 3) << 6) | d;
        p += 1;
      }
    }

    const chunkSize = 8192;
    let result = '';
    for (let i = 0; i < p; i += chunkSize) {
      const chunk = bytes.slice(i, Math.min(i + chunkSize, p));
      result += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return result;
  } catch {
    return '';
  }
}

function extractPageCountFromString(pdfContent: string): number {
  const patterns = [
    /\/Linearized\s+\d+[^>]*\/N\s+(\d+)/,
    /\/N\s+(\d+)[^>]*\/Linearized\s+\d+/,
    /\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/,
    /\/Count\s+(\d+)[^>]*\/Type\s*\/Pages/,
    /\/Count\s+(\d+)\s*\/Kids/,
    /\/Pages[\s\S]{0,200}\/Count\s+(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = pdfContent.match(pattern);
    const count = match?.[1] ? parseInt(match[1], 10) : 0;
    if (count > 0) return count;
  }

  const counts: number[] = [];
  const countPattern = /\/Count\s+(\d{1,4})\b/g;
  let match: RegExpExecArray | null;
  while ((match = countPattern.exec(pdfContent)) !== null) {
    const count = parseInt(match[1], 10);
    if (count > 0 && count < 10000) counts.push(count);
  }
  if (counts.length > 0) return Math.max(...counts);

  const pageMatches = pdfContent.match(/\/Type\s*\/Page\b(?!s)/g);
  return pageMatches?.length ?? 0;
}
