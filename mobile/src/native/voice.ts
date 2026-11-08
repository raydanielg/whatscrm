import { Audio } from 'expo-av';

export type Recording = {
  stop: () => Promise<{ uri: string; durationMs: number; mimeType: string }>;
  cancel: () => Promise<void>;
};

export async function startRecording(): Promise<Recording> {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Microphone permission denied');
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const rec = new Audio.Recording();
  await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await rec.startAsync();
  const startedAt = Date.now();
  return {
    stop: async () => {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) throw new Error('Recording had no URI');
      const durationMs = Date.now() - startedAt;
      const mime = uri.endsWith('.m4a') ? 'audio/m4a' : uri.endsWith('.mp4') ? 'audio/mp4' : 'audio/mpeg';
      return { uri, durationMs, mimeType: mime };
    },
    cancel: async () => {
      try {
        await rec.stopAndUnloadAsync();
      } catch {}
    },
  };
}

export async function playAudio(uri: string) {
  const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
  sound.setOnPlaybackStatusUpdate((s) => {
    if ('didJustFinish' in s && s.didJustFinish) sound.unloadAsync().catch(() => {});
  });
  return sound;
}
