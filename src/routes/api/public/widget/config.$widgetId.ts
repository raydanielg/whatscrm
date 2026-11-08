/**
 * GET /api/public/widget/config/:widgetId
 *
 * Returns the resolved widget config + routed chatbot for the embed iframe.
 * Applies domain allowlist (if configured) and evaluates routing rules
 * against the calling page URL.
 */
import { createFileRoute } from "@tanstack/react-router";
import { evaluateSchedule, mergeSchedule } from "@/lib/widgets/schedule";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
} as const;

interface RoutingCondition {
  type: string;
  value?: string;
  from?: string;
  to?: string;
  timezone?: string;
}
interface RoutingRule {
  id: string;
  name: string;
  when: RoutingCondition[];
  chatbotId: string | null;
  hideWidget?: boolean;
}

function inBusinessHours(from: string, to: string, tz?: string): boolean {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const [h, m] = fmt.format(now).split(":").map(Number);
    const cur = h * 60 + m;
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    const start = fh * 60 + fm;
    const end = th * 60 + tm;
    return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
  } catch {
    return true;
  }
}

function matchRule(rule: RoutingRule, url: string, lang: string): boolean {
  let u: URL | null = null;
  try {
    u = new URL(url);
  } catch {
    /* noop */
  }
  return rule.when.every((c) => {
    if (c.type === "url_contains") return url.includes(c.value ?? "");
    if (c.type === "url_equals") return url === c.value;
    if (c.type === "path_starts_with") return (u?.pathname ?? "").startsWith(c.value ?? "");
    if (c.type === "language") return lang.startsWith(c.value ?? "");
    if (c.type === "business_hours")
      return inBusinessHours(c.from ?? "00:00", c.to ?? "23:59", c.timezone);
    return false;
  });
}

export const Route = createFileRoute("/api/public/widget/config/$widgetId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => {
        const widgetId = params.widgetId;
        if (!/^[0-9a-f-]{36}$/i.test(widgetId)) {
          return new Response(JSON.stringify({ error: "bad id" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const url = new URL(request.url);
        const pageUrl = url.searchParams.get("url") ?? "";
        const lang =
          url.searchParams.get("lang") ??
          request.headers.get("accept-language")?.slice(0, 5) ??
          "en";

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: row, error } = await supabaseAdmin
          .from("chat_widgets")
          .select(
            "id, name, is_active, chatbot_id, config, routing_rules, allowed_domains, schedule",
          )
          .eq("id", widgetId)
          .maybeSingle();
        if (error || !row) {
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const w = row as {
          id: string;
          name: string;
          is_active: boolean;
          chatbot_id: string | null;
          config: unknown;
          routing_rules: unknown;
          allowed_domains: string[];
          schedule: unknown;
        };
        if (!w.is_active) {
          return new Response(JSON.stringify({ error: "inactive" }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        // Domain allowlist
        if (w.allowed_domains && w.allowed_domains.length > 0 && pageUrl) {
          try {
            const host = new URL(pageUrl).hostname;
            // Entries may be saved with a scheme or port (e.g. "https://wrapcoders.bid");
            // compare on the bare hostname so they match.
            const ok = w.allowed_domains.some((raw) => {
              const d = String(raw)
                .trim()
                .toLowerCase()
                .replace(/^[a-z]+:\/\//, "")
                .split(/[/:?#]/)[0];
              return !!d && (host === d || host.endsWith(`.${d}`));
            });
            if (!ok) {
              return new Response(JSON.stringify({ error: "domain not allowed" }), {
                status: 403,
                headers: { "Content-Type": "application/json", ...CORS },
              });
            }
          } catch {
            /* ignore */
          }
        }

        // Schedule evaluation
        const schedule = mergeSchedule(w.schedule);
        const evalResult = evaluateSchedule(schedule);
        if (!evalResult.active && schedule.enabled && schedule.offlineBehavior === "hide") {
          return new Response(JSON.stringify({ error: "offline", reason: evalResult.reason }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        // Routing
        const rules = (Array.isArray(w.routing_rules) ? w.routing_rules : []) as RoutingRule[];
        const matched = rules.find((r) => matchRule(r, pageUrl, lang));
        const chatbotId = matched?.chatbotId ?? w.chatbot_id;
        const hide = matched?.hideWidget === true;

        return new Response(
          JSON.stringify({
            id: w.id,
            name: w.name,
            config: w.config ?? {},
            chatbotId,
            hide,
            matchedRuleId: matched?.id ?? null,
            offline: !evalResult.active,
            offlineMessage: evalResult.active ? null : schedule.offlineMessage,
            scheduleReason: evalResult.reason,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
        );
      },
    },
  },
});
