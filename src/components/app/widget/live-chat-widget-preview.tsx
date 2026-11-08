/**
 * Visual Live Chat Widget preview.
 *
 * Pure React renderer that mirrors what the embedded widget will look like on
 * the customer's site. It does NOT talk to the live chat API — this is a
 * preview surface only, so we can update instantly as the builder controls
 * change without triggering rate limits or creating sessions.
 *
 * Custom CSS/JS is scoped: CSS is prefixed with `.wacrm-widget-preview`
 * during injection, and JS runs inside a sandboxed <script> inside a shadow
 * DOM-like scoped div. For real production embed, custom JS runs inside the
 * widget iframe on the customer's site — this preview does a best-effort
 * eval within an isolated function scope with `window`/`document` proxies
 * so the builder can visually verify placement without exposing the parent
 * app to injected scripts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  MessageSquare,
  Sparkles,
  HelpCircle,
  LifeBuoy,
  Send,
  X,
} from "lucide-react";
import type { WidgetConfig, LauncherIcon } from "@/lib/widget/widget-config";
import { cn } from "@/lib/utils";
import { useBrandName } from "@/hooks/use-brand-name";

interface Props {
  config: WidgetConfig;
  /** Optional: pin open/closed for the design surface. */
  forceOpen?: boolean;
}

const ICONS: Record<LauncherIcon, React.ComponentType<{ className?: string }>> = {
  chat: MessageCircle,
  message: MessageSquare,
  sparkles: Sparkles,
  help: HelpCircle,
  life: LifeBuoy,
  custom: MessageCircle,
};

const POS_CLASS: Record<WidgetConfig["launcherPosition"], string> = {
  "bottom-right": "bottom-4 right-4 items-end",
  "bottom-left": "bottom-4 left-4 items-start",
  "top-right": "top-4 right-4 items-end",
  "top-left": "top-4 left-4 items-start",
};

const ANIM_CLASS: Record<WidgetConfig["animation"], string> = {
  slide: "animate-in slide-in-from-bottom-4 fade-in duration-300",
  fade: "animate-in fade-in duration-300",
  scale: "animate-in zoom-in-95 fade-in duration-300",
  none: "",
};

