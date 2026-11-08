/**
 * Dashboard aggregators. Every query is RLS-scoped: the API only ever returns
 * rows the caller is allowed to see, so agents get personal metrics and
 * admins/owners get workspace-wide numbers with the same query shape.
 */
import { supabase } from './supabase';

export type PersonalKpis = {
  tasksOpen: number;
  tasksOverdue: number;
  appointmentsToday: number;
  unreadConversations: number;
  dealsOpen: number;
  dealsWonThisMonth: number;
  dealsWonAmount: number;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};
const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export async function fetchPersonalKpis(workspaceId: string, userId: string): Promise<PersonalKpis> {
  const nowIso = new Date().toISOString();

  const [tasksOpen, tasksOverdue, appts, convos, dealsOpen, dealsWon] = await Promise.all([
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('assigned_to', userId)
      .neq('status', 'done'),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('assigned_to', userId)
      .neq('status', 'done')
      .lt('due_date', nowIso),
    supabase
      .from('booking_appointments')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('start_at', startOfToday())
      .lte('start_at', endOfToday()),
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gt('unread_count', 0),
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .not('status', 'in', '("won","lost")'),
    supabase
      .from('deals')
      .select('amount')
      .eq('workspace_id', workspaceId)
      .eq('status', 'won')
      .gte('closed_at', startOfMonth()),
  ]);

  const won = (dealsWon.data ?? []) as Array<{ amount: number | null }>;
  return {
    tasksOpen: tasksOpen.count ?? 0,
    tasksOverdue: tasksOverdue.count ?? 0,
    appointmentsToday: appts.count ?? 0,
    unreadConversations: convos.count ?? 0,
    dealsOpen: dealsOpen.count ?? 0,
    dealsWonThisMonth: won.length,
    dealsWonAmount: won.reduce((s, d) => s + Number(d.amount ?? 0), 0),
  };
}

export async function fetchMyTasks(workspaceId: string, userId: string, limit = 25) {
  const { data } = await supabase
    .from('tasks')
    .select('id, title, status, priority, due_date')
    .eq('workspace_id', workspaceId)
    .eq('assigned_to', userId)
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

export async function fetchUpcomingAppointments(workspaceId: string, days = 7) {
  const now = new Date();
  const end = new Date(Date.now() + days * 86_400_000);
  const { data } = await supabase
    .from('booking_appointments')
    .select('id, title, start_at, end_at, status, customer_name')
    .eq('workspace_id', workspaceId)
    .gte('start_at', now.toISOString())
    .lte('start_at', end.toISOString())
    .order('start_at', { ascending: true })
    .limit(50);
  return data ?? [];
}

export async function fetchConversationAnalytics(workspaceId: string) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [byStatus, byChannel, unread] = await Promise.all([
    supabase.from('conversations').select('status').eq('workspace_id', workspaceId).gte('created_at', since),
    supabase.from('conversations').select('channel').eq('workspace_id', workspaceId).gte('created_at', since),
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gt('unread_count', 0),
  ]);
  const count = (rows: any[] | null, key: string) =>
    (rows ?? []).reduce<Record<string, number>>((acc, r) => {
      const k = r[key] ?? 'unknown';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  return {
    total: (byStatus.data ?? []).length,
    unread: unread.count ?? 0,
    byStatus: count(byStatus.data, 'status'),
    byChannel: count(byChannel.data, 'channel'),
  };
}

export async function fetchSalesAnalytics(workspaceId: string) {
  const since = startOfMonth();
  const [pipeline, won, lost] = await Promise.all([
    supabase.from('deals').select('amount, stage_id').eq('workspace_id', workspaceId).not('status', 'in', '("won","lost")'),
    supabase.from('deals').select('amount').eq('workspace_id', workspaceId).eq('status', 'won').gte('closed_at', since),
    supabase.from('deals').select('amount').eq('workspace_id', workspaceId).eq('status', 'lost').gte('closed_at', since),
  ]);
  const sum = (rows: any[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  return {
    pipelineValue: sum(pipeline.data),
    pipelineCount: (pipeline.data ?? []).length,
    wonAmount: sum(won.data),
    wonCount: (won.data ?? []).length,
    lostAmount: sum(lost.data),
    lostCount: (lost.data ?? []).length,
    winRate:
      (won.data?.length ?? 0) + (lost.data?.length ?? 0) === 0
        ? 0
        : ((won.data?.length ?? 0) / ((won.data?.length ?? 0) + (lost.data?.length ?? 0))) * 100,
  };
}

export async function fetchPerformance(workspaceId: string, userId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [messagesSent, tasksDone, dealsClosed, csat] = await Promise.all([
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('sender_user_id', userId)
      .gte('created_at', since),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('assigned_to', userId)
      .eq('status', 'done')
      .gte('completed_at', since),
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('owner_id', userId)
      .in('status', ['won', 'lost'])
      .gte('closed_at', since),
    supabase.from('csat_responses').select('score').eq('workspace_id', workspaceId).gte('created_at', since),
  ]);
  const scores = ((csat.data ?? []) as Array<{ score: number }>).map((r) => Number(r.score));
  return {
    messagesSent: messagesSent.count ?? 0,
    tasksDone: tasksDone.count ?? 0,
    dealsClosed: dealsClosed.count ?? 0,
    csatAvg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    csatCount: scores.length,
  };
}
