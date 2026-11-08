import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import { queryClient } from '@/api/queryClient';
import {
  getDeal,
  listStages,
  listQuotes,
  listInvoices,
  listAppointments,
  updateDeal,
  moveDealToStage,
  createFollowUpTask,
  formatCurrency,
} from '@/api/sales';
import { listTasks, listNotes, addNote, completeTask } from '@/api/crm';

export default function DealDetail() {
  const t = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const dealId = String(id);
  const [noteBody, setNoteBody] = useState('');

  useRealtimeTable('deals', ['sales', 'deal', dealId], `id=eq.${dealId}`);
  useRealtimeTable('tasks', ['crm', 'tasks', dealId], `deal_id=eq.${dealId}`);
  useRealtimeTable('notes', ['crm', 'notes', dealId], `deal_id=eq.${dealId}`);
  useRealtimeTable('quotes', ['sales', 'quotes', dealId], `deal_id=eq.${dealId}`);
  useRealtimeTable('invoices', ['sales', 'invoices', dealId], `deal_id=eq.${dealId}`);

  const deal = useQuery({ queryKey: ['sales', 'deal', dealId], queryFn: () => getDeal(dealId) });
  const stages = useQuery({
    queryKey: ['sales', 'stages', deal.data?.pipeline_id],
    queryFn: () => (deal.data?.pipeline_id ? listStages(deal.data.pipeline_id) : Promise.resolve([])),
    enabled: !!deal.data?.pipeline_id,
  });
  const tasks = useQuery({ queryKey: ['crm', 'tasks', dealId], queryFn: () => listTasks({ dealId }) });
  const notes = useQuery({ queryKey: ['crm', 'notes', dealId], queryFn: () => listNotes({ dealId }) });
  const quotes = useQuery({ queryKey: ['sales', 'quotes', dealId], queryFn: () => listQuotes({ dealId }) });
  const invoices = useQuery({ queryKey: ['sales', 'invoices', dealId], queryFn: () => listInvoices({ dealId }) });
  const appts = useQuery({
    queryKey: ['sales', 'appts', dealId],
    queryFn: () => listAppointments({ from: new Date(Date.now() - 30 * 864e5).toISOString(), to: new Date(Date.now() + 60 * 864e5).toISOString() }),
  });

  if (deal.isLoading) {
    return <Screen><ActivityIndicator color={t.colors.primary} /></Screen>;
  }
  if (!deal.data) {
    return <Screen><Text style={{ color: t.colors.foreground }}>Deal not found.</Text></Screen>;
  }

  const d = deal.data;
  const currentStage = (stages.data ?? []).find((s) => s.id === d.stage_id);

  const changeStage = async (stageId: string) => {
    Haptics.selectionAsync();
    queryClient.setQueryData(['sales', 'deal', dealId], { ...d, stage_id: stageId });
    await moveDealToStage(dealId, stageId);
    queryClient.invalidateQueries({ queryKey: ['sales'] });
  };

  const addFollowUp = async (days: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const due = new Date(Date.now() + days * 864e5).toISOString();
    await createFollowUpTask({
      title: `Follow up on ${d.name}`,
      due_date: due,
      deal_id: dealId,
      contact_id: d.contact_id,
      assignee_id: user?.id ?? null,
      priority: 'normal',
    });
    queryClient.invalidateQueries({ queryKey: ['crm', 'tasks', dealId] });
    Alert.alert('Follow-up scheduled', `Reminder set for ${new Date(due).toLocaleDateString()}`);
  };

  const saveNote = async () => {
    const body = noteBody.trim();
    if (!body) return;
    setNoteBody('');
    await addNote({ body, deal_id: dealId, contact_id: d.contact_id, author_id: user?.id ?? null });
    queryClient.invalidateQueries({ queryKey: ['crm', 'notes', dealId] });
  };

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {/* Header */}
        <View>
          <Text style={[t.typography.h1, { color: t.colors.foreground }]}>{d.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 }}>
            <Text style={{ color: t.colors.primary, fontSize: 18, fontWeight: '700' }}>{formatCurrency(d.amount, d.currency)}</Text>
            {currentStage ? (
              <Text style={{ color: t.colors.mutedFg }}>{currentStage.name} · {Number(currentStage.probability)}%</Text>
            ) : null}
          </View>
          {d.expected_close_date ? (
            <Text style={{ color: t.colors.mutedFg, marginTop: 4 }}>Expected close {new Date(d.expected_close_date).toLocaleDateString()}</Text>
          ) : null}
        </View>

        {/* Stage selector */}
        <Section title="Stage">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(stages.data ?? []).map((s) => {
              const active = s.id === d.stage_id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => changeStage(s.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? t.colors.primary : t.colors.card,
                    borderWidth: 1,
                    borderColor: active ? t.colors.primary : t.colors.border,
                  }}
                >
                  <Text style={{ color: active ? '#fff' : t.colors.foreground, fontWeight: '600' }}>{s.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Section>

        {/* Follow-ups */}
        <Section title="Follow-up">
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[1, 3, 7, 14].map((d2) => (
              <Pressable
                key={d2}
                onPress={() => addFollowUp(d2)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: t.radius.sm, backgroundColor: t.colors.card, borderWidth: 1, borderColor: t.colors.border }}
              >
                <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>+{d2}d</Text>
              </Pressable>
            ))}
          </View>
        </Section>

        {/* Tasks */}
        <Section title={`Tasks (${(tasks.data ?? []).length})`}>
          {(tasks.data ?? []).length === 0 ? (
            <Text style={{ color: t.colors.mutedFg }}>No tasks yet.</Text>
          ) : (
            (tasks.data ?? []).map((task) => (
              <Pressable
                key={task.id}
                onPress={async () => {
                  if (task.status !== 'completed') {
                    await completeTask(task.id);
                    queryClient.invalidateQueries({ queryKey: ['crm', 'tasks', dealId] });
                  }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
              >
                <Text style={{ marginRight: 8, color: task.status === 'completed' ? t.colors.primary : t.colors.mutedFg }}>
                  {task.status === 'completed' ? '☑' : '☐'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.colors.foreground, textDecorationLine: task.status === 'completed' ? 'line-through' : 'none' }}>{task.title}</Text>
                  {task.due_date ? <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>Due {new Date(task.due_date).toLocaleString()}</Text> : null}
                </View>
              </Pressable>
            ))
          )}
        </Section>

        {/* Quotes */}
        <Section title={`Quotes (${(quotes.data ?? []).length})`} action={{ label: 'View all', onPress: () => router.push('/sales/quotes') }}>
          {(quotes.data ?? []).slice(0, 3).map((q) => (
            <RowLine key={q.id} left={`#${q.quote_number} · ${q.title}`} right={formatCurrency(q.total, q.currency)} sub={q.status} />
          ))}
          {(quotes.data ?? []).length === 0 && <Text style={{ color: t.colors.mutedFg }}>No quotes.</Text>}
        </Section>

        {/* Invoices */}
        <Section title={`Invoices (${(invoices.data ?? []).length})`} action={{ label: 'View all', onPress: () => router.push('/sales/invoices') }}>
          {(invoices.data ?? []).slice(0, 3).map((i) => (
            <RowLine
              key={i.id}
              left={`#${i.invoice_number}`}
              right={formatCurrency(i.total, i.currency)}
              sub={`${i.status} · due ${i.amount_due} ${i.currency}`}
            />
          ))}
          {(invoices.data ?? []).length === 0 && <Text style={{ color: t.colors.mutedFg }}>No invoices.</Text>}
        </Section>

        {/* Meetings */}
        <Section title="Meetings">
          {(appts.data ?? []).filter((a) => a.contact_id === d.contact_id).slice(0, 3).map((a) => (
            <RowLine
              key={a.id}
              left={a.customer_name}
              right={new Date(a.start_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              sub={a.join_url ? `${a.status} · Join link ready` : a.status}
            />
          ))}
          {(appts.data ?? []).filter((a) => a.contact_id === d.contact_id).length === 0 && (
            <Text style={{ color: t.colors.mutedFg }}>No meetings.</Text>
          )}
        </Section>

        {/* Notes */}
        <Section title={`Notes (${(notes.data ?? []).length})`}>
          <TextInput
            placeholder="Add an internal note"
            placeholderTextColor={t.colors.mutedFg}
            value={noteBody}
            onChangeText={setNoteBody}
            multiline
            style={{
              minHeight: 60,
              borderColor: t.colors.border,
              borderWidth: 1,
              borderRadius: t.radius.sm,
              padding: 10,
              color: t.colors.foreground,
              backgroundColor: t.colors.card,
            }}
          />
          <Pressable
            onPress={saveNote}
            style={{ alignSelf: 'flex-end', marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: t.radius.sm, backgroundColor: t.colors.primary }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Save note</Text>
          </Pressable>
          {(notes.data ?? []).map((n) => (
            <View key={n.id} style={{ borderTopWidth: 1, borderColor: t.colors.border, paddingVertical: 8, marginTop: 8 }}>
              <Text style={{ color: t.colors.foreground }}>{n.body}</Text>
              <Text style={{ color: t.colors.mutedFg, fontSize: 11, marginTop: 2 }}>{new Date(n.created_at).toLocaleString()}</Text>
            </View>
          ))}
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.colors.card, borderColor: t.colors.border, borderWidth: 1, borderRadius: t.radius.md, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ color: t.colors.foreground, fontWeight: '700', flex: 1 }}>{title}</Text>
        {action ? <Pressable onPress={action.onPress}><Text style={{ color: t.colors.primary, fontWeight: '600' }}>{action.label}</Text></Pressable> : null}
      </View>
      {children}
    </View>
  );
}

function RowLine({ left, right, sub }: { left: string; right?: string; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={{ color: t.colors.foreground, flex: 1, fontWeight: '600' }} numberOfLines={1}>{left}</Text>
        {right ? <Text style={{ color: t.colors.foreground }}>{right}</Text> : null}
      </View>
      {sub ? <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}
