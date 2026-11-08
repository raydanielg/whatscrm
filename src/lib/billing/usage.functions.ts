/**
 * Usage Metering Server Functions
 * Realtime usage calculation + threshold alert management.
 *
 * Notes:
 * - Operational tables (messages, contacts, campaigns, workflow_runs, ai_request_logs)
 *   are keyed by workspace_id. Billing/organization scope uses organization_id.
 *   In this app, a workspace and organization map 1:1 for the caller's active org.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const orgInput = z.object({ organization_id: z.string().uuid() });

export type UsageMeterRow = {
  code: string;
  name: string;
  unit: string;
  used: number;
  included: number | null;
  hard_limit: number | null;
  percent: number | null;
  period_start: string | null;
  period_end: string | null;
};

export const getUsageSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => orgInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const orgId = data.organization_id;
    // Treat organization_id as the workspace_id for operational tables.
    const wsId = orgId;

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

    const subRes = await supabase
      .from("subscriptions")
      .select("current_period_start, current_period_end, plan_id")
      .eq("organization_id", orgId)
      .maybeSingle();

    const periodStart = subRes.data?.current_period_start ?? monthStart;
    const periodEnd = subRes.data?.current_period_end ?? monthEnd;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [
      membersRes,
      activeUsersRes,
      contactsRes,
      channelsRes,
      msgsSentRes,
      msgsRecvRes,
      broadcastRes,
      campaignsRes,
      aiRequestsRes,
      aiTokensRes,
      apiCallsRes,
      workflowRunsRes,
      filesRes,
      quotasRes,
    ] = await Promise.all([
      sbAny(supabase).from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase
        .from("audit_logs")
        .select("actor_id")
        .eq("organization_id", orgId)
        .gte("created_at", thirtyDaysAgo),

      sbAny(supabase).from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", wsId),
      sbAny(supabase).from("channel_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", wsId),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("direction", "outbound")
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("direction", "inbound")
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd),
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd),
      supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd),
      supabase
        .from("ai_request_logs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd),
      supabase
        .from("ai_request_logs")
        .select("total_tokens")
        .eq("workspace_id", wsId)
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd),
      supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd),
      supabase
        .from("workflow_runs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .gte("started_at", periodStart)
        .lt("started_at", periodEnd),
      sbAny(supabase).from("files").select("size_bytes").eq("organization_id", orgId),
      supabase
        .from("tenant_quotas")
        .select("meter_code, used, included, hard_limit, period_start, period_end")
        .eq("organization_id", orgId)
        .lte("period_start", now.toISOString())
        .gt("period_end", now.toISOString()),
    ]);

    const activeUserIds = new Set<string>();
    for (const r of (activeUsersRes.data ?? []) as Array<{ actor_id: string | null }>) {
      if (r.actor_id) activeUserIds.add(r.actor_id);
    }

    const totalTokens = ((aiTokensRes.data ?? []) as Array<{ total_tokens: number | null }>).reduce(
      (s, r) => s + Number(r.total_tokens ?? 0),
      0,
    );
    const totalBytes = ((filesRes.data ?? []) as Array<{ size_bytes: number | null }>).reduce(
      (s, r) => s + Number(r.size_bytes ?? 0),
      0,
    );

    const eventsRes = await supabase
      .from("usage_events")
      .select("meter_code, quantity")
      .eq("organization_id", orgId)
      .gte("occurred_at", periodStart)
      .lt("occurred_at", periodEnd);
    const eventTotals = new Map<string, number>();
    for (const r of eventsRes.data ?? []) {
      eventTotals.set(r.meter_code, (eventTotals.get(r.meter_code) ?? 0) + Number(r.quantity ?? 0));
    }

    const realtimeUsed: Record<string, number> = {
      workspace_members: membersRes.count ?? 0,
      active_users: activeUserIds.size,
      contacts: contactsRes.count ?? 0,
      whatsapp_numbers: channelsRes.count ?? 0,
      messages_sent: msgsSentRes.count ?? 0,
      messages_received: msgsRecvRes.count ?? 0,
      broadcast_messages: broadcastRes.count ?? 0,
      campaigns_launched: campaignsRes.count ?? 0,
      campaigns_sent: campaignsRes.count ?? 0,
      ai_requests: aiRequestsRes.count ?? 0,
      ai_tokens: totalTokens,
      api_calls: apiCallsRes.count ?? 0,
      workflow_executions: workflowRunsRes.count ?? 0,
      automation_runs: workflowRunsRes.count ?? 0,
      media_storage_bytes: totalBytes,
      storage_bytes: totalBytes,
      bandwidth_bytes: eventTotals.get("bandwidth_bytes") ?? 0,
      seats: membersRes.count ?? 0,
    };

    const metersRes = await sbAny(supabase).from("usage_meters").select("code, name, unit").eq("is_active", true);
    const quotaByMeter = new Map<string, { used: number; included: number | null; hard_limit: number | null; period_start: string; period_end: string }>();
    for (const q of quotasRes.data ?? []) {
      quotaByMeter.set(q.meter_code, {
        used: Number(q.used ?? 0),
        included: q.included != null ? Number(q.included) : null,
        hard_limit: q.hard_limit != null ? Number(q.hard_limit) : null,
        period_start: q.period_start,
        period_end: q.period_end,
      });
    }

    const rows: UsageMeterRow[] = ((metersRes.data ?? []) as Array<{ code: string; name: string; unit: string }>).map(
      (m) => {
        const q = quotaByMeter.get(m.code);
        const used = realtimeUsed[m.code] ?? (q?.used ?? 0);
        const included = q?.included ?? null;
        const hard_limit = q?.hard_limit ?? null;
        const cap = hard_limit ?? included;
        const percent = cap && cap > 0 ? Math.min(100, (used / cap) * 100) : null;
        return {
          code: m.code,
          name: m.name,
          unit: m.unit,
          used,
          included,
          hard_limit,
          percent,
          period_start: q?.period_start ?? periodStart,
          period_end: q?.period_end ?? periodEnd,
        };
      },
    );

    return { period_start: periodStart, period_end: periodEnd, meters: rows };
  });

export const listUsageAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => orgInput.parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("usage_alerts")
      .select("*")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

const alertInput = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  meter_code: z.string().min(1),
  threshold_type: z.enum(["percent", "absolute"]).default("percent"),
  threshold_value: z.number().positive(),
  notify_emails: z.array(z.string().email()).default([]),
  notify_in_app: z.boolean().default(true),
  block_on_exceed: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const upsertUsageAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => alertInput.parse(v))
  .handler(async ({ data, context }) => {
    const payload = { ...data, created_by: context.userId };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("usage_alerts")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("usage_alerts")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteUsageAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("usage_alerts").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const evaluateUsageAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => orgInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [alertsRes, summary] = await Promise.all([
      supabase
        .from("usage_alerts")
        .select("*")
        .eq("organization_id", data.organization_id)
        .eq("is_active", true),
      getUsageSummary({ data: { organization_id: data.organization_id } }),
    ]);
    if (alertsRes.error) throw alertsRes.error;
    const meterMap = new Map(summary.meters.map((m) => [m.code, m]));
    const triggered: Array<{ alert: (typeof alertsRes.data)[number]; meter: UsageMeterRow; value: number }> = [];
    for (const a of alertsRes.data ?? []) {
      const meter = meterMap.get(a.meter_code);
      if (!meter) continue;
      const cap = meter.hard_limit ?? meter.included;
      let hit = false;
      let currentValue = meter.used;
      if (a.threshold_type === "percent") {
        if (!cap || cap <= 0) continue;
        const pct = (meter.used / cap) * 100;
        currentValue = pct;
        hit = pct >= Number(a.threshold_value);
      } else {
        hit = meter.used >= Number(a.threshold_value);
      }
      if (hit) {
        triggered.push({ alert: a, meter, value: currentValue });
        if (
          !a.last_triggered_at ||
          new Date(a.last_triggered_at).getTime() < Date.now() - 60 * 60 * 1000
        ) {
          if (a.notify_in_app) {
            const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
            const { error: notificationError } = await sbAny(supabaseAdmin).from("notifications").insert({
              user_id: userId,
              organization_id: data.organization_id,
              channel: "in_app",
              title: `Usage alert: ${meter.name}`,
              body: `${meter.name} reached ${a.threshold_type === "percent" ? currentValue.toFixed(1) + "%" : currentValue.toLocaleString()} of your limit.`,
              category: "usage_alert",
              action_url: "/usage",
              data: { meter_code: a.meter_code, threshold: a.threshold_value },
            });
            if (notificationError) throw new Error(`Usage notification failed: ${notificationError.message}`);
          }
          const { error: updateError } = await supabase
            .from("usage_alerts")
            .update({ last_triggered_at: new Date().toISOString(), last_triggered_value: currentValue })
            .eq("id", a.id);
          if (updateError) throw updateError;
        }
      }
    }
    return { triggered_count: triggered.length, triggered };
  });
