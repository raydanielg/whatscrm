/**
 * Super Admin — unsupported channel provider triage.
 *
 * Lists every `channel_accounts.provider` value that the app cannot route
 * (not in KNOWN_PROVIDERS), grouped with counts, and lets platform staff
 * remap them onto a supported provider or disable the affected accounts.
 *
 * Authorization: role is verified through the caller's RLS-scoped client
 * BEFORE any privileged client is loaded. Reads/writes must span workspaces,
 * so they use the service client only after that check passes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseProvider } from "@/lib/inbox/channel-capabilities";
import { assertWritableProvider } from "@/lib/inbox/provider-validation";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(supabase: any, userId: string, writeAccess = false) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  const roles: string[] = (data ?? []).map((r: { role: string }) => r.role);
  if (roles.length === 0) throw new Error("Forbidden: platform staff only");
  if (writeAccess && !roles.includes("superadmin")) {
    throw new Error("Forbidden: superadmin required for this action");
  }
}

type AccountRow = {
  id: string;
  workspace_id: string | null;
  provider: string | null;
  display_name: string | null;
  status: string | null;
  created_at: string | null;
};

export type UnsupportedProviderGroup = {
  provider: string;
  count: number;
  reason: string;
  suggestedChannel: string | null;
  workspaceCount: number;
  statuses: Record<string, number>;
  accounts: Array<{
    id: string;
    workspaceId: string | null;
    workspaceName: string | null;
    displayName: string | null;
    status: string | null;
    createdAt: string | null;
  }>;
};

export const listUnsupportedProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const { data, error } = await supabaseAdmin
      .from("channel_accounts")
      .select("id, workspace_id, provider, display_name, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as AccountRow[];

    const workspaceIds = Array.from(
      new Set(rows.map((r) => r.workspace_id).filter((v): v is string => Boolean(v))),
    );
    const names = new Map<string, string>();
    if (workspaceIds.length > 0) {
      const { data: ws } = await supabaseAdmin
        .from("workspaces")
        .select("id, name")
        .in("id", workspaceIds);
      for (const w of (ws ?? []) as unknown as Array<{ id: string; name: string | null }>) {
        if (w.name) names.set(w.id, w.name);
      }
    }

    const groups = new Map<string, UnsupportedProviderGroup>();
    let supportedCount = 0;

    for (const row of rows) {
      const parsed = parseProvider(row.provider);
      if (parsed.ok) {
        supportedCount += 1;
        continue;
      }
      const key = parsed.provider || "(empty)";
      let g = groups.get(key);
      if (!g) {
        g = {
          provider: key,
          count: 0,
          reason: parsed.reason,
          suggestedChannel: parsed.channel,
          workspaceCount: 0,
          statuses: {},
          accounts: [],
        };
        groups.set(key, g);
      }
      g.count += 1;
      const status = row.status ?? "unknown";
      g.statuses[status] = (g.statuses[status] ?? 0) + 1;
      g.accounts.push({
        id: row.id,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_id ? (names.get(row.workspace_id) ?? null) : null,
        displayName: row.display_name,
        status: row.status,
        createdAt: row.created_at,
      });
    }

    for (const g of groups.values()) {
      g.workspaceCount = new Set(g.accounts.map((a) => a.workspaceId ?? "—")).size;
    }

    return {
      totalAccounts: rows.length,
      supportedCount,
      unsupportedCount: rows.length - supportedCount,
      knownProviders: [...REMAP_TARGETS] as string[],
      groups: Array.from(groups.values()).sort((a, b) => b.count - a.count),
    };
  });

/**
 * Providers that can actually be written back to `channel_accounts.provider`:
 * the intersection of the database `messaging_provider` enum and the values
 * the inbox knows how to route.
 */
export const REMAP_TARGETS = ["whatsapp_cloud", "twilio", "dialog360"] as const;

export const remapUnsupportedProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        fromProvider: z.string().min(1).max(120),
        // Checked strictly in the handler so unknown values return a 4xx.
        toProvider: z.string().max(120),
        accountIds: z.array(z.string().uuid()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const toProvider = assertWritableProvider(data.toProvider, "toProvider");
    await assertPlatformStaff(supabase, userId, true);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    let q = supabaseAdmin
      .from("channel_accounts")
      .update({ provider: toProvider, updated_at: new Date().toISOString() })
      .eq("provider", data.fromProvider as (typeof REMAP_TARGETS)[number]);

    if (data.accountIds && data.accountIds.length > 0) q = q.in("id", data.accountIds);

    const { data: updated, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { updated: (updated ?? []).length };
  });

export const disableUnsupportedProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        provider: z.string().min(1).max(120),
        accountIds: z.array(z.string().uuid()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId, true);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    let q = supabaseAdmin
      .from("channel_accounts")
      .update({
        status: "disconnected",
        status_reason: `Disabled by platform staff — unsupported provider "${data.provider}".`,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", data.provider as (typeof REMAP_TARGETS)[number]);
    if (data.accountIds && data.accountIds.length > 0) q = q.in("id", data.accountIds);

    const { data: updated, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { disabled: (updated ?? []).length };
  });
