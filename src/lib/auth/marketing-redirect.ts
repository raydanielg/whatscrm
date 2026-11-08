import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const MARKETING_PATHS = ["/", "/features", "/pricing", "/about", "/contact"] as const;

/** Keep marketing routes public for visitors, but send signed-in users into the app. */
export async function redirectSignedInFromMarketing() {
  // Auth is stored in the browser; the server cannot resolve this session.
  if (typeof window === "undefined") return;

  const { data } = await supabase.auth.getSession();
  if (data.session) throw redirect({ to: "/dashboard", replace: true });
}
