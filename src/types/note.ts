export type BackgroundType =
  | 'plain'
  | 'grid'
  | 'lined'
  | 'dotted'
  | 'graph'
  | 'pdf';

export const BACKGROUND_TYPES: BackgroundType[] = [
  'plain',
  'lined',
  'grid',
  'dotted',
  'graph',
  'pdf',
];

export const BACKGROUND_LABELS: Record<BackgroundType, string> = {
  plain: 'Plain',
  lined: 'Lined',
  grid: 'Grid',
  dotted: 'Dotted',
  graph: 'Graph',
  pdf: 'PDF',
};

export interface FolderMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteMetadata {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  backgroundType: BackgroundType;
  pdfUri: string | null;
  thumbnailUri: string | null;
}
