/**
 * Calendar Integrations — server functions
 *
 * Manage calendar_accounts: list, connect, disconnect, choose calendar,
 * trigger sync, view sync log. Google and Microsoft OAuth use app-owned callbacks.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";


export const listCalendarAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await sbAny(context.supabase)
      .from("calendar_accounts")
      .select("id,provider,account_email,display_name,calendar_id,color,enabled,is_primary,sync_direction,status,last_synced_at,last_sync_error,ics_url,scopes")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listSyncLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId?: string; limit?: number }) => data)
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase)
      .from("calendar_sync_log")
      .select("id,account_id,direction,operation,status,message,created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(200, data.limit ?? 50));
    if (data.accountId) q = q.eq("account_id", data.accountId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Start app-owned OAuth for Google or Microsoft Calendar. */
export const startCalendarOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { provider: "google" | "microsoft"; targetOrigin: string }) => data)
  .handler(async ({ data, context }) => {
      const origin = new URL(data.targetOrigin).origin;
      const canonical = new URL(process.env.APP_ORIGIN || (await import("@tanstack/react-start/server")).getRequest().url).origin;
      if (origin !== data.targetOrigin || origin !== canonical) throw new Error("Open the application at APP_ORIGIN before connecting a calendar");
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { data: member, error: memberError } = await sbAny(supabaseAdmin).from("workspace_members")
        .select("workspace_id").eq("user_id", context.userId).limit(1).maybeSingle();
      if (memberError || !member) throw new Error("No workspace found");
      const { randomUUID } = await import("node:crypto");
      const state = randomUUID();
      const authorizationUrl = data.provider === "google"
        ? await (await import("@/lib/integrations/google-oauth.server")).googleCalendarAuthorizationUrl(origin, state)
        : (await import("@/lib/integrations/microsoft-calendar-oauth.server")).microsoftCalendarAuthorizationUrl(origin, state);
      const { error } = await sbAny(supabaseAdmin).from("integration_oauth_states").insert({
        state, provider_id: `${data.provider}-calendar`, workspace_id: member.workspace_id,
        user_id: context.userId, return_origin: origin,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) throw new Error(error.message);
      return { authorizationUrl };
  });

/** Register an Apple / ICS feed URL — no OAuth involved. */
export const connectIcsFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({
    account_email: z.string().min(1).max(200),
    display_name: z.string().max(200).optional(),
    ics_url: z.string().url(),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: ws } = await supabaseAdmin
      .from("workspace_members").select("workspace_id").eq("user_id", context.userId).limit(1).maybeSingle();
    if (!ws) throw new Error("No workspace found");
    const { data: row, error } = await sbAny(supabaseAdmin).from("calendar_accounts").insert({
      workspace_id: (ws as { workspace_id: string }).workspace_id,
      user_id: context.userId,
      provider: "apple",
      account_email: data.account_email,
      display_name: data.display_name ?? "Apple Calendar",
      ics_url: data.ics_url,
      sync_direction: "inbound",
      status: "connected",
      enabled: true,
    }).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const setActiveCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId: string; calendarId: string; displayName?: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("calendar_accounts")
      .update({ calendar_id: data.calendarId, display_name: data.displayName ?? null })
      .eq("id", data.accountId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleCalendarAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId: string; enabled?: boolean; sync_direction?: "inbound" | "outbound" | "bidirectional" }) => data)
  .handler(async ({ data, context }) => {
    const update: { enabled?: boolean; sync_direction?: string } = {};
    if (data.enabled !== undefined) update.enabled = data.enabled;
    if (data.sync_direction) update.sync_direction = data.sync_direction;
    const { error } = await sbAny(context.supabase)
      .from("calendar_accounts")
      .update(update)
      .eq("id", data.accountId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listExternalCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { providerForKind, contextFor } = await import("@/lib/booking/providers/index.server");
    const { data: acc } = await supabaseAdmin
      .from("calendar_accounts")
      .select("*")
      .eq("id", data.accountId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!acc) throw new Error("Account not found");
    const provider = providerForKind((acc as { provider: string }).provider);
    return provider.listCalendars(contextFor(acc as Parameters<typeof contextFor>[0]));
  });

export const disconnectCalendarAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: acc } = await supabaseAdmin
      .from("calendar_accounts")
      .select("id,provider,connection_key_ciphertext")
      .eq("id", data.accountId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!acc) return { ok: true };
    const row = acc as { id: string; provider: string; connection_key_ciphertext: string | null };
    if (row.connection_key_ciphertext && (row.provider === "google" || row.provider === "microsoft")) {
      try {
        const { decryptConnectionKey } = await import("@/lib/booking/providers/crypto.server");
        const key = decryptConnectionKey(row.connection_key_ciphertext);
        if (row.provider === "google") {
          await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: key }),
          });
        }
      } catch { /* best effort */ }
    }
    await sbAny(supabaseAdmin).from("calendar_accounts").delete().eq("id", row.id);
    return { ok: true };
  });

/** Trigger inbound sync (busy-time fetch) for one host. */
export const syncCalendarAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { horizonDays?: number }) => data)
  .handler(async ({ data, context }) => {
    const { fetchHostBusyBlocks } = await import("@/lib/booking/calendar-sync-engine.server");
    const from = new Date();
    const to = new Date(from.getTime() + (data.horizonDays ?? 60) * 86400_000);
    const blocks = await fetchHostBusyBlocks(context.userId, from.toISOString(), to.toISOString());
    return { count: blocks.length };
  });
