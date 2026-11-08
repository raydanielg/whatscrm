/**
 * Public embed page for a named Chat Widget (embedded systems).
 *
 * Fetches the resolved config from /api/public/widget/config/:widgetId,
 * applies routing (which may swap the underlying chatbot or hide the
 * widget entirely for the current URL), then renders LiveChatWidget.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Maximize2, MessageCircle } from "lucide-react";
import { LiveChatWidget } from "@/components/app/widget/live-chat-widget";

type WidgetWindowState = "open" | "minimized" | "maximized";

function windowStateKey(widgetId: string) {
  return `wacrm.widget.window.${widgetId}`;
}

function readWindowState(widgetId: string): WidgetWindowState {
  try {
    const state = window.localStorage.getItem(windowStateKey(widgetId));
    if (state === "minimized" || state === "maximized") return state;
  } catch (error) {
    console.error("[widget] failed to read window state", error);
  }
  return "open";
}

interface ResolvedWidget {
  id: string;
  name: string;
  chatbotId: string | null;
  hide: boolean;
  config: { brandColor?: string; launcherPosition?: string; agentName?: string } & Record<
    string,
    unknown
  >;
}

export const Route = createFileRoute("/embed/w/$widgetId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Chat" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: WidgetEmbed,
});

function WidgetEmbed() {
  const { widgetId } = Route.useParams();
  const [hasEntered, setHasEntered] = useState(false);
  const maximizeButtonRef = useRef<HTMLButtonElement>(null);
  const [windowState, setWindowState] = useState<WidgetWindowState>(() =>
    typeof window === "undefined" ? "open" : readWindowState(widgetId),
  );
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error" | "hidden";
    data?: ResolvedWidget;
    error?: string;
  }>({ status: "loading" });

  useEffect(() => {
    setWindowState(readWindowState(widgetId));
  }, [widgetId]);

  useEffect(() => {
    if (windowState === "minimized" && state.status === "ready") {
      maximizeButtonRef.current?.focus();
    }
  }, [state.status, windowState]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHasEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (state.status !== "ready") return;
    window.parent.postMessage({ wacrm: "window-state", state: windowState }, "*");
  }, [state.status, windowState]);

  const changeWindowState = (next: WidgetWindowState) => {
    setWindowState(next);
    try {
      window.localStorage.setItem(windowStateKey(widgetId), next);
    } catch (error) {
      console.error("[widget] failed to save window state", error);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url") || "";
    const lang = (params.get("lang") || navigator.language).slice(0, 5);
    fetch(
      `/api/public/widget/config/${widgetId}?url=${encodeURIComponent(url)}&lang=${encodeURIComponent(lang)}`,
    )
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "failed");
        return r.json();
      })
      .then((data: ResolvedWidget) => {
        if (data.hide || !data.chatbotId) return setState({ status: "hidden" });
        setState({ status: "ready", data });
        // beacon 'open' when the iframe loads
        try {
          const beacon = new Blob([JSON.stringify({ widgetId, event: "open", url })], {
            type: "application/json",
          });
          navigator.sendBeacon?.("/api/public/widget/beacon", beacon);
        } catch {
          /* noop */
        }
      })
      .catch((e) => setState({ status: "error", error: String(e?.message ?? e) }));
  }, [widgetId]);

  if (state.status === "loading") {
    return (
      <div className="fixed inset-0 grid place-items-center bg-transparent text-sm text-muted-foreground">
        Loading
      </div>
    );
  }
  if (state.status === "hidden") return null;
  if (state.status === "error") {
    return (
      <div className="fixed inset-0 grid place-items-center bg-background p-4 text-sm text-destructive">
        {state.error}
      </div>
    );
  }
  const cfg = state.data!.config;
  const minimized = windowState === "minimized";
  const maximized = windowState === "maximized";
  const accent = typeof cfg.brandColor === "string" ? cfg.brandColor : "#075E54";
  return (
    <>
      <div
        className={`fixed z-50 flex flex-col overflow-hidden bg-background shadow-2xl transition-[width,height,inset,border-radius,opacity,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${
          maximized
            ? "inset-0 rounded-none"
            : minimized
              ? "bottom-0 right-0 h-0 w-0 translate-y-3 scale-[.98] rounded-control opacity-0"
              : "bottom-4 right-4 h-[min(680px,calc(100dvh-2rem))] w-[min(420px,calc(100vw-2rem))] rounded-control"
        } ${
          minimized
            ? "pointer-events-none"
            : hasEntered
              ? "translate-y-0 scale-100 opacity-100"
              : "translate-y-3 scale-[.98] opacity-0"
        }`}
        aria-hidden={minimized}
        inert={minimized}
      >
        <LiveChatWidget
          chatbotId={state.data!.chatbotId!}
          accent={accent}
          compact
          isMaximized={maximized}
          isMinimized={minimized}
          onToggleMaximize={() => changeWindowState(maximized ? "open" : "maximized")}
          onClose={() => changeWindowState("minimized")}
        />
      </div>
      {minimized && (
        <button
          ref={maximizeButtonRef}
          type="button"
          onClick={() => changeWindowState("maximized")}
          aria-label="Live Chat"
          title="Live Chat"
          className={`fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-xl transition-[transform,opacity] duration-300 ease-out hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none ${
            hasEntered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
          style={{ backgroundColor: accent }}
        >
          <MessageCircle className="h-4 w-4" />
          <span>Live Chat</span>
        </button>
      )}
    </>
  );
}
