import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";

const IDLE_KEY = "wacrm.idle.minutes";
const DEFAULT_IDLE_MINUTES = 30;

export function getIdleMinutes(): number {
  if (typeof window === "undefined") return DEFAULT_IDLE_MINUTES;
  const raw = window.localStorage.getItem(IDLE_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_MINUTES;
}

export function setIdleMinutes(m: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IDLE_KEY, String(m));
  window.dispatchEvent(new CustomEvent("wacrm:idle-changed"));
}

/**
 * Signs the user out after N minutes of no interaction. Zero disables it.
 * Only active while a Supabase session exists.
 */
export function IdleLogoutSentinel() {
  const timer = useRef<number | null>(null);
  const minutes = useRef<number>(getIdleMinutes());
  const hasSession = useRef<boolean>(false);
  // Platform Settings → Security → "Session timeout" is a hard ceiling:
  // a user may choose a shorter idle window, never a longer one.
  const { config } = usePlatformRuntime();
  const platformMax = config.security.sessionTimeoutMinutes;
  const maxRef = useRef<number>(platformMax);
  maxRef.current = platformMax;

  useEffect(() => {
    if (typeof window === "undefined") return;

    function clear() {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    }

    function schedule() {
      clear();
      const effective = minutes.current > 0 ? Math.min(minutes.current, maxRef.current) : maxRef.current;
      if (!hasSession.current || effective <= 0) return;
      timer.current = window.setTimeout(async () => {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) {
          // A temporary DNS/offline failure must not become an unhandled
          // rejection or attempt a global remote logout repeatedly.
          toast.error("Could not sign out while offline. Please try again.");
          schedule();
          return;
        }
        toast.info("Signed out due to inactivity");
      }, effective * 60 * 1000);
    }

    async function initSession() {
      const { data } = await supabase.auth.getSession();
      hasSession.current = !!data.session;
      schedule();
    }
    void initSession();

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, schedule, { passive: true }));
    document.addEventListener("visibilitychange", schedule);

    const onIdleChanged = () => {
      minutes.current = getIdleMinutes();
      schedule();
    };
    window.addEventListener("wacrm:idle-changed", onIdleChanged);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Only react to identity transitions; TOKEN_REFRESHED fires ~hourly.
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      hasSession.current = !!session;
      schedule();
    });

    return () => {
      clear();
      events.forEach((e) => window.removeEventListener(e, schedule));
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("wacrm:idle-changed", onIdleChanged);
      sub.subscription.unsubscribe();
    };
  }, [platformMax]);

  return null;
}
