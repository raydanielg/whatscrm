import { useEffect, useState } from "react";
import { X, Beaker } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_ACCOUNTS, DEMO_MODE_STORAGE_KEY } from "@/lib/demo/accounts";
import { DEMO_MODE_ENABLED } from "@/lib/demo/mode";

/**
 * Global "Demo Mode" strip. Only mounts when VITE_DEMO_MODE is enabled AND
 * the current session is a demo account. Dismissible per session.
 */
export function DemoModeBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!DEMO_MODE_ENABLED) return;
    let cancelled = false;
    const dismissed =
      typeof window !== "undefined" && window.sessionStorage.getItem("wacrm.demo-mode.dismissed") === "1";
    if (dismissed) return;

    async function check() {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email?.toLowerCase();
      const flagged =
        typeof window !== "undefined" && window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "1";
      const isDemo = !!email && DEMO_ACCOUNTS.some((a) => a.email.toLowerCase() === email);
      if (!cancelled) setVisible(isDemo || (flagged && !!email));
    }
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") check();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!visible) return null;
  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs">
      <div className="max-w-screen-2xl mx-auto flex items-center gap-2 px-4 py-1.5">
        <Beaker className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="font-medium">Demo Mode</span>
        <span className="text-amber-800/80 dark:text-amber-100/80 hidden sm:inline">
          You're signed in with a shared demo account. Destructive actions may be limited.
        </span>
        <button
          type="button"
          onClick={() => {
            window.sessionStorage.setItem("wacrm.demo-mode.dismissed", "1");
            setVisible(false);
          }}
          className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded hover:bg-amber-500/20"
          aria-label="Dismiss demo mode notice"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
