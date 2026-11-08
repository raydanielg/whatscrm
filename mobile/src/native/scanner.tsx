import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';

export type ScanResult = { type: string; data: string };

type Props = {
  mode?: 'qr' | 'barcode' | 'any';
  onScan: (r: ScanResult) => void;
  onClose?: () => void;
};

const QR_TYPES = ['qr'];
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code39', 'code93', 'code128', 'itf14', 'pdf417', 'aztec', 'datamatrix'];

export function ScannerView({ mode = 'any', onScan, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission?.granted, requestPermission]);

  const types = mode === 'qr' ? QR_TYPES : mode === 'barcode' ? BARCODE_TYPES : [...QR_TYPES, ...BARCODE_TYPES];

  const handle = (r: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onScan({ type: r.type, data: r.data });
  };

  if (!permission) return <ActivityIndicator style={styles.center} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>Camera permission is required to scan codes.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handle}
        barcodeScannerSettings={{ barcodeTypes: types as any }}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.frame} />
        <Text style={styles.hint}>{mode === 'qr' ? 'Point at a QR code' : 'Align a code inside the frame'}</Text>
        {onClose && (
          <TouchableOpacity style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        )}
        {scanned && (
          <TouchableOpacity style={styles.rescan} onPress={() => setScanned(false)}>
            <Text style={styles.btnText}>Scan again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#000' },
  msg: { color: '#fff', marginBottom: 16, textAlign: 'center' },
  btn: { backgroundColor: '#075E54', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 260, height: 260, borderColor: '#fff', borderWidth: 2, borderRadius: 16, backgroundColor: 'transparent' },
  hint: { color: '#fff', marginTop: 16, fontSize: 14, opacity: 0.9 },
  close: { position: 'absolute', top: 60, right: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  closeText: { color: '#fff', fontWeight: '600' },
  rescan: { position: 'absolute', bottom: 80, backgroundColor: '#075E54', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
});
