import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCallerOrgId } from "@/lib/developer/api-keys.functions";
import { sbAny } from "@/lib/supabase/untyped";

const inputSchema = z.object({ organizationId: z.string().uuid() });
const workspaceInputSchema = z.object({ workspaceId: z.string().uuid() });

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Returns the authenticated organization's member directory. The server can
 * safely fall back to Auth metadata when a legacy user has no populated
 * profile row, while membership verification prevents cross-tenant lookups.
 */
export const listOrganizationMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await getCallerOrgId(
      context.supabase,
      context.userId,
      data.organizationId,
    );
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const { data: memberships, error: membershipError } = await sbAny(supabaseAdmin)
      .from("organization_members")
      .select("user_id, role, joined_at")
      .eq("organization_id", organizationId)
      .order("joined_at", { ascending: true });
    if (membershipError) throw membershipError;

    const rows = (memberships ?? []) as Array<{
      user_id: string;
      role: "owner" | "admin" | "member";
      joined_at: string;
    }>;
    const userIds = rows.map((member) => member.user_id);
    if (userIds.length === 0) return [];

    const { data: profiles, error: profileError } = await sbAny(supabaseAdmin)
      .from("profiles")
      .select("id, display_name, full_name, email, avatar_url")
      .in("id", userIds);
    if (profileError) throw profileError;

    const profilesById = new Map<
      string,
      {
        display_name: string | null;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      }
    >(
      (profiles ?? []).map((profile: Record<string, unknown>) => [
        String(profile.id),
        {
          display_name: clean(profile.display_name),
          full_name: clean(profile.full_name),
          email: clean(profile.email),
          avatar_url: clean(profile.avatar_url),
        },
      ]),
    );

    return Promise.all(
      rows.map(async (member) => {
        const profile = profilesById.get(member.user_id);
        let authName: string | null = null;
        let authEmail: string | null = null;

        if (!profile?.display_name && !profile?.full_name) {
          const { data: authData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
          const metadata = authData.user?.user_metadata ?? {};
          authName =
            clean(metadata.display_name) ?? clean(metadata.full_name) ?? clean(metadata.name);
          authEmail = clean(authData.user?.email);
        }

        return {
          user_id: member.user_id,
          role: member.role,
          joined_at: member.joined_at,
          display_name: profile?.display_name ?? authName,
          full_name: profile?.full_name ?? authName,
          email: profile?.email ?? authEmail,
          avatar_url: profile?.avatar_url ?? null,
        };
      }),
    );
  });

/**
 * Returns a workspace member directory with identity fields resolved from the
 * profile first and Supabase Auth metadata second. Older invited users can
 * legitimately have an empty profile row, so the Auth fallback is required
 * for their real name and avatar to appear in team surfaces.
 */
export const listWorkspaceMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string }) => workspaceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: caller, error: callerError } = await sbAny(context.supabase)
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (callerError) throw callerError;
    if (!caller) throw new Error("Workspace membership required");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: memberships, error: membershipError } = await sbAny(supabaseAdmin)
      .from("workspace_members")
      .select("user_id, role, status, created_at, last_active_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: true });
    if (membershipError) throw membershipError;

    const rows = (memberships ?? []) as Array<{
      user_id: string;
      role: "owner" | "admin" | "manager" | "agent" | "viewer";
      status: "active" | "suspended" | null;
      created_at: string;
      last_active_at: string | null;
    }>;
    const userIds = rows.map((member) => member.user_id);
    if (userIds.length === 0) return [];

    const { data: profiles, error: profileError } = await sbAny(supabaseAdmin)
      .from("profiles")
      .select("id, display_name, full_name, email, avatar_url, last_seen_at")
      .in("id", userIds);
    if (profileError) throw profileError;

    const profilesById = new Map(
      (profiles ?? []).map((profile: Record<string, unknown>) => [
        String(profile.id),
        {
          display_name: clean(profile.display_name),
          full_name: clean(profile.full_name),
          email: clean(profile.email),
          avatar_url: clean(profile.avatar_url),
          last_seen_at: clean(profile.last_seen_at),
        },
      ]),
    );

    return Promise.all(
      rows.map(async (member) => {
        const profile = profilesById.get(member.user_id);
        let authName: string | null = null;
        let authEmail: string | null = null;
        let authAvatar: string | null = null;

        if (!profile?.display_name || !profile?.email || !profile?.avatar_url) {
          const { data: authData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
          const metadata = authData.user?.user_metadata ?? {};
          authName =
            clean(metadata.display_name) ?? clean(metadata.full_name) ?? clean(metadata.name);
          authEmail = clean(authData.user?.email);
          authAvatar = clean(metadata.avatar_url) ?? clean(metadata.picture);
        }

        return {
          user_id: member.user_id,
          role: member.role,
          status: member.status ?? "active",
          created_at: member.created_at,
          last_active_at: member.last_active_at,
          display_name: profile?.display_name ?? profile?.full_name ?? authName,
          avatar_url: profile?.avatar_url ?? authAvatar,
          email: profile?.email ?? authEmail,
          last_seen_at: profile?.last_seen_at ?? null,
        };
      }),
    );
  });
