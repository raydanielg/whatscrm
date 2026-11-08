import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function severityFromLevel(level: string | null | undefined) {
  const l = (level ?? "").toLowerCase();
  if (["critical", "fatal"].includes(l)) return "critical";
  if (["error", "err", "high"].includes(l)) return "error";
  if (["warn", "warning", "medium"].includes(l)) return "warn";
  if (["success", "ok"].includes(l)) return "success";
  return "info";
}

function normalizeLimit(n: number | undefined) {
  return Math.max(1, Math.min(500, n ?? 100));
}

export async function queryLogsInternal(data: any) {
  const limit = normalizeLimit(data.limit);
  const offset = Math.max(0, data.offset ?? 0);
  const q = (data.q ?? "").trim();
  const from = data.from ? new Date(data.from).toISOString() : null;
  const to = data.to ? new Date(data.to).toISOString() : null;

  let rows: any[] = [];

  switch (data.source) {
    case "audit": {
      let query = sbAny(supabaseAdmin)
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false });
      if (data.workspace_id) query = query.eq("workspace_id", data.workspace_id);
      if (data.organization_id) query = query.eq("organization_id", data.organization_id);
      if (data.actor_id) query = query.eq("actor_id", data.actor_id);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (q)
        query = query.or(
          `action.ilike.%${sanitizeSearchTerm(q)}%,resource_type.ilike.%${sanitizeSearchTerm(q)}%,resource_id.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "audit",
        timestamp: x.created_at,
        severity: "info",
        actor: x.actor_id,
        workspace_id: x.workspace_id,
        organization_id: x.organization_id,
        action: x.action,
        resource: x.resource_type
          ? `${x.resource_type}${x.resource_id ? ":" + x.resource_id : ""}`
          : null,
        ip: x.ip_address,
        user_agent: x.user_agent,
        message: null,
        meta: { changes: x.changes, metadata: x.metadata },
      }));
      break;
    }
    case "auth": {
      let query = sbAny(supabaseAdmin)
        .from("login_history")
        .select("*")
        .order("created_at", { ascending: false });
      if (data.actor_id) query = query.eq("user_id", data.actor_id);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (q)
        query = query.or(
          `event.ilike.%${sanitizeSearchTerm(q)}%,device.ilike.%${sanitizeSearchTerm(q)}%,failure_reason.ilike.%${sanitizeSearchTerm(q)}%,location.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "auth",
        timestamp: x.created_at,
        severity: x.event === "failed" ? "warn" : x.event === "success" ? "success" : "info",
        actor: x.user_id,
        workspace_id: null,
        organization_id: null,
        action: x.event,
        resource: x.device ?? null,
        ip: x.ip_address,
        user_agent: x.user_agent,
        message: x.failure_reason ?? x.location ?? null,
        meta: { metadata: x.metadata, location: x.location },
      }));
      break;
    }
    case "security": {
      let query = sbAny(supabaseAdmin)
        .from("security_events")
        .select("*")
        .order("created_at", { ascending: false });
      if (data.workspace_id) query = query.eq("workspace_id", data.workspace_id);
      if (data.actor_id) query = query.eq("actor_id", data.actor_id);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (q)
        query = query.or(
          `event_type.ilike.%${sanitizeSearchTerm(q)}%,resource_type.ilike.%${sanitizeSearchTerm(q)}%,resource_id.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "security",
        timestamp: x.created_at,
        severity: severityFromLevel(x.severity),
        actor: x.actor_id,
        workspace_id: x.workspace_id,
        organization_id: null,
        action: x.event_type,
        resource: x.resource_type
          ? `${x.resource_type}${x.resource_id ? ":" + x.resource_id : ""}`
          : null,
        ip: x.ip_address,
        user_agent: x.user_agent,
        message: null,
        meta: { data: x.data },
      }));
      break;
    }
    case "billing": {
      let query = sbAny(supabaseAdmin)
        .from("billing_events")
        .select("*")
        .order("created_at", { ascending: false });
      if (data.organization_id) query = query.eq("organization_id", data.organization_id);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (q)
        query = query.or(
          `event_type.ilike.%${sanitizeSearchTerm(q)}%,provider.ilike.%${sanitizeSearchTerm(q)}%,provider_event_id.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "billing",
        timestamp: x.created_at,
        severity: x.error ? "error" : "info",
        actor: null,
        workspace_id: null,
        organization_id: x.organization_id,
        action: x.event_type,
        resource: x.invoice_id
          ? `invoice:${x.invoice_id}`
          : x.subscription_id
            ? `subscription:${x.subscription_id}`
            : null,
        ip: null,
        user_agent: null,
        message: x.error ?? null,
        meta: { provider: x.provider, payload: x.payload },
      }));
      break;
    }
    case "payment": {
      let query = sbAny(supabaseAdmin)
        .from("billing_payment_attempts")
        .select("*")
        .order("created_at", { ascending: false });
      if (data.organization_id) query = query.eq("organization_id", data.organization_id);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (q)
        query = query.or(
          `provider.ilike.%${sanitizeSearchTerm(q)}%,status.ilike.%${sanitizeSearchTerm(q)}%,failure_code.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "payment",
        timestamp: x.created_at,
        severity: x.status === "failed" ? "error" : x.status === "succeeded" ? "success" : "info",
        actor: null,
        workspace_id: null,
        organization_id: x.organization_id,
        action: `payment.${x.status}`,
        resource: x.invoice_id ? `invoice:${x.invoice_id}` : null,
        ip: null,
        user_agent: null,
        message: x.failure_message ?? null,
        meta: { provider: x.provider, amount_cents: x.amount_cents, currency: x.currency },
      }));
      break;
    }
    case "api": {
      let query = sbAny(supabaseAdmin)
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false });
      if (data.organization_id) query = query.eq("organization_id", data.organization_id);
      if (data.actor_id) query = query.eq("created_by", data.actor_id);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (q)
        query = query.or(
          `name.ilike.%${sanitizeSearchTerm(q)}%,prefix.ilike.%${sanitizeSearchTerm(q)}%,description.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "api",
        timestamp: x.created_at,
        severity: x.revoked_at ? "warn" : "info",
        actor: x.created_by,
        workspace_id: null,
        organization_id: x.organization_id,
        action: x.revoked_at ? "api_key.revoked" : "api_key.created",
        resource: `${x.prefix}***`,
        ip: null,
        user_agent: null,
        message: x.description ?? null,
        meta: { scopes: x.scopes, last_used_at: x.last_used_at, expires_at: x.expires_at },
      }));
      break;
    }
    case "webhook": {
      let query = sbAny(supabaseAdmin)
        .from("webhook_events")
        .select("*")
        .order("received_at", { ascending: false });
      if (data.workspace_id) query = query.eq("workspace_id", data.workspace_id);
      if (from) query = query.gte("received_at", from);
      if (to) query = query.lte("received_at", to);
      if (q)
        query = query.or(
          `event_type.ilike.%${sanitizeSearchTerm(q)}%,provider.ilike.%${sanitizeSearchTerm(q)}%,last_error.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "webhook",
        timestamp: x.received_at,
        severity: x.last_error ? "error" : x.processed ? "success" : "info",
        actor: null,
        workspace_id: x.workspace_id,
        organization_id: null,
        action: x.event_type,
        resource: x.provider,
        ip: null,
        user_agent: null,
        message: x.last_error ?? null,
        meta: { attempts: x.attempts, signature_valid: x.signature_valid, processed: x.processed },
      }));
      break;
    }
    case "ai": {
      let query = sbAny(supabaseAdmin)
        .from("ai_request_logs")
        .select("*")
        .order("created_at", { ascending: false });
      if (data.workspace_id) query = query.eq("workspace_id", data.workspace_id);
      if (data.actor_id) query = query.eq("user_id", data.actor_id);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (q)
        query = query.or(
          `operation.ilike.%${sanitizeSearchTerm(q)}%,model.ilike.%${sanitizeSearchTerm(q)}%,error_message.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "ai",
        timestamp: x.created_at,
        severity: x.status === "error" ? "error" : "info",
        actor: x.user_id,
        workspace_id: x.workspace_id,
        organization_id: null,
        action: x.operation,
        resource: x.model ?? x.provider_id ?? null,
        ip: null,
        user_agent: null,
        message: x.error_message ?? null,
        meta: { total_tokens: x.total_tokens, latency_ms: x.latency_ms, cost_usd: x.cost_usd },
      }));
      break;
    }
    case "workflow": {
      let query = sbAny(supabaseAdmin)
        .from("workflow_run_steps")
        .select("*")
        .order("started_at", { ascending: false });
      if (data.workspace_id) query = query.eq("workspace_id", data.workspace_id);
      if (from) query = query.gte("started_at", from);
      if (to) query = query.lte("started_at", to);
      if (q)
        query = query.or(
          `node_type.ilike.%${sanitizeSearchTerm(q)}%,status.ilike.%${sanitizeSearchTerm(q)}%,run_id.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "workflow",
        timestamp: x.started_at,
        severity: x.status === "failed" ? "error" : x.status === "completed" ? "success" : "info",
        actor: null,
        workspace_id: x.workspace_id,
        organization_id: null,
        action: `${x.node_type}.${x.status}`,
        resource: `run:${x.run_id}`,
        ip: null,
        user_agent: null,
        message: x.error ? JSON.stringify(x.error) : null,
        meta: { node_id: x.node_id, attempts: x.attempts, duration_ms: x.duration_ms },
      }));
      break;
    }
    case "provider": {
      let query = sbAny(supabaseAdmin)
        .from("provider_logs")
        .select("*")
        .order("created_at", { ascending: false });
      if (data.workspace_id) query = query.eq("workspace_id", data.workspace_id);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (q)
        query = query.or(
          `scope.ilike.%${sanitizeSearchTerm(q)}%,message.ilike.%${sanitizeSearchTerm(q)}%,provider.ilike.%${sanitizeSearchTerm(q)}%`,
        );
      query = query.range(offset, offset + limit - 1);
      const { data: r, error } = await query;
      if (error) throw new Error(error.message);
      rows = (r ?? []).map((x: any) => ({
        id: x.id,
        source: "provider",
        timestamp: x.created_at,
        severity: severityFromLevel(x.level),
        actor: null,
        workspace_id: x.workspace_id,
        organization_id: null,
        action: x.scope,
        resource: x.provider ?? x.channel_account_id ?? null,
        ip: null,
        user_agent: null,
        message: x.message,
        meta: { data: x.data, correlation_id: x.correlation_id },
      }));
      break;
    }
    default:
      // Unknown source — return empty rather than throwing.
      break;
  }

  if (data.severity) {
    const wanted = data.severity === "warning" ? "warn" : data.severity;
    rows = rows.filter((r) => r.severity === wanted);
  }

  return { rows, offset, limit };
}
