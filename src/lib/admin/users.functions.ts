/**
 * Super Admin — User management server functions.
 *
 * Platform-staff only. Every mutating action writes to audit_logs.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
  targetUserId: string,
  action: string,
  changes: Record<string, unknown> = {},
) {
  await admin
    .from("audit_logs")
    .insert({
      actor_id: actorId,
      action: "admin.action" as never,
      resource_type: "user",
      resource_id: targetUserId,
      changes: { platform_action: action, ...changes },
      metadata: { source: "super_admin" },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

export const listPlatformUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { search?: string; status?: string; role?: string; limit?: number; page?: number }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const perPage = Math.min(data.limit ?? 100, 200);
    const page = Math.max(data.page ?? 1, 1);

    // auth.admin.listUsers gives us email/confirmed/banned/last_sign_in
    const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (authErr) throw new Error(authErr.message);

    const authUsers = Array.isArray(authList.users) ? authList.users : [];
    const userIds = authUsers.map((u) => u.id);
    if (userIds.length === 0) return { users: [], total: 0, page, perPage };

    const [profilesRes, rolesRes, membersRes, mfaRes] = await Promise.all([
      sbAny(supabaseAdmin)
        .from("profiles")
        .select("id, display_name, full_name, avatar_url, email, last_seen_at")
        .in("id", userIds),
      sbAny(supabaseAdmin).from("user_roles").select("user_id, role").in("user_id", userIds),
      supabaseAdmin
        .from("organization_members")
        .select("user_id, role, organization_id, organizations:organization_id ( id, name, slug )")
        .in("user_id", userIds),
      sbAny(supabaseAdmin)
        .from("user_2fa")
        .select("user_id, enabled, method")
        .in("user_id", userIds),
    ]);

    const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const members = Array.isArray(membersRes.data) ? membersRes.data : [];
    const mfaRows = Array.isArray(mfaRes.data) ? mfaRes.data : [];

    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const rolesMap = new Map<string, string[]>();
    roles.forEach((r) => {
      const list = rolesMap.get(r.user_id) ?? [];
      list.push(r.role);
      rolesMap.set(r.user_id, list);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgsMap = new Map<string, any[]>();
    members.forEach((m) => {
      const list = orgsMap.get(m.user_id) ?? [];
      list.push({ role: m.role, ...(m.organizations ?? {}) });
      orgsMap.set(m.user_id, list);
    });
    const mfaMap = new Map(mfaRows.map((m) => [m.user_id, m]));

    let users = authUsers.map((u) => {
      const p = profileMap.get(u.id);
      const orgs = orgsMap.get(u.id) ?? [];
      const mfa = mfaMap.get(u.id);
      const banned = (u as unknown as { banned_until?: string | null }).banned_until;
      const isSuspended = banned ? new Date(banned).getTime() > Date.now() : false;
      return {
        id: u.id,
        email: u.email ?? p?.email ?? null,
        display_name: p?.display_name ?? p?.full_name ?? null,
        avatar_url: p?.avatar_url ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        last_seen_at: p?.last_seen_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        phone: u.phone ?? null,
        status: isSuspended ? "suspended" : "active",
        banned_until: banned ?? null,
        platform_roles: rolesMap.get(u.id) ?? [],
        mfa_enabled: mfa?.enabled ?? false,
        mfa_method: mfa?.method ?? null,
        organizations: orgs,
      };
    });

    if (data.search && data.search.trim()) {
      const q = data.search.trim().toLowerCase();
      users = users.filter(
        (u) =>
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.display_name ?? "").toLowerCase().includes(q) ||
          u.id.includes(q),
      );
    }
    if (data.status && data.status !== "all") {
      users = users.filter((u) =>
        data.status === "unverified" ? !u.email_confirmed_at : u.status === data.status,
      );
    }
    if (data.role && data.role !== "all") {
      users = users.filter((u) => u.platform_roles.includes(data.role!));
    }

    return { users, total: authUsers.length, page, perPage };
  });

export const getPlatformUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { userId } = data;

    const [authRes, profileRes, rolesRes, membersRes, sessionsRes, loginRes, mfaRes, auditRes] =
      await Promise.all([
        supabaseAdmin.auth.admin.getUserById(userId),
        sbAny(supabaseAdmin).from("profiles").select("*").eq("id", userId).maybeSingle(),
        sbAny(supabaseAdmin)
          .from("user_roles")
          .select("id, role, created_at")
          .eq("user_id", userId),
        supabaseAdmin
          .from("organization_members")
          .select(
            "role, joined_at, organizations:organization_id ( id, name, slug, metadata, subscriptions:subscriptions ( status, plan_id, plans:plan_id ( name, code ) ) )",
          )
          .eq("user_id", userId),
        supabaseAdmin
          .from("sessions")
          .select(
            "id, device, user_agent, ip_address, location, last_seen_at, revoked_at, created_at",
          )
          .eq("user_id", userId)
          .order("last_seen_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("login_history")
          .select("id, event, ip_address, user_agent, device, location, failure_reason, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100),
        sbAny(supabaseAdmin).from("user_2fa").select("*").eq("user_id", userId).maybeSingle(),
        supabaseAdmin
          .from("audit_logs")
          .select("id, action, resource_type, resource_id, actor_id, changes, created_at")
          .or(`actor_id.eq.${userId},resource_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

    const authUser = authRes.data?.user ?? null;
    const banned = authUser
      ? (authUser as unknown as { banned_until?: string | null }).banned_until
      : null;

    return {
      user: authUser
        ? {
            id: authUser.id,
            email: authUser.email,
            phone: authUser.phone,
            created_at: authUser.created_at,
            last_sign_in_at: authUser.last_sign_in_at,
            email_confirmed_at: authUser.email_confirmed_at,
            phone_confirmed_at: authUser.phone_confirmed_at,
            banned_until: banned,
            status: banned && new Date(banned).getTime() > Date.now() ? "suspended" : "active",
          }
        : null,
      profile: profileRes.data,
      platformRoles: rolesRes.data ?? [],
      organizations: membersRes.data ?? [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessions: (sessionsRes.data ?? []).map((s: any) => ({
        ...s,
        ip_address: s.ip_address ? String(s.ip_address) : null,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loginHistory: (loginRes.data ?? []).map((l: any) => ({
        ...l,
        ip_address: l.ip_address ? String(l.ip_address) : null,
      })),
      mfa: mfaRes.data,
      audit: auditRes.data ?? [],
    };
  });

export const suspendPlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot suspend yourself");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: "876000h",
    });
    if (error) throw new Error(error.message);
    await sbAny(supabaseAdmin)
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", data.userId)
      .is("revoked_at", null);
    await logAudit(supabaseAdmin, context.userId, data.userId, "user.suspend", {
      reason: data.reason ?? null,
    });
    return { ok: true };
  });

export const activatePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: "none",
    });
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, data.userId, "user.activate");
    return { ok: true };
  });

export const deletePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; confirmEmail: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can delete users");
    if (data.userId === context.userId) throw new Error("You cannot delete yourself");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: got } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (!got?.user || got.user.email !== data.confirmEmail)
      throw new Error("Email confirmation does not match");
    const { error: prepareError } = await sbAny(supabaseAdmin).rpc(
      "prepare_platform_user_deletion",
      {
        _user_id: data.userId,
      },
    );
    if (prepareError)
      throw new Error(`Could not prepare account deletion: ${prepareError.message}`);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, data.userId, "user.delete", {
      email: got.user.email,
    });
    return { ok: true };
  });

export const resetPlatformUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: got } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (!got?.user?.email) throw new Error("User has no email address");
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: got.user.email,
    });
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, data.userId, "user.reset_password");
    return { ok: true };
  });

export const forceLogoutPlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.auth.admin as any)
      .signOut(data.userId, "global")
      .catch(() => ({ error: null }));
    if (error) throw new Error(error.message);
    await sbAny(supabaseAdmin)
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", data.userId)
      .is("revoked_at", null);
    await logAudit(supabaseAdmin, context.userId, data.userId, "user.force_logout");
    return { ok: true };
  });

export const revokeUserSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; sessionId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    await sbAny(supabaseAdmin)
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("user_id", data.userId);
    await logAudit(supabaseAdmin, context.userId, data.userId, "user.revoke_session", {
      session_id: data.sessionId,
    });
    return { ok: true };
  });

export const verifyPlatformUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, data.userId, "user.verify_email");
    return { ok: true };
  });

export const setPlatformRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; role: "superadmin" | "support"; grant: boolean }) => input)
  .handler(async ({ data, context }) => {
    const actorRole = await assertPlatformStaff(context.supabase, context.userId);
    if (actorRole !== "superadmin") throw new Error("Only superadmin can change platform roles");
    if (data.userId === context.userId && !data.grant && data.role === "superadmin") {
      throw new Error("You cannot remove your own superadmin role");
    }
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sbAny(supabaseAdmin)
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await logAudit(
      supabaseAdmin,
      context.userId,
      data.userId,
      data.grant ? "user.grant_role" : "user.revoke_role",
      { role: data.role },
    );
    return { ok: true };
  });

export const bulkUserAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      userIds: string[];
      action: "suspend" | "activate" | "force_logout" | "verify_email" | "reset_password";
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    let ok = 0;
    for (const id of data.userIds) {
      if (id === context.userId && data.action === "suspend") continue;
      try {
        if (data.action === "suspend") {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            ban_duration: "876000h",
          });
          if (error) throw new Error(error.message);
          await sbAny(supabaseAdmin)
            .from("sessions")
            .update({ revoked_at: new Date().toISOString() })
            .eq("user_id", id)
            .is("revoked_at", null);
        } else if (data.action === "activate") {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            ban_duration: "none",
          });
          if (error) throw new Error(error.message);
        } else if (data.action === "force_logout") {
          const { error } = await (
            supabaseAdmin.auth.admin as unknown as {
              signOut: (
                id: string,
                scope: string,
              ) => Promise<{ error: { message: string } | null }>;
            }
          )
            .signOut(id, "global")
            .catch((e: unknown) => ({ error: e instanceof Error ? { message: e.message } : null }));
          if (error) throw new Error(error.message);
          await sbAny(supabaseAdmin)
            .from("sessions")
            .update({ revoked_at: new Date().toISOString() })
            .eq("user_id", id)
            .is("revoked_at", null);
        } else if (data.action === "verify_email") {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            email_confirm: true,
          });
          if (error) throw new Error(error.message);
        } else if (data.action === "reset_password") {
          const { data: got } = await supabaseAdmin.auth.admin.getUserById(id);
          if (got?.user?.email) {
            const { error } = await supabaseAdmin.auth.admin.generateLink({
              type: "recovery",
              email: got.user.email,
            });
            if (error) throw new Error(error.message);
          }
        }
        await logAudit(supabaseAdmin, context.userId, id, `user.bulk_${data.action}`);
        ok += 1;
      } catch {
        // continue on per-user failures (blocked-in-demo, not-found, etc.) — not counted in `ok`
      }
    }
    return { ok: true, count: ok };
  });
