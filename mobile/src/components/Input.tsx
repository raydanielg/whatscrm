import { TextInput, View, Text, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export function Input({
  label,
  error,
  ...rest
}: TextInputProps & { label?: string; error?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ color: t.colors.mutedFg, fontSize: 13, fontWeight: '500' }}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={t.colors.mutedFg}
        style={{
          height: t.controlHeight,
          borderWidth: 1,
          borderColor: error ? t.colors.destructive : t.colors.border,
          borderRadius: t.radius.md,
          paddingHorizontal: t.spacing.md,
          color: t.colors.foreground,
          backgroundColor: t.colors.card,
          fontSize: 15,
        }}
        {...rest}
      />
      {error ? <Text style={{ color: t.colors.destructive, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}
