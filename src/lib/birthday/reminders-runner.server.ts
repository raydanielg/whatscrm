/**
 * Birthday reminder runner. Iterates all workspaces with reminders enabled,
 * finds contacts whose birthday (month+day) matches today + each configured
 * lead offset, and dispatches in-app notifications (+ optional email) exactly
 * once per (contact, target date, offset, channel) via a unique log row.
 *
 * Server-only. Never import from client bundles.
 */
import { sbAny } from "@/lib/supabase/untyped";

export type RunOptions = {
  /** Force run for a single workspace (e.g. from the "Send now" button). */
  workspaceId?: string;
  /** Override "today" (ISO date, yyyy-MM-dd). Test only. */
  today?: string;
};

export type RunResult = {
  workspaces_scanned: number;
  contacts_matched: number;
  notifications_created: number;
  emails_sent: number;
  emails_skipped: number;
  errors: string[];
};

function monthDay(iso: string): string | null {
  // birthday stored as YYYY-MM-DD in contacts.birthday
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}-${m[2]}` : null;
}

function targetMonthDay(baseISO: string, offsetDays: number): { key: string; date: string } {
  const [y, m, d] = baseISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const yyyy = dt.getUTCFullYear();
  return { key: `${mm}-${dd}`, date: `${yyyy}-${mm}-${dd}` };
}

export async function runBirthdayReminders(opts: RunOptions = {}): Promise<RunResult> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as any;

  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const result: RunResult = {
    workspaces_scanned: 0,
    contacts_matched: 0,
    notifications_created: 0,
    emails_sent: 0,
    emails_skipped: 0,
    errors: [],
  };

  // 1. Load enabled workspace settings
  let settingsQuery = admin
    .from("birthday_reminder_settings")
    .select("workspace_id, enabled, lead_days, email_enabled, inapp_enabled")
    .eq("enabled", true);
  if (opts.workspaceId) settingsQuery = settingsQuery.eq("workspace_id", opts.workspaceId);
  const { data: settings, error: sErr } = await settingsQuery;
  if (sErr) {
    result.errors.push(`load settings: ${sErr.message}`);
    return result;
  }
  const settingsList = (settings ?? []) as Array<{
    workspace_id: string;
    lead_days: number[] | null;
    email_enabled: boolean;
    inapp_enabled: boolean;
  }>;

  for (const s of settingsList) {
    result.workspaces_scanned++;
    const { data: workspace, error: workspaceError } = await admin
      .from("workspaces")
      .select("organization_id")
      .eq("id", s.workspace_id)
      .maybeSingle();
    if (workspaceError) result.errors.push(`ws ${s.workspace_id} organization: ${workspaceError.message}`);
    const organizationId: string | null = workspace?.organization_id ?? null;
    const offsets = (s.lead_days ?? [0]).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60);
    if (!offsets.length) continue;

    // 2. Load contacts with birthday for this workspace
    const { data: contacts, error: cErr } = await admin
      .from("contacts")
      .select("id, first_name, last_name, display_name, email, birthday, owner_id")
      .eq("workspace_id", s.workspace_id)
      .not("birthday", "is", null)
      .eq("is_archived", false)
      .eq("do_not_contact", false);
    if (cErr) {
      result.errors.push(`ws ${s.workspace_id} contacts: ${cErr.message}`);
      continue;
    }

    const list = (contacts ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      display_name: string | null;
      email: string | null;
      birthday: string;
      owner_id: string | null;
    }>;
    if (!list.length) continue;

    // Precompute target md->offset map
    const targets = new Map<string, { offset: number; date: string }>();
    for (const off of offsets) {
      const t = targetMonthDay(today, off);
      // If two offsets collide on the same md (they can't for offset<365), first wins
      if (!targets.has(t.key)) targets.set(t.key, { offset: off, date: t.date });
    }

    for (const c of list) {
      const md = monthDay(c.birthday);
      if (!md) continue;
      // Leap day: Feb 29 fires on Feb 28 in non-leap years
      let effective = md;
      if (md === "02-29") {
        const y = Number(today.slice(0, 4));
        const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        if (!isLeap) effective = "02-28";
      }
      const t = targets.get(effective);
      if (!t) continue;
      result.contacts_matched++;

      const displayName =
        c.display_name?.trim() ||
        [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
        "Contact";

      const daysUntil = t.offset;
      const title =
        daysUntil === 0
          ? `🎂 ${displayName}'s birthday is today`
          : `🎂 ${displayName}'s birthday in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
      const body =
        daysUntil === 0
          ? `Reach out to wish them a happy birthday.`
          : `Coming up on ${t.date}. Plan a message or gesture.`;

      // Resolve recipients: owner if any, else all workspace admins/owners
      let recipientIds: string[] = [];
      let ownerEmail: string | null = null;
      if (c.owner_id) {
        recipientIds = [c.owner_id];
        const { data: prof } = await admin
          .from("profiles")
          .select("email")
          .eq("id", c.owner_id)
          .maybeSingle();
        ownerEmail = (prof as any)?.email ?? null;
      } else {
        const { data: admins } = await admin
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", s.workspace_id)
          .in("role", ["owner", "admin"]);
        recipientIds = (admins ?? []).map((r: any) => r.user_id).filter(Boolean);
      }

      // 3. In-app notifications (one per recipient), guarded by unique log
      if (s.inapp_enabled && recipientIds.length && organizationId) {
        const { data: activeMembers, error: memberError } = await admin
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", s.workspace_id)
          .eq("status", "active")
          .in("user_id", recipientIds);
        if (memberError) {
          result.errors.push(`ws ${s.workspace_id} recipients: ${memberError.message}`);
        }
        const activeRecipientIds = memberError ? [] : (activeMembers ?? []).map((member: { user_id: string }) => member.user_id);
        if (activeRecipientIds.length) {
          const { error: logErr } = await admin
            .from("birthday_reminder_log")
            .insert({
              workspace_id: s.workspace_id,
              contact_id: c.id,
              owner_id: c.owner_id,
              reminder_date: t.date,
              lead_offset_days: t.offset,
              channel: "inapp",
            });
          if (logErr) {
            // 23505 = unique_violation: already sent, skip silently.
            if (!String(logErr.message).includes("duplicate")) {
              result.errors.push(`log inapp ${c.id}: ${logErr.message}`);
            }
          } else {
            const rows = activeRecipientIds.map((uid: string) => ({
              user_id: uid,
              organization_id: organizationId,
              channel: "in_app" as const,
              status: "unread" as const,
              title,
              body,
              action_url: `/contacts/${c.id}`,
              category: "birthday",
              data: {
                workspace_id: s.workspace_id,
                contact_id: c.id,
                contact_name: displayName,
                birthday: c.birthday,
                days_until: t.offset,
                target_date: t.date,
              },
            }));
            const { error: nErr } = await sbAny(admin).from("notifications").insert(rows);
            if (nErr) {
              result.errors.push(`notifications ${c.id}: ${nErr.message}`);
              await admin.from("birthday_reminder_log").delete().match({
                workspace_id: s.workspace_id,
                contact_id: c.id,
                reminder_date: t.date,
                lead_offset_days: t.offset,
                channel: "inapp",
              });
            } else {
              result.notifications_created += rows.length;
            }
          }
        }
      }

      // 4. Email to owner (if enabled, we have an owner email, and template exists)
      if (s.email_enabled && ownerEmail) {
        try {
          const { error: logErr } = await admin
            .from("birthday_reminder_log")
            .insert({
              workspace_id: s.workspace_id,
              contact_id: c.id,
              owner_id: c.owner_id,
              reminder_date: t.date,
              lead_offset_days: t.offset,
              channel: "email",
            });
          if (logErr) {
            if (!String(logErr.message).includes("duplicate")) {
              result.errors.push(`log email ${c.id}: ${logErr.message}`);
            }
            result.emails_skipped++;
          } else {
            // Email path is a no-op until app email templates are scaffolded.
            // The log row is written first so switch-on will not backfill
            // historical sends.
            result.emails_skipped++;
          }
        } catch (e: any) {
          result.errors.push(`email ${c.id}: ${e?.message ?? String(e)}`);
          result.emails_skipped++;
        }
      }
    }
  }

  return result;
}
