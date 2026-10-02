import type { SerializedNotebookData } from '@mathnotes/mobile-ink';

/** Folder under the documents directory that holds inserted images. */
export const IMAGES_SUBDIR = 'images/';

// Stored file URIs embed the app's data-container path. iOS can move that
// container on app updates, and an iCloud restore always lands in a new one,
// so an absolute URI saved earlier points at a file that no longer exists.
// The documents root is Documents/ on iOS and files/ on Android.
const APP_IMAGE_PATH = new RegExp(`^file://.*/(?:Documents|files)/(${IMAGES_SUBDIR}.*)$`);

/** Re-roots an inserted-image URI under the current documents directory. */
export function rebaseAppDocumentUri(uri: string, documentDirectory: string): string {
  if (!documentDirectory || uri.startsWith(documentDirectory)) return uri;
  const match = APP_IMAGE_PATH.exec(uri);
  // Never re-root a path that could climb out of the images folder.
  if (!match || match[1].split('/').includes('..')) return uri;
  return documentDirectory + match[1];
}

function rebaseOptional(uri: string | undefined, documentDirectory: string): string | undefined {
  return uri ? rebaseAppDocumentUri(uri, documentDirectory) : uri;
}

/** Returns the same object when no inserted-image URI needed re-rooting. */
export function withCurrentImagePaths(
  data: SerializedNotebookData,
  documentDirectory: string,
): SerializedNotebookData {
  let changed = false;
  const pages = data.pages.map((page) => {
    if (!page.insertedElements?.length) return page;
    let pageChanged = false;
    const insertedElements = page.insertedElements.map((element) => {
      const sourceUri = rebaseOptional(element.sourceUri, documentDirectory);
      const renderedImageUri = rebaseOptional(element.renderedImageUri, documentDirectory);
      if (sourceUri === element.sourceUri && renderedImageUri === element.renderedImageUri) {
        return element;
      }
      pageChanged = true;
      return { ...element, sourceUri, renderedImageUri };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, insertedElements };
  });
  return changed ? { ...data, pages } : data;
}
