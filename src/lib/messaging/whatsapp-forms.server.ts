/**
 * WhatsApp Flow (form) submission ingestion.
 *
 * Meta delivers Flow submissions as regular inbound messages with:
 *   messages[].type === "interactive"
 *   messages[].interactive.type === "nfm_reply"
 *   messages[].interactive.nfm_reply = { response_json, body, name }
 *
 * `response_json` is a JSON string containing:
 *   { flow_token, ...field values... }
 *
 * We resolve the target `whatsapp_forms` row by:
 *   1. flow_token stashed on the form (preferred), else
 *   2. flow_id embedded in response_json / interactive body, else
 *   3. most recent PUBLISHED form on the workspace (best-effort fallback).
 *
 * Dedup: we rely on the unique index on
 * `whatsapp_form_submissions.external_message_id`.
 * Repeated Meta redeliveries collapse to a single row.
 */

import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { routeWebhookToAccount } from "./registry.server";
import { sbAny } from "@/lib/supabase/untyped";

type Json = Record<string, unknown>;

interface Extracted {
  externalMessageId: string;
  fromWaId: string;
  contactName?: string;
  flowToken?: string;
  flowId?: string;
  responseJson: Json;
  raw: Json;
  receivedAt: string;
}

function safeJsonParse(input: unknown): Json | null {
  if (!input) return null;
  if (typeof input === "object") return input as Json;
  if (typeof input !== "string") return null;
  try {
    const v = JSON.parse(input);
    return v && typeof v === "object" ? (v as Json) : null;
  } catch {
    return null;
  }
}

function extractFormMessages(body: unknown): Extracted[] {
  const out: Extracted[] = [];
  const b = body as Json | undefined;
  const entries = Array.isArray(b?.entry) ? (b!.entry as Json[]) : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? (entry.changes as Json[]) : [];
    for (const change of changes) {
      const value = change?.value as Json | undefined;
      if (!value) continue;
      const contacts = Array.isArray(value.contacts) ? (value.contacts as Json[]) : [];
      const contactNameByWaId = new Map<string, string>();
      for (const c of contacts) {
        const waId = (c?.wa_id ?? "") as string;
        const profile = c?.profile as Json | undefined;
        const name = (profile?.name ?? "") as string;
        if (waId && name) contactNameByWaId.set(waId, name);
      }
      const messages = Array.isArray(value.messages) ? (value.messages as Json[]) : [];
      for (const msg of messages) {
        if (msg?.type !== "interactive") continue;
        const interactive = msg.interactive as Json | undefined;
        if (interactive?.type !== "nfm_reply") continue;
        const nfm = interactive.nfm_reply as Json | undefined;
        if (!nfm) continue;
        const responseJson = safeJsonParse(nfm.response_json) ?? {};
        const externalMessageId = (msg.id ?? "") as string;
        if (!externalMessageId) continue;
        const fromWaId = (msg.from ?? "") as string;
        const tsSec = Number(msg.timestamp ?? 0);
        const receivedAt =
          tsSec > 0 ? new Date(tsSec * 1000).toISOString() : new Date().toISOString();
        out.push({
          externalMessageId,
          fromWaId,
          contactName: contactNameByWaId.get(fromWaId),
          flowToken: (responseJson.flow_token ?? nfm.flow_token ?? undefined) as string | undefined,
          flowId: (responseJson.flow_id ?? nfm.flow_id ?? undefined) as string | undefined,
          responseJson,
          raw: { message: msg, nfm_reply: nfm },
          receivedAt,
        });
      }
    }
  }
  return out;
}

async function resolveFormId(workspaceId: string, ex: Extracted): Promise<string | null> {
  // 1. Match by flow_token stored in flow_json.flow_token
  if (ex.flowToken) {
    const { data } = await supabaseAdmin
      .from("whatsapp_forms" as never)
      .select("id")
      .eq("workspace_id", workspaceId)
      .filter("flow_json->>flow_token", "eq", ex.flowToken)
      .limit(1)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  // 2. Match by flow_id column
  if (ex.flowId) {
    const { data } = await supabaseAdmin
      .from("whatsapp_forms" as never)
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("flow_id", ex.flowId)
      .limit(1)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  // No match found — do NOT fall back to "most recent form" as that silently
  // misroutes submissions to the wrong form when flow_token is missing.
  // eslint-disable-next-line no-console
  console.warn("[whatsapp-forms] Could not resolve form for submission", {
    workspaceId,
    flowToken: ex.flowToken,
    flowId: ex.flowId,
  });
  return null;
}

/**
 * Process WhatsApp Flow submissions from a raw webhook envelope.
 * Idempotent — safe to call for every POST, including redeliveries.
 */
export async function processWhatsAppFormSubmissions(rawBody: string): Promise<{
  processed: number;
  inserted: number;
}> {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { processed: 0, inserted: 0 };
  }
  const extracted = extractFormMessages(body);
  if (extracted.length === 0) return { processed: 0, inserted: 0 };

  const account = await routeWebhookToAccount("whatsapp_cloud", body);
  if (!account) return { processed: extracted.length, inserted: 0 };

  let inserted = 0;
  for (const ex of extracted) {
    const formId = await resolveFormId(account.workspaceId, ex);
    if (!formId) continue;

    // Insert with dedup on external_message_id (unique partial index).
    const { error } = await sbAny(supabaseAdmin)
      .from("whatsapp_form_submissions" as never)
      .insert({
        workspace_id: account.workspaceId,
        form_id: formId,
        contact_wa_id: ex.fromWaId || null,
        contact_name: ex.contactName ?? null,
        response_data: ex.responseJson,
        external_message_id: ex.externalMessageId,
        flow_token: ex.flowToken ?? null,
        raw: ex.raw,
        received_at: ex.receivedAt,
      } as never);

    if (error) {
      // 23505 = unique_violation → known duplicate, treat as success.
      if ((error as { code?: string }).code !== "23505") {
        // eslint-disable-next-line no-console
        console.error("[whatsapp-forms] insert failed", error);
      }
      continue;
    }

    inserted += 1;

    // Atomically increment counter via RPC to avoid race conditions.
    // RPC not yet deployed — log and skip rather than corrupting the counter
    // with a racy read-modify-write. The count will be off until the RPC is
    // applied; that is preferable to silently losing increments under load.
    try {
      const { error: rpcErr } = await sbAny(supabaseAdmin).rpc("increment_form_submissions_count", {
        form_id: formId,
      });
      if (rpcErr) throw rpcErr;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[whatsapp-forms] increment_form_submissions_count RPC failed", err);
    }
  }

  return { processed: extracted.length, inserted };
}
