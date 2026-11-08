// Server-only: fetch rows for each supported dataset using a caller-scoped Supabase client.
// The caller's client (RLS) is passed in so exports never exceed the user's permissions.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportDataset, ExportFilters } from "./types";
import { sbAny } from "@/lib/supabase/untyped";

export interface DatasetResult {
  columns: string[];
  rows: Record<string, unknown>[];
  title: string;
}

const DEFAULT_LIMIT = 5000;

type Selector = {
  table: string;
  columns: string[];
  title: string;
  order?: { column: string; ascending?: boolean };
};

const SELECTORS: Record<Exclude<ExportDataset, "report">, Selector> = {
  crm_contacts: {
    table: "contacts",
    columns: ["id", "first_name", "last_name", "email", "phone", "company_name", "lifecycle_stage", "owner_id", "created_at"],
    title: "Contacts",
    order: { column: "created_at", ascending: false },
  },
  crm_companies: {
    table: "companies",
    columns: ["id", "name", "domain", "industry", "employee_count", "annual_revenue", "owner_id", "created_at"],
    title: "Companies",
    order: { column: "created_at", ascending: false },
  },
  crm_deals: {
    table: "deals",
    columns: ["id", "name", "amount", "currency", "stage_id", "probability", "expected_close_date", "owner_id", "status", "created_at"],
    title: "Deals",
    order: { column: "created_at", ascending: false },
  },
  crm_leads: {
    table: "leads",
    columns: ["id", "first_name", "last_name", "email", "phone", "source", "status", "score", "owner_id", "created_at"],
    title: "Leads",
    order: { column: "created_at", ascending: false },
  },
  campaigns: {
    table: "campaigns",
    columns: ["id", "name", "channel", "status", "sent_count", "delivered_count", "read_count", "reply_count", "scheduled_at", "created_at"],
    title: "Campaigns",
    order: { column: "created_at", ascending: false },
  },
  conversations: {
    table: "conversations",
    columns: ["id", "contact_id", "channel", "status", "priority", "assigned_to", "last_message_at", "created_at"],
    title: "Conversations",
    order: { column: "last_message_at", ascending: false },
  },
  messages: {
    table: "messages",
    columns: ["id", "conversation_id", "direction", "sender_id", "body", "status", "created_at"],
    title: "Messages",
    order: { column: "created_at", ascending: false },
  },
  tasks: {
    table: "tasks",
    columns: ["id", "title", "status", "priority", "due_date", "assigned_to", "created_at"],
    title: "Tasks",
    order: { column: "created_at", ascending: false },
  },
  activities: {
    table: "activities",
    columns: ["id", "type", "subject", "user_id", "entity_type", "entity_id", "created_at"],
    title: "Activity Feed",
    order: { column: "created_at", ascending: false },
  },
};

export async function fetchDataset(
  supabase: SupabaseClient,
  workspaceId: string,
  dataset: ExportDataset,
  filters: ExportFilters,
  reportId?: string | null,
): Promise<DatasetResult> {
  if (dataset === "report") {
    if (!reportId) return { columns: ["message"], rows: [{ message: "No report selected" }], title: "Report" };
    const { data: report } = await sbAny(supabase).from("bi_reports").select("id,name,definition").eq("id", reportId).maybeSingle();
    const runResp = await supabase
      .from("bi_report_runs")
      .select("result, created_at")
      .eq("report_id", reportId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const result = (runResp.data?.result ?? null) as { columns?: string[]; rows?: Record<string, unknown>[] } | null;
    if (result?.rows?.length) {
      return { columns: result.columns ?? Object.keys(result.rows[0] ?? {}), rows: result.rows, title: report?.name ?? "Report" };
    }
    return { columns: ["info"], rows: [{ info: "This report has not been run yet." }], title: report?.name ?? "Report" };
  }

  const sel = SELECTORS[dataset];
  const limit = Math.min(Math.max(Number(filters.limit) || DEFAULT_LIMIT, 1), 50000);
  let q = sbAny(supabase).from(sel.table).select(sel.columns.join(",")).eq("workspace_id", workspaceId).limit(limit);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  if (filters.status && sel.columns.includes("status")) q = q.eq("status", filters.status as string);
  if (sel.order) q = q.order(sel.order.column, { ascending: sel.order.ascending ?? false });
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { columns: sel.columns, rows, title: sel.title };
}
