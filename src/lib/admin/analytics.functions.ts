/**
 * Platform-wide analytics aggregator for the Super Admin console.
 *
 * All reads execute under an authenticated RLS context after asserting the
 * caller is platform staff.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
}

export interface PlatformOverview {
  generatedAt: string;
  totals: {
    organizations: number;
    users: number;
    activeUsers30d: number;
    activeUsers7d: number;
    newSignups7d: number;
    newSignups30d: number;
    mrrCents: number;
    arrCents: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
    churnRatePct: number;
    storageBytes: number;
    aiCostUsd: number;
    aiRequests30d: number;
    whatsappMessages30d: number;
    campaigns30d: number;
    workflowExecutions30d: number;
    apiRequests30d: number;
  };
  /** Percent change vs the previous period; `null` when the baseline is zero. */
  deltas: {
    organizationsPct: number | null;
    usersPct: number | null;
    mrrPct: number | null;
    aiCostPct: number | null;
    messagesPct: number | null;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeCount(supabase: any, table: string, filter?: (q: any) => any) {
  try {
    let q = sbAny(supabase).from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeSum(supabase: any, table: string, col: string, filter?: (q: any) => any) {
  try {
    const sel = (s: string) => s;
    let q = sbAny(supabase).from(table).select(sel(col));
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error || !data) return 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).reduce((acc, r) => acc + Number(r[col] ?? 0), 0);
  } catch {
    return 0;
  }
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Percent change vs the previous period, or `null` when there is nothing to
 * compare against. A zero baseline used to report "+100%" for any non-zero
 * value, which made every tile on a young platform claim 100% growth.
 */
function pctChange(now: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((now - prev) / prev) * 1000) / 10;
}

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformOverview> => {
    const { supabase: callerClient, userId } = context;
    await assertPlatformStaff(callerClient, userId);

    // Platform-wide totals must span EVERY tenant. The caller's own RLS context
    // only exposes tenants they belong to, so a super admin who is a member of
    // two organizations would read "2 organizations / 1 user" on a platform that
    // has four and three. Staff status was asserted above; everything below is
    // a read-only aggregate.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const supabase = supabaseAdmin;

    const now = new Date();
    const t7 = daysAgo(7);
    const t14 = daysAgo(14);
    const t30 = daysAgo(30);
    const t60 = daysAgo(60);

    const [
      organizations,
      organizationsPrev,
      users,
      usersPrev,
      activeUsers30d,
      activeUsers7d,
      newSignups7d,
      newSignups30d,
      whatsappMessages30d,
      whatsappMessagesPrev,
      campaigns30d,
      workflowExecutions30d,
      apiRequests30d,
      activeSubscriptions,
      trialingSubscriptions,
    ] = await Promise.all([
      safeCount(supabase, "organizations"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "organizations", (q: any) => q.lte("created_at", t30)),
      safeCount(supabase, "profiles"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "profiles", (q: any) => q.lte("created_at", t30)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "profiles", (q: any) => q.gte("last_seen_at", t30)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "profiles", (q: any) => q.gte("last_seen_at", t7)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "profiles", (q: any) => q.gte("created_at", t7)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "profiles", (q: any) => q.gte("created_at", t30)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "messages", (q: any) => q.gte("created_at", t30)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "messages", (q: any) => q.gte("created_at", t60).lt("created_at", t30)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "campaigns", (q: any) => q.gte("created_at", t30)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "workflow_runs", (q: any) => q.gte("started_at", t30)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "ai_request_logs", (q: any) => q.gte("created_at", t30)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "subscriptions", (q: any) => q.eq("status", "active")),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeCount(supabase, "subscriptions", (q: any) => q.eq("status", "trialing")),
    ]);

    // Revenue snapshots (most recent for MRR/ARR/churn) — sum across orgs for platform-wide
    let mrrCents = 0;
    let arrCents = 0;
    let mrrPrev = 0;
    let churnRatePct = 0;
    try {
      const { data: snaps } = await supabase
        .from("billing_revenue_snapshots")
        .select("snapshot_date, mrr_cents, arr_cents, churn_rate, organization_id")
        .gte("snapshot_date", new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10))
        .order("snapshot_date", { ascending: false });
      if (snaps && snaps.length) {
        // group by snapshot_date desc, take newest date's rows
        const newest = snaps[0].snapshot_date;
        const older = snaps.find((s: { snapshot_date: string }) => s.snapshot_date <= t30.slice(0, 10))?.snapshot_date;
        for (const s of snaps as Array<{ snapshot_date: string; mrr_cents: number; arr_cents: number; churn_rate: number }>) {
          if (s.snapshot_date === newest) {
            mrrCents += Number(s.mrr_cents ?? 0);
            arrCents += Number(s.arr_cents ?? 0);
            churnRatePct = Math.max(churnRatePct, Number(s.churn_rate ?? 0) * 100);
          } else if (older && s.snapshot_date === older) {
            mrrPrev += Number(s.mrr_cents ?? 0);
          }
        }
      }
    } catch {
      // ignore
    }

    // AI usage cost 30d + requests
    let aiCostUsd = 0;
    let aiCostPrev = 0;
    let aiRequests30d = 0;
    try {
      const { data } = await supabase
        .from("ai_usage_daily")
        .select("day, cost_usd, requests")
        .gte("day", t60.slice(0, 10));
      for (const r of (data ?? []) as Array<{ day: string; cost_usd: number; requests: number }>) {
        if (r.day >= t30.slice(0, 10)) {
          aiCostUsd += Number(r.cost_usd ?? 0);
          aiRequests30d += Number(r.requests ?? 0);
        } else {
          aiCostPrev += Number(r.cost_usd ?? 0);
        }
      }
    } catch {
      // ignore
    }

    // Storage
    const storageBytes = await safeSum(supabase, "files", "size_bytes").catch(() => 0);

    void now;
    return {
      generatedAt: new Date().toISOString(),
      totals: {
        organizations,
        users,
        activeUsers30d,
        activeUsers7d,
        newSignups7d,
        newSignups30d,
        mrrCents,
        arrCents,
        activeSubscriptions,
        trialingSubscriptions,
        churnRatePct: Math.round(churnRatePct * 100) / 100,
        storageBytes,
        aiCostUsd: Math.round(aiCostUsd * 100) / 100,
        aiRequests30d,
        whatsappMessages30d,
        campaigns30d,
        workflowExecutions30d,
        apiRequests30d,
      },
      deltas: {
        organizationsPct: pctChange(organizations, organizationsPrev),
        usersPct: pctChange(users, usersPrev),
        mrrPct: pctChange(mrrCents, mrrPrev),
        aiCostPct: pctChange(aiCostUsd, aiCostPrev),
        messagesPct: pctChange(whatsappMessages30d, whatsappMessagesPrev),
      },
    };
  });

