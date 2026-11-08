import { Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';

export default function Commerce() {
  const t = useTheme();
  return (
    <Screen>
      <Text style={[t.typography.h1, { color: t.colors.foreground }]}>Commerce</Text>
      <Text style={{ color: t.colors.mutedFg, marginTop: 6 }}>Orders, catalog, payment links.</Text>
    </Screen>
  );
}
