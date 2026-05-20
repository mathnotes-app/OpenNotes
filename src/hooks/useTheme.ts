import { useColorScheme } from 'react-native';
import { useMemo } from 'react';
import { darkColors, lightColors } from '../theme/colors';
import type { ColorPalette } from '../theme/colors';

export interface Theme {
  colors: ColorPalette;
  isDark: boolean;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return useMemo<Theme>(() => {
    const isDark = scheme === 'dark';
    return { colors: isDark ? darkColors : lightColors, isDark };
  }, [scheme]);
}
