// BI server functions — dashboards, widgets, reports, KPIs, metrics, forecasts, exports.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ChartType, DateRange, ForecastResult, KpiDefinition, MetricKey, MetricQuery, MetricResult, WidgetType } from "./types";
import { sbAny } from "@/lib/supabase/untyped";

const uuid = z.string().uuid();
const workspaceInput = z.object({ workspaceId: uuid });

// ---------- Dashboards ----------
export const listDashboards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("bi_dashboards")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const createDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; name: string; description?: string; visibility?: "private" | "workspace" | "public"; isDefault?: boolean }) =>
    z.object({
      workspaceId: uuid, name: z.string().min(1).max(120),
      description: z.string().max(500).optional(),
      visibility: z.enum(["private","workspace","public"]).optional(),
      isDefault: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase)
      .from("bi_dashboards")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        description: data.description ?? null,
        visibility: data.visibility ?? "workspace",
        is_default: data.isDefault ?? false,
        created_by: context.userId,
      } as never).select().single();
    if (error) throw error;
    return row;
  });

export const deleteDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("bi_dashboards").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Widgets ----------
export const listWidgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { dashboardId: string }) => z.object({ dashboardId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("bi_widgets").select("*")
      .eq("dashboard_id", data.dashboardId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const upsertWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id?: string; workspaceId: string; dashboardId: string; type: WidgetType; title: string; dataSource: MetricKey; config?: Record<string, unknown>; position?: unknown; size?: unknown; refreshIntervalS?: number }) =>
    z.object({
      id: uuid.optional(),
      workspaceId: uuid, dashboardId: uuid,
      type: z.string(), title: z.string().min(1).max(120),
      dataSource: z.string(),
      config: z.record(z.unknown()).optional(),
      position: z.unknown().optional(), size: z.unknown().optional(),
      refreshIntervalS: z.number().int().min(0).max(3600).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      workspace_id: data.workspaceId,
      dashboard_id: data.dashboardId,
      type: data.type,
      title: data.title,
      data_source: data.dataSource,
      config: data.config ?? {},
      position: data.position ?? { x: 0, y: 0 },
      size: data.size ?? { w: 4, h: 3 },
      refresh_interval_s: data.refreshIntervalS ?? 60,
    };
    if (data.id) {
      const { data: row, error } = await sbAny(context.supabase).from("bi_widgets").update(payload as never).eq("id", data.id).select().single();
      if (error) throw error; return row;
    }
    const { data: row, error } = await sbAny(context.supabase).from("bi_widgets").insert(payload as never).select().single();
    if (error) throw error;
    return row;
  });

export const deleteWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("bi_widgets").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Metrics (analytics engine + cache) ----------
export const runMetricQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; query: MetricQuery; cacheTtlS?: number }) =>
    z.object({
      workspaceId: uuid,
      query: z.object({
        metric: z.string(),
        range: z.object({ preset: z.string(), from: z.string().optional(), to: z.string().optional() }),
        granularity: z.string().optional(),
        filters: z.record(z.unknown()).optional(),
        groupBy: z.array(z.string()).optional(),
      }),
      cacheTtlS: z.number().int().min(0).max(3600).optional(),
    }).parse(d) as { workspaceId: string; query: MetricQuery; cacheTtlS?: number })
  .handler(async ({ data, context }): Promise<MetricResult> => {
    // Verify workspace membership via RLS-scoped read
    const { data: member } = await sbAny(context.supabase)
      .from("workspace_members").select("workspace_id").eq("workspace_id", data.workspaceId).maybeSingle();
    if (!member) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { runMetric } = await import("./analytics-engine.server");
    const { hashParams, readCache, writeCache } = await import("./cache.server");

    const paramsHash = hashParams(data.query);
    const ttl = data.cacheTtlS ?? 60;
    if (ttl > 0) {
      const cached = await readCache<MetricResult>(supabaseAdmin, data.workspaceId, data.query.metric, paramsHash);
      if (cached) return { ...cached, fromCache: true };
    }
    const result = await runMetric(supabaseAdmin, data.workspaceId, data.query);
    if (ttl > 0) await writeCache(supabaseAdmin, data.workspaceId, data.query.metric, paramsHash, result, ttl);
    return result;
  });

