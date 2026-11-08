// Executive Dashboard aggregate server functions.
// Returns system-wide metrics not covered by the analytics engine:
// response/resolution times, storage, API usage, subscription, system health, activity feed.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { formatMoney } from "@/lib/currency/format";

const uuid = z.string().uuid();

export interface ExecutiveOverview {
  responseTime: { avgFirstResponseMs: number; avgResolutionMs: number; slaBreaches: number };
  customers: { total: number; new30d: number };
  deals: { won30d: number; lost30d: number; winRate: number };
  storage: { totalBytes: number; fileCount: number };
  api: { requests24h: number; requests30d: number; errorRate: number };
  subscription: {
    status: string | null;
    plan: string | null;
    seats: number | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
  };
  systemHealth: {
    dbStatus: "healthy" | "degraded" | "down";
    queueBacklog: number;
    failedWorkflows24h: number;
    failedMessages24h: number;
    aiProviderIssues: number;
    lastCheckedAt: string;
  };
}

export interface ActivityFeedItem {
  id: string;
  type: "message" | "deal" | "lead" | "contact" | "workflow" | "campaign";
  title: string;
  subtitle?: string;
  status?: string;
  createdAt: string;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

export const getExecutiveOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => z.object({ workspaceId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<ExecutiveOverview> => {
    const { data: ws } = await context.supabase
      .from("workspaces")
      .select("id, organization_id, plan")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (!ws) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const wsId = data.workspaceId;
    const orgId = (ws as { organization_id: string | null }).organization_id;
    const since30 = daysAgo(30);
    const since24h = daysAgo(1);

    const [
      slaRows,
      convResolved,
      contactsTotal,
      contactsNew,
      dealsWon,
      dealsLost,
      files,
      aiReq24h,
      aiReq30d,
      aiErrors,
      subRow,
      queueRows,
      failedWf,
      failedMsg,
      providerHealth,
    ] = await Promise.all([
      supabaseAdmin
        .from("conversation_sla")
        .select("started_at, first_response_at, first_response_breached_at, resolution_breached_at")
        .eq("workspace_id", wsId)
        .gte("started_at", since30)
        .limit(5000),
      supabaseAdmin
        .from("conversations")
        .select("created_at, resolved_at")
        .eq("workspace_id", wsId)
        .not("resolved_at", "is", null)
        .gte("resolved_at", since30)
        .limit(5000),
      sbAny(supabaseAdmin).from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", wsId),
      sbAny(supabaseAdmin).from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).gte("created_at", since30),
      sbAny(supabaseAdmin).from("deals").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "won").gte("closed_at", since30),
      sbAny(supabaseAdmin).from("deals").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "lost").gte("closed_at", since30),
      sbAny(supabaseAdmin).from("files").select("size_bytes").eq("workspace_id", wsId).limit(50000),
      sbAny(supabaseAdmin).from("ai_request_logs").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).gte("created_at", since24h),
      sbAny(supabaseAdmin).from("ai_request_logs").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).gte("created_at", since30),
      sbAny(supabaseAdmin).from("ai_request_logs").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "error").gte("created_at", since24h),
      orgId
        ? sbAny(supabaseAdmin).from("subscriptions").select("status, seats, current_period_end, trial_ends_at, plans(name)").eq("organization_id", orgId).maybeSingle()
        : Promise.resolve({ data: null } as { data: null }),
      sbAny(supabaseAdmin).from("workflow_queue").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).in("status", ["queued", "running"]),
      sbAny(supabaseAdmin).from("workflow_runs").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "failed").gte("created_at", since24h),
      sbAny(supabaseAdmin).from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "failed").gte("created_at", since24h),
      sbAny(supabaseAdmin).from("ai_provider_health").select("id", { count: "exact", head: true }).eq("status", "degraded"),
    ]);

    // avg first response
    let frSum = 0, frN = 0, breaches = 0;
    for (const r of (slaRows.data ?? []) as Array<{ started_at: string; first_response_at: string | null; first_response_breached_at: string | null; resolution_breached_at: string | null }>) {
      if (r.first_response_at) {
        frSum += new Date(r.first_response_at).getTime() - new Date(r.started_at).getTime();
        frN++;
      }
      if (r.first_response_breached_at || r.resolution_breached_at) breaches++;
    }
    let resSum = 0, resN = 0;
    for (const r of (convResolved.data ?? []) as Array<{ created_at: string; resolved_at: string }>) {
      resSum += new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime();
      resN++;
    }

    const won = dealsWon.count ?? 0;
    const lost = dealsLost.count ?? 0;
    const totalFiles = (files.data ?? []) as Array<{ size_bytes: number | null }>;
    const totalBytes = totalFiles.reduce((s, f) => s + Number(f.size_bytes ?? 0), 0);
    const ai24 = aiReq24h.count ?? 0;
    const aiErr = aiErrors.count ?? 0;
    const queueBacklog = queueRows.count ?? 0;
    const failedMsgs = failedMsg.count ?? 0;
    const wfFailed = failedWf.count ?? 0;
    const providerIssues = providerHealth.count ?? 0;

    const dbStatus: ExecutiveOverview["systemHealth"]["dbStatus"] =
      queueBacklog > 500 || failedMsgs > 100 || wfFailed > 50
        ? "degraded"
        : "healthy";

    const sub = (subRow as { data: { status: string | null; seats: number | null; current_period_end: string | null; trial_ends_at: string | null; plans: { name: string } | { name: string }[] | null } | null }).data;
    const planFromSub = sub?.plans ? (Array.isArray(sub.plans) ? sub.plans[0]?.name : sub.plans.name) : null;

    return {
      responseTime: {
        avgFirstResponseMs: frN ? Math.round(frSum / frN) : 0,
        avgResolutionMs: resN ? Math.round(resSum / resN) : 0,
        slaBreaches: breaches,
      },
      customers: { total: contactsTotal.count ?? 0, new30d: contactsNew.count ?? 0 },
      deals: {
        won30d: won,
        lost30d: lost,
        winRate: won + lost > 0 ? (won / (won + lost)) * 100 : 0,
      },
      storage: { totalBytes, fileCount: totalFiles.length },
      api: {
        requests24h: ai24,
        requests30d: aiReq30d.count ?? 0,
        errorRate: ai24 > 0 ? (aiErr / ai24) * 100 : 0,
      },
      subscription: {
        status: sub?.status ?? null,
        plan: planFromSub ?? (ws as { plan: string | null }).plan ?? null,
        seats: sub?.seats ?? null,
        currentPeriodEnd: sub?.current_period_end ?? null,
        trialEndsAt: sub?.trial_ends_at ?? null,
      },
      systemHealth: {
        dbStatus,
        queueBacklog,
        failedWorkflows24h: wfFailed,
        failedMessages24h: failedMsgs,
        aiProviderIssues: providerIssues,
        lastCheckedAt: new Date().toISOString(),
      },
    };
  });

