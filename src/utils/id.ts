const rand = () => Math.random().toString(36).slice(2, 11);

export function noteId(): string {
  return `note-${Date.now()}-${rand()}`;
}

export function folderId(): string {
  return `folder-${Date.now()}-${rand()}`;
}

export function textBoxId(): string {
  return `tb-${Date.now()}-${rand()}`;
}

export function insertedElementId(): string {
  return `ie-${Date.now()}-${rand()}`;
}

export function imageId(): string {
  return `img-${Date.now()}-${rand()}`;
}
