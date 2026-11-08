import { useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import { queryClient } from '@/api/queryClient';
import { listQuotes, formatCurrency, type Quote } from '@/api/sales';

const FILTERS: (string | undefined)[] = [undefined, 'draft', 'sent', 'accepted', 'rejected'];

export default function QuotesScreen() {
  const t = useTheme();
  const [filter, setFilter] = useState<string | undefined>(undefined);
  useRealtimeTable('quotes', ['sales', 'quotes-list', filter ?? 'all']);
  const q = useQuery({ queryKey: ['sales', 'quotes-list', filter ?? 'all'], queryFn: () => listQuotes({ status: filter }) });

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable
              key={f ?? 'all'}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? t.colors.primary : t.colors.card,
                borderWidth: 1,
                borderColor: active ? t.colors.primary : t.colors.border,
              }}
            >
              <Text style={{ color: active ? '#fff' : t.colors.foreground, fontWeight: '600', textTransform: 'capitalize' }}>{f ?? 'All'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList<Quote>
        data={q.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sales', 'quotes-list'] })} />}
        ListEmptyComponent={<Text style={{ color: t.colors.mutedFg, textAlign: 'center', marginTop: 40 }}>No quotes.</Text>}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: t.colors.card, borderColor: t.colors.border, borderWidth: 1, borderRadius: t.radius.md, padding: 12 }}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ color: t.colors.foreground, fontWeight: '700', flex: 1 }} numberOfLines={1}>#{item.quote_number} · {item.title}</Text>
              <StatusPill status={item.status} />
            </View>
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <Text style={{ color: t.colors.foreground, flex: 1 }}>{formatCurrency(item.total, item.currency)}</Text>
              {item.valid_until ? <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>Valid until {new Date(item.valid_until).toLocaleDateString()}</Text> : null}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

function StatusPill({ status }: { status: string }) {
  const t = useTheme();
  const map: Record<string, string> = { draft: t.colors.mutedFg, sent: t.colors.primary, viewed: '#8b5cf6', accepted: '#22c55e', rejected: '#ef4444', expired: '#f59e0b' };
  const color = map[status] ?? t.colors.mutedFg;
  return (
    <View style={{ backgroundColor: color + '22', borderColor: color, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
      <Text style={{ color, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{status}</Text>
    </View>
  );
}
