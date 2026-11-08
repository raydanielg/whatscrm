import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SettingsSchema = z.object({
  workspace_id: z.string().uuid(),
  enabled: z.boolean(),
  lead_days: z.array(z.number().int().min(0).max(60)).min(1).max(10),
  email_enabled: z.boolean(),
  inapp_enabled: z.boolean(),
});

export const getBirthdayReminderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspace_id: string }) =>
    z.object({ workspace_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row, error } = await supabase
      .from("birthday_reminder_settings")
      .select("workspace_id, enabled, lead_days, email_enabled, inapp_enabled, updated_at")
      .eq("workspace_id", data.workspace_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      row ?? {
        workspace_id: data.workspace_id,
        enabled: false,
        lead_days: [0, 1, 7],
        email_enabled: false,
        inapp_enabled: true,
        updated_at: null,
      }
    );
  });

export const upsertBirthdayReminderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Only owner/admin can edit
    const { data: mem, error: mErr } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!mem || !["owner", "admin"].includes(String(mem.role))) {
      throw new Error("Forbidden");
    }

    // Normalize + dedupe lead_days
    const lead = Array.from(new Set(data.lead_days)).sort((a, b) => a - b);

    const { error } = await supabase
      .from("birthday_reminder_settings")
      .upsert(
        {
          workspace_id: data.workspace_id,
          enabled: data.enabled,
          lead_days: lead,
          email_enabled: data.email_enabled,
          inapp_enabled: data.inapp_enabled,
        },
        { onConflict: "workspace_id" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runBirthdayRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspace_id: string }) =>
    z.object({ workspace_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: mem } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!mem || !["owner", "admin"].includes(String(mem.role))) {
      throw new Error("Forbidden");
    }
    const { runBirthdayReminders } = await import("./reminders-runner.server");
    return await runBirthdayReminders({ workspaceId: data.workspace_id });
  });

export const getUpcomingBirthdays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspace_id: string; days?: number }) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        days: z.number().int().min(1).max(60).optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const horizon = data.days ?? 30;
    const { data: rows, error } = await supabase
      .from("contacts")
      .select("id, display_name, first_name, last_name, birthday, avatar_url")
      .eq("workspace_id", data.workspace_id)
      .not("birthday", "is", null)
      .eq("is_archived", false);
    if (error) throw new Error(error.message);

    const today = new Date();
    const y = today.getUTCFullYear();
    const items: Array<{
      id: string;
      name: string;
      birthday: string;
      next_date: string;
      days_until: number;
      avatar_url: string | null;
    }> = [];

    for (const r of (rows ?? []) as any[]) {
      const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(r.birthday);
      if (!m) continue;
      const mm = Number(m[1]);
      const dd = Number(m[2]);
      let next = new Date(Date.UTC(y, mm - 1, dd));
      const t0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      if (next < t0) next = new Date(Date.UTC(y + 1, mm - 1, dd));
      const diff = Math.round((next.getTime() - t0.getTime()) / 86400000);
      if (diff > horizon) continue;
      const name =
        r.display_name?.trim() ||
        [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
        "Contact";
      items.push({
        id: r.id,
        name,
        birthday: r.birthday,
        next_date: next.toISOString().slice(0, 10),
        days_until: diff,
        avatar_url: r.avatar_url ?? null,
      });
    }
    items.sort((a, b) => a.days_until - b.days_until);
    return items.slice(0, 100);
  });
