import type { InkToolType } from '@mathnotes/mobile-ink';
import { t } from '../i18n';

export type SupportedTool = Exclude<InkToolType, 'snip' | 'mark'>;

export interface ToolDescriptor {
  type: SupportedTool;
  label: string;
  iconFamily: 'ion' | 'material' | 'feather' | 'mci';
  iconName: string;
  defaultWidth: number;
  defaultColor: string;
  supportsColor: boolean;
  supportsWidth: boolean;
}

export const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    type: 'pen',
    label: t.tools.pen,
    iconFamily: 'mci',
    iconName: 'pen',
    defaultWidth: 3,
    defaultColor: '#111113',
    supportsColor: true,
    supportsWidth: true,
  },
  {
    type: 'highlighter',
    label: t.tools.highlighter,
    iconFamily: 'mci',
    iconName: 'marker',
    defaultWidth: 14,
    defaultColor: '#FFE066',
    supportsColor: true,
    supportsWidth: true,
  },
  {
    type: 'crayon',
    label: t.tools.crayon,
    iconFamily: 'mci',
    iconName: 'grease-pencil',
    defaultWidth: 6,
    defaultColor: '#FF9500',
    supportsColor: true,
    supportsWidth: true,
  },
  {
    type: 'calligraphy',
    label: t.tools.calligraphy,
    iconFamily: 'mci',
    iconName: 'fountain-pen-tip',
    defaultWidth: 4,
    defaultColor: '#111113',
    supportsColor: true,
    supportsWidth: true,
  },
  {
    type: 'eraser',
    label: t.tools.eraser,
    iconFamily: 'mci',
    iconName: 'eraser',
    defaultWidth: 18,
    defaultColor: '#000000',
    supportsColor: false,
    supportsWidth: true,
  },
  {
    type: 'select',
    label: t.tools.lasso,
    iconFamily: 'mci',
    iconName: 'lasso',
    defaultWidth: 0,
    defaultColor: '#000000',
    supportsColor: false,
    supportsWidth: false,
  },
  {
    type: 'text',
    label: t.tools.text,
    iconFamily: 'mci',
    iconName: 'format-text',
    defaultWidth: 0,
    defaultColor: '#111113',
    supportsColor: true,
    supportsWidth: false,
  },
  {
    type: 'insert',
    label: t.tools.image,
    iconFamily: 'ion',
    iconName: 'image-outline',
    defaultWidth: 0,
    defaultColor: '#000000',
    supportsColor: false,
    supportsWidth: false,
  },
];

export const TOOL_BY_TYPE: Record<SupportedTool, ToolDescriptor> = TOOL_DESCRIPTORS.reduce(
  (acc, tool) => {
    acc[tool.type] = tool;
    return acc;
  },
  {} as Record<SupportedTool, ToolDescriptor>,
);

export const DEFAULT_TOOL: SupportedTool = 'pen';

export const WIDTH_RANGE: Record<SupportedTool, [number, number]> = {
  pen: [1, 18],
  highlighter: [10, 56],
  crayon: [4, 32],
  calligraphy: [2, 22],
  eraser: [12, 96],
  select: [0, 0],
  text: [0, 0],
  insert: [0, 0],
};

export const TEXT_FONT_SIZES = [12, 14, 16, 18, 22, 28, 36] as const;