// ---------- Reports ----------
export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; category?: string }) =>
    z.object({ workspaceId: uuid, category: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase).from("bi_reports").select("*").eq("workspace_id", data.workspaceId);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q.order("updated_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const upsertReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    id?: string; workspaceId: string; name: string; description?: string;
    category?: string; dataSource: string; chartType?: ChartType;
    filters?: unknown[]; columns?: unknown[]; groupBy?: unknown[];
    metrics?: unknown[]; sort?: unknown[]; dateRange?: DateRange;
    calculatedFields?: unknown[]; visibility?: "private"|"workspace"|"public";
    isFavorite?: boolean;
  }) => z.object({
    id: uuid.optional(), workspaceId: uuid, name: z.string().min(1).max(120),
    description: z.string().optional(), category: z.string().optional(),
    dataSource: z.string(), chartType: z.string().optional(),
    filters: z.array(z.unknown()).optional(),
    columns: z.array(z.unknown()).optional(),
    groupBy: z.array(z.unknown()).optional(),
    metrics: z.array(z.unknown()).optional(),
    sort: z.array(z.unknown()).optional(),
    dateRange: z.object({ preset: z.string(), from: z.string().optional(), to: z.string().optional() }).optional(),
    calculatedFields: z.array(z.unknown()).optional(),
    visibility: z.enum(["private","workspace","public"]).optional(),
    isFavorite: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload: Record<string, unknown> = {
      workspace_id: data.workspaceId, name: data.name,
      description: data.description ?? null, category: data.category ?? "general",
      data_source: data.dataSource, chart_type: data.chartType ?? "table",
      filters: data.filters ?? [], columns: data.columns ?? [],
      group_by: data.groupBy ?? [], metrics: data.metrics ?? [],
      sort: data.sort ?? [], date_range: data.dateRange ?? { preset: "last_30d" },
      calculated_fields: data.calculatedFields ?? [],
      visibility: data.visibility ?? "private",
      created_by: context.userId,
    };
    if (data.isFavorite !== undefined) payload.is_favorite = data.isFavorite;
    if (data.id) {
      const { data: row, error } = await sbAny(context.supabase).from("bi_reports").update(payload as never).eq("id", data.id).select().single();
      if (error) throw error; return row;
    }
    const { data: row, error } = await sbAny(context.supabase).from("bi_reports").insert(payload as never).select().single();
    if (error) throw error; return row;
  });

export const toggleReportFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; isFavorite: boolean }) =>
    z.object({ id: uuid, isFavorite: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase).from("bi_reports")
      .update({ is_favorite: data.isFavorite } as never).eq("id", data.id).select().single();
    if (error) throw error; return row;
  });

export const cloneReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: original, error } = await sbAny(context.supabase).from("bi_reports").select("*").eq("id", data.id).single();
    if (error || !original) throw error ?? new Error("Report not found");
    const clone = {
      workspace_id: original.workspace_id,
      name: `${original.name} (copy)`,
      description: original.description,
      category: original.category,
      data_source: original.data_source,
      chart_type: original.chart_type,
      filters: original.filters,
      columns: original.columns,
      group_by: original.group_by,
      metrics: original.metrics,
      sort: original.sort,
      date_range: original.date_range,
      calculated_fields: (original as Record<string, unknown>).calculated_fields ?? [],
      visibility: "private",
      is_favorite: false,
      created_by: context.userId,
    };
    const { data: row, error: e2 } = await sbAny(context.supabase).from("bi_reports").insert(clone as never).select().single();
    if (e2) throw e2; return row;
  });

export const deleteReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("bi_reports").delete().eq("id", data.id);
    if (error) throw error; return { ok: true };
  });

export const runReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { reportId: string; workspaceId: string }) =>
    z.object({ reportId: uuid, workspaceId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const started = Date.now();
    const { data: report, error } = await sbAny(context.supabase).from("bi_reports").select("*").eq("id", data.reportId).single();
    if (error || !report) throw error ?? new Error("Report not found");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { runMetric } = await import("./analytics-engine.server");

    // Compute all metrics referenced by report
    const metricKeys: MetricKey[] = (Array.isArray(report.metrics) && report.metrics.length > 0
      ? (report.metrics as string[])
      : [report.data_source]) as MetricKey[];

    const results = await Promise.all(metricKeys.map((m) =>
      runMetric(supabaseAdmin, data.workspaceId, {
        metric: m,
        range: report.date_range as unknown as DateRange,
      }).catch((e) => ({ metric: m, total: 0, series: [], computedAt: new Date().toISOString(), error: String(e) }))
    ));

    const rowCount = results.reduce((s, r) => s + ("series" in r ? r.series.length : 0), 0);
    await sbAny(context.supabase).from("bi_report_runs").insert(({
      workspace_id: data.workspaceId,
      report_id: data.reportId,
      status: "success", triggered_by: "manual",
      actor_user_id: context.userId,
      row_count: rowCount,
      duration_ms: Date.now() - started,
      finished_at: new Date().toISOString(),
    }) as never);

    return { report, results, durationMs: Date.now() - started };
  });

