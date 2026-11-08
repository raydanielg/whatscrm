/**
 * Reads security signals without lying about the ones it could not read.
 *
 * The Security Center and Security Issues scanner used to wrap every query in a
 * helper that turned ANY failure into `0` / `[]`. A wrong column name, a
 * missing table or an RLS error therefore rendered as "0 failed logins, 0
 * webhook failures, no API keys without scopes" — a clean bill of health over
 * data that was never read. (Three column names in the Security Center and two
 * in the scanner were wrong that way, so those checks could never fire.)
 *
 * This reader keeps the numeric/array fallback so callers stay simple, but it
 * records every source that failed. Callers surface `unavailable` to the UI, and
 * the scanner refuses to report a finding as "passing" on unreadable data.
 *
 * An RLS filter that legitimately returns no rows is NOT a failure and is not
 * recorded — only query errors are.
 */
import { sbAny } from "@/lib/supabase/untyped";

export type UnavailableSignal = {
  /** Table or logical source that could not be read. */
  source: string;
  /** The database's own message, so the operator can fix the cause. */
  reason: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tune = (q: any) => any;

export function createSignalReader(client: unknown) {
  const unavailable: UnavailableSignal[] = [];

  const note = (source: string, reason: string) => {
    if (!unavailable.some((u) => u.source === source)) unavailable.push({ source, reason });
  };

  /** Row count; `0` (and a recorded failure) if the query errors. */
  async function count(table: string, tune: Tune = (q) => q, label: string = table): Promise<number> {
    try {
      const { count: n, error } = await tune(
        sbAny(client).from(table).select("*", { count: "exact", head: true }),
      );
      if (error) {
        note(label, String(error.message ?? error));
        return 0;
      }
      return n ?? 0;
    } catch (e) {
      note(label, e instanceof Error ? e.message : String(e));
      return 0;
    }
  }

  /** Rows; `[]` (and a recorded failure) if the query errors. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function select<T = any>(table: string, cols: string, tune: Tune = (q) => q, label: string = table): Promise<T[]> {
    try {
      const { data, error } = await tune(sbAny(client).from(table).select(cols));
      if (error) {
        note(label, String(error.message ?? error));
        return [];
      }
      return (data ?? []) as T[];
    } catch (e) {
      note(label, e instanceof Error ? e.message : String(e));
      return [];
    }
  }

  return {
    count,
    select,
    /** Record a failure from a query the caller ran itself. */
    note,
    /** Has this source failed so far? Use it to refuse a "passing" verdict. */
    failed: (source: string) => unavailable.some((u) => u.source === source),
    unavailable,
  };
}