export const getActivityFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; limit?: number }) =>
    z.object({ workspaceId: uuid, limit: z.number().int().min(1).max(50).optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ActivityFeedItem[]> => {
    const { data: member } = await context.supabase
      .from("workspace_members").select("workspace_id").eq("workspace_id", data.workspaceId).maybeSingle();
    if (!member) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const wsId = data.workspaceId;
    const lim = data.limit ?? 20;

    const [msgs, deals, leads, contacts, runs] = await Promise.all([
      sbAny(supabaseAdmin).from("messages").select("id, created_at, direction, status, body").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(lim),
      sbAny(supabaseAdmin).from("deals").select("id, created_at, title, status, amount, currency").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(lim),
      sbAny(supabaseAdmin).from("leads").select("id, created_at, full_name, status").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(lim),
      sbAny(supabaseAdmin).from("contacts").select("id, created_at, first_name, last_name").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(lim),
      sbAny(supabaseAdmin).from("workflow_runs").select("id, started_at, status, automation_id").eq("workspace_id", wsId).order("started_at", { ascending: false }).limit(lim),
    ]);

    const items: ActivityFeedItem[] = [];
    for (const m of (msgs.data ?? []) as Array<{ id: string; created_at: string; direction: string; status: string; body: string | null }>) {
      items.push({ id: `msg-${m.id}`, type: "message", title: m.direction === "outbound" ? "Outgoing message" : "Incoming message", subtitle: (m.body ?? "").slice(0, 80), status: m.status, createdAt: m.created_at });
    }
    for (const d of (deals.data ?? []) as Array<{ id: string; created_at: string; title: string; status: string; amount: number | null; currency: string | null }>) {
      // The deal's own currency, not a hardcoded dollar sign.
      items.push({ id: `deal-${d.id}`, type: "deal", title: d.title, subtitle: d.amount ? formatMoney(Number(d.amount), d.currency) : undefined, status: d.status, createdAt: d.created_at });
    }
    for (const l of (leads.data ?? []) as Array<{ id: string; created_at: string; full_name: string | null; status: string }>) {
      items.push({ id: `lead-${l.id}`, type: "lead", title: l.full_name ?? "New lead", status: l.status, createdAt: l.created_at });
    }
    for (const c of (contacts.data ?? []) as Array<{ id: string; created_at: string; first_name: string | null; last_name: string | null }>) {
      items.push({ id: `contact-${c.id}`, type: "contact", title: [c.first_name, c.last_name].filter(Boolean).join(" ") || "New contact", createdAt: c.created_at });
    }
    for (const r of (runs.data ?? []) as Array<{ id: string; started_at: string; status: string; automation_id: string }>) {
      items.push({ id: `run-${r.id}`, type: "workflow", title: "Workflow run", status: r.status, createdAt: r.started_at });
    }
    return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, lim);
  });
