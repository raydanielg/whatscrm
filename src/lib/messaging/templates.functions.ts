/**
 * WhatsApp template management — server functions.
 *
 * Endpoints (all workspace-scoped, RLS enforced via requireSupabaseAuth):
 *  - listTemplates      : list all templates for a workspace / account
 *  - getTemplate        : single template with version history
 *  - createTemplate     : draft + submit to WhatsApp Cloud API for approval
 *  - updateTemplate     : edit local metadata + re-submit new version to Meta
 *  - deleteTemplate     : delete at provider + locally
 *  - syncTemplates      : pull latest status/components from Meta (import)
 *  - previewTemplate    : render template with variable substitution
 *  - getTemplateAnalytics : per-template send/deliver/read/failed counts
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ALL_HEADER_MIMES,
  MAX_HEADER_BYTES,
  formatForMime,
  countPdfPages,
  validateDuration,
  validateHeaderMedia,
  validatePageCount,
} from "./header-media-limits";
import {
  assertValidTemplateUrls,
  normalizeTemplateComponentPhones,
} from "./template-url-validation";

import { assertValidTemplatePayload, assertValidTemplateComponents } from "./template-payload-schema";
import { assertNotSampleTemplate } from "./sample-templates";
import { auditTemplateAction } from "./audit-templates.server";
import { appendTemplateVersion } from "./template-versions";
import { sbAny } from "@/lib/supabase/untyped";


// ---------------------------------------------------------------------------
// schemas
// ---------------------------------------------------------------------------

const TemplateComponent = z.object({
  type: z.enum(["HEADER", "BODY", "FOOTER", "BUTTONS", "CAROUSEL"]),
  format: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]).optional(),
  text: z.string().max(1024).optional(),
  example: z.record(z.string(), z.unknown()).optional(),
  buttons: z.array(z.record(z.string(), z.unknown())).optional(),
});

const CreateSchema = z.object({
  workspaceId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  name: z.string().regex(/^[a-z0-9_]{1,512}$/, "lowercase letters, digits and underscores only"),
  language: z.string().min(2).max(10),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  components: z.array(TemplateComponent).min(1).max(10),
  submit: z.boolean().optional(),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  // Name/language may only be changed while the template is a local draft
  // that Meta has never seen (enforced in the handler).
  name: z.string().trim().min(1).max(512).regex(/^[a-z0-9_]+$/).optional(),
  language: z.string().min(2).max(10).optional(),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).optional(),
  components: z.array(TemplateComponent).min(1).max(10).optional(),
  resubmit: z.boolean().optional(),
});

const IdSchema = z.object({ id: z.string().uuid() });
const WsSchema = z.object({ workspaceId: z.string().uuid(), channelAccountId: z.string().uuid().optional() });
const SyncSchema = z.object({ workspaceId: z.string().uuid(), channelAccountId: z.string().uuid() });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type JsonPrim = string | number | boolean | null;
type JsonValue = JsonPrim | { [k: string]: JsonValue } | JsonValue[];
type JsonObject = { [k: string]: JsonValue };

interface TemplateRow {
  id: string;
  workspace_id: string;
  channel_account_id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: JsonObject[];
  variables: string[];
  versions: JsonObject[];
  external_template_id: string | null;
  rejection_reason: string | null;
  quality_score: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

function extractVariables(components: unknown[]): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  for (const raw of components) {
    const c = raw as { text?: string; buttons?: Array<{ text?: string; url?: string }> };
    const bits = [c.text, ...(c.buttons ?? []).flatMap((b) => [b.text, b.url])].filter(Boolean) as string[];
    for (const s of bits) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) set.add(m[1]);
    }
  }
  return Array.from(set).sort((a, b) => Number(a) - Number(b));
}

// ---------------------------------------------------------------------------
// list / get
// ---------------------------------------------------------------------------

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => WsSchema.parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("wa_templates" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("updated_at", { ascending: false });
    if (data.channelAccountId) q = q.eq("channel_account_id", data.channelAccountId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { templates: (rows ?? []) as unknown as TemplateRow[] };
  });

export const getTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("wa_templates" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Template not found");
    return { template: row as unknown as TemplateRow };
  });

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Role-based check: Only workspace admins (owners/admins) can create templates.
    const { data: isAdmin } = await sbAny(context.supabase).rpc("is_workspace_admin", {
      _workspace_id: data.workspaceId,
      _user_id: context.userId,
    });
    if (!isAdmin) throw new Error("Unauthorized: Only workspace admins can create templates.");

    // Rewrite call-button numbers into E.164 before anything else so Meta
    // never sees "(#192) ... is not a valid phone number" for a fixable format.
    const { components: normalizedComponents } = normalizeTemplateComponentPhones(data.components);

    // Catch invalid URL buttons here so Meta never returns its opaque

    // "(#100) Param components[i]['buttons'][j]['url'] is not a valid URI".
    assertValidTemplateUrls(normalizedComponents);
    // Full Meta payload validation (name, category, components, buttons).
    assertValidTemplatePayload({
      name: data.name,
      language: data.language,
      category: data.category,
      components: normalizedComponents,
    });
    const variables = extractVariables(normalizedComponents);
    const row = {
      workspace_id: data.workspaceId,
      channel_account_id: data.channelAccountId,
      provider: "whatsapp_cloud",
      name: data.name,
      language: data.language,
      category: data.category,
      components: normalizedComponents,
      variables,
      status: "draft",
      created_by: context.userId,
      versions: [
        { version: 1, created_at: new Date().toISOString(), user_id: context.userId, category: data.category, components: normalizedComponents },
      ],
    };

    const { data: inserted, error } = await context.supabase
      .from("wa_templates" as never)
      .insert(row as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const created = inserted as unknown as TemplateRow;

    await auditTemplateAction("template.create", {
      workspaceId: data.workspaceId,
      actorId: context.userId,
      templateId: created.id,
      templateName: created.name,
      channelAccountId: data.channelAccountId,
      data: { submit: data.submit, category: data.category },
    });

    if (data.submit) {
      const { submitTemplateToProvider } = await import("./templates.server");
      await submitTemplateToProvider(created.id);
    }

    return { template: created };
  });

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: readErr } = await context.supabase
      .from("wa_templates" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing) throw new Error("Template not found");
    const cur = existing as unknown as TemplateRow;

    // Role-based check: Only workspace admins (owners/admins) can edit templates.
    const { data: isAdmin } = await sbAny(context.supabase).rpc("is_workspace_admin", {
      _workspace_id: cur.workspace_id,
      _user_id: context.userId,
    });
    if (!isAdmin) throw new Error("Unauthorized: Only workspace admins can edit templates.");

    // Meta-owned sample templates are read-only at the provider.

    assertNotSampleTemplate(cur.name);

    const rawComponents = data.components ?? (cur.components as unknown[]);
    // E.164-normalize call buttons on every save, including edits of a
    // template Meta previously rejected with (#192).
    const { components } = normalizeTemplateComponentPhones(rawComponents);
    const category = data.category ?? cur.category;
    // Never re-submit a template whose URL buttons Meta would reject.
    if (data.resubmit) {
      assertValidTemplateUrls(components);
      assertValidTemplateComponents(components);
    }

    const variables = extractVariables(components);
    // Identical consecutive snapshots are not recorded again — repeated saves
    // or resubmits of unchanged content should not create duplicate versions.
    const { versions, version: nextVersion } = appendTemplateVersion(cur.versions, {
      category,
      components,
      userId: context.userId,
    });

    // A draft that was never submitted is still fully editable; once Meta owns
    // the template its name/language are immutable.
    const isLocalDraft = cur.status === "draft" && !cur.external_template_id;
    if ((data.name || data.language) && !isLocalDraft) {
      throw new Error("Name and language can only be changed while the template is an unsubmitted draft.");
    }

    const patch = {
      category,
      ...(isLocalDraft && data.name ? { name: data.name } : {}),
      ...(isLocalDraft && data.language ? { language: data.language } : {}),
      components,
      variables,
      status: data.resubmit ? "pending" : cur.status,
      versions,
    };
    const { data: updated, error } = await context.supabase
      .from("wa_templates" as never)
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const updatedRow = updated as unknown as TemplateRow;

    await auditTemplateAction("template.update", {
      workspaceId: cur.workspace_id,
      actorId: context.userId,
      templateId: data.id,
      templateName: cur.name,
      channelAccountId: cur.channel_account_id,
      data: { resubmit: data.resubmit, category: data.category, version: nextVersion },
    });

    if (data.resubmit) {
      const { submitTemplateToProvider } = await import("./templates.server");
      await submitTemplateToProvider(data.id);
    }
    return { template: updatedRow };

  });

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error: readErr } = await context.supabase
      .from("wa_templates" as never)
      .select("id, workspace_id, name, channel_account_id, external_template_id, status")

      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Template not found");
    const t = row as unknown as { id: string; workspace_id: string; name: string; channel_account_id: string; external_template_id: string | null; status: string };

    // Role-based check: Only workspace admins (owners/admins) can delete templates.
    const { data: isAdmin } = await sbAny(context.supabase).rpc("is_workspace_admin", {
      _workspace_id: t.workspace_id,
      _user_id: context.userId,
    });
    if (!isAdmin) throw new Error("Unauthorized: Only workspace admins can delete templates.");

    assertNotSampleTemplate(t.name);


    // Best-effort delete at provider if it was ever submitted.
    if (t.status !== "draft") {
      try {
        const { deleteTemplateAtProvider } = await import("./templates.server");
        await deleteTemplateAtProvider(t.channel_account_id, t.name, t.external_template_id);
      } catch (err) {
        // continue with local delete; provider errors are logged inside
        console.warn("provider delete failed", err);
        await auditTemplateAction("template.delete_failure", {
          workspaceId: t.workspace_id,

          actorId: context.userId,
          templateId: data.id,
          templateName: t.name,
          channelAccountId: t.channel_account_id,
          data: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    const { error } = await sbAny(context.supabase).from("wa_templates" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    await auditTemplateAction("template.delete", {
      workspaceId: t.workspace_id,
      actorId: context.userId,
      templateId: data.id,
      templateName: t.name,
      channelAccountId: t.channel_account_id,
    });

    return { ok: true };

  });

// ---------------------------------------------------------------------------
// sync / import from Meta
// ---------------------------------------------------------------------------

export const syncTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SyncSchema.parse(input))
  .handler(async ({ data }) => {
    const { syncTemplatesForAccount } = await import("./templates.server");
    const res = await syncTemplatesForAccount(data.channelAccountId);
    return res;
  });

// ---------------------------------------------------------------------------
// preview — render with variable substitution
// ---------------------------------------------------------------------------

const PreviewSchema = z.object({
  id: z.string().uuid(),
  variables: z.record(z.string(), z.string()).optional(),
});

export const previewTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => PreviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("wa_templates" as never)
      .select("components, variables, language, name, category")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Template not found");
    const t = row as unknown as { components: unknown[]; variables: string[]; language: string; name: string; category: string };
    const vars = data.variables ?? {};
    const render = (s: string) => s.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
    const rendered = t.components.map((raw) => {
      const c = raw as { type: string; format?: string; text?: string; buttons?: Array<{ text?: string; url?: string; type?: string }> };
      return {
        ...c,
        text: c.text ? render(c.text) : c.text,
        buttons: c.buttons?.map((b) => ({ ...b, text: b.text ? render(b.text) : b.text, url: b.url ? render(b.url) : b.url })),
      };
    });
    return { preview: { name: t.name, language: t.language, category: t.category, components: rendered } };
  });

// ---------------------------------------------------------------------------
// analytics — counts from messages table
// ---------------------------------------------------------------------------

export const getTemplateAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("wa_templates" as never)
      .select("workspace_id, name")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { sent: 0, delivered: 0, read: 0, failed: 0 };
    const t = row as unknown as { workspace_id: string; name: string };
    const { data: msgs } = await context.supabase
      .from("messages" as never)
      .select("status")
      .eq("workspace_id", t.workspace_id)
      .eq("type", "template")
      .contains("metadata" as never, { template_name: t.name } as never);
    const counts = { sent: 0, delivered: 0, read: 0, failed: 0 } as Record<string, number>;
    for (const r of (msgs ?? []) as Array<{ status?: string }>) {
      const s = String(r.status ?? "sent");
      if (s in counts) counts[s] += 1;
    }
    return counts as { sent: number; delivered: number; read: number; failed: number };
  });

// ---------------------------------------------------------------------------
// header media sample upload (IMAGE / VIDEO / DOCUMENT headers)
// ---------------------------------------------------------------------------

const HeaderSampleSchema = z.object({
  workspaceId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  mimeType: z
    .string()
    .min(3)
    .max(128)
    .transform((m) => m.split(";")[0].trim().toLowerCase())
    .refine((m) => ALL_HEADER_MIMES.includes(m), {
      message: "Unsupported file type for a template header",
    }),
  // base64-encoded file contents (no data: prefix)
  base64: z.string().min(1).max(Math.ceil((MAX_HEADER_BYTES * 4) / 3) + 1024),
  durationSeconds: z.number().positive().max(60 * 60).optional(),
});

export const uploadTemplateHeaderSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => HeaderSampleSchema.parse(input))
  .handler(async ({ data, context }) => {
    // RLS check: caller must be able to read this account in this workspace.
    const { data: acct, error } = await context.supabase
      .from("channel_accounts" as never)
      .select("id")
      .eq("id", data.channelAccountId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!acct) throw new Error("Channel account not found");

    const format = formatForMime(data.mimeType);
    if (!format) throw new Error("Unsupported file type for a template header");

    const binary = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));

    // Authoritative server-side mime + size validation (client checks are a UX nicety).
    const invalid = validateHeaderMedia(format, {
      mimeType: data.mimeType,
      size: binary.byteLength,
    });
    if (invalid) throw new Error(invalid);

    const tooLong = validateDuration(format, data.durationSeconds ?? null);
    if (tooLong) throw new Error(tooLong);

    // Documents: enforce the page cap from the real bytes, never from a
    // client-supplied number.
    if (format === "DOCUMENT") {
      const tooManyPages = validatePageCount(format, countPdfPages(binary));
      if (tooManyPages) throw new Error(tooManyPages);
    }

    const { uploadTemplateHeaderSample: upload } = await import("./templates.server");
    const { handle } = await upload({
      channelAccountId: data.channelAccountId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      bytes: binary,
    });
    return { handle };
  });

