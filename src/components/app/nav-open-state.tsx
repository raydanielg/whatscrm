import * as React from "react";
import { readActiveOrgId, subscribeActiveTenant } from "@/lib/tenant/active-tenant";

/**
 * Persistent open/closed state for sidebar provider & feature groups.
 *
 * Unlike the previous single-accordion behaviour, any number of groups can
 * stay expanded at once, and the expanded set is remembered **per tenant**
 * so switching organizations restores that org's own sidebar shape.
 */

const STORAGE_PREFIX = "wacrm.sidebar.groups.v1";

function storageKey(orgId: string | null) {
  return `${STORAGE_PREFIX}:${orgId ?? "global"}`;
}

function readOpenKeys(orgId: string | null): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(orgId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((k) => typeof k === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeOpenKeys(orgId: string | null, keys: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(orgId), JSON.stringify([...keys]));
  } catch {
    /* private mode / quota */
  }
}

export type NavOpenStore = {
  isOpen: (key: string) => boolean;
  setOpen: (key: string, open: boolean) => void;
  /** True once the persisted set has been read from localStorage. */
  hydrated: boolean;
  /** True when the current tenant had a previously persisted open group. */
  hasStored: boolean;
};

export const NavOpenStoreContext = React.createContext<NavOpenStore | null>(null);
/** Dotted path of ancestor keys, so identical labels at different depths never collide. */
export const NavPathContext = React.createContext<string>("");

export function useNavOpenStore(): NavOpenStore {
  const [orgId, setOrgId] = React.useState<string | null>(null);
  const [openKeys, setOpenKeys] = React.useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = React.useState(false);
  const [hasStored, setHasStored] = React.useState(false);

  // Hydrate client-side and re-hydrate whenever the active tenant changes.
  React.useEffect(() => {
    const sync = () => {
      const id = readActiveOrgId();
      const stored = readOpenKeys(id);
      setOrgId(id);
      setOpenKeys(stored);
      setHasStored(stored.size > 0);
      setHydrated(true);
    };
    sync();
    return subscribeActiveTenant(sync);
  }, []);


  const setOpen = React.useCallback(
    (key: string, open: boolean) => {
      setOpenKeys((prev) => {
        const next = new Set(prev);
        if (open) {
          // Accordion at this level only: close same-parent siblings, but keep
          // their nested state remembered so reopening restores the sub-tree.
          const lastDot = key.lastIndexOf(".");
          const parent = lastDot === -1 ? "" : key.slice(0, lastDot);
          for (const k of prev) {
            if (k === key) continue;
            const kLastDot = k.lastIndexOf(".");
            const kParent = kLastDot === -1 ? "" : k.slice(0, kLastDot);
            if (kParent === parent) next.delete(k);
          }
          next.add(key);
        } else {
          if (!prev.has(key)) return prev;
          // Only collapse this level — descendants keep their remembered state.
          next.delete(key);
        }
        let same = next.size === prev.size;
        if (same) for (const k of next) if (!prev.has(k)) { same = false; break; }
        if (same) return prev;
        writeOpenKeys(orgId, next);
        return next;
      });
    },
    [orgId],
  );


  return React.useMemo(
    () => ({ isOpen: (key: string) => openKeys.has(key), setOpen, hydrated, hasStored }),
    [openKeys, setOpen, hydrated, hasStored],

  );
}
