import { getHarnessAdmin } from "./harness.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sbAny } from "@/lib/supabase/untyped";

export type OrgRole = "owner" | "admin" | "member" | "billing" | "guest";
export type WorkspaceRole = "owner" | "admin" | "agent" | "viewer" | "manager";

export type MemberSpec = {
  /** Label used in the generated e-mail, e.g. "billing". */
  label: string;
  organization_id: string;
  workspace_id?: string;
  org_role: OrgRole;
  workspace_role?: WorkspaceRole;
};

/**
 * Creates ephemeral auth users and enrolls each into the given organization
 * (and optionally workspace) with an explicit role, so RLS suites can probe
 * every role instead of just the tenant owner.
 */
export async function createHarnessMembers(specs: MemberSpec[]) {
  const { admin, url, publishableKey } = getHarnessAdmin();
  const runId = crypto.randomUUID().slice(0, 8);
  const members: Array<{
    id: string;
    email: string;
    password: string;
    access_token: string;
    org_role: OrgRole;
    workspace_role: WorkspaceRole | null;
    organization_id: string;
    workspace_id: string | null;
  }> = [];

  for (const spec of specs) {
    const email = `rls-${spec.label}-${runId}@rls-harness.test`;
    const password = `Rls-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { rls_harness: true, run_id: runId },
    });
    if (error || !data.user) throw new Error(`user_create_${spec.label}: ${error?.message}`);
    const userId = data.user.id;

    const orgIns = await admin
      .from("organization_members")
      .upsert(
        { organization_id: spec.organization_id, user_id: userId, role: spec.org_role },
        { onConflict: "organization_id,user_id" },
      );
    if (orgIns.error) throw new Error(`org_member_${spec.label}: ${orgIns.error.message}`);

    if (spec.workspace_id) {
      const wsIns = await sbAny(admin).from("workspace_members").upsert(
        {
          workspace_id: spec.workspace_id,
          user_id: userId,
          role: spec.workspace_role ?? "viewer",
          status: "active",
        },
        { onConflict: "workspace_id,user_id" },
      );
      if (wsIns.error) throw new Error(`ws_member_${spec.label}: ${wsIns.error.message}`);
    }

    const client = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session) {
      throw new Error(`signin_${spec.label}: ${signIn.error?.message}`);
    }

    members.push({
      id: userId,
      email,
      password,
      access_token: signIn.data.session.access_token,
      org_role: spec.org_role,
      workspace_role: spec.workspace_role ?? null,
      organization_id: spec.organization_id,
      workspace_id: spec.workspace_id ?? null,
    });
  }

  return { run_id: runId, supabase_url: url, publishable_key: publishableKey, members };
}
