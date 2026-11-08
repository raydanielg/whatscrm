import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

type MemberDirectoryInput = { workspaceId: string };

export const getWorkspaceMemberDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: MemberDirectoryInput) => input)
  .handler(async ({ data, context }) => {
    const { data: callerMembership, error: membershipError } = await context.supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (membershipError || !callerMembership) {
      throw new Error("Forbidden: workspace membership required");
    }

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: members, error: membersError } = await sbAny(supabaseAdmin)
      .from("workspace_members")
      .select("user_id, role, status, created_at, last_active_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at");

    if (membersError) throw new Error(membersError.message);
    const rows = members ?? [];
    const userIds = rows.map((member) => member.user_id as string);
    if (userIds.length === 0) return [];

    const { data: profiles, error: profilesError } = await sbAny(supabaseAdmin)
      .from("profiles")
      .select("id, display_name, full_name, avatar_url, email, last_seen_at")
      .in("id", userIds);

    if (profilesError) throw new Error(profilesError.message);
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));

    const authUsers = await Promise.all(
      userIds.map(async (userId) => {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
        return [userId, authData.user] as const;
      }),
    );
    const authById = new Map(authUsers);

    return rows.map((member) => {
      const profile = profileById.get(member.user_id as string);
      const authUser = authById.get(member.user_id as string);
      const metadata = authUser?.user_metadata ?? {};

      return {
        ...member,
        display_name:
          profile?.display_name ??
          profile?.full_name ??
          metadata.full_name ??
          metadata.name ??
          authUser?.email?.split("@")[0] ??
          null,
        avatar_url: profile?.avatar_url ?? metadata.avatar_url ?? metadata.picture ?? null,
        email: profile?.email ?? authUser?.email ?? null,
        last_seen_at: profile?.last_seen_at ?? authUser?.last_sign_in_at ?? null,
      };
    });
  });
