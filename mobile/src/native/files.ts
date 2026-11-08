import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

export type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
};

export async function pickFiles(opts?: { multiple?: boolean; type?: string | string[] }): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({
    multiple: opts?.multiple ?? false,
    type: opts?.type ?? '*/*',
    copyToCacheDirectory: true,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size ?? undefined, mimeType: a.mimeType ?? undefined }));
}

export async function shareFile(uri: string, opts?: { mimeType?: string; dialogTitle?: string }) {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: opts?.mimeType, dialogTitle: opts?.dialogTitle });
}

export async function shareText(text: string, dialogTitle = 'Share') {
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('No cache directory');
  const uri = `${dir}share-${Date.now()}.txt`;
  await FileSystem.writeAsStringAsync(uri, text);
  await shareFile(uri, { mimeType: 'text/plain', dialogTitle });
}
