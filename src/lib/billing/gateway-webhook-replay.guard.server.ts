import { sbAny } from "@/lib/supabase/untyped";
/** Super-admin gate for the webhook replay tool (server-only). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertReplayAdmin(supabase: any, userId: string): Promise<void> {
  const { data, error } = await sbAny(supabase).rpc("is_super_admin", { _user_id: userId });
  if (error) throw new Error("Unable to verify platform role");
  if (!data) throw new Error("Forbidden: super admins only");
}
