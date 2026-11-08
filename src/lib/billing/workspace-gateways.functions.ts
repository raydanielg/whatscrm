/**
 * Per-workspace payment gateway overrides.
 *
 * Platform settings stay the source of truth: a workspace can only *narrow*
 * what the platform allows (turn an enabled gateway off for itself, or pick a
 * different default among the gateways still available to it). Turning a
 * gateway on for a workspace has no effect while the platform switch is off.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { listBillingProviders } from "./providers";
import { sbAny } from "@/lib/supabase/untyped";

export type WorkspaceGateway = {
  id: string;
  displayName: string;
  /** Platform-level switch — a workspace cannot override this to `true`. */
  platformEnabled: boolean;
  platformDefault: boolean;
  mode: "sandbox" | "live";
  /** `null` = inherit the platform switch. */
  override: boolean | null;
  /** Resolved state after applying the override. */
  effectiveEnabled: boolean;
  isWorkspaceDefault: boolean;
  notes: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

async function assertWorkspaceAdmin(supabase: Client, workspaceId: string, userId: string) {
  const { data, error } = await sbAny(supabase).rpc("is_workspace_admin", {
    _workspace_id: workspaceId,
    _user_id: userId,
  });
  if (error) throw new Error("Unable to verify workspace role");
  if (!data) throw new Error("Forbidden: workspace owners and admins only");
}

type PlatformRow = {
  provider_id: string;
  enabled: boolean;
  is_default: boolean;
  mode: "sandbox" | "live";
  display_label: string | null;
};

type OverrideRow = {
  provider_id: string;
  enabled: boolean | null;
  is_default: boolean;
  notes: string | null;
};

const workspaceInput = z.object({ workspace_id: z.string().uuid() });

/** Gateways available to a workspace, with its overrides applied. */
export const listWorkspaceGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<WorkspaceGateway[]> => {
    const { supabase } = context;

    const [{ data: platform, error: pErr }, { data: overrides, error: oErr }] = await Promise.all([
      supabase
        .rpc("list_payment_gateway_basics")
        .returns<PlatformRow[]>(),
      supabase
        .from("workspace_payment_gateway_settings")
        .select("provider_id, enabled, is_default, notes")
        .eq("workspace_id", data.workspace_id)
        .returns<OverrideRow[]>(),
    ]);
    if (pErr) throw pErr;
    if (oErr) throw oErr;

    const catalog = new Map(listBillingProviders().map((p) => [p.id, p.displayName]));
    const byId = new Map((overrides ?? []).map((o) => [o.provider_id, o]));

    return (platform ?? []).map((p) => {
      const o = byId.get(p.provider_id);
      const override = o?.enabled ?? null;
      const effectiveEnabled = p.enabled && (override ?? true);
      return {
        id: p.provider_id,
        displayName:
          p.display_label?.trim() || catalog.get(p.provider_id) || p.provider_id,
        platformEnabled: p.enabled,
        platformDefault: p.is_default,
        mode: p.mode ?? "sandbox",
        override,
        effectiveEnabled,
        isWorkspaceDefault: Boolean(o?.is_default) && effectiveEnabled,
        notes: o?.notes ?? null,
      };
    });
  });

