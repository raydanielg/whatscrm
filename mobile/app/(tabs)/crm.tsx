import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import { useAppStore } from '@/stores/appStore';
import { pending as pendingOutbox } from '@/offline/outbox';
import {
  listContacts,
  listCompanies,
  listLeads,
  listDeals,
  listTasks,
  completeTask,
  type ContactRow,
  type CompanyRow,
  type LeadRow,
  type DealRow,
  type TaskRow,
} from '@/api/crm';

type Tab = 'contacts' | 'companies' | 'leads' | 'deals' | 'tasks';

export default function CRM() {
  const t = useTheme();
  const { user } = useAuth();
  const online = useAppStore((s) => s.networkOnline);
  const [tab, setTab] = useState<Tab>('contacts');
  const [q, setQ] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  useRealtimeTable('contacts', ['crm', 'contacts']);
  useRealtimeTable('deals', ['crm', 'deals']);
  useRealtimeTable('tasks', ['crm', 'tasks']);

  const contacts = useQuery({
    queryKey: ['crm', 'contacts', q, mineOnly],
    queryFn: () => listContacts(q, mineOnly ? 'me' : null, user?.id),
    enabled: tab === 'contacts',
  });
  const companies = useQuery({ queryKey: ['crm', 'companies', q], queryFn: () => listCompanies(q), enabled: tab === 'companies' });
  const leads = useQuery({ queryKey: ['crm', 'leads', q], queryFn: () => listLeads(q), enabled: tab === 'leads' });
  const deals = useQuery({ queryKey: ['crm', 'deals', q], queryFn: () => listDeals(q), enabled: tab === 'deals' });
  const tasks = useQuery({ queryKey: ['crm', 'tasks'], queryFn: () => listTasks(), enabled: tab === 'tasks' });

  const active = { contacts, companies, leads, deals, tasks }[tab];
  const pendingCount = useMemo(() => pendingOutbox().length, [online]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[t.typography.h1, { color: t.colors.foreground, flex: 1 }]}>CRM</Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.push('/crm/new');
          }}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: t.colors.primary,
          }}
        >
          <Text style={{ color: t.colors.primaryFg, fontWeight: '700' }}>＋ New</Text>
        </Pressable>
      </View>

      {!online || pendingCount > 0 ? (
        <View
          style={{
            marginTop: t.spacing.sm,
            padding: t.spacing.sm,
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.muted,
          }}
        >
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>
            {online ? `${pendingCount} change(s) queued — syncing` : `Offline — ${pendingCount} pending change(s)`}
          </Text>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: t.spacing.md,
          padding: 10,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.muted,
        }}
      >
        <Text style={{ color: t.colors.mutedFg }}>⌕</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={`Search ${tab}`}
          placeholderTextColor={t.colors.mutedFg}
          style={{ flex: 1, color: t.colors.foreground, fontSize: 15 }}
          returnKeyType="search"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['contacts', 'companies', 'leads', 'deals', 'tasks'] as Tab[]).map((tk) => (
            <Chip key={tk} label={tk} active={tab === tk} onPress={() => setTab(tk)} />
          ))}
          {tab === 'contacts' ? (
            <>
              <View style={{ width: 8 }} />
              <Chip label="Mine" active={mineOnly} onPress={() => setMineOnly((v) => !v)} />
            </>
          ) : null}
        </View>
      </ScrollView>

      <FlatList
        style={{ marginTop: t.spacing.sm }}
        data={(active?.data ?? []) as any[]}
        keyExtractor={(i: any) => i.id}
        refreshControl={
          <RefreshControl refreshing={!!active?.isRefetching} onRefresh={() => active?.refetch()} tintColor={t.colors.primary} />
        }
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.colors.border }} />}
        renderItem={({ item }) => {
          if (tab === 'contacts') return <ContactCard item={item as ContactRow} />;
          if (tab === 'companies') return <CompanyCard item={item as CompanyRow} />;
          if (tab === 'leads') return <LeadCard item={item as LeadRow} />;
          if (tab === 'deals') return <DealCard item={item as DealRow} />;
          return <TaskCard item={item as TaskRow} />;
        }}
        ListEmptyComponent={
          !active?.isLoading ? (
            <Text style={{ color: t.colors.mutedFg, textAlign: 'center', marginTop: 40 }}>Nothing to show</Text>
          ) : null
        }
      />
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: active ? t.colors.foreground : t.colors.muted,
      }}
    >
      <Text style={{ color: active ? t.colors.background : t.colors.mutedFg, fontSize: 12, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: t.spacing.md, backgroundColor: t.colors.background }}>
      {children}
    </Pressable>
  );
}

