import * as ImagePicker from 'expo-image-picker';

export type CapturedAsset = {
  uri: string;
  type: 'image' | 'video';
  mimeType?: string;
  width?: number;
  height?: number;
  fileName?: string;
};

async function ensureCamera() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') throw new Error('Camera permission denied');
}

async function ensureLibrary() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') throw new Error('Photo library permission denied');
}

export async function takePhoto(opts?: { allowsEditing?: boolean; quality?: number }): Promise<CapturedAsset | null> {
  await ensureCamera();
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: opts?.allowsEditing ?? false,
    quality: opts?.quality ?? 0.85,
    exif: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, type: 'image', mimeType: a.mimeType, width: a.width, height: a.height, fileName: a.fileName ?? undefined };
}

export async function recordVideo(opts?: { maxDurationSec?: number }): Promise<CapturedAsset | null> {
  await ensureCamera();
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    videoMaxDuration: opts?.maxDurationSec ?? 60,
    quality: 0.8,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, type: 'video', mimeType: a.mimeType, width: a.width, height: a.height, fileName: a.fileName ?? undefined };
}

export async function pickFromGallery(opts?: { multiple?: boolean; type?: 'image' | 'video' | 'all' }): Promise<CapturedAsset[]> {
  await ensureLibrary();
  const mediaTypes =
    opts?.type === 'video'
      ? ImagePicker.MediaTypeOptions.Videos
      : opts?.type === 'all'
        ? ImagePicker.MediaTypeOptions.All
        : ImagePicker.MediaTypeOptions.Images;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    allowsMultipleSelection: opts?.multiple ?? false,
    quality: 0.85,
    selectionLimit: opts?.multiple ? 10 : 1,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    uri: a.uri,
    type: (a.type === 'video' ? 'video' : 'image') as 'image' | 'video',
    mimeType: a.mimeType,
    width: a.width,
    height: a.height,
    fileName: a.fileName ?? undefined,
  }));
}

/**
 * Lightweight "document scanner" — captures a photo optimized for documents.
 * For production-grade scanning with edge detection, add `react-native-document-scanner-plugin`
 * via a dev-client build; this call remains the fallback path.
 */
export async function scanDocument(): Promise<CapturedAsset | null> {
  await ensureCamera();
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 1,
    exif: false,
    aspect: [3, 4],
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, type: 'image', mimeType: a.mimeType ?? 'image/jpeg', width: a.width, height: a.height, fileName: a.fileName ?? 'document.jpg' };
}
