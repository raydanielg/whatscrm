/**
 * Structured logger. Enterprise-grade: level-aware, JSON in production for
 * ingestion by Datadog/Grafana Loki/CloudWatch; pretty in dev.
 *
 * Usage:
 *   import { logger } from '@/shared/lib/logger';
 *   logger.info('user.signup', { userId });
 *   logger.error('payment.failed', { orderId, err });
 *
 * Never log PII, tokens, secrets, or full request bodies.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const configuredLevel: Level =
  (typeof process !== "undefined" && (process.env?.LOG_LEVEL as Level)) ||
  (typeof import.meta !== "undefined" && (import.meta as { env?: { MODE?: string } }).env?.MODE === "production"
    ? "info"
    : "debug");

const isProd =
  typeof process !== "undefined"
    ? process.env?.NODE_ENV === "production"
    : (import.meta as { env?: { PROD?: boolean } }).env?.PROD === true;

function emit(level: Level, event: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[configuredLevel]) return;

  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const line = isProd ? JSON.stringify(payload) : `[${level.toUpperCase()}] ${event} ${context ? JSON.stringify(context) : ""}`;

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  debug: (event: string, ctx?: Record<string, unknown>) => emit("debug", event, ctx),
  info: (event: string, ctx?: Record<string, unknown>) => emit("info", event, ctx),
  warn: (event: string, ctx?: Record<string, unknown>) => emit("warn", event, ctx),
  error: (event: string, ctx?: Record<string, unknown>) => emit("error", event, ctx),
  child: (bindings: Record<string, unknown>) => ({
    debug: (e: string, c?: Record<string, unknown>) => emit("debug", e, { ...bindings, ...c }),
    info: (e: string, c?: Record<string, unknown>) => emit("info", e, { ...bindings, ...c }),
    warn: (e: string, c?: Record<string, unknown>) => emit("warn", e, { ...bindings, ...c }),
    error: (e: string, c?: Record<string, unknown>) => emit("error", e, { ...bindings, ...c }),
  }),
};

/**
 * Report an error to the monitoring backend (Sentry/Datadog/etc).
 * Wire the actual SDK here — this stub logs so callers can integrate now.
 */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  logger.error("error.reported", { ...context, err });
  // TODO: Sentry.captureException(error, { extra: context })
}
