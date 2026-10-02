// Pure crash-report shaping, kept free of React Native imports so it can be
// unit tested in Node. The capture and storage glue lives in crashCapture.ts.

export type CrashSource = 'global' | 'render';

export interface CrashEnvironment {
  appVersion: string;
  platform: string;
  osVersion: string;
  deviceIdiom: string;
  now: Date;
}

export interface CrashReport extends Omit<CrashEnvironment, 'now'> {
  message: string;
  stack: string | null;
  source: CrashSource;
  occurredAt: string;
}

const MAX_STACK_LENGTH = 4000;
// Bounds what an error message can carry into a user-shared report.
const MAX_MESSAGE_LENGTH = 1000;

export function buildCrashReport(
  error: unknown,
  source: CrashSource,
  env: CrashEnvironment,
): CrashReport {
  const isError = error instanceof Error;
  const name = isError ? error.name : typeof error;
  const message = isError ? error.message : String(error);
  const stack = isError && typeof error.stack === 'string'
    ? error.stack.slice(0, MAX_STACK_LENGTH)
    : null;
  const { now, ...device } = env;
  return {
    ...device,
    message: `${name}: ${message}`.slice(0, MAX_MESSAGE_LENGTH),
    stack,
    source,
    occurredAt: now.toISOString(),
  };
}

export function parseCrashReport(raw: string): CrashReport | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const text = (key: string) => (typeof v[key] === 'string' ? (v[key] as string) : null);
  const message = text('message');
  if (!message) return null;
  return {
    message,
    stack: text('stack'),
    source: v.source === 'render' ? 'render' : 'global',
    occurredAt: text('occurredAt') ?? '',
    appVersion: text('appVersion') ?? 'unknown',
    platform: text('platform') ?? 'unknown',
    osVersion: text('osVersion') ?? 'unknown',
    deviceIdiom: text('deviceIdiom') ?? 'unknown',
  };
}

export function formatCrashReport(report: CrashReport): string {
  return [
    'OpenNotes error report',
    `App: ${report.appVersion}`,
    `System: ${report.platform} ${report.osVersion} (${report.deviceIdiom})`,
    `When: ${report.occurredAt}`,
    `Where: ${report.source === 'render' ? 'screen rendering' : 'app code'}`,
    '',
    report.message,
    report.stack ? `\n${report.stack}` : '',
  ].join('\n').trimEnd();
}
