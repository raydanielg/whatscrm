import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import { listAppointments, type Appointment } from '@/api/sales';

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export default function CalendarScreen() {
  const t = useTheme();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<Date>(new Date());

  const monthStart = startOfMonth(cursor);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);

  useRealtimeTable('booking_appointments', ['sales', 'appts-cal', cursor.toISOString().slice(0, 7)]);
  const q = useQuery({
    queryKey: ['sales', 'appts-cal', cursor.toISOString().slice(0, 7)],
    queryFn: () => listAppointments({ from: monthStart.toISOString(), to: monthEnd.toISOString() }),
  });

  const byDay = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const a of q.data ?? []) {
      const d = new Date(a.start_at);
      const key = d.toISOString().slice(0, 10);
      (m[key] ||= []).push(a);
    }
    return m;
  }, [q.data]);

  const totalDays = daysInMonth(cursor);
  const firstWeekday = monthStart.getDay();
  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];

  const selKey = selected.toISOString().slice(0, 10);
  const selApts = byDay[selKey] ?? [];

  return (
    <Screen style={{ padding: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
          }}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: t.colors.foreground, fontSize: 20 }}>‹</Text>
        </Pressable>
        <Text style={[t.typography.h2, { color: t.colors.foreground, flex: 1, textAlign: 'center' }]}>
          {cursor.toLocaleString([], { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
          }}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: t.colors.foreground, fontSize: 20 }}>›</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: t.colors.mutedFg, fontSize: 11, fontWeight: '600' }}>{d}</Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 8 }}>
        {cells.map((d, idx) => {
          if (!d) return <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const key = d.toISOString().slice(0, 10);
          const count = (byDay[key] ?? []).length;
          const isSel = key === selKey;
          const isToday = key === new Date().toISOString().slice(0, 10);
          return (
            <Pressable
              key={idx}
              onPress={() => {
                Haptics.selectionAsync();
                setSelected(d);
              }}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: 8,
                  backgroundColor: isSel ? t.colors.primary : isToday ? t.colors.card : 'transparent',
                  borderColor: isToday && !isSel ? t.colors.primary : 'transparent',
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: isSel ? '#fff' : t.colors.foreground, fontWeight: isToday ? '700' : '500' }}>{d.getDate()}</Text>
                {count > 0 ? (
                  <View style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: isSel ? '#fff' : t.colors.primary }} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
        <Text style={{ color: t.colors.foreground, fontWeight: '700', marginBottom: 8 }}>
          {selected.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 8, paddingBottom: 40 }}>
        {q.isLoading ? <ActivityIndicator color={t.colors.primary} /> : null}
        {selApts.length === 0 && !q.isLoading ? <Text style={{ color: t.colors.mutedFg }}>Nothing scheduled.</Text> : null}
        {selApts.map((a) => (
          <View key={a.id} style={{ backgroundColor: t.colors.card, borderColor: t.colors.border, borderWidth: 1, borderRadius: t.radius.md, padding: 12 }}>
            <Text style={{ color: t.colors.foreground, fontWeight: '700' }}>{a.customer_name}</Text>
            <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 2 }}>
              {new Date(a.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(a.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {a.status}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
