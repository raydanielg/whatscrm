/**
 * Sales data layer for mobile. Reads directly from Supabase (RLS scoped to
 * workspace). Mutations use mutateOrQueue via the CRM outbox for offline safety.
 */
import { supabase } from '@/api/supabase';
import { enqueue } from '@/offline/outbox';
import { useAppStore } from '@/stores/appStore';

export type Pipeline = {
  id: string;
  name: string;
  is_default: boolean;
  default_currency: string;
  color: string | null;
};

export type Stage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  color: string | null;
};

export type Deal = {
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
  created_at?: string;
  updated_at?: string;
};

export type Quote = {
  id: string;
  quote_number: string;
  title: string;
  status: string;
  currency: string;
  total: number;
  valid_until: string | null;
  deal_id: string | null;
  contact_id: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  currency: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  issue_date: string;
  due_date: string | null;
  deal_id: string | null;
  contact_id: string | null;
  paid_at: string | null;
};

export type Appointment = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  start_at: string;
  end_at: string;
  status: string;
  join_url: string | null;
  location_kind: string | null;
  contact_id: string | null;
  host_id: string;
};

export type Notification = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  status: string;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
};

// ---------- Pipelines & stages ----------

export async function listPipelines(): Promise<Pipeline[]> {
  const { data, error } = await supabase
    .from('deal_pipelines')
    .select('id, name, is_default, default_currency, color')
    .is('deleted_at', null)
    .order('position');
  if (error) throw error;
  return (data ?? []) as Pipeline[];
}

export async function listStages(pipelineId: string): Promise<Stage[]> {
  const { data, error } = await supabase
    .from('deal_stages')
    .select('id, pipeline_id, name, position, probability, is_won, is_lost, color')
    .eq('pipeline_id', pipelineId)
    .eq('is_active', true)
    .order('position');
  if (error) throw error;
  return (data ?? []) as Stage[];
}

