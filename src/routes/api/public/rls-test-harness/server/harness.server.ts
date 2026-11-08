import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Privileged client for RLS test harness.
 * Only ever imported by .server.ts files.
 */
export function getHarnessAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !serviceKey || !publishableKey) {
    throw new Error("Missing Supabase configuration");
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { admin, url, serviceKey, publishableKey };
}
