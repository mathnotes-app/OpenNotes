// Records the last fatal JavaScript error on this device so the user can
// choose to share it. App Store crash logs drop the JS error message, so
// without this a release crash can only be seen as "a JS exception".
// Nothing is ever sent automatically.
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  buildCrashReport,
  parseCrashReport,
  type CrashReport,
  type CrashSource,
} from './crashReport';

// Cache, not Documents: Documents is backed up to iCloud and restored, so a
// stale report could resurface on another install.
const REPORT_FILENAME = 'last-error-report.json';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler(): GlobalErrorHandler;
  setGlobalHandler(handler: GlobalErrorHandler): void;
}

let installed = false;

function reportFile(): File {
  return new File(Paths.cache, REPORT_FILENAME);
}

function currentEnvironment() {
  const constants = Platform.constants as { interfaceIdiom?: string } | undefined;
  const version = Constants.expoConfig?.version ?? 'unknown';
  const build = Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber
    : Constants.expoConfig?.android?.versionCode?.toString();
  return {
    appVersion: build ? `${version} (${build})` : version,
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    deviceIdiom: constants?.interfaceIdiom ?? 'unknown',
    now: new Date(),
  };
}

/**
 * Writes the report synchronously: a fatal error terminates the process
 * right after the global handler returns, so an async write would be lost.
 */
export function recordCrash(error: unknown, source: CrashSource): void {
  try {
    const report = buildCrashReport(error, source, currentEnvironment());
    reportFile().write(JSON.stringify(report));
  } catch (writeError) {
    if (__DEV__) console.warn('[crashCapture] could not record error', writeError);
  }
}

/** Wraps React Native's global JS error handler; keeps its fatal behavior. */
export function installCrashCapture(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !errorUtils) return;
  installed = true;
  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) recordCrash(error, 'global');
    previousHandler(error, isFatal);
  });
}

/** Returns the report from a previous run once, then removes it. */
export function takePendingCrashReport(): CrashReport | null {
  const file = reportFile();
  if (!file.exists) return null;
  let report: CrashReport | null = null;
  try {
    report = parseCrashReport(file.textSync());
  } catch (readError) {
    if (__DEV__) console.warn('[crashCapture] could not read error report', readError);
  }
  try {
    file.delete();
  } catch (deleteError) {
    if (__DEV__) console.warn('[crashCapture] could not remove error report', deleteError);
  }
  return report;
}
