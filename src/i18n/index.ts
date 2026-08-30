import { en, type Strings } from './locales/en';
import { de } from './locales/de';
import { fr } from './locales/fr';
import { es } from './locales/es';
import { it } from './locales/it';
import { pt } from './locales/pt';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { nl } from './locales/nl';
import { ru } from './locales/ru';
import { zhHans } from './locales/zhHans';
import { zhHant } from './locales/zhHant';

const BY_LANGUAGE: Record<string, Strings> = {
  en,
  de,
  fr,
  es,
  it,
  pt,
  ja,
  ko,
  nl,
  ru,
};

const TRADITIONAL_REGIONS = new Set(['TW', 'HK', 'MO']);

/**
 * Resolves the string catalog once at startup from the device's preferred
 * languages (a locale change on iOS restarts the app, so static resolution
 * is safe). Falls back to English for unsupported languages or if the
 * localization module is unavailable.
 */
interface DeviceLocale {
  languageCode: string | null;
  languageScriptCode?: string | null;
  languageRegionCode?: string | null;
  regionCode: string | null;
}

function resolveStrings(): Strings {
  let locales: DeviceLocale[];
  try {
    // Required lazily inside try: importing expo-localization throws at load
    // time when the native module is absent (older binary, unit tests), and
    // the app must fall back to English rather than crash.
    const { getLocales } = require('expo-localization') as {
      getLocales: () => DeviceLocale[];
    };
    locales = getLocales();
  } catch {
    return en;
  }
  for (const locale of locales) {
    const lang = locale.languageCode;
    if (!lang) continue;
    if (lang === 'zh') {
      // The script code is authoritative when present (iOS always sets it
      // for Chinese); the region is only a fallback, and the LANGUAGE's
      // region at that - regionCode is the device Region setting, which must
      // not override an explicit Hans/Hant choice.
      const traditional = locale.languageScriptCode
        ? locale.languageScriptCode === 'Hant'
        : TRADITIONAL_REGIONS.has(locale.languageRegionCode ?? locale.regionCode ?? '');
      return traditional ? zhHant : zhHans;
    }
    const match = BY_LANGUAGE[lang];
    if (match) return match;
  }
  return en;
}

/** The active string catalog. Import `t` and read `t.section.key`. */
export const t: Strings = resolveStrings();
