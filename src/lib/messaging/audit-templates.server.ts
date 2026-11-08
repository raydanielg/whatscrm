/**
 * Template-specific audit logging.
 *
 * Records template lifecycle events (create, edit, delete, sync) to the 
 * centralized security audit trail.
 */
import { recordServerAuditEvent } from "@/lib/security/audit.server";

export type TemplateAuditEvent = "template.create" | "template.update" | "template.delete" | "template.sync" | "template.delete_failure";

interface AuditParams {
  workspaceId: string;
  actorId: string | null;
  templateId?: string | null;
  templateName: string;
  channelAccountId: string;
  data?: Record<string, any>;
}

export async function auditTemplateAction(
  type: TemplateAuditEvent,
  params: AuditParams
) {
  await recordServerAuditEvent({
    eventType: type,
    severity: type === "template.delete_failure" ? "warning" : "info",
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    resourceType: "wa_template",
    resourceId: params.templateId || params.templateName,
    data: {
      template_name: params.templateName,
      channel_account_id: params.channelAccountId,
      ...params.data,
    },
  });
}
