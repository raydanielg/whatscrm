import { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  TextInput,
  ScrollView,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import { useAppStore } from '@/stores/appStore';
import {
  fetchConversations,
  updateAssignment,
  updateStatus,
  type ConversationRow,
  type InboxFilter,
} from '@/api/inbox';

const CHANNELS = ['all', 'whatsapp', 'email', 'instagram', 'messenger', 'sms', 'livechat', 'telegram'] as const;
const STATUSES = ['open', 'pending', 'resolved', 'snoozed'] as const;

export default function Inbox() {
  const t = useTheme();
  const qc = useQueryClient();
  const { user } = useAuth();
  const online = useAppStore((s) => s.networkOnline);

  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('all');
  const [status, setStatus] = useState<(typeof STATUSES)[number] | null>('open');
  const [assignee, setAssignee] = useState<'all' | 'me' | 'unassigned'>('all');
  const [q, setQ] = useState('');

  const filter: InboxFilter = useMemo(
    () => ({
      channel: channel === 'all' ? null : channel,
      status: status ?? null,
      assigneeId: assignee === 'me' ? 'me' : assignee === 'unassigned' ? null : null,
      q,
    }),
    [channel, status, assignee, q],
  );

  const query = useQuery({
    queryKey: ['conversations', filter],
    queryFn: () => fetchConversations(filter, user?.id),
  });

  useRealtimeTable('conversations', ['conversations']);
  useRealtimeTable('messages', ['conversations']);

  return (
    <Screen>
      <Text style={[t.typography.h1, { color: t.colors.foreground }]}>Inbox</Text>

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
          placeholder="Search conversations"
          placeholderTextColor={t.colors.mutedFg}
          style={{ flex: 1, color: t.colors.foreground, fontSize: 15 }}
          returnKeyType="search"
        />
        {q ? (
          <Pressable onPress={() => setQ('')}>
            <Text style={{ color: t.colors.mutedFg }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {CHANNELS.map((c) => (
            <Chip key={c} label={c} active={channel === c} onPress={() => setChannel(c)} />
          ))}
        </View>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip label="All" active={assignee === 'all'} onPress={() => setAssignee('all')} />
          <Chip label="Assigned to me" active={assignee === 'me'} onPress={() => setAssignee('me')} />
          <Chip label="Unassigned" active={assignee === 'unassigned'} onPress={() => setAssignee('unassigned')} />
          <View style={{ width: 8 }} />
          {STATUSES.map((s) => (
            <Chip key={s} label={s} active={status === s} onPress={() => setStatus(status === s ? null : s)} />
          ))}
        </View>
      </ScrollView>

      {!online ? (
        <View
          style={{
            padding: t.spacing.sm,
            backgroundColor: t.colors.muted,
            borderRadius: t.radius.sm,
            marginTop: t.spacing.sm,
          }}
        >
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>Offline — showing cached conversations</Text>
        </View>
      ) : null}

      <FlatList
        style={{ marginTop: t.spacing.sm }}
        data={query.data ?? []}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={t.colors.primary} />
        }
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.colors.border }} />}
        renderItem={({ item }) => (
          <ConversationItem
            item={item}
            onOpen={() => router.push({ pathname: '/conversation/[id]', params: { id: item.id } })}
            onArchive={async () => {
              await updateStatus(item.id, 'resolved');
              await qc.invalidateQueries({ queryKey: ['conversations'] });
            }}
            onAssignSelf={async () => {
              if (!user) return;
              await updateAssignment(item.id, user.id);
              await qc.invalidateQueries({ queryKey: ['conversations'] });
            }}
          />
        )}
        ListEmptyComponent={
          !query.isLoading ? (
            <Text style={{ color: t.colors.mutedFg, textAlign: 'center', marginTop: 40 }}>No conversations</Text>
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

function ConversationItem({
  item,
  onOpen,
  onArchive,
  onAssignSelf,
}: {
  item: ConversationRow;
  onOpen: () => void;
  onArchive: () => void;
  onAssignSelf: () => void;
}) {
  const t = useTheme();

  const rightActions = () => (
    <Pressable
      onPress={() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onArchive();
      }}
      style={{
        backgroundColor: t.colors.success,
        justifyContent: 'center',
        paddingHorizontal: 20,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700' }}>Resolve</Text>
    </Pressable>
  );
  const leftActions = () => (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onAssignSelf();
      }}
      style={{
        backgroundColor: t.colors.primary,
        justifyContent: 'center',
        paddingHorizontal: 20,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700' }}>Assign me</Text>
    </Pressable>
  );

  const name = item.contact_display_name ?? item.subject ?? '(no subject)';

  return (
    <Swipeable renderRightActions={rightActions} renderLeftActions={leftActions} overshootLeft={false} overshootRight={false}>
      <Pressable onPress={onOpen} style={{ paddingVertical: t.spacing.md, backgroundColor: t.colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={name} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: t.colors.foreground, fontSize: 15, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {name}
              </Text>
              <Text style={{ color: t.colors.mutedFg, fontSize: 11 }}>{formatTime(item.last_message_at)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>{item.channel ?? 'chat'}</Text>
              <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>·</Text>
              <Text style={{ color: t.colors.mutedFg, fontSize: 12, flex: 1 }} numberOfLines={1}>
                {item.last_message_preview ?? ''}
              </Text>
              {item.unread_count ? (
                <View style={{ backgroundColor: t.colors.primary, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ color: t.colors.primaryFg, fontSize: 10, fontWeight: '700' }}>{item.unread_count}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </Swipeable>
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

function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
