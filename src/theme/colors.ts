export interface ColorPalette {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  divider: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentMuted: string;
  destructive: string;
  toolbarBackground: string;
  toolbarBorder: string;
  toolbarShadow: string;
  overlayScrim: string;
  cardBackground: string;
  cardShadow: string;
  selection: string;
}

export const lightColors: ColorPalette = {
  background: '#F7F7F8',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F2F2F4',
  divider: 'rgba(60, 60, 67, 0.12)',
  text: '#111113',
  textSecondary: 'rgba(60, 60, 67, 0.6)',
  textTertiary: 'rgba(60, 60, 67, 0.38)',
  accent: '#0A84FF',
  accentMuted: 'rgba(10, 132, 255, 0.12)',
  destructive: '#FF3B30',
  toolbarBackground: 'rgba(255, 255, 255, 0.92)',
  toolbarBorder: 'rgba(60, 60, 67, 0.18)',
  toolbarShadow: 'rgba(0, 0, 0, 0.18)',
  overlayScrim: 'rgba(0, 0, 0, 0.32)',
  cardBackground: '#FFFFFF',
  cardShadow: 'rgba(0, 0, 0, 0.08)',
  selection: 'rgba(10, 132, 255, 0.18)',
};

export const darkColors: ColorPalette = {
  background: '#0B0B0D',
  surface: '#161618',
  surfaceElevated: '#1C1C1E',
  surfaceMuted: '#232326',
  divider: 'rgba(235, 235, 245, 0.16)',
  text: '#F5F5F7',
  textSecondary: 'rgba(235, 235, 245, 0.6)',
  textTertiary: 'rgba(235, 235, 245, 0.38)',
  accent: '#0A84FF',
  accentMuted: 'rgba(10, 132, 255, 0.22)',
  destructive: '#FF453A',
  toolbarBackground: 'rgba(28, 28, 30, 0.92)',
  toolbarBorder: 'rgba(235, 235, 245, 0.18)',
  toolbarShadow: 'rgba(0, 0, 0, 0.6)',
  overlayScrim: 'rgba(0, 0, 0, 0.5)',
  cardBackground: '#1C1C1E',
  cardShadow: 'rgba(0, 0, 0, 0.4)',
  selection: 'rgba(10, 132, 255, 0.28)',
};

export const STROKE_COLORS: readonly string[] = [
  '#111113',
  '#FFFFFF',
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#0A84FF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#8E8E93',
  '#A2845E',
];

export const HIGHLIGHTER_COLORS: readonly string[] = [
  '#FFE066',
  '#FFB3B3',
  '#B3E5FC',
  '#C8E6C9',
  '#E1BEE7',
  '#FFCCBC',
];
