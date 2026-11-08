import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Send a single "Test Send" template message to a phone number using the
 * workspace's connected WhatsApp Cloud channel account. Bypasses campaign
 * recipient materialization — used from the Send Campaign wizard to verify
 * a template render before launching a broadcast.
 */

const inputSchema = z.object({
  templateId: z.string().uuid(),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{6,14}$/, "Enter a valid international phone number (E.164)"),
  variables: z.record(z.string(), z.string()).optional().default({}),
  channelAccountId: z.string().uuid().optional(),
});

/** Turn a template `components` array + variable map into Meta send components. */
function buildSendComponents(
  templateComponents: unknown,
  variables: Record<string, string>,
): Array<Record<string, unknown>> {
  if (!Array.isArray(templateComponents)) return [];
  const out: Array<Record<string, unknown>> = [];
  const varKeys = Object.keys(variables);

  for (const raw of templateComponents as Array<Record<string, unknown>>) {
    const type = String(raw?.type ?? "").toUpperCase();
    if (type === "BODY" || type === "HEADER") {
      const text = String(raw?.text ?? "");
      // Match {{1}}, {{2}}, {{name}} tokens in the order they appear.
      const tokens = Array.from(text.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)).map((m) => m[1]);
      if (tokens.length === 0) continue;
      const params = tokens.map((tok) => {
        // Numeric token or named token — pull from the variables map. Fall
        // back to the first available variable in insertion order so a
        // partially-filled test never sends a raw `{{1}}` placeholder.
        const value =
          variables[tok] ??
          variables[String(Number(tok))] ??
          variables[varKeys[Number(tok) - 1] ?? ""] ??
          "";
        return { type: "text", text: value };
      });
      out.push({ type: type.toLowerCase(), parameters: params });
    }
  }
  return out;
}

export const sendTestTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => inputSchema.parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;

    // 1) Load the template. RLS scopes to caller's workspace.
    const { data: tpl, error: tErr } = await supabase
      .from("wa_templates")
      .select("id, workspace_id, name, language, status, components")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!tpl) throw new Error("Template not found");
    if (String(tpl.status).toLowerCase() !== "approved") {
      throw new Error(`Template is ${tpl.status}. Only APPROVED templates can be sent.`);
    }

    // 1b) Strict variable validation — mirrors the client check so the API
    // rejects malformed payloads even if a caller bypasses the UI.
    const { validateTemplateVariables } = await import("./variable-validation");
    const { issues } = validateTemplateVariables(tpl.components, data.variables ?? {});
    if (issues.length > 0) {
      throw new Error(issues[0].message);
    }

    // 2) Resolve the channel account (explicit → default → first connected WA Cloud).
    let accountQ = supabase
      .from("channel_accounts")
      .select("id, workspace_id, provider, status, is_default")
      .eq("workspace_id", tpl.workspace_id)
      .eq("provider", "whatsapp_cloud")
      .eq("status", "connected");
    if (data.channelAccountId) accountQ = accountQ.eq("id", data.channelAccountId);
    const { data: accounts, error: aErr } = await accountQ.limit(10);
    if (aErr) throw new Error(aErr.message);
    const account =
      (accounts ?? []).find((a: any) => a.is_default) ?? (accounts ?? [])[0];
    if (!account) {
      throw new Error(
        "No connected WhatsApp Cloud account in this workspace. Connect one on the Channels page first.",
      );
    }

    // 3) Load full record + credentials on the server.
    const { loadChannelAccount, loadCredentials } = await import(
      "@/lib/messaging/registry.server"
    );
    const acc = await loadChannelAccount(account.id);
    if (!acc) throw new Error("Failed to load channel account");
    const credentials = loadCredentials(acc);

    // 4) Build the outbound payload and send via the WA Cloud provider.
    const components = buildSendComponents(tpl.components, data.variables ?? {});
    const { whatsappCloudProvider } = await import(
      "@/lib/messaging/providers/whatsapp-cloud.server"
    );
    const to = data.phoneNumber.replace(/^\+/, "");

    const correlationId = crypto.randomUUID();
    try {
      const result = await whatsappCloudProvider.send(
        {
          to,
          type: "template",
          template: {
            name: tpl.name,
            language: tpl.language ?? "en_US",
            components,
          },
        },
        {
          account: acc,
          credentials,
          correlationId,
          log: () => {
            /* no-op — errors are surfaced via thrown ProviderError */
          },
        },
      );
      return {
        ok: true,
        externalMessageId: result.externalMessageId,
        status: result.status,
        correlationId,
      };
    } catch (err) {
      const e = err as { message?: string; code?: string; kind?: string };
      return {
        ok: false,
        error: e.message ?? "Send failed",
        code: e.code ?? e.kind ?? "unknown",
        correlationId,
      };
    }
  });
