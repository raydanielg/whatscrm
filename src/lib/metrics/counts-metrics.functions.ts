import { createServerFn } from "@tanstack/react-start";

/**
 * Structured metrics ingest for the `get_conversation_counts` RPC.
 *
 * Emitted as a single JSON line prefixed with `[metrics.counts]` so it is
 * discoverable via server-function-logs / worker log search. Kept tiny by
 * design — clients send pre-aggregated windows, not per-call events.
 */
export type CountsMetricsSample = {
  workspaceId: string | null;
  inboxId: string | null;
  windowMs: number;
  samples: number;
  errors: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    avg: number;
  };
  payload: {
    avgBytes: number;
    maxBytes: number;
  };
  errorSample: string | null;
  ua: string | null;
  ts: string;
};

export const recordCountsMetrics = createServerFn({ method: "POST" })
  .validator((data: CountsMetricsSample) => data)
  .handler(async ({ data }) => {
    // Structured log line — parseable and grep-friendly.
    // eslint-disable-next-line no-console
    console.log("[metrics.counts]", JSON.stringify(data));
    return { ok: true as const };
  });
