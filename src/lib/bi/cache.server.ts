// Metric cache helpers — hash params, read/write cached results.
import { createHash } from "crypto";
import { sbAny } from "@/lib/supabase/untyped";

export function hashParams(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input ?? {})).digest("hex").slice(0, 32);
}

interface AdminClient {
  from: (t: string) => any;
}

export async function readCache<T>(admin: AdminClient, workspaceId: string, key: string, paramsHash: string): Promise<T | null> {
  const { data } = await sbAny(admin).from("bi_metric_cache")
    .select("value, expires_at")
    .eq("workspace_id", workspaceId).eq("metric_key", key).eq("params_hash", paramsHash)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return data.value as T;
}

export async function writeCache(admin: AdminClient, workspaceId: string, key: string, paramsHash: string, value: unknown, ttlSeconds = 60): Promise<void> {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await sbAny(admin).from("bi_metric_cache").upsert({
    workspace_id: workspaceId, metric_key: key, params_hash: paramsHash,
    value, expires_at: expires, computed_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,metric_key,params_hash" });
}