// ---------- KPIs ----------
export const listKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase).from("bi_kpis").select("*").eq("workspace_id", data.workspaceId).order("category").order("name");
    if (error) throw error;
    return rows ?? [];
  });

export const upsertKpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: Partial<KpiDefinition> & { workspaceId: string; key: string; name: string; formula: KpiDefinition["formula"] }) =>
    z.object({
      id: uuid.optional(),
      workspaceId: uuid, key: z.string().min(1).max(80), name: z.string().min(1).max(120),
      description: z.string().nullable().optional(), category: z.string().optional(),
      unit: z.enum(["count","currency","percent","duration_ms"]).optional(),
      target: z.number().nullable().optional(),
      direction: z.enum(["higher","lower","neutral"]).optional(),
      formula: z.object({ source: z.string(), aggregation: z.string().optional(), filters: z.record(z.unknown()).optional() }),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      workspace_id: data.workspaceId, key: data.key, name: data.name,
      description: data.description ?? null, category: data.category ?? "general",
      unit: data.unit ?? "count", target: data.target ?? null,
      direction: data.direction ?? "higher", formula: data.formula,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await sbAny(context.supabase).from("bi_kpis").update(payload as never).eq("id", data.id).select().single();
      if (error) throw error; return row;
    }
    const { data: row, error } = await sbAny(context.supabase).from("bi_kpis").upsert(payload as never, { onConflict: "workspace_id,key" }).select().single();
    if (error) throw error; return row;
  });

export const deleteKpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("bi_kpis").delete().eq("id", data.id);
    if (error) throw error; return { ok: true };
  });

// ---------- Scheduled Reports ----------
export const listSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("bi_scheduled_reports").select("*, bi_reports(name)")
      .eq("workspace_id", data.workspaceId).order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const upsertSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    id?: string; workspaceId: string; reportId: string; name: string;
    cron: string; timezone?: string; recipients: string[];
    format?: "pdf"|"csv"|"xlsx"|"json"; delivery?: "email"|"webhook"|"slack"|"whatsapp"|"download";
    webhookUrl?: string; enabled?: boolean;
    frequency?: "daily"|"weekly"|"monthly"|"quarterly"|"yearly"|"custom";
    whatsappRecipients?: string[];
  }) => z.object({
    id: uuid.optional(), workspaceId: uuid, reportId: uuid,
    name: z.string().min(1).max(120), cron: z.string().min(3).max(120),
    timezone: z.string().optional(),
    recipients: z.array(z.string()).max(50),
    format: z.enum(["pdf","csv","xlsx","json"]).optional(),
    delivery: z.enum(["email","webhook","slack","whatsapp","download"]).optional(),
    webhookUrl: z.string().url().optional(),
    enabled: z.boolean().optional(),
    frequency: z.enum(["daily","weekly","monthly","quarterly","yearly","custom"]).optional(),
    whatsappRecipients: z.array(z.string()).max(50).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      workspace_id: data.workspaceId, report_id: data.reportId, name: data.name,
      cron: data.cron, timezone: data.timezone ?? "UTC",
      recipients: data.recipients, format: data.format ?? "pdf",
      delivery: data.delivery ?? "email", webhook_url: data.webhookUrl ?? null,
      enabled: data.enabled ?? true, created_by: context.userId,
      frequency: data.frequency ?? null,
      whatsapp_recipients: data.whatsappRecipients ?? [],
    };
    if (data.id) {
      const { data: row, error } = await sbAny(context.supabase).from("bi_scheduled_reports").update(payload as never).eq("id", data.id).select().single();
      if (error) throw error; return row;
    }
    const { data: row, error } = await sbAny(context.supabase).from("bi_scheduled_reports").insert(payload as never).select().single();
    if (error) throw error; return row;
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("bi_scheduled_reports").delete().eq("id", data.id);
    if (error) throw error; return { ok: true };
  });

