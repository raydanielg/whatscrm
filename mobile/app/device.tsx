import { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import * as NativeCap from '@/native';
import { startRecording, playAudio, type Recording } from '@/native/voice';
import { palette, radius, spacing } from '@/theme/tokens';

export default function DeviceScreen() {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [recorder, setRecorder] = useState<Recording | null>(null);
  const [lastVoice, setLastVoice] = useState<string | null>(null);
  const [locText, setLocText] = useState<string | null>(null);
  const [contactsCount, setContactsCount] = useState<number | null>(null);
  const [scan, setScan] = useState<string | null>(null);

  const wrap = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Device capabilities' }} />
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Section title="Media">
          <Row label="Take photo" onPress={() => wrap(async () => {
            const a = await NativeCap.Camera.takePhoto();
            if (a) setPhotoUri(a.uri);
          })} />
          <Row label="Pick from gallery" onPress={() => wrap(async () => {
            const [a] = await NativeCap.Camera.pickFromGallery({ multiple: false });
            if (a) setPhotoUri(a.uri);
          })} />
          <Row label="Scan document" onPress={() => wrap(async () => {
            const a = await NativeCap.Camera.scanDocument();
            if (a) setPhotoUri(a.uri);
          })} />
          {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}
        </Section>

        <Section title="Files & share">
          <Row label="Pick file" onPress={() => wrap(async () => {
            const files = await NativeCap.Files.pickFiles({ multiple: false });
            if (files[0]) Alert.alert('Picked', `${files[0].name} (${files[0].size ?? '?'} bytes)`);
          })} />
          <Row label="Share text" onPress={() => wrap(() => NativeCap.Files.shareText('Hello from WACRM', 'Share note'))} />
        </Section>

        <Section title="Scanners">
          <Row label="QR scanner" onPress={() => router.push({ pathname: '/scanner', params: { mode: 'qr' } })} />
          <Row label="Barcode scanner" onPress={() => router.push({ pathname: '/scanner', params: { mode: 'barcode' } })} />
          {scan && <Text style={styles.value}>Last scan: {scan}</Text>}
        </Section>

        <Section title="Voice">
          {!recorder ? (
            <Row label="Start recording" onPress={() => wrap(async () => setRecorder(await startRecording()))} />
          ) : (
            <Row label="Stop recording" onPress={() => wrap(async () => {
              const r = await recorder.stop();
              setLastVoice(r.uri);
              setRecorder(null);
            })} />
          )}
          {lastVoice && <Row label="Play last recording" onPress={() => wrap(() => playAudio(lastVoice))} />}
        </Section>

        <Section title="Location">
          <Row label="Get current location" onPress={() => wrap(async () => {
            const c = await NativeCap.Location.getCurrentLocation({ highAccuracy: true });
            const place = await NativeCap.Location.reverseGeocode(c).catch(() => null);
            setLocText(`${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}${place?.city ? ` — ${place.city}` : ''}`);
          })} />
          {locText && <Text style={styles.value}>{locText}</Text>}
        </Section>

        <Section title="Contacts">
          <Row label="Load contacts" onPress={() => wrap(async () => {
            const list = await NativeCap.Contacts.listContacts({ limit: 500 });
            setContactsCount(list.length);
          })} />
          {contactsCount !== null && <Text style={styles.value}>{contactsCount} contacts loaded</Text>}
        </Section>

        <Section title="Sync">
          <Row label="Register background sync" onPress={() => wrap(async () => {
            const ok = await NativeCap.Background.registerBackgroundSync();
            Alert.alert('Background sync', ok ? 'Registered' : 'Denied or restricted');
          })} />
          <Row label="Copy shareable deep link" onPress={() => wrap(async () => {
            const link = NativeCap.Links.createShareableLink('/device');
            await NativeCap.Files.shareText(link, 'Share link');
          })} />
        </Section>
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row} activeOpacity={0.7}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.chev}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  section: { backgroundColor: palette.card, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: palette.mutedFg, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  rowLabel: { fontSize: 15, color: palette.foreground, fontWeight: '500' },
  chev: { fontSize: 22, color: palette.mutedFg },
  preview: { width: '100%', height: 200, borderRadius: radius.sm, marginTop: 8, backgroundColor: palette.muted },
  value: { fontSize: 13, color: palette.mutedFg, marginTop: 4 },
});