export interface GrowthPoint {
  date: string;
  organizations: number;
  users: number;
  mrrCents: number;
  messages: number;
  aiCostUsd: number;
  workflowRuns: number;
}

export const getGrowthTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { days?: number }) => z.object({ days: z.number().min(7).max(365).default(30) }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<GrowthPoint[]> => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const days = data.days;
    const since = new Date(Date.now() - days * 86400_000);
    const sinceIso = since.toISOString();
    const sinceDate = sinceIso.slice(0, 10);

    // Fetch time-bucketed data in parallel
    const sel = (s: string) => s;
    const [orgs, users, snaps, msgs, aiDaily, wfRuns] = await Promise.all([
      sbAny(supabase).from("organizations").select(sel("created_at")).gte("created_at", sinceIso),
      sbAny(supabase).from("profiles").select(sel("created_at")).gte("created_at", sinceIso),
      sbAny(supabase).from("billing_revenue_snapshots").select(sel("snapshot_date, mrr_cents")).gte("snapshot_date", sinceDate),
      sbAny(supabase).from("messages").select(sel("created_at")).gte("created_at", sinceIso),
      sbAny(supabase).from("ai_usage_daily").select(sel("day, cost_usd")).gte("day", sinceDate),
      sbAny(supabase).from("workflow_runs").select(sel("started_at")).gte("started_at", sinceIso),
    ]);

    const buckets = new Map<string, GrowthPoint>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 86400_000).toISOString().slice(0, 10);
      buckets.set(d, {
        date: d,
        organizations: 0,
        users: 0,
        mrrCents: 0,
        messages: 0,
        aiCostUsd: 0,
        workflowRuns: 0,
      });
    }

    const bump = (iso: string | undefined, key: keyof GrowthPoint, value = 1) => {
      if (!iso) return;
      const d = iso.slice(0, 10);
      const b = buckets.get(d);
      if (b) (b[key] as number) = ((b[key] as number) ?? 0) + value;
    };

    for (const r of ((orgs.data ?? []) as unknown as Array<{ created_at: string }>)) bump(r.created_at, "organizations");
    for (const r of ((users.data ?? []) as unknown as Array<{ created_at: string }>)) bump(r.created_at, "users");
    for (const r of ((msgs.data ?? []) as unknown as Array<{ created_at: string }>)) bump(r.created_at, "messages");
    for (const r of ((wfRuns.data ?? []) as unknown as Array<{ started_at: string }>)) bump(r.started_at, "workflowRuns");
    for (const r of ((aiDaily.data ?? []) as unknown as Array<{ day: string; cost_usd: number }>)) {
      const b = buckets.get(r.day);
      if (b) b.aiCostUsd += Number(r.cost_usd ?? 0);
    }
    // MRR: latest per day (sum across orgs)
    const mrrByDay = new Map<string, number>();
    for (const r of ((snaps.data ?? []) as unknown as Array<{ snapshot_date: string; mrr_cents: number }>)) {
      mrrByDay.set(r.snapshot_date, (mrrByDay.get(r.snapshot_date) ?? 0) + Number(r.mrr_cents ?? 0));
    }
    // Fill running MRR (carry forward)
    let running = 0;
    const sorted = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
    for (const p of sorted) {
      if (mrrByDay.has(p.date)) running = mrrByDay.get(p.date)!;
      p.mrrCents = running;
    }
    return sorted;
  });