// ---------- Forecasts ----------
export const runForecastFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; metric: MetricKey; method?: "linear"|"ema"; horizonDays?: number }) =>
    z.object({
      workspaceId: uuid,
      metric: z.string(),
      method: z.enum(["linear","ema"]).optional(),
      horizonDays: z.number().int().min(1).max(365).optional(),
    }).parse(d) as { workspaceId: string; metric: MetricKey; method?: "linear"|"ema"; horizonDays?: number })
  .handler(async ({ data, context }): Promise<ForecastResult> => {
    const { data: member } = await sbAny(context.supabase)
      .from("workspace_members").select("workspace_id").eq("workspace_id", data.workspaceId).maybeSingle();
    if (!member) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { runMetric } = await import("./analytics-engine.server");
    const { runForecast } = await import("./forecast");
    const metric = await runMetric(supabaseAdmin, data.workspaceId, { metric: data.metric, range: { preset: "last_90d" }, granularity: "day" });
    const history = metric.series.map((p) => ({ t: p.t, y: p.y }));
    const result = runForecast(data.metric, history, data.method ?? "linear", data.horizonDays ?? 30);
    await sbAny(supabaseAdmin).from("bi_forecasts").upsert(({
      workspace_id: data.workspaceId, metric_key: data.metric,
      method: result.method, horizon_days: result.horizonDays,
      historical: result.historical, projection: result.projection,
      accuracy: result.accuracy ?? null,
      computed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    }) as never, { onConflict: "workspace_id,metric_key,method,horizon_days" });
    return result;
  });

// ---------- Export ----------
export const exportReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; reportId: string; format: "csv"|"json" }) =>
    z.object({ workspaceId: uuid, reportId: uuid, format: z.enum(["csv","json"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: report, error } = await sbAny(context.supabase).from("bi_reports").select("*").eq("id", data.reportId).single();
    if (error || !report) throw error ?? new Error("Report not found");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { runMetric } = await import("./analytics-engine.server");
    const metric = (report.metrics as string[])?.[0] ?? report.data_source;
    const result = await runMetric(supabaseAdmin, data.workspaceId, { metric: metric as MetricKey, range: report.date_range as unknown as DateRange });

    if (data.format === "json") {
      return { content: JSON.stringify(result, null, 2), mimeType: "application/json", filename: `${report.name}.json` };
    }
    const header = "timestamp,value\n";
    const csv = header + result.series.map((p) => `${p.t},${p.y}`).join("\n");
    return { content: csv, mimeType: "text/csv", filename: `${report.name}.csv` };
  });

// ---------- Dashboard customization (extended) ----------
export const updateDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; name?: string; description?: string | null; visibility?: "private"|"workspace"|"public"; isDefault?: boolean; icon?: string | null; tags?: string[]; layout?: Record<string, unknown> }) =>
    z.object({
      id: uuid,
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(500).nullable().optional(),
      visibility: z.enum(["private","workspace","public"]).optional(),
      isDefault: z.boolean().optional(),
      icon: z.string().max(60).nullable().optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      layout: z.record(z.unknown()).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if (data.isDefault !== undefined) patch.is_default = data.isDefault;
    if (data.icon !== undefined) patch.icon = data.icon;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.layout !== undefined) patch.layout = data.layout;
    const { data: row, error } = await sbAny(context.supabase).from("bi_dashboards").update(patch as never).eq("id", data.id).select().single();
    if (error) throw error;
    return row;
  });

export const cloneDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; name?: string; visibility?: "private"|"workspace"|"public" }) =>
    z.object({ id: uuid, name: z.string().max(120).optional(), visibility: z.enum(["private","workspace","public"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: original, error } = await sbAny(context.supabase).from("bi_dashboards").select("*").eq("id", data.id).single();
    if (error || !original) throw error ?? new Error("Dashboard not found");
    const { data: dash, error: e2 } = await sbAny(context.supabase).from("bi_dashboards").insert({
      workspace_id: original.workspace_id,
      name: data.name ?? `${original.name} (copy)`,
      description: original.description,
      layout: original.layout,
      visibility: data.visibility ?? "private",
      is_default: false,
      icon: original.icon,
      tags: original.tags,
      created_by: context.userId,
    } as never).select().single();
    if (e2 || !dash) throw e2 ?? new Error("Clone failed");

    const { data: widgets } = await sbAny(context.supabase).from("bi_widgets").select("*").eq("dashboard_id", data.id);
    if (widgets && widgets.length > 0) {
      const rows = widgets.map((w) => ({
        workspace_id: w.workspace_id, dashboard_id: dash.id, type: w.type,
        title: w.title, subtitle: w.subtitle, data_source: w.data_source,
        config: w.config, position: w.position, size: w.size,
        refresh_interval_s: w.refresh_interval_s, sort_order: w.sort_order,
      }));
      await sbAny(context.supabase).from("bi_widgets").insert(rows as never);
    }
    return dash;
  });

export const saveDashboardLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { dashboardId: string; widgets: Array<{ id: string; position: { x: number; y: number }; size: { w: number; h: number }; sortOrder: number }> }) =>
    z.object({
      dashboardId: uuid,
      widgets: z.array(z.object({
        id: uuid,
        position: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }),
        size: z.object({ w: z.number().int().min(1).max(12), h: z.number().int().min(1).max(12) }),
        sortOrder: z.number().int().min(0),
      })).max(200),
    }).parse(d))
  .handler(async ({ data, context }) => {
    // Update each widget's position/size/sort_order
    await Promise.all(data.widgets.map((w) =>
      sbAny(context.supabase).from("bi_widgets").update({
        position: w.position, size: w.size, sort_order: w.sortOrder,
      } as never).eq("id", w.id).eq("dashboard_id", data.dashboardId)
    ));
    return { ok: true, count: data.widgets.length };
  });

