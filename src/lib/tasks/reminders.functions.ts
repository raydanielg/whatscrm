import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const SettingsSchema = z.object({
  enabled: z.boolean(),
  lead_minutes: z.array(z.number().int().min(0).max(20160)).min(0).max(10),
  notify_overdue: z.boolean(),
  overdue_repeat_minutes: z.number().int().min(0).max(20160),
  inapp_enabled: z.boolean(),
  email_enabled: z.boolean(),
});

const DEFAULTS = {
  enabled: true,
  lead_minutes: [1440, 60, 0],
  notify_overdue: true,
  overdue_repeat_minutes: 0,
  inapp_enabled: true,
  email_enabled: false,
};

const LEGACY_SETTINGS_COLUMNS =
  "enabled, lead_minutes, notify_overdue, overdue_repeat_minutes, inapp_enabled, updated_at";

function missingEmailColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error &&
    (error.code === "PGRST204" || error.code === "42703") &&
    !!error.message?.includes("email_enabled");
}

export const getTaskReminderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await sbAny(supabase)
      .from("task_reminder_settings")
      .select("enabled, lead_minutes, notify_overdue, overdue_repeat_minutes, inapp_enabled, email_enabled, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (missingEmailColumn(error)) {
      const legacy = await sbAny(supabase)
        .from("task_reminder_settings")
        .select(LEGACY_SETTINGS_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();
      if (legacy.error) throw new Error(legacy.error.message);
      return { ...DEFAULTS, ...legacy.data, email_enabled: false, email_available: false, updated_at: legacy.data?.updated_at ?? null };
    }
    if (error) throw new Error(error.message);
    return { ...DEFAULTS, ...data, email_available: true, updated_at: data?.updated_at ?? null };
  });

export const upsertTaskReminderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const leads = Array.from(new Set(data.lead_minutes)).sort((a, b) => b - a);
    const { error } = await sbAny(supabase).from("task_reminder_settings").upsert(
      {
        user_id: userId,
        enabled: data.enabled,
        lead_minutes: leads,
        notify_overdue: data.notify_overdue,
        overdue_repeat_minutes: data.overdue_repeat_minutes,
        inapp_enabled: data.inapp_enabled,
        email_enabled: data.email_enabled,
      },
      { onConflict: "user_id" }
    );
    if (missingEmailColumn(error)) {
      if (data.email_enabled) {
        throw new Error("Email reminders need the task reminder email database migration before they can be enabled.");
      }
      const legacy = await sbAny(supabase).from("task_reminder_settings").upsert(
        {
          user_id: userId,
          enabled: data.enabled,
          lead_minutes: leads,
          notify_overdue: data.notify_overdue,
          overdue_repeat_minutes: data.overdue_repeat_minutes,
          inapp_enabled: data.inapp_enabled,
        },
        { onConflict: "user_id" }
      );
      if (legacy.error) throw new Error(legacy.error.message);
      return { ok: true };
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runTaskRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { runTaskReminders } = await import("./reminders-runner.server");
    return await runTaskReminders();
  });
