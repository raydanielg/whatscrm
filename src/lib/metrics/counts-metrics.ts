/**
 * Client-side recorder for `get_conversation_counts` RPC metrics.
 *
 * Aggregates per-call samples in memory and flushes windowed summaries
 * (latency percentiles, error rate, payload size) to a server function so
 * we can watch for regressions in production.
 *
 * Enable verbose console output at runtime with:
 *   localStorage.setItem("debug:counts", "1")
 */
import { recordCountsMetrics } from "./counts-metrics.functions";

type Sample = {
  ms: number;
  bytes: number;
  ok: boolean;
  workspaceId: string | null;
  inboxId: string | null;
  errorMessage?: string;
};

const WINDOW_MS = 60_000;
const MAX_SAMPLES_PER_WINDOW = 500;

let buffer: Sample[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlushAt = 0;
/** Telemetry is best-effort: after repeated transport failures, stop trying. */
let consecutiveFlushFailures = 0;
const MAX_FLUSH_FAILURES = 3;

function debugEnabled(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem("debug:counts") === "1"
    );
  } catch {
    return false;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

function summarize(samples: Sample[]) {
  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);
  const bytes = samples.map((s) => s.bytes);
  const errors = samples.filter((s) => !s.ok);
  const errorSample = errors[0]?.errorMessage ?? null;
  const workspaceId = samples[samples.length - 1]?.workspaceId ?? null;
  const inboxId = samples[samples.length - 1]?.inboxId ?? null;
  return {
    workspaceId,
    inboxId,
    windowMs: WINDOW_MS,
    samples: samples.length,
    errors: errors.length,
    latency: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      p99: Math.round(percentile(latencies, 99)),
      max: Math.round(latencies[latencies.length - 1] ?? 0),
      avg:
        latencies.length === 0
          ? 0
          : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    },
    payload: {
      avgBytes:
        bytes.length === 0
          ? 0
          : Math.round(bytes.reduce((a, b) => a + b, 0) / bytes.length),
      maxBytes: Math.max(0, ...bytes),
    },
    errorSample,
    ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    ts: new Date().toISOString(),
  };
}

async function flush() {
  if (buffer.length === 0) {
    flushTimer = null;
    return;
  }
  const samples = buffer;
  buffer = [];
  flushTimer = null;
  lastFlushAt = Date.now();

  const summary = summarize(samples);
  if (debugEnabled()) {
    // eslint-disable-next-line no-console
    console.log("[metrics.counts] flush", summary);
  }
  // Expose latest window for debugging tools.
  try {
    (window as unknown as { __countsMetrics?: unknown }).__countsMetrics = summary;
  } catch {
    /* ignore */
  }
  if (consecutiveFlushFailures >= MAX_FLUSH_FAILURES) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  try {
    await recordCountsMetrics({ data: summary });
    consecutiveFlushFailures = 0;
  } catch (err) {
    consecutiveFlushFailures += 1;
    if (debugEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[metrics.counts] flush failed", err);
    }
  }
}

function scheduleFlush() {
  if (flushTimer != null) return;
  const elapsed = Date.now() - lastFlushAt;
  const delay = Math.max(1000, WINDOW_MS - elapsed);
  flushTimer = setTimeout(flush, delay);
}

/** Record one RPC observation. */
export function recordCountsRpc(sample: Sample) {
  if (buffer.length >= MAX_SAMPLES_PER_WINDOW) {
    // Drop oldest to bound memory; overflow itself is a signal.
    buffer.shift();
  }
  buffer.push(sample);
  scheduleFlush();
}

/** Instrument a promise resolving to the RPC response. */
export async function measureCountsRpc<T>(
  ctx: { workspaceId: string | null; inboxId: string | null },
  run: () => Promise<{ data: T; error: unknown }>,
): Promise<{ data: T; error: unknown }> {
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const startMark = `counts-rpc:start:${t0}`;
  try {
    performance.mark?.(startMark);
  } catch {
    /* ignore */
  }
  let res: { data: T; error: unknown };
  try {
    res = await run();
  } catch (err) {
    const t1 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    recordCountsRpc({
      ms: t1 - t0,
      bytes: 0,
      ok: false,
      workspaceId: ctx.workspaceId,
      inboxId: ctx.inboxId,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  const t1 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  let bytes = 0;
  try {
    bytes = res.data ? JSON.stringify(res.data).length : 0;
  } catch {
    /* ignore */
  }
  try {
    performance.measure?.("counts-rpc", startMark);
  } catch {
    /* ignore */
  }
  recordCountsRpc({
    ms: t1 - t0,
    bytes,
    ok: !res.error,
    workspaceId: ctx.workspaceId,
    inboxId: ctx.inboxId,
    errorMessage:
      res.error && typeof res.error === "object" && "message" in res.error
        ? String((res.error as { message?: unknown }).message ?? "")
        : undefined,
  });
  return res;
}

/** Force a flush — useful for tests and pagehide handlers. */
export function flushCountsMetrics() {
  return flush();
}