export const resetDashboardLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { dashboardId: string }) => z.object({ dashboardId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: widgets, error } = await sbAny(context.supabase).from("bi_widgets").select("id").eq("dashboard_id", data.dashboardId).order("created_at", { ascending: true });
    if (error) throw error;
    let x = 0; let y = 0; let idx = 0;
    const updates = (widgets ?? []).map((w) => {
      const size = { w: 4, h: 3 };
      if (x + size.w > 12) { x = 0; y += size.h; }
      const pos = { x, y };
      x += size.w;
      idx += 1;
      return { id: w.id, position: pos, size, sortOrder: idx };
    });
    await Promise.all(updates.map((u) =>
      sbAny(context.supabase).from("bi_widgets").update({ position: u.position, size: u.size, sort_order: u.sortOrder } as never).eq("id", u.id)
    ));
    await sbAny(context.supabase).from("bi_dashboards").update({ layout: { cols: 12, rowHeight: 80 } } as never).eq("id", data.dashboardId);
    return { ok: true, count: updates.length };
  });

// ---------- Download center ----------
export const listReportRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; limit?: number; status?: "pending"|"running"|"success"|"failed" }) =>
    z.object({ workspaceId: uuid, limit: z.number().int().min(1).max(500).optional(), status: z.enum(["pending","running","success","failed"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase).from("bi_report_runs")
      .select("*, bi_reports(name)")
      .eq("workspace_id", data.workspaceId)
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Workspace role helper ----------
export const getMyWorkspaceRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await sbAny(context.supabase).from("workspace_members")
      .select("role").eq("workspace_id", data.workspaceId).eq("user_id", context.userId).maybeSingle();
    return { role: (row?.role as string | undefined) ?? null };
  });

// ---------- BI Health / Status ----------
// Returns the state of the calc queue, KPI snapshot freshness, recent report runs, and
// scheduled-report backlog so the UI can prove the pipeline is healthy.
export const getBiHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const wsId = data.workspaceId;
    const [queue, latestSnap, recentRuns, dueSchedules, failedRuns] = await Promise.all([
      sbAny(context.supabase).from("bi_calc_queue").select("status", { count: "exact", head: false }).eq("workspace_id", wsId),
      sbAny(context.supabase).from("bi_kpi_snapshots").select("captured_at").eq("workspace_id", wsId).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      sbAny(context.supabase).from("bi_report_runs").select("id,status,created_at").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(20),
      sbAny(context.supabase).from("bi_scheduled_reports").select("id").eq("workspace_id", wsId).eq("enabled", true).lte("next_run_at", new Date().toISOString()),
      sbAny(context.supabase).from("bi_report_runs").select("id").eq("workspace_id", wsId).eq("status", "failed").gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
    ]);

    const counts: Record<string, number> = { queued: 0, running: 0, failed: 0, success: 0 };
    for (const r of (queue.data ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1;

    const runs = (recentRuns.data ?? []) as { status: string; created_at: string }[];
    const successRate = runs.length > 0
      ? Math.round((runs.filter((r) => r.status === "success").length / runs.length) * 100)
      : null;

    return {
      queue: counts,
      lastSnapshotAt: (latestSnap.data as { captured_at?: string } | null)?.captured_at ?? null,
      recentRunCount: runs.length,
      recentSuccessRate: successRate,
      dueSchedules: dueSchedules.data?.length ?? 0,
      failuresLast24h: failedRuns.data?.length ?? 0,
    };
  });
