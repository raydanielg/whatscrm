/**
 * Super Admin — Tenant (Organization) management server functions.
 *
 * All functions verify platform staff role via the caller's RLS-scoped
 * client BEFORE loading supabaseAdmin. Never rely on supabaseAdmin for
 * authorization decisions.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantAccess } from "@/lib/auth/tenant-auth";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny, type UntypedClient } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
  return data[0].role as "superadmin" | "support";
}

async function logAudit(
  admin: UntypedClient,
  actorId: string,
  orgId: string,
  action: string,
  changes: Record<string, unknown> = {},
) {
  await sbAny(admin)
    .from("audit_logs")
    .insert({
      organization_id: orgId,
      actor_id: actorId,
      action: "admin.action" as never, // enum fallback; keep generic
      resource_type: "organization",
      resource_id: orgId,
      changes: { platform_action: action, ...changes },
      metadata: { source: "super_admin" },
    })
    .throwOnError()
    .then(undefined, () => {
      // Some audit_action enums may not include admin.action; ignore audit failure
      // rather than blocking the platform operation.
    });
}

export const listTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator(
    (input: { search?: string; status?: string; planId?: string; limit?: number }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    let query = supabaseAdmin
      .from("organizations")
      .select(
        `
        id, name, slug, owner_id, billing_email, created_at, metadata, logo_url, industry,
        subscriptions:subscriptions ( id, status, seats, current_period_end, trial_ends_at, plan_id, plans:plan_id ( code, name ) ),
        members:organization_members ( count )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);

    if (data.search && data.search.trim()) {
      const q = `%${sanitizeSearchTerm(data.search)}%`;
      query = query.or(`name.ilike.${q},slug.ilike.${q},billing_email.ilike.${q}`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shaped = (Array.isArray(rows) ? rows : []).map((r: any) => {
      const sub = Array.isArray(r.subscriptions) ? r.subscriptions[0] : r.subscriptions;
      const memberCount = Array.isArray(r.members) ? (r.members[0]?.count ?? 0) : 0;
      const metaStatus = (r.metadata?.status as string | undefined) ?? "active";
      return {
        id: r.id as string,
        name: r.name as string,
        slug: r.slug as string,
        owner_id: r.owner_id as string,
        billing_email: r.billing_email as string | null,
        logo_url: r.logo_url as string | null,
        industry: r.industry as string | null,
        created_at: r.created_at as string,
        status: metaStatus,
        plan: sub?.plans?.name ?? "—",
        plan_code: sub?.plans?.code ?? null,
        subscription_status: sub?.status ?? "none",
        seats: sub?.seats ?? 0,
        current_period_end: sub?.current_period_end ?? null,
        member_count: memberCount,
      };
    });

    // Optional filters applied post-shape
    return shaped.filter((r) => {
      if (data.status && data.status !== "all" && r.status !== data.status) return false;
      if (data.planId && data.planId !== "all" && r.plan_code !== data.planId) return false;
      return true;
    });
  });

export const getTenantDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { orgId } = data;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [org, sub, members, usage, audit] = await Promise.all([
      sbAny(supabaseAdmin).from("organizations").select("*").eq("id", orgId).maybeSingle(),
      supabaseAdmin
        .from("subscriptions")
        .select("*, plans:plan_id ( code, name, features )")
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabaseAdmin
        .from("organization_members")
        .select("user_id, role, joined_at, profiles:user_id ( display_name, email, avatar_url )")
        .eq("organization_id", orgId)
        .order("joined_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("usage_events")
        .select("meter_code, quantity, occurred_at")
        .eq("organization_id", orgId)
        .gte("occurred_at", since),
      supabaseAdmin
        .from("audit_logs")
        .select("id, action, resource_type, resource_id, actor_id, changes, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const usageByMeter: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (usage.data ?? []).forEach((e: any) => {
      usageByMeter[e.meter_code] = (usageByMeter[e.meter_code] ?? 0) + Number(e.quantity ?? 0);
    });

    return {
      organization: org.data,
      subscription: sub.data,
      members: members.data ?? [],
      usage: usageByMeter,
      audit: audit.data ?? [],
    };
  });

async function updateStatus(orgId: string, status: "active" | "suspended", actorId: string) {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: org, error: e1 } = await sbAny(supabaseAdmin)
    .from("organizations")
    .select("metadata")
    .eq("id", orgId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  const existing =
    org?.metadata && typeof org.metadata === "object" && !Array.isArray(org.metadata)
      ? (org.metadata as Record<string, unknown>)
      : {};
  const meta = {
    ...existing,
    status,
    status_changed_at: new Date().toISOString(),
    status_changed_by: actorId,
  };
  const { error } = await sbAny(supabaseAdmin)
    .from("organizations")
    .update({ metadata: meta })
    .eq("id", orgId);
  if (error) throw new Error(error.message);
  if (status === "suspended") {
    await sbAny(supabaseAdmin)
      .from("subscriptions")
      .update({ suspended_at: new Date().toISOString() })
      .eq("organization_id", orgId);
  } else {
    await sbAny(supabaseAdmin)
      .from("subscriptions")
      .update({ suspended_at: null })
      .eq("organization_id", orgId);
  }
  await logAudit(supabaseAdmin, actorId, orgId, `tenant.${status}`);
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return `${base || "organization"}-${Math.random().toString(36).slice(2, 8)}`;
}

export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator(
    (input: { name: string; ownerEmail: string; workspaceName?: string; billingEmail?: string }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const name = data.name.trim();
    const ownerEmail = data.ownerEmail.trim().toLowerCase();
    if (!name) throw new Error("Tenant name is required");
    if (!ownerEmail) throw new Error("Owner email is required");

    const { data: owner } = await sbAny(supabaseAdmin)
      .from("profiles")
      .select("id")
      .eq("email", ownerEmail)
      .maybeSingle();
    if (!owner) {
      throw new Error(
        "No user found with that email. Ask them to create an account first, then try again.",
      );
    }

    const slug = slugify(name);
    const { data: org, error: orgError } = await sbAny(supabaseAdmin)
      .from("organizations")
      .insert({
        name,
        slug,
        owner_id: owner.id,
        billing_email: data.billingEmail?.trim() || ownerEmail,
      })
      .select("id")
      .single();
    if (orgError || !org) throw new Error(orgError?.message ?? "Could not create organization");

    const { error: memberError } = await sbAny(supabaseAdmin)
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: owner.id, role: "owner" });
    if (memberError) {
      await sbAny(supabaseAdmin).from("organizations").delete().eq("id", org.id);
      throw new Error(memberError.message);
    }

    const workspaceSlug = slugify(data.workspaceName?.trim() || name);
    const { data: ws, error: wsError } = await sbAny(supabaseAdmin)
      .from("workspaces")
      .insert({
        name: data.workspaceName?.trim() || name,
        slug: workspaceSlug,
        organization_id: org.id,
        owner_id: owner.id,
        plan: "free",
      })
      .select("id")
      .single();
    if (wsError || !ws) {
      await sbAny(supabaseAdmin).from("organizations").delete().eq("id", org.id);
      throw new Error(wsError?.message ?? "Could not create workspace");
    }

    const { error: wsMemberError } = await sbAny(supabaseAdmin)
      .from("workspace_members")
      .insert({ workspace_id: ws.id, user_id: owner.id, role: "owner" });
    if (wsMemberError) throw new Error(wsMemberError.message);

    await logAudit(supabaseAdmin, context.userId, org.id, "tenant.create", {
      owner_email: ownerEmail,
      workspace_id: ws.id,
    });

    return { ok: true, organizationId: org.id as string, workspaceId: ws.id as string };
  });

export const suspendTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    await updateStatus(data.orgId, "suspended", context.userId);
    return { ok: true };
  });

export const activateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { orgId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    await updateStatus(data.orgId, "active", context.userId);
    return { ok: true };
  });

export const deleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { orgId: string; confirmSlug: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can delete tenants");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const { data: org } = await sbAny(supabaseAdmin)
      .from("organizations")
      .select("slug")
      .eq("id", data.orgId)
      .maybeSingle();
    if (!org || org.slug !== data.confirmSlug) throw new Error("Slug confirmation does not match");

    await logAudit(supabaseAdmin, context.userId, data.orgId, "tenant.delete", { slug: org.slug });
    const { error } = await sbAny(supabaseAdmin)
      .from("organizations")
      .delete()
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const transferOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { orgId: string; newOwnerEmail: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can transfer ownership");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const { data: profile } = await sbAny(supabaseAdmin)
      .from("profiles")
      .select("id")
      .eq("email", data.newOwnerEmail)
      .maybeSingle();
    if (!profile) throw new Error("No user found with that email");

    const { error } = await sbAny(supabaseAdmin)
      .from("organizations")
      .update({ owner_id: profile.id })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    await sbAny(supabaseAdmin).from("organization_members").upsert(
      {
        organization_id: data.orgId,
        user_id: profile.id,
        role: "owner",
      },
      { onConflict: "organization_id,user_id" },
    );

    await logAudit(supabaseAdmin, context.userId, data.orgId, "tenant.transfer_ownership", {
      new_owner: profile.id,
    });
    return { ok: true, newOwnerId: profile.id };
  });

export const impersonateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { orgId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can impersonate");
    if (!data.reason || data.reason.length < 8)
      throw new Error("Reason (min 8 chars) required for audit trail");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    await logAudit(supabaseAdmin, context.userId, data.orgId, "tenant.impersonate", {
      reason: data.reason,
    });
    // Impersonation session is created via a signed session token in a real system.
    // We record the request; a downstream Cloud Function issues the actual token.
    return { ok: true, ticket: crypto.randomUUID(), expiresIn: 900 };
  });

export const bulkTenantAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { orgIds: string[]; action: "suspend" | "activate" }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const status = data.action === "suspend" ? "suspended" : "active";
    for (const id of data.orgIds) {
      await updateStatus(id, status, context.userId);
    }
    return { ok: true, count: data.orgIds.length };
  });
