/**
 * GET /api/public/widget/embed?w=<widgetId>
 *
 * Serves the loader JavaScript customers paste into their site. Injects a
 * launcher iframe pointing at /embed/w/<widgetId>. Deliberately minimal — the
 * widget UI itself lives in the iframe, so we can update it without asking
 * customers to re-paste the snippet.
 */
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300",
} as const;

type LauncherPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

// Maps the widget's launcherPosition to the fixed-position inset for the wrapper.
function wrapInset(pos: LauncherPosition): string {
  switch (pos) {
    case "bottom-left":
      return "auto auto 0 0";
    case "top-right":
      return "0 0 auto auto";
    case "top-left":
      return "0 auto auto 0";
    default:
      return "auto 0 0 auto";
  }
}

interface LoaderSettings {
  pos: LauncherPosition;
  delayMs: number;
}

// Reads the widget's saved launcher position and show delay from its config.
async function readLoaderSettings(widgetId: string): Promise<LoaderSettings> {
  const settings: LoaderSettings = { pos: "bottom-right", delayMs: 0 };
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data } = await supabaseAdmin
      .from("chat_widgets")
      .select("config")
      .eq("id", widgetId)
      .maybeSingle();
    const cfg = (data as { config?: { launcherPosition?: string; showDelayMs?: number } } | null)
      ?.config;
    const pos = cfg?.launcherPosition;
    if (pos === "bottom-left" || pos === "top-right" || pos === "top-left") settings.pos = pos;
    const delay = Number(cfg?.showDelayMs);
    if (delay > 0) settings.delayMs = delay;
  } catch {
    // fall through to the defaults
  }
  return settings;
}

function loader(widgetId: string, origin: string, pos: LauncherPosition, delayMs: number): string {
  return `/* WACRM chat widget loader */
(function(){
  if (window.__wacrmWidget && window.__wacrmWidget.loaded) return;
  window.__wacrmWidget = { loaded: true, widgetId: ${JSON.stringify(widgetId)} };
  var origin = ${JSON.stringify(origin)};
  var wid = ${JSON.stringify(widgetId)};
  var cfg = Object.assign({ delayMs: ${JSON.stringify(delayMs)} }, window.WACRMChatConfig || {});
  var src = origin + "/embed/w/" + wid + "?url=" + encodeURIComponent(location.href) + "&ref=" + encodeURIComponent(document.referrer||"") + (cfg.locale ? "&lang=" + encodeURIComponent(cfg.locale) : "");
  var wrap = document.createElement("div");
  wrap.id = "wacrm-widget-root";
  var transition = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "0s" : ".3s cubic-bezier(.22,1,.36,1)";
  wrap.style.cssText = "position:fixed;inset:${wrapInset(pos)};width:min(420px,100vw);height:min(720px,100vh);z-index:2147483000;pointer-events:none;transition:width " + transition + ",height " + transition + ",border-radius " + transition + ",box-shadow " + transition + ";";
  var iframe = document.createElement("iframe");
  iframe.title = "Chat widget";
  iframe.src = src;
  iframe.allow = "clipboard-write; microphone; autoplay";
  iframe.style.cssText = "border:0;width:100%;height:100%;background:transparent;pointer-events:auto;transition:width " + transition + ",height " + transition + ";";
  wrap.appendChild(iframe);
  window.addEventListener("message", function(e){
    if (e.source !== iframe.contentWindow || !e.data || typeof e.data !== "object") return;
    var state = e.data.wacrm === "close" ? "minimized" : e.data.wacrm === "window-state" ? e.data.state : null;
    if (state === "maximized") {
      wrap.style.width = "100vw";
      wrap.style.height = "100vh";
      wrap.style.borderRadius = "0";
      wrap.style.boxShadow = "none";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
    } else if (state === "minimized") {
      wrap.style.width = "190px";
      wrap.style.height = "76px";
      wrap.style.borderRadius = "16px";
      wrap.style.boxShadow = "none";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
    } else if (state === "open") {
      wrap.style.width = "min(420px,100vw)";
      wrap.style.height = "min(720px,100vh)";
      wrap.style.borderRadius = "0";
      wrap.style.boxShadow = "none";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
    }
  });
  function mount(){
    var target = (cfg.mountSelector && document.querySelector(cfg.mountSelector)) || document.body;
    target.appendChild(wrap);
  }
  function start(){
    var d = Number(cfg.delayMs) > 0 ? Number(cfg.delayMs) : 0;
    if (d) setTimeout(mount, d); else mount();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  // beacon: page load
  try {
    var beacon = new Blob([JSON.stringify({ widgetId: wid, event: "load", url: location.href, referrer: document.referrer })], { type: "application/json" });
    (navigator.sendBeacon && navigator.sendBeacon(origin + "/api/public/widget/beacon", beacon));
  } catch(e){}
})();`;
}

export const Route = createFileRoute("/api/public/widget/embed")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const wid = url.searchParams.get("w") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(wid)) {
          return new Response("// invalid widget id", {
            status: 400,
            headers: { "Content-Type": "application/javascript", ...CORS },
          });
        }
        const origin = `${url.protocol}//${url.host}`;
        const { pos, delayMs } = await readLoaderSettings(wid);
        return new Response(loader(wid, origin, pos, delayMs), {
          status: 200,
          headers: { "Content-Type": "application/javascript; charset=utf-8", ...CORS },
        });
      },
    },
  },
});
