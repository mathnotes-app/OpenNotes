import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { imageId as makeImageId } from '../utils/id';

const IMAGES_SUBDIR = 'images/';

function noteImagesDir(noteId: string): string {
  return `${FileSystem.documentDirectory ?? ''}${IMAGES_SUBDIR}${encodeURIComponent(noteId)}/`;
}

async function ensureDir(noteId: string): Promise<void> {
  const dir = noteImagesDir(noteId);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

function inferExtension(uri: string, mimeType?: string | null): string {
  const fromUri = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1]?.toLowerCase();
  if (fromUri) return fromUri;
  if (mimeType?.includes('png')) return 'png';
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) return 'jpg';
  if (mimeType?.includes('gif')) return 'gif';
  if (mimeType?.includes('heic')) return 'heic';
  return 'jpg';
}

export interface PickedImageResult {
  id: string;
  uri: string;
  width: number;
  height: number;
}

async function copyAssetToNote(
  noteId: string,
  asset: ImagePicker.ImagePickerAsset,
): Promise<PickedImageResult | null> {
  try {
    await ensureDir(noteId);
    const id = makeImageId();
    const ext = inferExtension(asset.uri, asset.mimeType);
    const dest = `${noteImagesDir(noteId)}${id}.${ext}`;
    await FileSystem.copyAsync({ from: asset.uri, to: dest });
    return {
      id,
      uri: dest,
      width: asset.width ?? 800,
      height: asset.height ?? 600,
    };
  } catch (error) {
    if (__DEV__) console.warn('[imageInsertStorage] copy failed', error);
    return null;
  }
}

export async function pickFromLibrary(noteId: string): Promise<PickedImageResult | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  return copyAssetToNote(noteId, asset);
}

export async function pickFromCamera(noteId: string): Promise<PickedImageResult | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  return copyAssetToNote(noteId, asset);
}

export async function deleteImagesForNote(noteId: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(noteImagesDir(noteId), { idempotent: true });
  } catch (error) {
    if (__DEV__) console.log('[imageInsertStorage] delete failed', noteId, error);
  }
}
