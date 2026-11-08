import { useLocalSearchParams, router } from 'expo-router';
import { ScannerView, type ScanResult } from '@/native/scanner';
import { View } from 'react-native';

export default function ScannerScreen() {
  const { mode } = useLocalSearchParams<{ mode?: 'qr' | 'barcode' | 'any' }>();
  const handleScan = (r: ScanResult) => {
    // Return result via router params on the previous screen.
    router.back();
    setTimeout(() => {
      router.setParams({ scanned: r.data, scannedType: r.type } as any);
    }, 50);
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScannerView mode={mode ?? 'any'} onScan={handleScan} onClose={() => router.back()} />
    </View>
  );
}
