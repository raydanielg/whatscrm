/**
 * Tenant-facing webhook management server functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

async function getOrgId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.organization_id) throw new Error("No organization for user");
  return data.organization_id as string;
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  url: z.string().url().max(2048).refine((u) => u.startsWith("https://"), "HTTPS required"),
  events: z.array(z.string().min(1).max(80)).min(1).max(100),
  headers: z.record(z.string(), z.string().max(1024)).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
  maxRetries: z.number().int().min(0).max(20).optional(),
});

export const listWebhookEndpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { endpoints: data ?? [] };
  });

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof CreateSchema>) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { randomSecret, sha256Hex } = await import("./dispatch.server");
    const { full, prefix } = randomSecret();
    const secret_hash = await sha256Hex(full);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: ep, error } = await (sbAny(supabaseAdmin).from("webhook_endpoints") as any)
      .insert({
        organization_id: orgId,
        created_by: context.userId,
        name: data.name,
        description: data.description ?? null,
        url: data.url,
        events: data.events,
        headers: data.headers ?? {},
        secret_hash,
        secret_prefix: prefix,
        timeout_ms: data.timeoutMs ?? 10000,
        max_retries: data.maxRetries ?? 8,
      })
      .select("id, name, url")
      .single();
    if (error) throw error;
    const { error: sErr } = await (sbAny(supabaseAdmin).from("webhook_endpoint_secrets") as any)
      .insert({ endpoint_id: ep.id, secret: full });
    if (sErr) throw sErr;
    return { id: ep.id, signing_secret: full }; // shown once
  });

export const updateWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: Partial<z.infer<typeof CreateSchema>> & { id: string; status?: "active"|"paused"|"disabled" }) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(500).optional(),
      url: z.string().url().max(2048).optional(),
      events: z.array(z.string()).max(100).optional(),
      headers: z.record(z.string(), z.string().max(1024)).optional(),
      timeoutMs: z.number().int().min(1000).max(30000).optional(),
      maxRetries: z.number().int().min(0).max(20).optional(),
      status: z.enum(["active", "paused", "disabled"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.url !== undefined) patch.url = data.url;
    if (data.events !== undefined) patch.events = data.events;
    if (data.headers !== undefined) patch.headers = data.headers;
    if (data.timeoutMs !== undefined) patch.timeout_ms = data.timeoutMs;
    if (data.maxRetries !== undefined) patch.max_retries = data.maxRetries;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "active") {
        patch.auto_disabled_at = null;
        patch.auto_disabled_reason = null;
        patch.consecutive_failures = 0;
      }
    }
    const { error } = await (sbAny(context.supabase).from("webhook_endpoints") as any)
      .update(patch).eq("id", data.id).eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("webhook_endpoints").delete().eq("id", data.id).eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });

export const rotateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { data: ep } = await context.supabase
      .from("webhook_endpoints").select("id").eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!ep) throw new Error("not_found");
    const { randomSecret, sha256Hex } = await import("./dispatch.server");
    const { full, prefix } = randomSecret();
    const secret_hash = await sha256Hex(full);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    await sbAny(supabaseAdmin).from("webhook_endpoints").update({
      secret_hash, secret_prefix: prefix, updated_at: new Date().toISOString(),
    }).eq("id", ep.id);
    await sbAny(supabaseAdmin).from("webhook_endpoint_secrets").upsert({
      endpoint_id: ep.id, secret: full, rotated_at: new Date().toISOString(),
    });
    return { signing_secret: full };
  });

export const testWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; eventType?: string }) =>
    z.object({ id: z.string().uuid(), eventType: z.string().max(80).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { data: ep } = await context.supabase
      .from("webhook_endpoints").select("id, max_retries")
      .eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!ep) throw new Error("not_found");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const eventId = "evt_test_" + crypto.randomUUID();
    const { data: row, error } = await supabaseAdmin
      .from("webhook_deliveries")
      .insert({
        endpoint_id: ep.id,
        organization_id: orgId,
        event_type: data.eventType ?? "webhook.test",
        event_id: eventId,
        payload: { test: true, at: new Date().toISOString(), source: "manual" },
        max_attempts: 1,
      })
      .select("id").single();
    if (error) throw error;
    return { delivery_id: row.id };
  });

export const listDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { endpointId?: string; status?: string; limit?: number }) =>
    z.object({
      endpointId: z.string().uuid().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    let q = context.supabase
      .from("webhook_deliveries")
      .select("id, endpoint_id, event_type, event_id, status, attempt, response_status, duration_ms, error_message, next_attempt_at, created_at, last_attempted_at, succeeded_at, dead_letter_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.endpointId) q = q.eq("endpoint_id", data.endpointId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { deliveries: rows ?? [] };
  });

export const getDeliveryDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { data: d1, error } = await context.supabase
      .from("webhook_deliveries").select("*")
      .eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (error) throw error;
    if (!d1) throw new Error("not_found");
    return { delivery: d1 };
  });

export const replayDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { data: orig } = await context.supabase
      .from("webhook_deliveries").select("*")
      .eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!orig) throw new Error("not_found");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: row, error } = await supabaseAdmin
      .from("webhook_deliveries")
      .insert({
        endpoint_id: orig.endpoint_id,
        organization_id: orig.organization_id,
        event_type: orig.event_type,
        event_id: orig.event_id + ".replay." + Date.now(),
        payload: orig.payload,
        max_attempts: orig.max_attempts,
        replay_of: orig.id,
      })
      .select("id").single();
    if (error) throw error;
    return { delivery_id: row.id };
  });

export const getWebhookStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await context.supabase
      .from("webhook_deliveries")
      .select("status, response_status")
      .eq("organization_id", orgId)
      .gte("created_at", since);
    const rows = data ?? [];
    const total = rows.length;
    const succeeded = rows.filter((r: any) => r.status === "succeeded").length;
    const failed = rows.filter((r: any) => r.status === "dead_letter").length;
    const pending = rows.filter((r: any) => ["pending", "delivering"].includes(r.status)).length;
    const successRate = total ? Math.round((succeeded / total) * 100) : 100;
    return { total, succeeded, failed, pending, successRate };
  });