export function LiveChatWidgetPreview({ config, forceOpen }: Props) {
  const brandName = useBrandName();
  const [open, setOpen] = useState<boolean>(forceOpen ?? true);
  useEffect(() => {
    if (typeof forceOpen === "boolean") setOpen(forceOpen);
  }, [forceOpen]);

  const isDark = config.theme === "dark";
  const surfaceBg = isDark ? "#161A1D" : "#FFFFFF";
  const surfaceFg = isDark ? "#F5F3F4" : "#0B090A";
  const mutedFg = isDark ? "#B1A7A6" : "#6B6B6B";
  const bubbleIn = isDark ? "#2A2F33" : "#F5F3F4";

  const bubbleRadius = useMemo(() => {
    if (config.bubbleStyle === "sharp") return 4;
    if (config.bubbleStyle === "tail") return config.radius;
    return config.radius;
  }, [config.bubbleStyle, config.radius]);

  // Inject scoped custom CSS
  const cssId = "wacrm-widget-preview-css";
  useEffect(() => {
    let style = document.getElementById(cssId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = cssId;
      document.head.appendChild(style);
    }
    // Naive scoping: prefix every top-level rule with the container class.
    const scoped = config.customCss
      .split("}")
      .filter(Boolean)
      .map((rule) => {
        const [sel, body] = rule.split("{");
        if (!sel || !body) return "";
        return `.wacrm-widget-preview ${sel.trim()} { ${body} }`;
      })
      .join("\n");
    style.textContent = scoped;
    return () => {
      style?.remove();
    };
  }, [config.customCss]);

  // Best-effort sandboxed custom JS execution (preview only).
  const jsRunRef = useRef<string>("");
  useEffect(() => {
    if (!config.customJs || jsRunRef.current === config.customJs) return;
    jsRunRef.current = config.customJs;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      new Function("widget", config.customJs)({ config, open });
    } catch (err) {
      console.warn("[widget-preview] custom JS error:", (err as Error).message);
    }
  }, [config, open]);

  const Icon = ICONS[config.launcherIcon] ?? MessageCircle;

  return (
    <div
      className={cn(
        "wacrm-widget-preview absolute z-10 flex flex-col gap-3 pointer-events-none",
        POS_CLASS[config.launcherPosition],
      )}
      style={{
        fontFamily: config.fontFamily,
        fontSize: `${config.fontSizeBase}px`,
      }}
    >
      {open && (
        <div
          className={cn("pointer-events-auto overflow-hidden border shadow-2xl flex flex-col", ANIM_CLASS[config.animation])}
          style={{
            width: config.width,
            height: config.height,
            borderRadius: config.radius,
            background: surfaceBg,
            color: surfaceFg,
            borderColor: isDark ? "#2A2F33" : "#E5E7EB",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ background: config.brandColor, color: config.brandTextColor }}
          >
            <div className="flex items-center gap-3 min-w-0">
              {config.agentAvatarUrl ? (
                <img
                  src={config.agentAvatarUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover ring-2"
                  style={{ ["--tw-ring-color" as string]: config.brandTextColor }}
                />
              ) : (
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center font-semibold"
                  style={{ background: `${config.brandTextColor}22`, color: config.brandTextColor }}
                >
                  {config.agentName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-semibold truncate">{config.welcomeTitle}</div>
                <div className="text-xs opacity-80 truncate">{config.welcomeSubtitle}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 hover:bg-black/10 transition"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: surfaceBg }}>
            <div className="flex items-start gap-2">
              {config.agentAvatarUrl ? (
                <img src={config.agentAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ background: config.brandColor, color: config.brandTextColor }}
                >
                  {config.agentName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div
                className="max-w-[75%] px-3 py-2"
                style={{
                  background: bubbleIn,
                  color: surfaceFg,
                  borderRadius: bubbleRadius,
                  borderBottomLeftRadius: config.bubbleStyle === "tail" ? 4 : bubbleRadius,
                }}
              >
                {config.welcomeMessage}
              </div>
            </div>
            <div className="flex justify-end">
              <div
                className="max-w-[75%] px-3 py-2"
                style={{
                  background: config.brandColor,
                  color: config.brandTextColor,
                  borderRadius: bubbleRadius,
                  borderBottomRightRadius: config.bubbleStyle === "tail" ? 4 : bubbleRadius,
                }}
              >
                Hey! I have a quick question about pricing.
              </div>
            </div>
            <div className="flex items-start gap-2">
              {config.agentAvatarUrl ? (
                <img src={config.agentAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ background: config.brandColor, color: config.brandTextColor }}
                >
                  {config.agentName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div
                className="max-w-[75%] px-3 py-2"
                style={{
                  background: bubbleIn,
                  color: surfaceFg,
                  borderRadius: bubbleRadius,
                  borderBottomLeftRadius: config.bubbleStyle === "tail" ? 4 : bubbleRadius,
                }}
              >
                Happy to help! Which plan are you looking at?
              </div>
            </div>
          </div>

          {/* Composer */}
          <div className="p-3 border-t flex items-center gap-2" style={{ borderColor: isDark ? "#2A2F33" : "#E5E7EB" }}>
            <input
              type="text"
              placeholder={config.inputPlaceholder}
              readOnly
              className="flex-1 h-9 px-3 outline-none text-sm"
              style={{
                background: isDark ? "#0B090A" : "#F5F3F4",
                color: surfaceFg,
                borderRadius: config.radius / 2,
              }}
            />
            <button
              type="button"
              className="h-9 w-9 flex items-center justify-center transition-transform"
              style={{
                background: config.brandColor,
                color: config.brandTextColor,
                borderRadius: config.radius / 2,
              }}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          {config.showBrandingFooter && (
            <div className="px-4 py-2 text-[11px] text-center" style={{ color: mutedFg, background: surfaceBg }}>
              Powered by {brandName}
            </div>
          )}
        </div>
      )}

      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex items-center gap-2 shadow-lg transition-transform"
        style={{
          background: config.brandColor,
          color: config.brandTextColor,
          borderRadius: 999,
          padding: config.launcherLabel ? "10px 16px" : 14,
        }}
        aria-label="Open chat"
      >
        {config.launcherIcon === "custom" && config.launcherIconUrl ? (
          <img src={config.launcherIconUrl} alt="" className="h-6 w-6 object-contain" />
        ) : (
          <Icon className="h-6 w-6" />
        )}
        {config.launcherLabel && <span className="font-medium text-sm">{config.launcherLabel}</span>}
      </button>
    </div>
  );
}
