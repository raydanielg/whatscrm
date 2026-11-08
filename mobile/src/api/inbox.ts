/**
 * Data access for the omnichannel inbox.
 * All queries hit the SAME tables the web app uses (conversations, messages,
 * message_attachments, conversation_notes, contacts). RLS on the server
 * enforces per-user/workspace access — no additional client checks needed.
 */
import { supabase } from '@/api/supabase';

export type InboxFilter = {
  channel?: string | null; // 'whatsapp' | 'email' | 'instagram' | 'sms' | ...
  status?: 'open' | 'pending' | 'resolved' | 'snoozed' | null;
  assigneeId?: string | null; // 'me' | uuid | null
  q?: string; // full-text search on subject / contact display name
};

export type ConversationRow = {
  id: string;
  subject: string | null;
  channel: string | null;
  status: string | null;
  priority: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number | null;
  assignee_id: string | null;
  contact_id: string | null;
  contact_display_name?: string | null;
  contact_avatar_url?: string | null;
};

export async function fetchConversations(filter: InboxFilter, meUserId?: string) {
  let q = supabase
    .from('conversations')
    .select(
      `id, subject, channel, status, priority, last_message_at,
       last_message_preview, unread_count, assignee_id, contact_id,
       contact:contact_id (display_name, avatar_url)`,
    )
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (filter.channel) q = q.eq('channel', filter.channel);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.assigneeId === 'me' && meUserId) q = q.eq('assignee_id', meUserId);
  else if (filter.assigneeId && filter.assigneeId !== 'me') q = q.eq('assignee_id', filter.assigneeId);
  if (filter.q && filter.q.trim().length > 0) q = q.ilike('subject', `%${filter.q.trim()}%`);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: any): ConversationRow => ({
    id: row.id,
    subject: row.subject,
    channel: row.channel,
    status: row.status,
    priority: row.priority,
    last_message_at: row.last_message_at,
    last_message_preview: row.last_message_preview,
    unread_count: row.unread_count,
    assignee_id: row.assignee_id,
    contact_id: row.contact_id,
    contact_display_name: row.contact?.display_name ?? null,
    contact_avatar_url: row.contact?.avatar_url ?? null,
  }));
}

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_type: 'agent' | 'customer' | 'system' | 'bot' | null;
  sender_id: string | null;
  body: string | null;
  content_type: string | null;
  created_at: string;
  is_internal: boolean | null;
  status: string | null;
  attachments?: {
    id: string;
    url: string | null;
    mime_type: string | null;
    name: string | null;
    duration_ms: number | null;
    size_bytes: number | null;
  }[];
};

export async function fetchMessages(conversationId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(
      `id, conversation_id, sender_type, sender_id, body, content_type,
       created_at, is_internal, status,
       attachments:message_attachments (id, url, mime_type, name, duration_ms, size_bytes)`,
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

export async function sendMessage(params: {
  conversation_id: string;
  body: string;
  is_internal?: boolean;
  attachments?: { url: string; mime_type: string; name: string; duration_ms?: number; size_bytes?: number }[];
}) {
  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: params.conversation_id,
      body: params.body,
      is_internal: params.is_internal ?? false,
      content_type: params.attachments?.length ? 'multimedia' : 'text',
      sender_type: 'agent',
      status: 'queued',
    })
    .select('id')
    .single();
  if (error) throw error;

  if (params.attachments?.length) {
    const rows = params.attachments.map((a) => ({ message_id: msg!.id, ...a }));
    const { error: aErr } = await supabase.from('message_attachments').insert(rows);
    if (aErr) throw aErr;
  }
  return msg!.id;
}

export async function markConversationRead(conversationId: string) {
  await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversationId);
}

export async function updateAssignment(conversationId: string, assigneeId: string | null) {
  const { error } = await supabase.from('conversations').update({ assignee_id: assigneeId }).eq('id', conversationId);
  if (error) throw error;
}

export async function updateStatus(conversationId: string, status: 'open' | 'resolved' | 'snoozed' | 'pending') {
  const { error } = await supabase.from('conversations').update({ status }).eq('id', conversationId);
  if (error) throw error;
}

export async function fetchContact(contactId: string) {
  const { data, error } = await supabase.from('contacts').select('*').eq('id', contactId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchNotes(conversationId: string) {
  const { data, error } = await supabase
    .from('conversation_notes')
    .select('id, body, created_at, author_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function addNote(conversationId: string, body: string) {
  const { error } = await supabase.from('conversation_notes').insert({ conversation_id: conversationId, body });
  if (error) throw error;
}

export async function fetchQuickReplies(limit = 20) {
  const { data, error } = await supabase
    .from('message_templates')
    .select('id, name, body, channel')
    .eq('type', 'quick_reply')
    .limit(limit);
  if (error) return [] as any[];
  return data ?? [];
}
