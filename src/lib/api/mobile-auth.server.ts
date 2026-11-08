/**
 * Shared bearer-token authentication for the `/api/mobile/*` endpoints.
 *
 * These routes used to accept any header that merely started with "Bearer ",
 * which let anonymous callers burn the shared AI budget and target arbitrary
 * workspaces. Every mobile endpoint now resolves the token through Supabase
 * (`auth.getUser`) and, where a workspace is supplied by the client, verifies
 * the resolved user is an active member of that workspace.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface MobileAuth {
  userId: string;
  token: string;
  /** RLS-scoped client acting as the authenticated user. */
  supabase: SupabaseClient<Database>;
}

function bearer(request: Request): string | null {
  const auth =
    request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Build a user-scoped Supabase client for a raw access token. */
export function userClient(token: string): SupabaseClient<Database> {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/**
 * Verifies the bearer token server-side. Returns `{ auth }` on success or
 * `{ response }` with a generic 401 that leaks no internal detail.
 */
export async function authenticateMobileRequest(
  request: Request,
): Promise<{ auth: MobileAuth } | { response: Response }> {
  const token = bearer(request);
  if (!token) return { response: new Response("Unauthorized", { status: 401 }) };

  const supabase = userClient(token);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { response: new Response("Unauthorized", { status: 401 }) };
  }
  return { auth: { userId: data.user.id, token, supabase } };
}

/**
 * Confirms the authenticated user is an active member of `workspaceId`.
 * Returns a 403 Response when they are not.
 */
export async function requireWorkspaceMembership(
  auth: MobileAuth,
  workspaceId: string,
): Promise<Response | null> {
  const { data, error } = await auth.supabase.rpc("is_active_workspace_member", {
    _workspace_id: workspaceId,
    _user_id: auth.userId,
  });
  if (error || data !== true) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}
