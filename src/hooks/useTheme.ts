import { useColorScheme } from 'react-native';
import { useMemo } from 'react';
import { darkColors, lightColors } from '../theme/colors';
import type { ColorPalette } from '../theme/colors';
import { usePreferences } from './Preferences';

export interface Theme {
  colors: ColorPalette;
  isDark: boolean;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const { appearance } = usePreferences();
  return useMemo<Theme>(() => {
    const isDark = appearance === 'system' ? scheme === 'dark' : appearance === 'dark';
    return { colors: isDark ? darkColors : lightColors, isDark };
  }, [scheme, appearance]);
}
