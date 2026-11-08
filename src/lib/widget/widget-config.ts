/**
 * Widget theme contract.
 *
 * Shared between the visual builder (authoring surface) and the widget
 * runtime that renders in the embed iframe. Keep it JSON-serializable so it
 * can round-trip through the `chatbots.widget_config` JSONB column and be
 * passed unchanged to <LiveChatWidgetPreview />.
 *
 * DEFAULT_WIDGET_CONFIG is used both as UI defaults for new chatbots and as
 * a fallback when a legacy chatbot has no config yet. Extend by adding new
 * fields with sane defaults; do not remove fields — old rows still contain
 * them and the preview reads them directly.
 */
export type Theme = "light" | "dark" | "system";
export type BubbleStyle = "rounded" | "sharp" | "tail";
export type LauncherPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type Animation = "slide" | "fade" | "scale" | "none";
export type LauncherIcon = "chat" | "message" | "sparkles" | "help" | "life" | "custom";

export interface WidgetConfig {
  /** Branding */
  logoUrl: string | null;
  agentAvatarUrl: string | null;
  agentName: string;
  brandColor: string; // primary accent (buttons, header, user bubble)
  brandTextColor: string; // foreground for brand color
  /** Theme + shape */
  theme: Theme;
  radius: number; // 0-24px
  bubbleStyle: BubbleStyle;
  /** Launcher */
  launcherPosition: LauncherPosition;
  launcherIcon: LauncherIcon;
  launcherIconUrl: string | null; // when launcherIcon === "custom"
  launcherLabel: string | null; // optional pill label next to launcher
  showDelayMs: number; // wait before the launcher appears on the site (0 = immediate)
  /** Copy */
  welcomeTitle: string;
  welcomeSubtitle: string;
  welcomeMessage: string;
  inputPlaceholder: string;
  /** Typography */
  fontFamily: string; // CSS font-family stack
  fontSizeBase: number; // px
  /** Layout */
  width: number; // px (280 - 480)
  height: number; // px (400 - 800)
  animation: Animation;
  /** Escape hatches */
  customCss: string;
  customJs: string;
  /** Behavior */
  showBrandingFooter: boolean;
  soundEnabled: boolean;
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  logoUrl: null,
  agentAvatarUrl: null,
  agentName: "Assistant",
  brandColor: "#075E54",
  brandTextColor: "#FFFFFF",
  theme: "light",
  radius: 16,
  bubbleStyle: "rounded",
  launcherPosition: "bottom-right",
  launcherIcon: "chat",
  launcherIconUrl: null,
  launcherLabel: null,
  showDelayMs: 0,
  welcomeTitle: "Hi there 👋",
  welcomeSubtitle: "How can we help?",
  welcomeMessage: "Ask us anything — a real human is one message away.",
  inputPlaceholder: "Type your message",
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  fontSizeBase: 14,
  width: 380,
  height: 620,
  animation: "slide",
  customCss: "",
  customJs: "",
  showBrandingFooter: true,
  soundEnabled: false,
};

/** Merge unknown JSON from the DB with defaults so preview code sees a full config. */
export function mergeWidgetConfig(raw: unknown): WidgetConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_WIDGET_CONFIG };
  const r = raw as Partial<WidgetConfig>;
  return { ...DEFAULT_WIDGET_CONFIG, ...r };
}
