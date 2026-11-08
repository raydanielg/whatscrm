/**
 * WhatsApp Flows (forms) — client-callable server functions.
 *
 * Publishing a form creates (or updates) a real Flow on the workspace's WABA
 * through the Meta Graph API and stores the returned Flow ID, so the form can
 * be attached to an interactive message. Unpublishing deprecates it at Meta.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FormIdSchema = z.object({ formId: z.string().uuid() });

type FormRow = {
  id: string;
  workspace_id: string;
  name: string;
  category: string;
  status: string;
  flow_id: string | null;
  flow_json: Record<string, unknown> | null;
};

/**
 * Create/refresh the Flow at Meta and publish it.
 * Returns the Meta Flow ID plus any validation warnings Meta reported.
 */
export const publishWhatsAppForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FormIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("whatsapp_forms")
      .select("id, workspace_id, name, category, status, flow_id, flow_json")
      .eq("id", data.formId)
      .maybeSingle();
    if (error || !row) throw new Error("Form not found");
    const form = row as unknown as FormRow;

    const steps = Array.isArray((form.flow_json ?? {})["steps"])
      ? ((form.flow_json ?? {})["steps"] as Array<Record<string, unknown>>)
      : [];
    if (steps.length === 0) {
      throw new Error("Add at least one question before publishing this form.");
    }

    const flows = await import("@/lib/messaging/whatsapp-flows.server");
    const creds = await flows.resolveWabaCredentials(form.workspace_id);
    if (!creds) {
      throw new Error(
        "No connected WhatsApp Cloud account found. Connect WhatsApp before publishing forms.",
      );
    }
    if (!creds.wabaId) {
      throw new Error("The connected WhatsApp account has no WABA ID configured.");
    }

    const flowJson = flows.compileFlowJson(form.name, steps as never);

    let flowId = form.flow_id;
    if (!flowId) {
      flowId = await flows.createMetaFlow(creds.wabaId, creds.token, form.name, form.category);
    }

    const { warnings } = await flows.uploadFlowAsset(flowId, creds.token, flowJson);
    await flows.publishMetaFlow(flowId, creds.token);

    // A stable per-form token lets webhook ingestion match submissions back.
    const existingToken = (form.flow_json ?? {})["flow_token"];
    const flowToken =
      typeof existingToken === "string" && existingToken ? existingToken : `wf_${form.id}`;

    const { error: upErr } = await context.supabase
      .from("whatsapp_forms")
      .update({
        flow_id: flowId,
        waba_id: creds.wabaId,
        status: "PUBLISHED",
        last_published_at: new Date().toISOString(),
        flow_json: { ...(form.flow_json ?? {}), flow_token: flowToken },
      })
      .eq("id", form.id)
      .eq("workspace_id", form.workspace_id);
    if (upErr) throw new Error(upErr.message);

    return { flowId, flowToken, warnings };
  });

/** Deprecate the Flow at Meta and move the form back to draft. */
export const unpublishWhatsAppForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FormIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("whatsapp_forms")
      .select("id, workspace_id, flow_id, status")
      .eq("id", data.formId)
      .maybeSingle();
    if (error || !row) throw new Error("Form not found");
    const form = row as unknown as Pick<FormRow, "id" | "workspace_id" | "flow_id">;

    let deprecated = false;
    if (form.flow_id) {
      const flows = await import("@/lib/messaging/whatsapp-flows.server");
      const creds = await flows.resolveWabaCredentials(form.workspace_id);
      if (creds) {
        try {
          await flows.deprecateMetaFlow(form.flow_id, creds.token);
          deprecated = true;
        } catch {
          // Meta refuses to deprecate drafts / already-deprecated flows.
          deprecated = false;
        }
      }
    }

    const { error: upErr } = await context.supabase
      .from("whatsapp_forms")
      .update({ status: deprecated ? "DEPRECATED" : "DRAFT" })
      .eq("id", form.id)
      .eq("workspace_id", form.workspace_id);
    if (upErr) throw new Error(upErr.message);

    return { deprecated };
  });
