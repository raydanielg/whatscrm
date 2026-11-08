/**
 * Voice note recorder using expo-av. Produces an m4a/aac file that Supabase
 * Storage accepts. Server-side WhatsApp/etc. providers will transcode as
 * needed; the transcription pipeline handles Opus vs MP3 conversion on the
 * backend (see ai-speech-to-text guidance).
 */
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/api/supabase';

let currentRecording: Audio.Recording | null = null;

export async function startRecording() {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Microphone permission denied');
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });
  const rec = new Audio.Recording();
  await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await rec.startAsync();
  currentRecording = rec;
}

export async function stopRecording(): Promise<{ uri: string; durationMs: number } | null> {
  if (!currentRecording) return null;
  const rec = currentRecording;
  currentRecording = null;
  await rec.stopAndUnloadAsync();
  const status = await rec.getStatusAsync();
  const uri = rec.getURI();
  if (!uri) return null;
  return { uri, durationMs: status.durationMillis ?? 0 };
}

export async function cancelRecording() {
  if (!currentRecording) return;
  await currentRecording.stopAndUnloadAsync().catch(() => {});
  currentRecording = null;
}

export async function uploadVoiceNote(uri: string, conversationId: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('Recording file missing');
  const bytes = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const path = `voice/${conversationId}/${Date.now()}.m4a`;
  const { error } = await supabase.storage.from('message-attachments').upload(path, decode(bytes), {
    contentType: 'audio/mp4',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('message-attachments').getPublicUrl(path);
  return { url: data.publicUrl, path, size_bytes: info.size ?? 0 };
}

// Minimal base64→Uint8Array (avoids adding a dependency).
function decode(b64: string): Uint8Array {
  const bin = globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
