import { t } from '../i18n';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  const diff = now - then;

  if (diff < 30 * SECOND) return t.time.justNow;
  if (diff < HOUR) {
    return t.time.minutesAgo(Math.max(1, Math.floor(diff / MINUTE)));
  }
  if (diff < DAY) {
    return t.time.hoursAgo(Math.floor(diff / HOUR));
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY);
    return d === 1 ? t.time.yesterday : t.time.daysAgo(d);
  }

  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}
