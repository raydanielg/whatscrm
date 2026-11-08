/**
 * Booking workspace resolution.
 *
 * The booking module used to read the caller's first `workspace_members` row and
 * throw "No workspace found" when it was missing. Users whose organization was
 * provisioned without an explicit workspace membership row (or who only own a
 * workspace) then saw every booking read fail silently — stats rendered "—" and
 * appointment types could not be created.
 *
 * This resolver falls back through owned workspaces and organization-scoped
 * workspaces, and backfills the missing membership row so later calls are cheap.
 */

export class NoWorkspaceError extends Error {
  constructor() {
    super("No workspace found for this account. Create or join a workspace first.");
    this.name = "NoWorkspaceError";
  }
}

export async function resolveBookingWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

  const { data: member } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (member?.workspace_id) return member.workspace_id as string;

  // Fallback 1: a workspace the user owns but has no membership row for.
  const { data: owned } = await supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owned?.id) {
    await backfillMembership(supabaseAdmin, userId, owned.id as string, "owner");
    return owned.id as string;
  }

  // Fallback 2: any workspace inside an organization the user belongs to.
  const { data: orgs } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(20);
  const orgIds = (orgs ?? [])
    .map((o) => (o as { organization_id: string | null }).organization_id)
    .filter((v): v is string => Boolean(v));
  if (orgIds.length > 0) {
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id")
      .in("organization_id", orgIds)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ws?.id) {
      await backfillMembership(supabaseAdmin, userId, ws.id as string, "member");
      return ws.id as string;
    }
  }

  throw new NoWorkspaceError();
}

async function backfillMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
  workspaceId: string,
  role: "owner" | "member",
): Promise<void> {
  try {
    await supabaseAdmin
      .from("workspace_members")
      .upsert(
        { user_id: userId, workspace_id: workspaceId, role, status: "active" },
        { onConflict: "workspace_id,user_id", ignoreDuplicates: true },
      );
  } catch {
    // Membership backfill is best-effort; resolution already succeeded.
  }
}
