/**
 * Template service — sync approved WhatsApp templates from the provider
 * into `wa_templates` so agents can pick them in the composer.
 */

import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { loadChannelAccount, loadCredentials, getProvider } from "./registry.server";
import { log, makeCorrelationId } from "./logger.server";
import {
  parseMetaError, explainMetaError, toFriendlyErrorMessage, metaErrorLogData,
  isTransientMetaError,
  type MetaStage,

} from "./meta-error-messages";
import type { ProviderName } from "./types";
import { auditTemplateAction } from "./audit-templates.server";
import { normalizeTemplateComponentPhones } from "./template-url-validation";




const STATUS_MAP: Record<string, string> = {
  approved: "approved",
  pending: "pending",
  rejected: "rejected",
  paused: "paused",
  disabled: "disabled",
};

export async function syncTemplatesForAccount(channelAccountId: string): Promise<{ synced: number }> {
  const account = await loadChannelAccount(channelAccountId);
  const impl = getProvider(account.provider as ProviderName);
  if (!impl.listTemplates) return { synced: 0 };
  const creds = loadCredentials(account);
  const correlationId = makeCorrelationId();

  const templates = await impl.listTemplates({
    account, credentials: creds, correlationId,
    log: (level, scope, message, data) => log({
      workspaceId: account.workspaceId, channelAccountId, provider: account.provider,
      level, scope, message, data, correlationId,
    }),
  });

  const rows = templates.map((t) => ({
    workspace_id: account.workspaceId,
    channel_account_id: channelAccountId,
    provider: account.provider,
    external_template_id: t.externalTemplateId,
    name: t.name,
    language: t.language,
    category: t.category,
    status: STATUS_MAP[t.status] ?? "pending",
    components: t.components,
    // Carry Meta's verdict across. Clearing the reason on approval matters:
    // an approved template used to keep showing the old "Fix & resubmit"
    // banner because the stale rejection reason was never reset.
    rejection_reason:
      STATUS_MAP[t.status] === "rejected"
        ? ((t as { rejectedReason?: string | null }).rejectedReason ??
            "Meta rejected this template but did not return a reason. Review the body, buttons and header against Meta's template policy, then resubmit.")
        : null,
    last_synced_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    await supabaseAdmin
      .from("wa_templates" as never)
      .upsert(rows as never, { onConflict: "channel_account_id,name,language" } as never);
  }

  await log({
    workspaceId: account.workspaceId, channelAccountId, provider: account.provider,
    level: "info", scope: "template", message: `synced ${rows.length} templates`,
    correlationId,
  });

  if (rows.length > 0) {
    // Record sync in audit log
    await auditTemplateAction("template.sync", {
      workspaceId: account.workspaceId,
      actorId: null, // System-triggered sync
      templateName: "multiple",
      channelAccountId,
      data: { count: rows.length, correlationId },
    });
  }

  return { synced: rows.length };



}

/**
 * Submit a locally-created template to the provider for approval.
 * Updates the row with the returned external id + status (`pending` typically).
 */
export async function submitTemplateToProvider(templateId: string): Promise<void> {
  const { data: row, error } = await supabaseAdmin
    .from("wa_templates" as never)
    .select("id, workspace_id, channel_account_id, name, language, category, components, external_template_id")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !row) throw new Error("template not found");
  const t = row as unknown as {
    id: string; workspace_id: string; channel_account_id: string;
    name: string; language: string; category: string; components: unknown[];
    external_template_id: string | null;
  };
  const account = await loadChannelAccount(t.channel_account_id);
  const impl = getProvider(account.provider as ProviderName);
  if (!impl.createTemplate) throw new Error("provider does not support template creation");
  const creds = loadCredentials(account);
  const correlationId = makeCorrelationId();

  // Last line of defence before Meta: rewrite call-button numbers into E.164.
  // Covers rows created outside the editor (imports, API, older drafts) that
  // would otherwise fail with "(#192) ... is not a valid phone number".
  const { components: submitComponents, changes: phoneFixes } =
    normalizeTemplateComponentPhones(t.components);
  if (phoneFixes.length > 0) {
    t.components = submitComponents;
    await supabaseAdmin
      .from("wa_templates" as never)
      .update({ components: submitComponents } as never)
      .eq("id", templateId);
    await log({
      workspaceId: t.workspace_id, channelAccountId: t.channel_account_id, provider: account.provider,
      level: "info", scope: "template",
      message: `normalized ${phoneFixes.length} call button number(s) to E.164`,
      data: { changes: phoneFixes }, correlationId,
    });
  }


  try {
    const ctx = {
      account, credentials: creds, correlationId,
      log: (level: "debug" | "info" | "warn" | "error", scope: string, message: string, data?: Record<string, unknown>) => log({
        workspaceId: t.workspace_id, channelAccountId: t.channel_account_id,
        provider: account.provider, level, scope, message, data, correlationId,
      }),
    };
    // Already published at Meta? Editing must go to the template id — creating
    // it again under the same name is rejected as "Invalid parameter".
    const res = t.external_template_id && impl.updateTemplate
      ? await impl.updateTemplate(
          { externalTemplateId: t.external_template_id, category: t.category, components: t.components },
          ctx,
        )
      : await impl.createTemplate(
          { name: t.name, language: t.language, category: t.category, components: t.components },
          ctx,
        );

    await supabaseAdmin
      .from("wa_templates" as never)
      .update({
        external_template_id: res.externalTemplateId,
        status: STATUS_MAP[res.status] ?? "pending",
        last_synced_at: new Date().toISOString(),
        rejection_reason: null,
      } as never)
      .eq("id", templateId);
    await log({
      workspaceId: t.workspace_id, channelAccountId: t.channel_account_id, provider: account.provider,
      level: "info", scope: "template", message: `submitted template ${t.name}`,
      data: { externalTemplateId: res.externalTemplateId, status: res.status }, correlationId,
    });
  } catch (err) {
    const pe = err as Partial<{ status: number; raw: unknown; code: string; kind: string }>;
    const parsed = parseMetaError(Number(pe?.status ?? 0), pe?.raw ?? null);
    if (!parsed.rawMessage && err instanceof Error) parsed.rawMessage = err.message;
    const friendly = explainMetaError("template_submit", parsed);
    const diagnostics = {
      ...metaErrorLogData("template_submit", parsed),
      templateId,
      templateName: t.name,
      language: t.language,
      category: t.category,
      providerErrorKind: pe?.kind,
      correlationId,
    };
    // Full diagnostics stay server-side; the caller only sees the friendly text.
    console.error("[whatsapp:template] submit failed", JSON.stringify(diagnostics));
    await supabaseAdmin
      .from("wa_templates" as never)
      .update({ status: "rejected", rejection_reason: friendly.message } as never)
      .eq("id", templateId);
    await log({
      workspaceId: t.workspace_id, channelAccountId: t.channel_account_id, provider: account.provider,
      level: "error", scope: "template", message: `submit failed: ${friendly.message}`,
      data: diagnostics, correlationId,
    }).catch(() => {});
    throw new Error(toFriendlyErrorMessage(friendly));
  }
}

/** Delete a template at the provider by name (best-effort). */
export async function deleteTemplateAtProvider(
  channelAccountId: string,
  name: string,
  externalTemplateId: string | null,
): Promise<void> {
  const account = await loadChannelAccount(channelAccountId);
  const impl = getProvider(account.provider as ProviderName);
  if (!impl.deleteTemplate) return;
  const creds = loadCredentials(account);
  const correlationId = makeCorrelationId();
  await impl.deleteTemplate(
    { name, externalTemplateId: externalTemplateId ?? undefined },
    {
      account, credentials: creds, correlationId,
      log: (level, scope, message, data) => log({
        workspaceId: account.workspaceId, channelAccountId, provider: account.provider,
        level, scope, message, data, correlationId,
      }),
    },
  );
}

// ---------------------------------------------------------------------------
// Media header samples — Meta Resumable Upload API
// ---------------------------------------------------------------------------

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Resolve the Meta App ID that owns the access token (needed for /uploads). */
async function resolveAppId(accessToken: string): Promise<string> {
  const res = await fetch(
    `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`,
  );
  const json = (await res.json().catch(() => null)) as { data?: { app_id?: string }; error?: unknown } | null;
  if (!res.ok || !json?.data?.app_id) {
    throw metaFailure("resolve_app", res.status, json, { endpoint: "debug_token" });
  }
  return String(json.data.app_id);
}

/**
 * Build an Error carrying a user-friendly message (headline + hint on a second
 * line) while writing the full Meta diagnostics — status, error code, subcode
 * and fbtrace_id — to the server log. Tokens are never logged.
 */
function metaFailure(
  stage: MetaStage,
  status: number,
  body: unknown,
  context: Record<string, unknown> = {},
): Error {
  const parsed = parseMetaError(status, body);
  const friendly = explainMetaError(stage, parsed);
  console.error("[whatsapp:template]", JSON.stringify({ ...metaErrorLogData(stage, parsed), ...context }));
  const err = new Error(toFriendlyErrorMessage(friendly, { retryable: isTransientMetaError(parsed) }));
  (err as Error & { metaDiagnostics?: unknown }).metaDiagnostics = {
    ...metaErrorLogData(stage, parsed),
    ...context,
  };
  return err;
}

/**
 * Upload a sample header media file to Meta and return the `header_handle`
 * required by `components[].example.header_handle` when creating a template
 * with an IMAGE / VIDEO / DOCUMENT header.
 */
export async function uploadTemplateHeaderSample(input: {
  channelAccountId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<{ handle: string }> {
  const account = await loadChannelAccount(input.channelAccountId);
  const creds = loadCredentials(account);
  const accessToken = creds.accessToken;
  if (!accessToken) {
    throw new Error(
      "This WhatsApp account has no access token\nAdd your permanent Meta System User token under Cloud → Secrets and reference its name in the account's advanced settings.",
    );
  }

  const correlationId = makeCorrelationId();
  const uploadContext = {
    channelAccountId: input.channelAccountId,
    workspaceId: account.workspaceId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
    correlationId,
  };

  try {
    return await runHeaderUpload(accessToken, input, uploadContext, account);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const diagnostics = (err as { metaDiagnostics?: Record<string, unknown> })?.metaDiagnostics;
    console.error("[whatsapp:template] header upload failed", JSON.stringify({ ...uploadContext, message, ...(diagnostics ?? {}) }));
    await log({
      workspaceId: account.workspaceId,
      channelAccountId: input.channelAccountId,
      provider: account.provider,
      level: "error",
      scope: "template",
      message: `header upload failed: ${message.split("\n")[0]}`,
      data: { ...uploadContext, ...(diagnostics ?? {}) },
      correlationId,
    }).catch(() => {});
    throw err;
  }
}

async function runHeaderUpload(
  accessToken: string,
  input: { channelAccountId: string; fileName: string; mimeType: string; bytes: Uint8Array },
  uploadContext: Record<string, unknown>,
  account: Awaited<ReturnType<typeof loadChannelAccount>>,
): Promise<{ handle: string }> {
  const appId = await resolveAppId(accessToken);

  // 1. Create the upload session.
  const params = new URLSearchParams({
    file_name: input.fileName,
    file_length: String(input.bytes.byteLength),
    file_type: input.mimeType,
  });
  const sessionRes = await fetch(`${GRAPH_BASE}/${appId}/uploads?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const sessionJson = (await sessionRes.json().catch(() => null)) as { id?: string; error?: unknown } | null;
  if (!sessionRes.ok || !sessionJson?.id) {
    throw metaFailure("upload_session", sessionRes.status, sessionJson, uploadContext);
  }

  // 2. Upload the bytes.
  const uploadRes = await fetch(`${GRAPH_BASE}/${sessionJson.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0",
      "Content-Type": input.mimeType || "application/octet-stream",
    },
    body: input.bytes as unknown as BodyInit,
  });
  const uploadJson = (await uploadRes.json().catch(() => null)) as { h?: string; error?: unknown } | null;
  if (!uploadRes.ok || !uploadJson?.h) {
    throw metaFailure("upload_bytes", uploadRes.status, uploadJson, uploadContext);
  }

  await log({
    workspaceId: account.workspaceId,
    channelAccountId: input.channelAccountId,
    provider: account.provider,
    level: "info",
    scope: "template",
    message: `uploaded header sample ${input.fileName}`,
    data: uploadContext,
    correlationId: String(uploadContext.correlationId ?? makeCorrelationId()),
  });

  return { handle: uploadJson.h };
}
