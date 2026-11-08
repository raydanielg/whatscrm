/**
 * CRM data layer for mobile. All reads hit Supabase directly; mutations go
 * through the offline outbox when the device is offline, and are flushed by
 * NetworkGate on reconnect. Tables mirror the web platform 1:1 — RLS enforces
 * per-workspace access.
 */
import { supabase } from '@/api/supabase';
import { enqueue } from '@/offline/outbox';
import { useAppStore } from '@/stores/appStore';

// ---------- Types ----------

export type ContactRow = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_id: string | null;
  company_name?: string | null;
  avatar_url: string | null;
  lifecycle_stage: string | null;
  owner_id: string | null;
  created_at: string;
};

export type CompanyRow = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  size: string | null;
  city: string | null;
  country: string | null;
  owner_id: string | null;
};

export type LeadRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
  score: number | null;
  owner_id: string | null;
  created_at: string;
};

export type DealRow = {
  id: string;
  name: string;
  amount: number | null;
  currency: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  probability: number | null;
  expected_close_date: string | null;
  owner_id: string | null;
  contact_id: string | null;
  company_id: string | null;
};

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string | null;
  priority: string | null;
  assignee_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
};

export type NoteRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
};

export type ActivityRow = {
  id: string;
  type: string | null;
  subject: string | null;
  body: string | null;
  created_at: string;
  contact_id: string | null;
  deal_id: string | null;
};

// ---------- Reads ----------

export async function listContacts(q?: string, owner?: 'me' | null, meId?: string) {
  let query = supabase
    .from('contacts')
    .select('id, display_name, first_name, last_name, email, phone, company_id, avatar_url, lifecycle_stage, owner_id, created_at, company:company_id (name)')
    .order('display_name', { ascending: true, nullsFirst: false })
    .limit(200);
  if (q && q.trim()) query = query.or(`display_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  if (owner === 'me' && meId) query = query.eq('owner_id', meId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r: any): ContactRow => ({ ...r, company_name: r.company?.name ?? null }));
}

export async function getContact(id: string) {
  const { data, error } = await supabase.from('contacts').select('*, company:company_id (name)').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCompanies(q?: string) {
  let query = supabase.from('companies').select('*').order('name').limit(200);
  if (q && q.trim()) query = query.ilike('name', `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CompanyRow[];
}

export async function listLeads(q?: string) {
  let query = supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(200);
  if (q && q.trim()) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LeadRow[];
}

export async function listDeals(q?: string) {
  let query = supabase.from('deals').select('*').order('expected_close_date', { ascending: true, nullsFirst: false }).limit(200);
  if (q && q.trim()) query = query.ilike('name', `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DealRow[];
}

export async function listTasks(scope?: { contactId?: string; dealId?: string }) {
  let query = supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }).limit(200);
  if (scope?.contactId) query = query.eq('contact_id', scope.contactId);
  if (scope?.dealId) query = query.eq('deal_id', scope.dealId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

export async function listNotes(scope: { contactId?: string; dealId?: string }) {
  let query = supabase.from('notes').select('*').order('created_at', { ascending: false }).limit(200);
  if (scope.contactId) query = query.eq('contact_id', scope.contactId);
  if (scope.dealId) query = query.eq('deal_id', scope.dealId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as NoteRow[];
}

export async function listActivities(contactId: string) {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

/** Fetch the "Customer 360" bundle in one round-trip. */
export async function fetchCustomer360(contactId: string) {
  const [contact, activities, notes, tasks, deals, conversations] = await Promise.all([
    getContact(contactId),
    listActivities(contactId),
    listNotes({ contactId }),
    listTasks({ contactId }),
    supabase.from('deals').select('id, name, amount, currency, stage_id').eq('contact_id', contactId).limit(50),
    supabase
      .from('conversations')
      .select('id, subject, channel, status, last_message_at')
      .eq('contact_id', contactId)
      .order('last_message_at', { ascending: false })
      .limit(50),
  ]);
  return {
    contact,
    activities,
    notes,
    tasks,
    deals: (deals.data ?? []) as any[],
    conversations: (conversations.data ?? []) as any[],
  };
}

// ---------- Writes (offline-safe) ----------

/**
 * Attempts a mutation; if the device is offline OR the request throws a
 * network error, the mutation is queued in the outbox and replayed later.
 * Returns `{ queued: true }` when deferred.
 */
async function mutateOrQueue(op: 'insert' | 'update' | 'delete', table: string, payload: any, match?: any) {
  const online = useAppStore.getState().networkOnline;
  if (!online) {
    enqueue({ op, table, payload, match });
    return { queued: true } as const;
  }
  try {
    const t = supabase.from(table);
    let error: any = null;
    if (op === 'insert') ({ error } = await t.insert(payload));
    else if (op === 'update') ({ error } = await t.update(payload).match(match ?? {}));
    else ({ error } = await t.delete().match(match ?? {}));
    if (error) throw error;
    return { queued: false } as const;
  } catch (e: any) {
    // Treat fetch/network failures as offline; anything else re-throws.
    if (String(e?.message ?? '').match(/Network request failed|fetch/i)) {
      enqueue({ op, table, payload, match });
      return { queued: true } as const;
    }
    throw e;
  }
}

export function createContact(payload: Partial<ContactRow>) {
  return mutateOrQueue('insert', 'contacts', payload);
}
export function updateContact(id: string, payload: Partial<ContactRow>) {
  return mutateOrQueue('update', 'contacts', payload, { id });
}
export function createCompany(payload: Partial<CompanyRow>) {
  return mutateOrQueue('insert', 'companies', payload);
}
export function createLead(payload: Partial<LeadRow>) {
  return mutateOrQueue('insert', 'leads', payload);
}
export function updateDealStage(id: string, stage_id: string) {
  return mutateOrQueue('update', 'deals', { stage_id }, { id });
}
export function createTask(payload: Partial<TaskRow>) {
  return mutateOrQueue('insert', 'tasks', payload);
}
export function completeTask(id: string) {
  return mutateOrQueue('update', 'tasks', { status: 'completed' }, { id });
}
export function addNote(payload: Partial<NoteRow>) {
  return mutateOrQueue('insert', 'notes', payload);
}
export function logActivity(payload: Partial<ActivityRow>) {
  return mutateOrQueue('insert', 'activities', payload);
}
