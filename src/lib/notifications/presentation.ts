import type { NotificationRow } from "@/hooks/use-notifications";

export type NotificationSection =
  | "Communication"
  | "CRM"
  | "Projects & boards"
  | "Marketing"
  | "Automation"
  | "Insights"
  | "API configuration"
  | "Settings"
  | "Platform"
  | "Other";

export const NOTIFICATION_SECTIONS: NotificationSection[] = [
  "Communication",
  "CRM",
  "Projects & boards",
  "Marketing",
  "Automation",
  "Insights",
  "API configuration",
  "Settings",
  "Platform",
  "Other",
];

/** Classify both current and older notification rows without relying on a title's wording. */
export function notificationSection(
  notification: Pick<NotificationRow, "category" | "action_url" | "data">,
): NotificationSection {
  const category = notification.category;
  const data = notification.data ?? {};
  const path = notification.action_url ?? "";

  if (data.source === "platform_broadcast") return "Platform";
  if (
    category === "communication" ||
    category === "livechat_handoff" ||
    category === "ticket_mention" ||
    category === "mention" ||
    category === "assignment" ||
    typeof data.conversation_id === "string" ||
    typeof data.ticket_id === "string" ||
    /^\/(inbox|livechat|helpdesk|booking)(\/|\.|\?|$)/.test(path)
  )
    return "Communication";
  if (
    category === "project" ||
    typeof data.pm_task_id === "string" ||
    typeof data.project_id === "string" ||
    /^\/projects(\/|\.|\?|$)/.test(path)
  )
    return "Projects & boards";
  if (
    category === "crm" ||
    category === "birthday" ||
    category === "task" ||
    category === "deal" ||
    typeof data.task_id === "string" ||
    /^\/(crm|contacts|audience|leads|deals|tasks)(\/|\.|\?|$)/.test(path)
  )
    return "CRM";
  if (
    category === "marketing" ||
    category === "campaign" ||
    /^\/(campaigns|campaign-analytics|campaign-templates|marketing|broadcasts|social)(\/|\.|\?|$)/.test(
      path,
    )
  )
    return "Marketing";
  if (
    category === "automation" ||
    category === "workflow" ||
    category === "ai" ||
    /^\/(automations|automation-flows|webhook-automation|workflows)(\/|\.|\?|$)/.test(path)
  )
    return "Automation";
  if (
    category === "insights" ||
    typeof data.report_id === "string" ||
    /^\/(bi|analytics|reports|ai-analytics)(\/|\.|\?|$)/.test(path)
  )
    return "Insights";
  if (
    category === "api_configuration" ||
    /^\/(api-config|developer|developer-tools|integrations)(\/|\.|\?|$)/.test(path)
  )
    return "API configuration";
  if (category === "settings" || /^\/settings(\/|\.|\?|$)/.test(path)) return "Settings";
  if (
    category === "platform" ||
    category === "system" ||
    category === "workspace" ||
    category === "invitation" ||
    category === "security" ||
    category === "subscription" ||
    category === "usage_alert"
  )
    return "Platform";
  return "Other";
}
