import { Pressable, Text, ActivityIndicator, type PressableProps, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  ...rest
}: PressableProps & { title: string; variant?: Variant; loading?: boolean }) {
  const t = useTheme();
  const bg =
    variant === 'primary'
      ? t.colors.primary
      : variant === 'destructive'
      ? t.colors.destructive
      : variant === 'secondary'
      ? t.colors.muted
      : 'transparent';
  const fg =
    variant === 'primary' || variant === 'destructive'
      ? t.colors.primaryFg
      : t.colors.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        height: t.controlHeight,
        borderRadius: t.radius.md,
        backgroundColor: bg,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: t.spacing.lg,
        borderWidth: variant === 'ghost' ? 1 : 0,
        borderColor: t.colors.border,
      })}
      {...rest}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {loading ? <ActivityIndicator color={fg} /> : null}
        <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      </View>
    </Pressable>
  );
}
