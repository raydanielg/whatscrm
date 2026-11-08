/**
 * Worker configuration. All values come from the environment (.env / PM2 env).
 * Fails fast on boot when a required secret is missing — a misconfigured worker
 * that silently accepts unsigned traffic is worse than one that refuses to start.
 */
const required = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "0.0.0.0",

  /** Bearer token the WACRM app must present on every inbound call. */
  workerToken: required("WA_QR_WORKER_TOKEN"),
  /** HMAC secret for app → worker request signing. */
  signingSecret: required("WA_QR_WORKER_SIGNING_SECRET"),
  /** HMAC secret for worker → app webhook signing. */
  webhookSecret: required("WA_QR_WEBHOOK_SECRET"),
  /** Absolute URL of the WACRM webhook endpoint. */
  webhookUrl:
    process.env.WACRM_WEBHOOK_URL || "https://wrapcoders.bid/api/public/whatsapp/qr-webhook",

  /** Where Baileys auth state is persisted. MUST survive restarts. */
  authDir: process.env.WA_AUTH_DIR || "./data/auth",
  /** Max clock skew accepted on inbound signed requests (seconds). */
  maxSkewSeconds: 300,
  /** How long a sent-message idempotency record is kept (ms). */
  dedupeTtlMs: 24 * 60 * 60 * 1000,
  logLevel: process.env.LOG_LEVEL || "info",
};