function ContactCard({ item }: { item: ContactRow }) {
  const t = useTheme();
  const name = item.display_name ?? [item.first_name, item.last_name].filter(Boolean).join(' ') ?? item.email ?? '(no name)';
  return (
    <Row onPress={() => router.push({ pathname: '/crm/contact/[id]', params: { id: item.id } })}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Avatar name={name} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.colors.foreground, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }} numberOfLines={1}>
            {[item.company_name, item.email, item.phone].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {item.lifecycle_stage ? (
          <View style={{ backgroundColor: t.colors.muted, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
            <Text style={{ color: t.colors.mutedFg, fontSize: 10, fontWeight: '600' }}>{item.lifecycle_stage}</Text>
          </View>
        ) : null}
      </View>
    </Row>
  );
}

function CompanyCard({ item }: { item: CompanyRow }) {
  const t = useTheme();
  return (
    <Row>
      <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>{item.name}</Text>
      <Text style={{ color: t.colors.mutedFg, fontSize: 12 }} numberOfLines={1}>
        {[item.industry, item.city, item.country].filter(Boolean).join(' · ') || '—'}
      </Text>
    </Row>
  );
}

function LeadCard({ item }: { item: LeadRow }) {
  const t = useTheme();
  return (
    <Row>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>{item.name ?? item.email ?? 'Lead'}</Text>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }} numberOfLines={1}>
            {[item.source, item.status].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {item.score != null ? (
          <View style={{ backgroundColor: t.colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
            <Text style={{ color: t.colors.primaryFg, fontSize: 11, fontWeight: '700' }}>{item.score}</Text>
          </View>
        ) : null}
      </View>
    </Row>
  );
}

function DealCard({ item }: { item: DealRow }) {
  const t = useTheme();
  const amount = item.amount != null ? new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency ?? 'USD' }).format(item.amount) : '—';
  return (
    <Row>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>{item.name}</Text>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>
            {item.expected_close_date ? `Close ${new Date(item.expected_close_date).toLocaleDateString()}` : 'No close date'}
          </Text>
        </View>
        <Text style={{ color: t.colors.foreground, fontWeight: '700' }}>{amount}</Text>
      </View>
    </Row>
  );
}

function TaskCard({ item }: { item: TaskRow }) {
  const t = useTheme();
  const done = item.status === 'completed';
  return (
    <Row>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={() => {
            if (done) return;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            completeTask(item.id);
          }}
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: done ? t.colors.success : t.colors.border,
            backgroundColor: done ? t.colors.success : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {done ? <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text> : null}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: t.colors.foreground,
              fontWeight: '600',
              textDecorationLine: done ? 'line-through' : 'none',
              opacity: done ? 0.6 : 1,
            }}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>
            {item.due_date ? `Due ${new Date(item.due_date).toLocaleDateString()}` : 'No due date'}
            {item.priority ? ` · ${item.priority}` : ''}
          </Text>
        </View>
      </View>
    </Row>
  );
}

function Avatar({ name }: { name: string }) {
  const t = useTheme();
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: t.colors.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: t.colors.foreground, fontWeight: '700' }}>{initials || '?'}</Text>
    </View>
  );
}