/** Turn a gateway on/off for one workspace, or clear the override (inherit). */
export const setWorkspaceGatewayOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    workspaceInput
      .extend({
        provider_id: z.string().min(1),
        // null = inherit the platform switch
        enabled: z.boolean().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertWorkspaceAdmin(supabase, data.workspace_id, userId);

    if (data.enabled === null) {
      // Inherit: drop the row unless it also carries the workspace default.
      const { data: row } = await supabase
        .from("workspace_payment_gateway_settings")
        .select("is_default")
        .eq("workspace_id", data.workspace_id)
        .eq("provider_id", data.provider_id)
        .maybeSingle();

      if (row?.is_default) {
        const { error } = await supabase
          .from("workspace_payment_gateway_settings")
          .update({ enabled: null } as never)
          .eq("workspace_id", data.workspace_id)
          .eq("provider_id", data.provider_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("workspace_payment_gateway_settings")
          .delete()
          .eq("workspace_id", data.workspace_id)
          .eq("provider_id", data.provider_id);
        if (error) throw error;
      }
      return { ok: true };
    }

    if (data.enabled) {
      const { data: platform } = await supabase
        .rpc("list_payment_gateway_basics")
        .returns<Array<{ provider_id: string; enabled: boolean }>>();
      const platformRow = (platform ?? []).find((r) => r.provider_id === data.provider_id);
      if (!platformRow?.enabled) {
        throw new Error(
          "This gateway is switched off platform-wide. A workspace cannot enable it on its own.",
        );
      }
    } else {
      // Disabling the workspace default clears the default too.
      await supabase
        .from("workspace_payment_gateway_settings")
        .update({ is_default: false } as never)
        .eq("workspace_id", data.workspace_id)
        .eq("provider_id", data.provider_id);
    }

    const { error } = await sbAny(supabase).from("workspace_payment_gateway_settings").upsert(
      {
        workspace_id: data.workspace_id,
        provider_id: data.provider_id,
        enabled: data.enabled,
      } as never,
      { onConflict: "workspace_id,provider_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

/** Pick (or clear) the workspace's preferred default gateway. */
export const setWorkspaceDefaultGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    workspaceInput.extend({ provider_id: z.string().min(1).nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertWorkspaceAdmin(supabase, data.workspace_id, userId);

    // Only one default per workspace (enforced by a partial unique index too).
    const { error: clearErr } = await supabase
      .from("workspace_payment_gateway_settings")
      .update({ is_default: false } as never)
      .eq("workspace_id", data.workspace_id)
      .eq("is_default", true);
    if (clearErr) throw clearErr;

    if (!data.provider_id) return { ok: true };

    const { data: platform } = await supabase
      .rpc("list_payment_gateway_basics")
      .returns<Array<{ provider_id: string; enabled: boolean }>>();
    const platformRow = (platform ?? []).find((r) => r.provider_id === data.provider_id);
    if (!platformRow?.enabled) {
      throw new Error("That gateway is switched off platform-wide.");
    }

    const { data: existing } = await supabase
      .from("workspace_payment_gateway_settings")
      .select("enabled")
      .eq("workspace_id", data.workspace_id)
      .eq("provider_id", data.provider_id)
      .maybeSingle();
    if (existing?.enabled === false) {
      throw new Error("Turn this gateway on for the workspace before making it the default.");
    }

    const { error } = await sbAny(supabase).from("workspace_payment_gateway_settings").upsert(
      {
        workspace_id: data.workspace_id,
        provider_id: data.provider_id,
        enabled: existing?.enabled ?? null,
        is_default: true,
      } as never,
      { onConflict: "workspace_id,provider_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Gateway health for the active tenant
 * ------------------------------------------------------------------ */

export type WorkspaceGatewayHealth = {
  id: string;
  displayName: string;
  mode: "sandbox" | "live";
  /** Resolved on/off state for this workspace. */
  enabled: boolean;
  isDefault: boolean;
  /** ISO timestamp of the most recent inbound webhook, or null if never. */
  lastWebhookAt: string | null;
  lastWebhookStatus: string | null;
  /** Delivery counters over the rolling window. */
  deliveries: number;
  failures: number;
  /** Connection state derived from configuration + recent deliveries. */
  state: "healthy" | "degraded" | "failing" | "idle" | "disabled";
};

export type WorkspaceGatewayHealthReport = {
  windowHours: number;
  generatedAt: string;
  gateways: WorkspaceGatewayHealth[];
};

const FAILURE_STATUSES = new Set(["failed", "invalid_signature", "misconfigured"]);

/**
 * Non-sensitive gateway health for one workspace: last webhook time, failure
 * counters and connection state. Deliberately returns no credentials, secret
 * names, webhook URLs, payloads or error text — any workspace member may read
 * it, so only counters and timestamps cross the boundary.
 */
export const getWorkspaceGatewayHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    workspaceInput
      .extend({ window_hours: z.number().int().min(1).max(720).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<WorkspaceGatewayHealthReport> => {
    const { supabase, userId } = context;

    const { data: isMember, error: memberErr } = await sbAny(supabase).rpc("is_workspace_member", {
      _workspace_id: data.workspace_id,
      _user_id: userId,
    });
    if (memberErr) throw new Error("Unable to verify workspace membership");
    if (!isMember) throw new Error("Forbidden: workspace members only");

    const windowHours = data.window_hours ?? 24;
    const since = new Date(Date.now() - windowHours * 3600_000).toISOString();

    const [{ data: platform, error: pErr }, { data: overrides, error: oErr }] =
      await Promise.all([
        sbAny(supabase).rpc("list_payment_gateway_basics"),
        supabase
          .from("workspace_payment_gateway_settings")
          .select("provider_id, enabled, is_default, notes")
          .eq("workspace_id", data.workspace_id)
          .returns<OverrideRow[]>(),
      ]);
    if (pErr) throw pErr;
    if (oErr) throw oErr;

    // Delivery telemetry is platform-wide and not readable by tenant members,
    // so aggregate it server-side and hand back counters only.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: deliveries } = await supabaseAdmin
      .from("payment_gateway_webhook_deliveries")
      .select("provider_id, status, received_at")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(2000)
      .returns<{ provider_id: string; status: string; received_at: string }[]>();

    const stats = new Map<
      string,
      { total: number; failures: number; lastAt: string | null; lastStatus: string | null }
    >();
    for (const row of deliveries ?? []) {
      const s =
        stats.get(row.provider_id) ??
        { total: 0, failures: 0, lastAt: null, lastStatus: null };
      s.total += 1;
      if (FAILURE_STATUSES.has(row.status)) s.failures += 1;
      if (!s.lastAt || row.received_at > s.lastAt) {
        s.lastAt = row.received_at;
        s.lastStatus = row.status;
      }
      stats.set(row.provider_id, s);
    }

    const catalog = new Map(listBillingProviders().map((p) => [p.id, p.displayName]));
    const byId = new Map((overrides ?? []).map((o) => [o.provider_id, o]));

    const gateways = ((platform ?? []) as PlatformRow[]).map((p): WorkspaceGatewayHealth => {
      const o = byId.get(p.provider_id);
      const enabled = p.enabled && (o?.enabled ?? true);
      const s = stats.get(p.provider_id);
      const total = s?.total ?? 0;
      const failures = s?.failures ?? 0;
      const failureRate = total > 0 ? failures / total : 0;

      let state: WorkspaceGatewayHealth["state"] = "healthy";
      if (!enabled) state = "disabled";
      else if (total === 0) state = "idle";
      else if (failureRate >= 0.5) state = "failing";
      else if (failures > 0) state = "degraded";

      return {
        id: p.provider_id,
        displayName: p.display_label?.trim() || catalog.get(p.provider_id) || p.provider_id,
        mode: p.mode ?? "sandbox",
        enabled,
        isDefault: Boolean(o?.is_default) ? enabled : p.is_default && enabled,
        lastWebhookAt: s?.lastAt ?? null,
        lastWebhookStatus: s?.lastStatus ?? null,
        deliveries: total,
        failures,
        state,
      };
    });

    return { windowHours, generatedAt: new Date().toISOString(), gateways };
  });
