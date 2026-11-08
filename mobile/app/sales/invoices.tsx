import { useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import { queryClient } from '@/api/queryClient';
import { listInvoices, formatCurrency, type Invoice } from '@/api/sales';

const FILTERS: (string | undefined)[] = [undefined, 'draft', 'sent', 'partial', 'paid', 'overdue', 'void'];

export default function InvoicesScreen() {
  const t = useTheme();
  const [filter, setFilter] = useState<string | undefined>(undefined);
  useRealtimeTable('invoices', ['sales', 'invoices-list', filter ?? 'all']);
  const q = useQuery({ queryKey: ['sales', 'invoices-list', filter ?? 'all'], queryFn: () => listInvoices({ status: filter }) });

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

      <FlatList<Invoice>
        data={q.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sales', 'invoices-list'] })} />}
        ListEmptyComponent={<Text style={{ color: t.colors.mutedFg, textAlign: 'center', marginTop: 40 }}>No invoices.</Text>}
        renderItem={({ item }) => {
          const overdue = item.due_date && new Date(item.due_date) < new Date() && item.status !== 'paid' && item.status !== 'void';
          return (
            <View style={{ backgroundColor: t.colors.card, borderColor: overdue ? '#ef4444' : t.colors.border, borderWidth: 1, borderRadius: t.radius.md, padding: 12 }}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ color: t.colors.foreground, fontWeight: '700', flex: 1 }}>#{item.invoice_number}</Text>
                <StatusPill status={overdue ? 'overdue' : item.status} />
              </View>
              <View style={{ flexDirection: 'row', marginTop: 6 }}>
                <Text style={{ color: t.colors.foreground, flex: 1 }}>{formatCurrency(item.total, item.currency)}</Text>
                <Text style={{ color: item.amount_due > 0 ? '#c0392b' : t.colors.mutedFg, fontSize: 12 }}>
                  {item.amount_due > 0 ? `${formatCurrency(item.amount_due, item.currency)} due` : 'Paid'}
                </Text>
              </View>
              <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 4 }}>
                Issued {new Date(item.issue_date).toLocaleDateString()}
                {item.due_date ? ` · Due ${new Date(item.due_date).toLocaleDateString()}` : ''}
              </Text>
            </View>
          );
        }}
      />
    </Screen>
  );
}

function StatusPill({ status }: { status: string }) {
  const t = useTheme();
  const map: Record<string, string> = { draft: t.colors.mutedFg, sent: t.colors.primary, viewed: '#8b5cf6', partial: '#f59e0b', paid: '#22c55e', overdue: '#ef4444', void: t.colors.mutedFg };
  const color = map[status] ?? t.colors.mutedFg;
  return (
    <View style={{ backgroundColor: color + '22', borderColor: color, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
      <Text style={{ color, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{status}</Text>
    </View>
  );
}
