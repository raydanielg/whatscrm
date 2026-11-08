import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export function KpiTile({
  label,
  value,
  hint,
  tone = 'default',
  onPress,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
  onPress?: () => void;
}) {
  const t = useTheme();
  const toneColor =
    tone === 'success'
      ? t.colors.success
      : tone === 'warning'
      ? t.colors.warning
      : tone === 'destructive'
      ? t.colors.destructive
      : t.colors.foreground;
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 150,
        padding: t.spacing.md,
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.card,
        borderWidth: 1,
        borderColor: t.colors.border,
        gap: 4,
      }}
    >
      <Text style={{ ...t.typography.caption, color: t.colors.mutedFg, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 26, fontWeight: '700', color: toneColor, letterSpacing: -0.5 }}>{value}</Text>
      {hint ? <Text style={{ ...t.typography.small, color: t.colors.mutedFg }}>{hint}</Text> : null}
    </Wrap>
  );
}

export function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        padding: t.spacing.md,
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.card,
        borderWidth: 1,
        borderColor: t.colors.border,
        gap: t.spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...t.typography.h3, color: t.colors.foreground }}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function ListRow({ title, subtitle, right, onPress }: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void }) {
  const t = useTheme();
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress}
      style={{
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={{ ...t.typography.small, color: t.colors.mutedFg }}>{subtitle}</Text> : null}
      </View>
      {right}
    </Wrap>
  );
}

export function StatusPill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'success' | 'warning' | 'destructive' | 'muted' }) {
  const t = useTheme();
  const bg =
    tone === 'success'
      ? t.colors.success
      : tone === 'warning'
      ? t.colors.warning
      : tone === 'destructive'
      ? t.colors.destructive
      : tone === 'muted'
      ? t.colors.muted
      : t.colors.primary;
  const fg = tone === 'muted' ? t.colors.mutedFg : '#fff';
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: t.radius.full, backgroundColor: bg }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
