/**
 * Offline mutation outbox.
 *
 * Any mutation performed while offline is pushed here. A background flusher
 * drains the queue when connectivity returns. Each entry is idempotent —
 * server functions should accept a client-generated `client_id` to dedupe.
 */
import { kv } from '@/lib/storage';
import { supabase } from '@/api/supabase';

export type OutboxEntry = {
  id: string;
  createdAt: number;
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  match?: Record<string, unknown>;
  attempts: number;
};

const KEY = 'outbox:v1';

function read(): OutboxEntry[] {
  const raw = kv.getString(KEY);
  return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
}
function write(entries: OutboxEntry[]) {
  kv.set(KEY, JSON.stringify(entries));
}

export function enqueue(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'attempts'>) {
  const list = read();
  list.push({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    attempts: 0,
  });
  write(list);
}

export function pending() {
  return read();
}

export async function flush(): Promise<{ ok: number; failed: number }> {
  const list = read();
  const remaining: OutboxEntry[] = [];
  let ok = 0;
  let failed = 0;

  for (const entry of list) {
    try {
      const t = supabase.from(entry.table);
      let error: unknown = null;
      if (entry.op === 'insert') ({ error } = await t.insert(entry.payload));
      else if (entry.op === 'update') ({ error } = await t.update(entry.payload).match(entry.match ?? {}));
      else ({ error } = await t.delete().match(entry.match ?? {}));

      if (error) throw error;
      ok += 1;
    } catch {
      failed += 1;
      if (entry.attempts < 5) remaining.push({ ...entry, attempts: entry.attempts + 1 });
    }
  }
  write(remaining);
  return { ok, failed };
}
