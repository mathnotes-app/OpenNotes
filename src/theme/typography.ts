import { Platform, TextStyle } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
}) as string;

const fontFamilySemibold = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default: 'System',
}) as string;

export const typography: Record<
  | 'largeTitle'
  | 'title'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption',
  TextStyle
> = {
  largeTitle: {
    fontFamily: fontFamilySemibold,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.36,
  },
  title: {
    fontFamily: fontFamilySemibold,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0.34,
  },
  headline: {
    fontFamily: fontFamilySemibold,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.41,
  },
  body: {
    fontFamily,
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.41,
  },
  callout: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: -0.32,
  },
  subhead: {
    fontFamily,
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.24,
  },
  footnote: {
    fontFamily,
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: -0.08,
  },
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: '400',
    letterSpacing: 0,
  },
};
