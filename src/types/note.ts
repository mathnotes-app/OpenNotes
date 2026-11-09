export type BackgroundType =
  | 'plain'
  | 'grid'
  | 'lined'
  | 'dotted'
  | 'graph'
  | 'pdf';

export type LineSpacing = 'standard' | 'narrow' | 'compact' | `custom-${number}`;

export const BACKGROUND_TYPES: BackgroundType[] = [
  'plain',
  'lined',
  'grid',
  'dotted',
  'graph',
  'pdf',
];

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
  lineSpacing?: LineSpacing;
  pdfUri: string | null;
  thumbnailUri: string | null;
  thumbnailVersion?: number;
  customCoverUri?: string | null;
}