export async function listDealsByPipeline(pipelineId: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('id, name, amount, currency, stage_id, pipeline_id, probability, expected_close_date, owner_id, contact_id, company_id, created_at, updated_at')
    .eq('pipeline_id', pipelineId)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function getDeal(id: string): Promise<Deal | null> {
  const { data, error } = await supabase.from('deals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Deal | null;
}

// ---------- Quotes / Invoices ----------

export async function listQuotes(scope?: { dealId?: string; contactId?: string; status?: string }): Promise<Quote[]> {
  let q = supabase
    .from('quotes')
    .select('id, quote_number, title, status, currency, total, valid_until, deal_id, contact_id, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (scope?.dealId) q = q.eq('deal_id', scope.dealId);
  if (scope?.contactId) q = q.eq('contact_id', scope.contactId);
  if (scope?.status) q = q.eq('status', scope.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Quote[];
}

export async function listInvoices(scope?: { dealId?: string; contactId?: string; status?: string }): Promise<Invoice[]> {
  let q = supabase
    .from('invoices')
    .select('id, invoice_number, status, currency, total, amount_paid, amount_due, issue_date, due_date, deal_id, contact_id, paid_at')
    .is('deleted_at', null)
    .order('issue_date', { ascending: false })
    .limit(200);
  if (scope?.dealId) q = q.eq('deal_id', scope.dealId);
  if (scope?.contactId) q = q.eq('contact_id', scope.contactId);
  if (scope?.status) q = q.eq('status', scope.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Invoice[];
}

// ---------- Appointments ----------

export async function listAppointments(opts: { from?: string; to?: string; hostId?: string } = {}): Promise<Appointment[]> {
  let q = supabase
    .from('booking_appointments')
    .select('id, customer_name, customer_email, start_at, end_at, status, join_url, location_kind, contact_id, host_id')
    .order('start_at', { ascending: true })
    .limit(500);
  if (opts.from) q = q.gte('start_at', opts.from);
  if (opts.to) q = q.lte('start_at', opts.to);
  if (opts.hostId) q = q.eq('host_id', opts.hostId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Appointment[];
}

// ---------- Notifications ----------

export async function listNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, body, category, status, action_url, created_at, read_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(id: string) {
  return supabase.from('notifications').update({ status: 'read', read_at: new Date().toISOString() }).eq('id', id);
}

// ---------- Dashboard aggregation ----------

export type DashboardStats = {
  openDeals: number;
  openValue: number;
  wonThisMonth: number;
  wonValue: number;
  quotesOpen: number;
  invoicesUnpaid: number;
  invoicesOverdue: number;
  apptsToday: number;
  tasksDue: number;
};

export async function fetchSalesDashboard(userId?: string): Promise<DashboardStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const [openDeals, wonDeals, quotes, invoices, appts, tasks] = await Promise.all([
    supabase.from('deals').select('amount, currency, stage_id, deal_stages:stage_id(is_won,is_lost)').limit(1000),
    supabase.from('deals').select('amount').gte('updated_at', monthStart).limit(1000),
    supabase.from('quotes').select('id, status').is('deleted_at', null).in('status', ['sent', 'viewed', 'draft']).limit(500),
    supabase.from('invoices').select('id, status, due_date').is('deleted_at', null).in('status', ['sent', 'viewed', 'partial', 'overdue']).limit(500),
    supabase.from('booking_appointments').select('id').gte('start_at', dayStart).lt('start_at', dayEnd).in('status', ['pending', 'confirmed']).limit(500),
    supabase.from('tasks').select('id').eq('status', 'pending').limit(500),
  ]);

  const openList = ((openDeals.data ?? []) as any[]).filter((d) => !d.deal_stages?.is_won && !d.deal_stages?.is_lost);
  const wonList = ((openDeals.data ?? []) as any[]).filter((d) => d.deal_stages?.is_won);
  const invsRows = (invoices.data ?? []) as any[];
  const overdue = invsRows.filter((i) => i.due_date && new Date(i.due_date) < now).length;

  return {
    openDeals: openList.length,
    openValue: openList.reduce((s, d) => s + Number(d.amount ?? 0), 0),
    wonThisMonth: wonList.length,
    wonValue: wonList.reduce((s, d) => s + Number(d.amount ?? 0), 0),
    quotesOpen: (quotes.data ?? []).length,
    invoicesUnpaid: invsRows.length,
    invoicesOverdue: overdue,
    apptsToday: (appts.data ?? []).length,
    tasksDue: (tasks.data ?? []).length,
  };
}

// ---------- Writes (offline-safe) ----------

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
    if (String(e?.message ?? '').match(/Network request failed|fetch/i)) {
      enqueue({ op, table, payload, match });
      return { queued: true } as const;
    }
    throw e;
  }
}

export function moveDealToStage(dealId: string, stageId: string) {
  return mutateOrQueue('update', 'deals', { stage_id: stageId, updated_at: new Date().toISOString() }, { id: dealId });
}
export function updateDeal(id: string, payload: Partial<Deal>) {
  return mutateOrQueue('update', 'deals', payload, { id });
}
export function createFollowUpTask(payload: { title: string; due_date?: string | null; deal_id?: string | null; contact_id?: string | null; assignee_id?: string | null; priority?: string | null }) {
  return mutateOrQueue('insert', 'tasks', { ...payload, status: 'pending' });
}
export function rescheduleAppointment(id: string, start_at: string, end_at: string) {
  return mutateOrQueue('update', 'booking_appointments', { start_at, end_at, updated_at: new Date().toISOString() }, { id });
}
export function cancelAppointment(id: string, reason?: string) {
  return mutateOrQueue('update', 'booking_appointments', { status: 'cancelled', cancellation_reason: reason ?? null }, { id });
}

export function formatCurrency(amount: number | null | undefined, currency: string | null | undefined) {
  const n = Number(amount ?? 0);
  const c = (currency ?? 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${c} ${n.toFixed(0)}`;
  }
}
