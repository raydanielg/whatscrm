import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useTheme } from '@/theme/ThemeProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import {
  fetchCustomer360,
  updateContact,
  addNote,
  createTask,
  logActivity,
} from '@/api/crm';

export default function ContactDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const contactId = String(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<'timeline' | 'notes' | 'tasks' | 'deals'>('timeline');
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const query = useQuery({ queryKey: ['crm', 'customer360', contactId], queryFn: () => fetchCustomer360(contactId) });
  useRealtimeTable('activities', ['crm', 'customer360', contactId], `contact_id=eq.${contactId}`);
  useRealtimeTable('notes', ['crm', 'customer360', contactId], `contact_id=eq.${contactId}`);
  useRealtimeTable('tasks', ['crm', 'customer360', contactId], `contact_id=eq.${contactId}`);

  const data = query.data;
  const c = data?.contact;
  const name = c?.display_name ?? [c?.first_name, c?.last_name].filter(Boolean).join(' ') ?? c?.email ?? 'Contact';

  const refresh = () => qc.invalidateQueries({ queryKey: ['crm', 'customer360', contactId] });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 22, color: t.colors.foreground }}>‹</Text>
        </Pressable>
        <Text style={[t.typography.h2, { color: t.colors.foreground, marginLeft: 8, flex: 1 }]} numberOfLines={1}>
          {name}
        </Text>
        <Pressable onPress={() => setEditOpen(true)} hitSlop={12}>
          <Text style={{ color: t.colors.primary, fontWeight: '600' }}>Edit</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80, gap: t.spacing.md }}>
        {/* Header card */}
        <View
          style={{
            marginTop: t.spacing.md,
            padding: t.spacing.md,
            borderRadius: t.radius.lg,
            backgroundColor: t.colors.muted,
          }}
        >
          <Text style={{ color: t.colors.foreground, fontSize: 18, fontWeight: '700' }}>{name}</Text>
          <Text style={{ color: t.colors.mutedFg, marginTop: 2 }}>
            {[c?.email, c?.phone, c?.company?.name].filter(Boolean).join(' · ') || '—'}
          </Text>

          {/* Quick actions */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: t.spacing.md }}>
            <QuickAction
              label="Call"
              disabled={!c?.phone}
              onPress={async () => {
                if (!c?.phone) return;
                Haptics.selectionAsync();
                Linking.openURL(`tel:${c.phone}`);
                await logActivity({ contact_id: contactId, type: 'call', subject: 'Called customer', body: c.phone });
                refresh();
              }}
            />
            <QuickAction
              label="Email"
              disabled={!c?.email}
              onPress={() => c?.email && Linking.openURL(`mailto:${c.email}`)}
            />
            <QuickAction
              label="SMS"
              disabled={!c?.phone}
              onPress={() => c?.phone && Linking.openURL(`sms:${c.phone}`)}
            />
            <QuickAction
              label="Chat"
              onPress={async () => {
                const conv = data?.conversations?.[0];
                if (conv) router.push({ pathname: '/conversation/[id]', params: { id: conv.id } });
                else Alert.alert('No conversation', 'Start a new conversation from the inbox.');
              }}
            />
          </View>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['timeline', 'notes', 'tasks', 'deals'] as const).map((tk) => (
              <Pressable
                key={tk}
                onPress={() => setTab(tk)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: tab === tk ? t.colors.foreground : t.colors.muted,
                }}
              >
                <Text
                  style={{
                    color: tab === tk ? t.colors.background : t.colors.mutedFg,
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  {tk}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {tab === 'timeline' ? <Timeline data={data} /> : null}
        {tab === 'notes' ? <NotesList notes={data?.notes ?? []} onAdd={() => setNoteOpen(true)} /> : null}
        {tab === 'tasks' ? <TasksList tasks={data?.tasks ?? []} onAdd={() => setTaskOpen(true)} /> : null}
        {tab === 'deals' ? <DealsList deals={data?.deals ?? []} /> : null}
      </ScrollView>

      <EditContactModal
        open={editOpen}
        contact={c}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          refresh();
        }}
      />
      <ComposeModal
        open={noteOpen}
        title="Add note"
        placeholder="Write a note (customer won't see this)"
        onClose={() => setNoteOpen(false)}
        onSubmit={async (body) => {
          const res = await addNote({ contact_id: contactId, body });
          setNoteOpen(false);
          refresh();
          if (res.queued) Alert.alert('Saved offline', 'Note will sync when you reconnect.');
        }}
      />
      <ComposeModal
        open={taskOpen}
        title="Add task"
        placeholder="Task title"
        onClose={() => setTaskOpen(false)}
        onSubmit={async (title) => {
          const res = await createTask({ contact_id: contactId, title, status: 'open' });
          setTaskOpen(false);
          refresh();
          if (res.queued) Alert.alert('Saved offline', 'Task will sync when you reconnect.');
        }}
      />
    </Screen>
  );
}

function QuickAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: t.radius.md,
        alignItems: 'center',
        backgroundColor: disabled ? t.colors.border : t.colors.background,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function Timeline({ data }: { data: any }) {
  const t = useTheme();
  const merged = [
    ...(data?.activities ?? []).map((a: any) => ({ ...a, _kind: 'activity' })),
    ...(data?.notes ?? []).map((n: any) => ({ ...n, _kind: 'note' })),
    ...(data?.conversations ?? []).map((c: any) => ({ ...c, _kind: 'conversation', created_at: c.last_message_at })),
  ].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());

  if (!merged.length)
    return <Text style={{ color: t.colors.mutedFg, textAlign: 'center', marginTop: 20 }}>No activity yet</Text>;

  return (
    <View style={{ gap: t.spacing.sm }}>
      {merged.map((e: any) => (
        <View
          key={`${e._kind}-${e.id}`}
          style={{
            padding: t.spacing.md,
            borderRadius: t.radius.md,
            backgroundColor: t.colors.background,
            borderWidth: 1,
            borderColor: t.colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: t.colors.mutedFg, textTransform: 'uppercase' }}>
              {e._kind === 'activity' ? e.type ?? 'activity' : e._kind}
            </Text>
            <Text style={{ fontSize: 11, color: t.colors.mutedFg }}>·</Text>
            <Text style={{ fontSize: 11, color: t.colors.mutedFg }}>
              {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
            </Text>
          </View>
          <Text style={{ color: t.colors.foreground, marginTop: 4 }} numberOfLines={4}>
            {e.subject ?? e.body ?? e.name ?? e.channel ?? ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function NotesList({ notes, onAdd }: { notes: any[]; onAdd: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      <Button title="Add note" onPress={onAdd} variant="secondary" />
      {notes.map((n) => (
        <View key={n.id} style={{ padding: 10, backgroundColor: '#FEF3C7', borderRadius: t.radius.md }}>
          <Text style={{ color: '#78350F' }}>{n.body}</Text>
          <Text style={{ color: '#78350F', opacity: 0.6, fontSize: 10, marginTop: 4 }}>
            {new Date(n.created_at).toLocaleString()}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TasksList({ tasks, onAdd }: { tasks: any[]; onAdd: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      <Button title="Add task" onPress={onAdd} variant="secondary" />
      {tasks.map((tk) => (
        <View
          key={tk.id}
          style={{
            padding: t.spacing.md,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.colors.border,
          }}
        >
          <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>{tk.title}</Text>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>
            {tk.status} {tk.due_date ? ` · due ${new Date(tk.due_date).toLocaleDateString()}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DealsList({ deals }: { deals: any[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      {deals.map((d) => (
        <View
          key={d.id}
          style={{
            padding: t.spacing.md,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.colors.border,
          }}
        >
          <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>{d.name}</Text>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>
            {d.amount != null
              ? new Intl.NumberFormat(undefined, { style: 'currency', currency: d.currency ?? 'USD' }).format(d.amount)
              : '—'}
          </Text>
        </View>
      ))}
      {deals.length === 0 ? <Text style={{ color: t.colors.mutedFg }}>No deals</Text> : null}
    </View>
  );
}

function EditContactModal({
  open,
  contact,
  onClose,
  onSaved,
}: {
  open: boolean;
  contact: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (v: string) => setValues((cur) => ({ ...cur, [k]: v }));

  // Seed once when opened
  const init = () => ({
    first_name: contact?.first_name ?? '',
    last_name: contact?.last_name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
  });

  return (
    <Modal
      visible={open}
      animationType="slide"
      onShow={() => setValues(init())}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[t.typography.h2, { color: t.colors.foreground, flex: 1 }]}>Edit contact</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: t.colors.primary, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: t.spacing.md, paddingTop: t.spacing.md }}>
          <Input label="First name" value={values.first_name ?? ''} onChangeText={set('first_name')} />
          <Input label="Last name" value={values.last_name ?? ''} onChangeText={set('last_name')} />
          <Input label="Email" value={values.email ?? ''} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          <Input label="Phone" value={values.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" />
          <Button
            title="Save"
            loading={saving}
            onPress={async () => {
              setSaving(true);
              try {
                const res = await updateContact(contact.id, {
                  first_name: values.first_name || null,
                  last_name: values.last_name || null,
                  email: values.email || null,
                  phone: values.phone || null,
                  display_name: `${values.first_name ?? ''} ${values.last_name ?? ''}`.trim() || null,
                });
                if (res.queued) Alert.alert('Saved offline', 'Changes will sync when you reconnect.');
                onSaved();
              } catch (e: any) {
                Alert.alert('Save failed', e?.message ?? 'Unknown error');
              } finally {
                setSaving(false);
              }
            }}
          />
        </ScrollView>
      </Screen>
    </Modal>
  );
}

function ComposeModal({
  open,
  title,
  placeholder,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  placeholder: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void> | void;
}) {
  const t = useTheme();
  const [v, setV] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={() => setV('')}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[t.typography.h2, { color: t.colors.foreground, flex: 1 }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: t.colors.primary, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
        <TextInput
          value={v}
          onChangeText={setV}
          placeholder={placeholder}
          placeholderTextColor={t.colors.mutedFg}
          multiline
          style={{
            marginTop: t.spacing.md,
            minHeight: 120,
            padding: t.spacing.md,
            borderRadius: t.radius.md,
            backgroundColor: t.colors.muted,
            color: t.colors.foreground,
            fontSize: 15,
            textAlignVertical: 'top',
          }}
        />
        <View style={{ marginTop: t.spacing.md }}>
          <Button
            title="Save"
            loading={saving}
            disabled={!v.trim()}
            onPress={async () => {
              setSaving(true);
              try {
                await onSubmit(v.trim());
                setV('');
              } finally {
                setSaving(false);
              }
            }}
          />
        </View>
      </Screen>
    </Modal>
  );
}
