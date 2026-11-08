import { useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, Alert, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import { queryClient } from '@/api/queryClient';
import { listAppointments, cancelAppointment, type Appointment } from '@/api/sales';

type Range = 'upcoming' | 'today' | 'week' | 'past';

function rangeToDates(range: Range) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'today') return { from: start.toISOString(), to: new Date(+start + 864e5).toISOString() };
  if (range === 'week') return { from: start.toISOString(), to: new Date(+start + 7 * 864e5).toISOString() };
  if (range === 'past') return { from: new Date(+start - 30 * 864e5).toISOString(), to: now.toISOString() };
  return { from: now.toISOString(), to: new Date(+now + 60 * 864e5).toISOString() };
}

export default function AppointmentsScreen() {
  const t = useTheme();
  const [range, setRange] = useState<Range>('upcoming');
  useRealtimeTable('booking_appointments', ['sales', 'appts-list', range]);
  const q = useQuery({
    queryKey: ['sales', 'appts-list', range],
    queryFn: () => listAppointments(rangeToDates(range)),
  });

  const openMeeting = (a: Appointment) => {
    if (!a.join_url) return;
    Haptics.selectionAsync();
    Linking.openURL(a.join_url).catch(() => Alert.alert('Cannot open meeting link'));
  };

  const cancel = (a: Appointment) => {
    Alert.alert('Cancel appointment', `Cancel meeting with ${a.customer_name}?`, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Cancel meeting',
        style: 'destructive',
        onPress: async () => {
          await cancelAppointment(a.id);
          queryClient.invalidateQueries({ queryKey: ['sales'] });
        },
      },
    ]);
  };

  return (
    <Screen style={{ padding: 0 }}>
      <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
        {(['today', 'upcoming', 'week', 'past'] as Range[]).map((r) => {
          const active = r === range;
          return (
            <Pressable
              key={r}
              onPress={() => setRange(r)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? t.colors.primary : t.colors.card,
                borderWidth: 1,
                borderColor: active ? t.colors.primary : t.colors.border,
              }}
            >
              <Text style={{ color: active ? '#fff' : t.colors.foreground, fontWeight: '600', textTransform: 'capitalize' }}>{r}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList<Appointment>
        data={q.data ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sales', 'appts-list'] })} />}
        ListEmptyComponent={<Text style={{ color: t.colors.mutedFg, textAlign: 'center', marginTop: 40 }}>Nothing scheduled.</Text>}
        renderItem={({ item }) => {
          const start = new Date(item.start_at);
          const end = new Date(item.end_at);
          return (
            <View style={{ backgroundColor: t.colors.card, borderColor: t.colors.border, borderWidth: 1, borderRadius: t.radius.md, padding: 12 }}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ color: t.colors.foreground, fontWeight: '700', flex: 1 }} numberOfLines={1}>{item.customer_name}</Text>
                <Text style={{ color: t.colors.mutedFg, fontSize: 12, textTransform: 'capitalize' }}>{item.status}</Text>
              </View>
              <Text style={{ color: t.colors.foreground, marginTop: 4 }}>
                {start.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {item.customer_email ? <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 2 }}>{item.customer_email}</Text> : null}
              <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
                {item.join_url ? (
                  <Pressable onPress={() => openMeeting(item)} style={{ backgroundColor: t.colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: t.radius.sm }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Join</Text>
                  </Pressable>
                ) : null}
                {item.status !== 'cancelled' && item.status !== 'completed' ? (
                  <Pressable onPress={() => cancel(item)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: t.radius.sm, borderWidth: 1, borderColor: t.colors.border }}>
                    <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>Cancel</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}
