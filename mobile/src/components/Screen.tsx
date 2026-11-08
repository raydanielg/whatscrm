import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, type ViewProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export function Screen({ children, style, ...rest }: ViewProps) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['top', 'left', 'right']}>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      <View style={[{ flex: 1, padding: t.spacing.lg }, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}
