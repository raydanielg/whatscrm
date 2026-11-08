import { useState } from "react";
import { MessageCircle, Sparkles, HelpCircle, LifeBuoy, Send, X, Minus, Smartphone, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WidgetConfig } from "@/lib/widget/widget-config";
import { cn } from "@/lib/utils";
import { useBrandName } from "@/hooks/use-brand-name";

interface Props {
  config: WidgetConfig;
  widgetName?: string;
}

const ICONS = {
  chat: MessageCircle,
  message: MessageCircle,
  sparkles: Sparkles,
  help: HelpCircle,
  life: LifeBuoy,
  custom: MessageCircle,
} as const;

/**
 * Live, non-persisted preview of the widget with current unsaved config.
 * Renders a mock browser frame with the launcher + open chat panel so users
 * see color / theme / layout / copy changes instantly.
 */
export function WidgetAppearancePreview({ config, widgetName }: Props) {
  const brandName = useBrandName();
  const [open, setOpen] = useState(true);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const isDark = config.theme === "dark";
  const Icon = ICONS[config.launcherIcon] ?? MessageCircle;

  const surfaceBg = isDark ? "#0b0f19" : "#ffffff";
  const surfaceFg = isDark ? "#e6e8ee" : "#0b0f19";
  const mutedFg = isDark ? "#9aa3b2" : "#64748b";
  const border = isDark ? "#1f2632" : "#e5e7eb";
  const botBubble = isDark ? "#1a2130" : "#f1f5f9";

  const [pos, side] = config.launcherPosition.split("-") as ["top" | "bottom", "left" | "right"];

  const panelW = device === "mobile" ? Math.min(config.width, 320) : config.width;
  const panelH = device === "mobile" ? Math.min(config.height, 520) : config.height;

  return (
    <div className="overflow-hidden rounded-control border bg-muted/30">
      {/* Preview toolbar */}
      <div className="flex items-center justify-between gap-2 border-b bg-background/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-yellow-400" />
          <span className="size-2.5 rounded-full bg-green-400" />
          <span className="ml-3 text-muted-foreground text-xs">Live preview — unsaved</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={device === "desktop" ? "secondary" : "ghost"} className="h-7 px-2" onClick={() => setDevice("desktop")}>
            <Monitor className="size-3.5" />
          </Button>
          <Button size="sm" variant={device === "mobile" ? "secondary" : "ghost"} className="h-7 px-2" onClick={() => setDevice("mobile")}>
            <Smartphone className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Stage */}
      <div
        className={cn("relative h-[560px] w-full overflow-hidden", isDark ? "bg-slate-900" : "bg-slate-50")}
        style={{ fontFamily: config.fontFamily }}
      >
        {/* Fake site backdrop */}
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:22px_22px] text-muted-foreground/40" />

        {/* Panel */}
        {open && (
          <div
            className="absolute flex flex-col overflow-hidden shadow-2xl"
            style={{
              [side]: 24,
              [pos]: 92,
              width: panelW,
              height: panelH,
              maxWidth: "calc(100% - 32px)",
              maxHeight: "calc(100% - 120px)",
              background: surfaceBg,
              color: surfaceFg,
              borderRadius: config.radius,
              border: `1px solid ${border}`,
              fontSize: config.fontSizeBase,
            } as React.CSSProperties}
          >
            {/* Header */}
            <div
              className="flex items-start gap-3 p-4"
              style={{ background: config.brandColor, color: config.brandTextColor }}
            >
              {config.agentAvatarUrl ? (
                <img src={config.agentAvatarUrl} alt="" className="size-10 rounded-full object-cover" />
              ) : (
                <div className="grid size-10 place-items-center rounded-full bg-white/20 font-bold">
                  {(config.agentName || "A").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-base">{config.welcomeTitle || widgetName || "Chat"}</div>
                <div className="truncate text-xs opacity-90">{config.welcomeSubtitle}</div>
              </div>
              <div className="flex items-center gap-1">
                <button className="grid size-7 place-items-center rounded-control hover:bg-white/15" aria-label="Minimize" onClick={() => setOpen(false)}>
                  <Minus className="size-4" />
                </button>
                <button className="grid size-7 place-items-center rounded-control hover:bg-white/15" aria-label="Close" onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              <div className="flex items-end gap-2">
                <div className="grid size-6 shrink-0 place-items-center rounded-full text-[11px]" style={{ background: botBubble, color: surfaceFg }}>
                  {(config.agentName || "A").slice(0, 1).toUpperCase()}
                </div>
                <div
                  className="max-w-[80%] px-3 py-2"
                  style={{
                    background: botBubble,
                    color: surfaceFg,
                    borderRadius: config.bubbleStyle === "sharp" ? 4 : config.radius,
                  }}
                >
                  {config.welcomeMessage}
                </div>
              </div>
              <div className="flex justify-end">
                <div
                  className="max-w-[80%] px-3 py-2"
                  style={{
                    background: config.brandColor,
                    color: config.brandTextColor,
                    borderRadius: config.bubbleStyle === "sharp" ? 4 : config.radius,
                  }}
                >
                  Sample reply from a visitor
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="border-t p-3" style={{ borderColor: border }}>
              <div
                className="flex items-center gap-2 px-3 py-2"
                style={{ background: isDark ? "#141a25" : "#f8fafc", borderRadius: config.radius, border: `1px solid ${border}` }}
              >
                <input
                  className="flex-1 bg-transparent outline-none"
                  placeholder={config.inputPlaceholder}
                  style={{ color: surfaceFg, fontSize: config.fontSizeBase }}
                  readOnly
                />
                <button
                  className="grid size-8 place-items-center"
                  style={{ background: config.brandColor, color: config.brandTextColor, borderRadius: config.bubbleStyle === "sharp" ? 4 : config.radius }}
                  aria-label="Send"
                >
                  <Send className="size-4" />
                </button>
              </div>
              {config.showBrandingFooter && (
                <div className="mt-2 text-center text-[11px]" style={{ color: mutedFg }}>
                  Powered by {brandName}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Launcher */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="absolute flex items-center gap-2 shadow-xl transition-transform hover:scale-105"
          style={{
            [side]: 24,
            [pos]: 24,
            background: config.brandColor,
            color: config.brandTextColor,
            borderRadius: 999,
            padding: config.launcherLabel ? "12px 16px" : 14,
          } as React.CSSProperties}
          aria-label="Toggle chat"
        >
          {config.launcherIcon === "custom" && config.launcherIconUrl ? (
            <img src={config.launcherIconUrl} alt="" className="size-6" />
          ) : (
            <Icon className="size-6" />
          )}
          {config.launcherLabel && <span className="font-medium text-sm">{config.launcherLabel}</span>}
        </button>
      </div>
    </div>
  );
}
