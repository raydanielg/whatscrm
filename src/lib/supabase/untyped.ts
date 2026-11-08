/**
 * Typecheck-performance escape hatch.
 *
 * The generated `Database` types make every `.select("a, b, c")` string a
 * type-level parse. Across the large server-function surface of this app that
 * costs minutes of typecheck time. `sbAny` keeps the runtime client exactly as
 * it is while opting a call chain out of that parsing.
 *
 * Use it for server-side queries whose shapes are already validated by Zod or
 * explicit return types. Prefer the typed client in new, small modules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UntypedClient = SupabaseClient<any, "public", any>;

export function sbAny(client: unknown): UntypedClient {
  return client as UntypedClient;
}
