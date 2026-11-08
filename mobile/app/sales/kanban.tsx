import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import { queryClient } from '@/api/queryClient';
import { listPipelines, listStages, listDealsByPipeline, moveDealToStage, formatCurrency, type Deal, type Stage } from '@/api/sales';

export default function KanbanScreen() {
  const t = useTheme();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<{ deal: Deal } | null>(null);

  const pipelines = useQuery({ queryKey: ['sales', 'pipelines'], queryFn: listPipelines });
  const activePipeline = pipelineId ?? pipelines.data?.find((p) => p.is_default)?.id ?? pipelines.data?.[0]?.id ?? null;

  const stages = useQuery({
    queryKey: ['sales', 'stages', activePipeline],
    queryFn: () => (activePipeline ? listStages(activePipeline) : Promise.resolve([] as Stage[])),
    enabled: !!activePipeline,
  });
  const deals = useQuery({
    queryKey: ['sales', 'deals', activePipeline],
    queryFn: () => (activePipeline ? listDealsByPipeline(activePipeline) : Promise.resolve([] as Deal[])),
    enabled: !!activePipeline,
  });

  useRealtimeTable('deals', ['sales', 'deals', activePipeline], activePipeline ? `pipeline_id=eq.${activePipeline}` : undefined);
  useRealtimeTable('deal_stages', ['sales', 'stages', activePipeline]);

  const byStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const d of deals.data ?? []) {
      if (!d.stage_id) continue;
      (map[d.stage_id] ||= []).push(d);
    }
    return map;
  }, [deals.data]);

  const move = async (deal: Deal, stageId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMoveMode(null);
    // Optimistic
    queryClient.setQueryData<Deal[]>(['sales', 'deals', activePipeline], (prev) =>
      (prev ?? []).map((d) => (d.id === deal.id ? { ...d, stage_id: stageId } : d)),
    );
    try {
      await moveDealToStage(deal.id, stageId);
    } finally {
      queryClient.invalidateQueries({ queryKey: ['sales', 'deals', activePipeline] });
    }
  };

  return (
    <Screen style={{ padding: 0 }}>
      {/* Pipeline chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {(pipelines.data ?? []).map((p) => {
          const active = p.id === activePipeline;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPipelineId(p.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? t.colors.primary : t.colors.card,
                borderWidth: 1,
                borderColor: active ? t.colors.primary : t.colors.border,
              }}
            >
              <Text style={{ color: active ? '#fff' : t.colors.foreground, fontWeight: '600' }}>{p.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {stages.isLoading || deals.isLoading ? (
        <ActivityIndicator color={t.colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          horizontal
          pagingEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={deals.isFetching} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sales'] })} />}
        >
          {(stages.data ?? []).map((s) => {
            const items = byStage[s.id] ?? [];
            const total = items.reduce((sum, d) => sum + Number(d.amount ?? 0), 0);
            return (
              <View
                key={s.id}
                style={{
                  width: 300,
                  marginHorizontal: 6,
                  backgroundColor: t.colors.card,
                  borderRadius: t.radius.md,
                  borderColor: t.colors.border,
                  borderWidth: 1,
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color ?? (s.is_won ? '#22c55e' : s.is_lost ? '#ef4444' : t.colors.primary), marginRight: 8 }} />
                  <Text style={{ color: t.colors.foreground, fontWeight: '700', flex: 1 }}>{s.name}</Text>
                  <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>{items.length}</Text>
                </View>
                <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginBottom: 8 }}>{formatCurrency(total, items[0]?.currency ?? 'USD')}</Text>

                <FlatList
                  data={items}
                  keyExtractor={(d) => d.id}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  ListEmptyComponent={<Text style={{ color: t.colors.mutedFg, fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>No deals</Text>}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => router.push(`/sales/deal/${item.id}`)}
                      onLongPress={() => {
                        Haptics.selectionAsync();
                        setMoveMode({ deal: item });
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: t.colors.background,
                        borderColor: moveMode?.deal.id === item.id ? t.colors.primary : t.colors.border,
                        borderWidth: 1,
                        borderRadius: t.radius.sm,
                        padding: 10,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ color: t.colors.foreground, fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', marginTop: 4 }}>
                        <Text style={{ color: t.colors.foreground, fontSize: 12, flex: 1 }}>{formatCurrency(item.amount, item.currency)}</Text>
                        {item.probability != null ? <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>{Number(item.probability)}%</Text> : null}
                      </View>
                      {item.expected_close_date ? (
                        <Text style={{ color: t.colors.mutedFg, fontSize: 11, marginTop: 2 }}>Close {new Date(item.expected_close_date).toLocaleDateString()}</Text>
                      ) : null}
                    </Pressable>
                  )}
                />
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Move sheet */}
      {moveMode ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.colors.card, borderTopWidth: 1, borderColor: t.colors.border, padding: 16 }}>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>Move deal</Text>
          <Text style={{ color: t.colors.foreground, fontWeight: '700', marginBottom: 8 }} numberOfLines={1}>{moveMode.deal.name}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(stages.data ?? []).map((s) => (
              <Pressable
                key={s.id}
                onPress={() => move(moveMode.deal, s.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: t.colors.background,
                  borderWidth: 1,
                  borderColor: moveMode.deal.stage_id === s.id ? t.colors.primary : t.colors.border,
                }}
              >
                <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>{s.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => setMoveMode(null)} style={{ marginTop: 12, alignSelf: 'center' }}>
            <Text style={{ color: t.colors.mutedFg }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}
