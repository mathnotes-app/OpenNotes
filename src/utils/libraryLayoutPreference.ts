export type LibraryLayout = 'grid' | 'columns';
export const LAYOUT_VERSION = 1;

export function resolveLibraryLayout(value: { libraryLayout?: unknown; libraryLayoutVersion?: unknown }): {
  layout: LibraryLayout;
  migrate: boolean;
} {
  if (value.libraryLayoutVersion !== LAYOUT_VERSION) return { layout: 'columns', migrate: true };
  return { layout: value.libraryLayout === 'grid' ? 'grid' : 'columns', migrate: false };
}
