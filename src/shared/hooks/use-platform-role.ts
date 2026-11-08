import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlatformRole = "superadmin" | "support" | null;

/**
 * Reads the caller's platform-level role from `public.user_roles`.
 * Returns `null` while loading or when the table/row is missing so callers
 * can render a safe "no privilege" state without crashing.
 *
 * Backed by the `has_role(user_id, role app_role)` security-definer helper
 * once the roles migration ships (see docs/architecture/SOFTWARE_ARCHITECTURE.md).
 */
export function usePlatformRole(): { role: PlatformRole; loading: boolean } {
  const [role, setRole] = useState<PlatformRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        if (!cancelled) { setRole(null); setLoading(false); }
        return;
      }
      // Best-effort read; ignore errors when the table doesn't exist yet.
      const { data } = await supabase
        .from("user_roles" as never)
        .select("role")
        .eq("user_id", userRes.user.id)
        .in("role", ["superadmin", "support"])
        .maybeSingle();
      if (cancelled) return;
      const r = (data as { role?: PlatformRole } | null)?.role ?? null;
      setRole(r);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { role, loading };
}
