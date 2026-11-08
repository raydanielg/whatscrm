/**
 * Structured logger for the messaging layer. Writes to `provider_logs`
 * (workspace-scoped) so admins can audit webhook + send activity.
 *
 * SERVER-ONLY. Never import from a component / route module scope.
 */

import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import type { ProviderName } from "./types";
import { sbAny } from "@/lib/supabase/untyped";

export interface LogEntry {
  workspaceId?: string | null;
  channelAccountId?: string | null;
  provider?: ProviderName | null;
  level: "debug" | "info" | "warn" | "error";
  scope: string;
  message: string;
  data?: Record<string, unknown>;
  correlationId?: string;
}

export async function log(entry: LogEntry): Promise<void> {
  // Always mirror to stdout for edge log aggregation.
  const line = `[msg:${entry.scope}] ${entry.level.toUpperCase()} ${entry.message}`;
  if (entry.level === "error") console.error(line, entry.data ?? {});
  else if (entry.level === "warn") console.warn(line, entry.data ?? {});
  else console.log(line, entry.data ?? {});

  try {
    await sbAny(supabaseAdmin).from("provider_logs" as never).insert({
      workspace_id: entry.workspaceId ?? null,
      channel_account_id: entry.channelAccountId ?? null,
      provider: entry.provider ?? null,
      level: entry.level,
      scope: entry.scope,
      message: entry.message,
      data: entry.data ?? {},
      correlation_id: entry.correlationId ?? null,
    } as never);
  } catch (err) {
    // Never let logging kill the caller.
    console.error("[msg:logger] failed to persist log", err);
  }
}

export function makeCorrelationId(): string {
  return `cor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
