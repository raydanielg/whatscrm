/** Opt-in weekly project updates to explicitly bound email conversations. */
import type { PmProject, PmTask } from "@/lib/project-management/client";
import { buildProjectUpdate } from "./project-update";
import { dueClientUpdateSlot, type ClientUpdateRule } from "./client-update-schedule";
import { sbAny, type UntypedClient } from "@/lib/supabase/untyped";

type Admin = UntypedClient;
type Rule = ClientUpdateRule & {
  id: string;
  workspace_id: string;
  project_id: string;
  conversation_id: string;
  created_by: string;
  include_tasks: boolean;
};
type Conversation = { id: string; workspace_id: string; channel: string; status: string; metadata: Record<string, unknown> | null };
export type ClientUpdateResult = { rules_scanned: number; sent: number; failed: number; errors: string[] };

export async function runClientProjectUpdates(admin: Admin, now = new Date()): Promise<ClientUpdateResult> {
  const result: ClientUpdateResult = { rules_scanned: 0, sent: 0, failed: 0, errors: [] };
  const { data, error } = await sbAny(admin).from("pm_client_update_rules")
    .select("id,workspace_id,project_id,conversation_id,created_by,enabled,cadence,day_of_week,hour_utc,include_tasks")
    .eq("enabled", true).eq("day_of_week", now.getUTCDay()).eq("hour_utc", now.getUTCHours())
    .limit(100);
  // Existing inbox and task reminders must keep running until this migration is deployed.
  if (error?.code === "42P01" || error?.code === "PGRST205") return result;
  if (error) { result.errors.push(`client rules: ${error.message}`); return result; }

  for (const rule of (data ?? []) as Rule[]) {
    result.rules_scanned++;
    const slot = dueClientUpdateSlot(rule, now);
    if (!slot) continue;
    try {
      await deliverRule(admin, rule, slot, now, result);
    } catch (cause) {
      result.failed++;
      result.errors.push(`client rule ${rule.id}: ${(cause as Error).message}`);
    }
  }
  return result;
}

async function deliverRule(admin: Admin, rule: Rule, slot: string, now: Date, result: ClientUpdateResult) {
  const [freshRes, projectRes, conversationRes] = await Promise.all([
    sbAny(admin).from("pm_client_update_rules").select("enabled,project_id,conversation_id,workspace_id").eq("id", rule.id).maybeSingle(),
    sbAny(admin).from("pm_projects").select("*").eq("id", rule.project_id).eq("workspace_id", rule.workspace_id).maybeSingle(),
    sbAny(admin).from("conversations").select("id,workspace_id,channel,status,metadata").eq("id", rule.conversation_id).eq("workspace_id", rule.workspace_id).maybeSingle(),
  ]);
  for (const response of [freshRes, projectRes, conversationRes]) if (response.error) throw response.error;
  const fresh = freshRes.data as { enabled: boolean; project_id: string; conversation_id: string; workspace_id: string } | null;
  if (!fresh?.enabled || fresh.workspace_id !== rule.workspace_id || fresh.project_id !== rule.project_id || fresh.conversation_id !== rule.conversation_id) return;
  const project = projectRes.data as PmProject | null;
  const conversation = conversationRes.data as Conversation | null;
  // Never send project content to a wrong tenant, channel, or closed thread.
  if (!project || project.status === "archived" || !conversation || conversation.channel !== "email" || conversation.status !== "open") return;
  if (typeof conversation.metadata?.account_id !== "string" || !conversation.metadata.account_id) {
    await updateRuleError(admin, rule, "Email conversation has no connected account");
    result.failed++;
    return;
  }

  let tasks: PmTask[] = [];
  if (rule.include_tasks) {
    const { data, error } = await sbAny(admin).from("pm_tasks").select("*")
      .eq("workspace_id", rule.workspace_id).eq("project_id", rule.project_id)
      .neq("status", "done").order("due_date", { ascending: true, nullsFirst: false }).limit(20);
    if (error) throw error;
    tasks = (data ?? []) as PmTask[];
  }
  const body = buildProjectUpdate(project, tasks);
  const { data: claim, error: claimError } = await sbAny(admin).from("pm_client_update_deliveries")
    .insert({ rule_id: rule.id, slot_date: slot }).select("id").single();
  if (claimError?.code === "23505") return;
  if (claimError || !claim) throw claimError ?? new Error("Could not claim client update slot");

  let messageId: string | null = null;
  try {
    const { data: message, error: messageError } = await sbAny(admin).from("messages").insert({
      workspace_id: rule.workspace_id,
      conversation_id: rule.conversation_id,
      direction: "outbound",
      message_type: "text",
      status: "queued",
      body,
      sent_by: rule.created_by,
      metadata: { pm_client_update_rule_id: rule.id, pm_client_update_slot: slot },
    }).select("id").single();
    if (messageError || !message) throw messageError ?? new Error("Could not queue client update");
    messageId = message.id as string;
    await sbAny(admin).from("pm_client_update_deliveries").update({ message_id: messageId }).eq("id", claim.id);
    const { deliverInboxMessage } = await import("./outbound.server");
    const delivery = await deliverInboxMessage({ messageId, userId: rule.created_by });
    if (delivery.status !== "sent" || !delivery.delivered) {
      throw new Error(delivery.error ?? "Delivery was skipped or could not be confirmed");
    }
    await sbAny(admin).from("pm_client_update_deliveries").update({ status: "sent" }).eq("id", claim.id);
    await sbAny(admin).from("pm_client_update_rules").update({ last_sent_at: now.toISOString(), last_error: null }).eq("id", rule.id);
    result.sent++;
  } catch (cause) {
    const reason = String((cause as Error).message ?? cause).slice(0, 500);
    // Once a provider send was attempted, never automatically resend this slot:
    // a timeout may mean the customer already received it.
    await sbAny(admin).from("pm_client_update_deliveries")
      .update({ status: messageId ? "uncertain" : "failed", error: reason, message_id: messageId }).eq("id", claim.id);
    await updateRuleError(admin, rule, reason);
    result.failed++;
    result.errors.push(`client rule ${rule.id}: ${reason}`);
  }
}

async function updateRuleError(admin: Admin, rule: Rule, reason: string) {
  await sbAny(admin).from("pm_client_update_rules").update({ last_error: reason.slice(0, 500) }).eq("id", rule.id);
}