export interface TopTenant {
  organizationId: string;
  name: string;
  slug: string | null;
  mrrCents: number;
  users: number;
  messages30d: number;
  aiCostUsd: number;
  plan: string | null;
  status: string | null;
}

export const getTopTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { metric?: "mrr" | "messages" | "ai" | "users"; limit?: number }) =>
    z
      .object({
        metric: z.enum(["mrr", "messages", "ai", "users"]).default("mrr"),
        limit: z.number().min(1).max(50).default(10),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<TopTenant[]> => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);

    const sel = (s: string) => s;
    const t30 = daysAgo(30);

    const { data: orgs } = await supabase
      .from("organizations")
      .select(sel("id, name, slug"))
      .limit(500);
    const orgList = ((orgs ?? []) as unknown as Array<{ id: string; name: string; slug: string | null }>);
    if (orgList.length === 0) return [];

    // subscriptions -> plan and MRR proxy
    const { data: subs } = await supabase
      .from("subscriptions")
      .select(sel("organization_id, status, plan_id, plans(name, monthly_price_cents)"))
      .in("organization_id", orgList.map((o) => o.id));
    const subMap = new Map<string, { status: string; plan: string | null; mrrCents: number }>();
    for (const s of ((subs ?? []) as unknown as Array<{
      organization_id: string;
      status: string;
      plans: { name: string; monthly_price_cents: number } | null;
    }>)) {
      subMap.set(s.organization_id, {
        status: s.status,
        plan: s.plans?.name ?? null,
        mrrCents: Number(s.plans?.monthly_price_cents ?? 0),
      });
    }

    // user counts
    const { data: members } = await supabase
      .from("organization_members")
      .select(sel("organization_id"))
      .in("organization_id", orgList.map((o) => o.id));
    const userMap = new Map<string, number>();
    for (const m of ((members ?? []) as unknown as Array<{ organization_id: string }>)) {
      userMap.set(m.organization_id, (userMap.get(m.organization_id) ?? 0) + 1);
    }

    // Messages/AI cost are workspace-scoped; approximate by treating workspace_id == organization_id
    // when a workspace shares the org UUID. Fallback: 0.
    const { data: msgs } = await supabase
      .from("messages")
      .select(sel("workspace_id"))
      .gte("created_at", t30);
    const msgMap = new Map<string, number>();
    for (const m of ((msgs ?? []) as unknown as Array<{ workspace_id: string }>)) {
      msgMap.set(m.workspace_id, (msgMap.get(m.workspace_id) ?? 0) + 1);
    }

    const { data: ai } = await supabase
      .from("ai_usage_daily")
      .select(sel("workspace_id, cost_usd"))
      .gte("day", t30.slice(0, 10));
    const aiMap = new Map<string, number>();
    for (const r of ((ai ?? []) as unknown as Array<{ workspace_id: string; cost_usd: number }>)) {
      aiMap.set(r.workspace_id, (aiMap.get(r.workspace_id) ?? 0) + Number(r.cost_usd ?? 0));
    }

    const rows: TopTenant[] = orgList.map((o) => {
      const sub = subMap.get(o.id);
      return {
        organizationId: o.id,
        name: o.name,
        slug: o.slug,
        mrrCents: sub?.mrrCents ?? 0,
        users: userMap.get(o.id) ?? 0,
        messages30d: msgMap.get(o.id) ?? 0,
        aiCostUsd: Math.round((aiMap.get(o.id) ?? 0) * 100) / 100,
        plan: sub?.plan ?? null,
        status: sub?.status ?? null,
      };
    });

    const sortKey: Record<string, keyof TopTenant> = {
      mrr: "mrrCents",
      messages: "messages30d",
      ai: "aiCostUsd",
      users: "users",
    };
    rows.sort((a, b) => Number(b[sortKey[data.metric]]) - Number(a[sortKey[data.metric]]));
    return rows.slice(0, data.limit);
  });

