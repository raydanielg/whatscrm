import { useCallback, useEffect, useState } from "react";

const KEY = "wacrm.favorites.v1";
const MAX = 12;

/**
 * useFavorites — user-pinned pages. Persisted in localStorage per browser.
 * Values are route paths (e.g. "/contacts", "/reports/quarterly").
 */
export function useFavorites() {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  const persist = useCallback((next: string[]) => {
    setItems(next);
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
  }, []);

  const isFavorite = useCallback((path: string) => items.includes(path), [items]);

  const toggle = useCallback((path: string) => {
    persist(
      items.includes(path)
        ? items.filter((p) => p !== path)
        : [path, ...items].slice(0, MAX),
    );
  }, [items, persist]);

  const remove = useCallback((path: string) => {
    persist(items.filter((p) => p !== path));
  }, [items, persist]);

  const reorder = useCallback((from: number, to: number) => {
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
  }, [items, persist]);

  const clear = useCallback(() => persist([]), [persist]);

  return { items, isFavorite, toggle, remove, reorder, clear };
}
