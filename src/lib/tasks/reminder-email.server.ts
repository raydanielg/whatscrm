/** Email delivery shared by CRM and Project task reminders. Server-only. */
import { sbAny, type UntypedClient } from "@/lib/supabase/untyped";
import { sendResendEmail } from "@/lib/email/send.server";

type Sender = {
  workspace_id: string;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  api_key_ciphertext: string;
};
type DeliveryResult = { emails_sent: number; emails_skipped: number; errors: string[] };
export type TaskEmailReminder = {
  source: "crm" | "project";
  taskId: string;
  userId: string;
  workspaceId: string;
  title: string;
  kind: "lead" | "due" | "overdue";
  offsetMinutes: number;
  dueKey: string;
};

function formatOffset(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export async function createTaskReminderEmailDelivery(
  admin: UntypedClient,
  workspaceIds: string[],
  userIds: string[],
  result: DeliveryResult,
): Promise<(event: TaskEmailReminder) => Promise<void>> {
  const [profiles, accounts] = await Promise.all([
    sbAny(admin).from("profiles").select("id,email").in("id", userIds),
    sbAny(admin).from("email_accounts")
      .select("workspace_id,from_email,from_name,reply_to,api_key_ciphertext")
      .in("workspace_id", workspaceIds)
      .eq("provider", "resend")
      .eq("status", "connected")
      .order("created_at", { ascending: false }),
  ]);
  if (profiles.error) result.errors.push(`task reminder profiles: ${profiles.error.message}`);
  if (accounts.error) result.errors.push(`task reminder email accounts: ${accounts.error.message}`);
  const emails = new Map<string, string>(
    ((profiles.data ?? []) as Array<{ id: string; email: string | null }>)
      .filter((profile) => !!profile.email)
      .map((profile) => [profile.id, profile.email!]),
  );
  const senders = new Map<string, Sender>();
  for (const sender of (accounts.data ?? []) as Sender[]) {
    if (sender.from_email && sender.api_key_ciphertext && !senders.has(sender.workspace_id)) {
      senders.set(sender.workspace_id, sender);
    }
  }

  return async (event) => {
    const to = emails.get(event.userId);
    const sender = senders.get(event.workspaceId);
    if (!to || !sender || profiles.error || accounts.error) {
      result.emails_skipped++;
      return;
    }
    const key = {
      source: event.source,
      task_id: event.taskId,
      user_id: event.userId,
      kind: event.kind,
      offset_minutes: event.offsetMinutes,
      due_key: event.dueKey,
    };
    const { error: logError } = await sbAny(admin).from("task_reminder_email_log").insert(key);
    if (logError) {
      if (logError.code !== "23505") result.errors.push(`task email log ${event.taskId}: ${logError.message}`);
      return;
    }
    const sourceLabel = event.source === "crm" ? "CRM" : "Project";
    const timing = event.kind === "overdue"
      ? `${formatOffset(event.offsetMinutes)} overdue`
      : event.kind === "due"
        ? "due now"
        : `due in ${formatOffset(event.offsetMinutes)}`;
    try {
      await sendResendEmail({
        apiKeyCipher: sender.api_key_ciphertext,
        fromEmail: sender.from_email,
        fromName: sender.from_name,
        replyTo: sender.reply_to,
        to,
        subject: `${sourceLabel} task reminder: ${event.title}`,
        text: `${event.title}\n${sourceLabel} task ${timing}.\nDue: ${event.dueKey}\nOpen the ${sourceLabel} tasks page in your workspace to review it.`,
      });
      result.emails_sent++;
    } catch (error) {
      result.errors.push(`task email ${event.taskId}/${event.userId}: ${error instanceof Error ? error.message : String(error)}`);
      const { error: rollbackError } = await sbAny(admin).from("task_reminder_email_log").delete().match(key);
      if (rollbackError) result.errors.push(`task email log rollback ${event.taskId}: ${rollbackError.message}`);
    }
  };
}