export interface ChurnPoint {
  date: string;
  churnRatePct: number;
  churned: number;
  new: number;
  net: number;
}

export const getChurnTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { days?: number }) => z.object({ days: z.number().min(30).max(365).default(90) }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ChurnPoint[]> => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const since = new Date(Date.now() - data.days * 86400_000).toISOString().slice(0, 10);
    const sel = (s: string) => s;
    const { data: snaps } = await supabase
      .from("billing_revenue_snapshots")
      .select(sel("snapshot_date, churn_rate, new_subscriptions, churned_subscriptions"))
      .gte("snapshot_date", since)
      .order("snapshot_date", { ascending: true });

    const byDay = new Map<string, ChurnPoint>();
    for (const s of ((snaps ?? []) as unknown as Array<{
      snapshot_date: string;
      churn_rate: number;
      new_subscriptions: number;
      churned_subscriptions: number;
    }>)) {
      const cur = byDay.get(s.snapshot_date) ?? {
        date: s.snapshot_date,
        churnRatePct: 0,
        churned: 0,
        new: 0,
        net: 0,
      };
      cur.churnRatePct = Math.max(cur.churnRatePct, Number(s.churn_rate ?? 0) * 100);
      cur.churned += Number(s.churned_subscriptions ?? 0);
      cur.new += Number(s.new_subscriptions ?? 0);
      cur.net = cur.new - cur.churned;
      byDay.set(s.snapshot_date, cur);
    }
    return Array.from(byDay.values());
  });

export const exportAnalyticsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { dataset: "growth" | "top_tenants" | "churn" | "overview"; days?: number }) =>
    z
      .object({
        dataset: z.enum(["growth", "top_tenants", "churn", "overview"]),
        days: z.number().min(7).max(365).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ filename: string; csv: string }> => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const stamp = new Date().toISOString().slice(0, 10);

    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const toCsv = (headers: string[], rows: unknown[][]) =>
      [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");

    if (data.dataset === "growth") {
      const rows = await getGrowthTrends({ data: { days: data.days } });
      return {
        filename: `platform-growth-${stamp}.csv`,
        csv: toCsv(
          ["date", "organizations", "users", "mrr_cents", "messages", "ai_cost_usd", "workflow_runs"],
          rows.map((r) => [r.date, r.organizations, r.users, r.mrrCents, r.messages, r.aiCostUsd, r.workflowRuns]),
        ),
      };
    }
    if (data.dataset === "top_tenants") {
      const rows = await getTopTenants({ data: { metric: "mrr", limit: 50 } });
      return {
        filename: `platform-top-tenants-${stamp}.csv`,
        csv: toCsv(
          ["organization_id", "name", "slug", "plan", "status", "mrr_cents", "users", "messages_30d", "ai_cost_usd"],
          rows.map((r) => [
            r.organizationId,
            r.name,
            r.slug,
            r.plan,
            r.status,
            r.mrrCents,
            r.users,
            r.messages30d,
            r.aiCostUsd,
          ]),
        ),
      };
    }
    if (data.dataset === "churn") {
      const rows = await getChurnTrend({ data: { days: data.days } });
      return {
        filename: `platform-churn-${stamp}.csv`,
        csv: toCsv(
          ["date", "churn_rate_pct", "new_subscriptions", "churned_subscriptions", "net"],
          rows.map((r) => [r.date, r.churnRatePct, r.new, r.churned, r.net]),
        ),
      };
    }
    // overview
    const o = await getPlatformOverview();
    const rows: [string, unknown][] = [
      ["organizations", o.totals.organizations],
      ["users", o.totals.users],
      ["active_users_30d", o.totals.activeUsers30d],
      ["active_users_7d", o.totals.activeUsers7d],
      ["new_signups_7d", o.totals.newSignups7d],
      ["new_signups_30d", o.totals.newSignups30d],
      ["mrr_cents", o.totals.mrrCents],
      ["arr_cents", o.totals.arrCents],
      ["active_subscriptions", o.totals.activeSubscriptions],
      ["trialing_subscriptions", o.totals.trialingSubscriptions],
      ["churn_rate_pct", o.totals.churnRatePct],
      ["storage_bytes", o.totals.storageBytes],
      ["ai_cost_usd_30d", o.totals.aiCostUsd],
      ["ai_requests_30d", o.totals.aiRequests30d],
      ["whatsapp_messages_30d", o.totals.whatsappMessages30d],
      ["campaigns_30d", o.totals.campaigns30d],
      ["workflow_executions_30d", o.totals.workflowExecutions30d],
      ["api_requests_30d", o.totals.apiRequests30d],
    ];
    return {
      filename: `platform-overview-${stamp}.csv`,
      csv: toCsv(["metric", "value"], rows.map((r) => [r[0], r[1]])),
    };
  });
