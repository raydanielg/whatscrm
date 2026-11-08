import { getHarnessAdmin } from "./harness.server";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function setupHarness() {
  const { admin, url, serviceKey, publishableKey } = getHarnessAdmin();
  const runId = crypto.randomUUID().slice(0, 8);

  const mkUser = async (label: string) => {
    const email = `rls-${label}-${runId}@rls-harness.test`;
    const password = `Rls-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { rls_harness: true, run_id: runId },
    });
    if (error || !data.user) throw new Error(`user_create_${label}: ${error?.message}`);
    return { id: data.user.id, email, password };
  };

  const signIn = async (email: string, password: string) => {
    const client = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(`signin: ${error?.message}`);
    return { client, accessToken: data.session.access_token };
  };

  const createWs = async (client: SupabaseClient<Database>, name: string) => {
    const { data, error } = await client.rpc("create_workspace_with_owner", {
      _name: `RLS ${name.toUpperCase()} ${runId}`,
      _slug: `rls-${name}-${runId}`,
      _description: "rls-harness",
    });
    if (error) throw new Error(`create_ws_${name}: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as {
      id: string;
      organization_id: string | null;
    };
    return {
      workspaceId: row.id,
      organizationId: row.organization_id ?? row.id,
    };
  };

  const userA = await mkUser("a");
  const userB = await mkUser("b");
  const sessA = await signIn(userA.email, userA.password);
  const sessB = await signIn(userB.email, userB.password);
  const wsA = await createWs(sessA.client, "a");
  const wsB = await createWs(sessB.client, "b");

  return {
    run_id: runId,
    supabase_url: url,
    publishable_key: publishableKey,
    userA: { ...userA, access_token: sessA.accessToken, ...wsA },
    userB: { ...userB, access_token: sessB.accessToken, ...wsB },
  };
}
