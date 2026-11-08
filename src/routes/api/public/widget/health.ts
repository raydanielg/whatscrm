/**
 * Public health endpoint for the Live Chat widget SDK.
 *
 * Consumed by:
 *   - Monitoring / uptime probes on customer sites
 *   - The Live Chat Overview dashboard
 *   - `window.WACRMChat.health()` runtime API
 *
 * Response is intentionally minimal — no PII, no workspace IDs — and cached
 * for 30s at the edge. Reports whether the widget can accept a specific bot
 * (when `chatbotId` is passed) or the overall service.
 */
import { createFileRoute } from "@tanstack/react-router";
import { loadEmbeddableBot } from "@/lib/widget/widget-runtime.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
      ...CORS,
      ...extra,
    },
  });
}

export const Route = createFileRoute("/api/public/widget/health")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);
        const botId = url.searchParams.get("chatbotId");

        if (botId) {
          try {
            const bot = await loadEmbeddableBot(botId);
            return json(200, {
              status: bot ? "ok" : "unavailable",
              chatbotId: botId,
              embeddable: !!bot,
              service: "livechat-widget",
              latencyMs: Date.now() - t0,
              time: new Date().toISOString(),
            });
          } catch {
            return json(200, {
              status: "degraded",
              chatbotId: botId,
              embeddable: false,
              service: "livechat-widget",
              latencyMs: Date.now() - t0,
              time: new Date().toISOString(),
            });
          }
        }

        return json(200, {
          status: "ok",
          service: "livechat-widget",
          latencyMs: Date.now() - t0,
          time: new Date().toISOString(),
        });
      },
    },
  },
});
