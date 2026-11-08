/**
 * Server functions for the visual Widget Builder.
 *
 * Both are workspace-scoped via `requireSupabaseAuth` — the RLS policies on
 * `chatbots` guarantee the caller belongs to the chatbot's workspace, so we
 * don't need to re-check membership manually.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_WIDGET_CONFIG, mergeWidgetConfig, type WidgetConfig } from "./widget-config";

const GetInput = z.object({ chatbotId: z.string().uuid() });

export const getWidgetConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => GetInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("chatbots")
      .select("id, name, widget_config, avatar_url, welcome_message")
      .eq("id", data.chatbotId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Chatbot not found");
    const bot = row as {
      id: string;
      name: string;
      widget_config: unknown;
      avatar_url: string | null;
      welcome_message: string | null;
    };
    // Fall back to chatbot-level fields when widget_config is empty.
    const merged = mergeWidgetConfig(bot.widget_config);
    return {
      chatbotId: bot.id,
      chatbotName: bot.name,
      config: {
        ...merged,
        agentName: merged.agentName || bot.name,
        agentAvatarUrl: merged.agentAvatarUrl ?? bot.avatar_url,
        welcomeMessage: merged.welcomeMessage || bot.welcome_message || DEFAULT_WIDGET_CONFIG.welcomeMessage,
      } as WidgetConfig,
    };
  });

const SaveInput = z.object({
  chatbotId: z.string().uuid(),
  config: z.object({
    logoUrl: z.string().url().nullable(),
    agentAvatarUrl: z.string().url().nullable(),
    agentName: z.string().min(1).max(80),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    brandTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    theme: z.enum(["light", "dark", "system"]),
    radius: z.number().min(0).max(32),
    bubbleStyle: z.enum(["rounded", "sharp", "tail"]),
    launcherPosition: z.enum(["bottom-right", "bottom-left", "top-right", "top-left"]),
    launcherIcon: z.enum(["chat", "message", "sparkles", "help", "life", "custom"]),
    launcherIconUrl: z.string().url().nullable(),
    launcherLabel: z.string().max(40).nullable(),
    welcomeTitle: z.string().max(80),
    welcomeSubtitle: z.string().max(120),
    welcomeMessage: z.string().max(500),
    inputPlaceholder: z.string().max(80),
    fontFamily: z.string().max(200),
    fontSizeBase: z.number().min(10).max(20),
    width: z.number().min(280).max(560),
    height: z.number().min(360).max(900),
    animation: z.enum(["slide", "fade", "scale", "none"]),
    // customCss/customJs run in a sandboxed iframe — cap length to avoid abuse.
    customCss: z.string().max(20_000),
    customJs: z.string().max(20_000),
    showBrandingFooter: z.boolean(),
    soundEnabled: z.boolean(),
  }),
});

export const saveWidgetConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => SaveInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chatbots")
      .update({ widget_config: data.config } as never)
      .eq("id", data.chatbotId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
