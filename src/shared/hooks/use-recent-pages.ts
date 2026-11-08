import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

const KEY = "wacrm.recent.v1";
const MAX = 8;
const IGNORE = ["/auth", "/maintenance", "/403"];

/**
 * useRecentPages — MRU list of visited routes, deduped. Persisted per
 * browser. Skips auth / error routes.
 */
export function useRecentPages() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [items, setItems] = useState<string[]>([]);

  // hydrate
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  // record navigation
  useEffect(() => {
    if (!pathname || IGNORE.some((p) => pathname === p || pathname.startsWith(p + "/"))) return;
    setItems((prev) => {
      const next = [pathname, ...prev.filter((p) => p !== pathname)].slice(0, MAX);
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, [pathname]);

  const clear = () => {
    setItems([]);
    try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
  };

  return { items, clear };
}
