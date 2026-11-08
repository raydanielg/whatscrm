/**
 * WhatsApp Flows (forms) — Meta Graph API layer.
 *
 * Responsibilities:
 *  - compile the app's simple `flow_json` step list into a Meta Flow JSON asset
 *  - create / update / publish / deprecate the Flow on the WABA
 *  - resolve WABA credentials from the workspace's connected channel account
 *
 * Server-only: never import this from client code.
 */

const GRAPH = "https://graph.facebook.com/v20.0";

export interface FlowStep {
  id?: string;
  title: string;
  question: string;
  type: "text" | "textarea" | "email" | "phone" | "number" | "select" | "multiselect";
  required: boolean;
  field_key: string;
  help?: string | null;
  validation?: { min?: number | null; max?: number | null; pattern?: string | null };
  options?: Array<{ value: string; label: string }>;
}

export const FLOW_SCREEN_ID = "FORM";

/**
 * Sanitize a field_key to a valid Meta Flow JSON identifier.
 * Meta requires component names to match [a-z][a-z0-9_]* — lowercase,
 * starting with a letter, only alphanumeric and underscores.
 */
function sanitizeFieldKey(key: string, index: number): string {
  const cleaned = key
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^[^a-z]+/, "");
  // Always include the step index as a suffix to prevent cross-step collisions
  // when two distinct keys sanitize to the same string (e.g. "1name" and "2name" → "name").
  return cleaned ? `${cleaned}_${index}` : `field_${index}`;
}

/** Compile the app's step list into a Meta Flow JSON (v5.0) asset. */
export function compileFlowJson(name: string, steps: FlowStep[]): Record<string, unknown> {
  const children: Record<string, unknown>[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const fieldName = sanitizeFieldKey(step.field_key, i);
    const label = step.question.slice(0, 80);
    // TextInput and TextArea use "helper-text"; Dropdown/CheckboxGroup use "description".
    const textHint = step.help ? { "helper-text": String(step.help).slice(0, 80) } : {};
    const choiceHint = step.help ? { description: String(step.help).slice(0, 300) } : {};

    switch (step.type) {
      case "textarea":
        children.push({
          type: "TextArea",
          name: fieldName,
          label,
          required: step.required,
          "max-length": step.validation?.max ?? 600,
          ...textHint,
        });
        break;
      case "select": {
        const opts = (step.options ?? []).filter((o) => o.value && o.label);
        if (opts.length === 0) throw new Error(`Step "${step.title}" has no options`);
        children.push({
          type: "RadioButtonsGroup",
          name: fieldName,
          label,
          required: step.required,
          "data-source": opts.map((o) => ({
            id: String(o.value),
            title: o.label.slice(0, 30),
          })),
          ...choiceHint,
        });
        break;
      }
      case "multiselect": {
        const opts = (step.options ?? []).filter((o) => o.value && o.label);
        if (opts.length === 0) throw new Error(`Step "${step.title}" has no options`);
        children.push({
          type: "CheckboxGroup",
          name: fieldName,
          label,
          required: step.required,
          "data-source": opts.map((o) => ({
            id: String(o.value),
            title: o.label.slice(0, 30),
          })),
          ...choiceHint,
        });
        break;
      }
      default: {
        const inputType =
          step.type === "email"
            ? "email"
            : step.type === "phone"
              ? "phone"
              : step.type === "number"
                ? "number"
                : "text";
        children.push({
          type: "TextInput",
          name: fieldName,
          label,
          required: step.required,
          "input-type": inputType,
          ...(step.validation?.max ? { "max-length": step.validation.max } : {}),
          ...textHint,
        });
        break;
      }
    }
  }

  const payload: Record<string, string> = {};
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const fieldName = sanitizeFieldKey(step.field_key, i);
    payload[fieldName] = `\${form.${fieldName}}`;
  }

  children.push({
    type: "Footer",
    label: "Submit",
    "on-click-action": { name: "complete", payload },
  });

  return {
    version: "6.1",
    screens: [
      {
        id: FLOW_SCREEN_ID,
        title: name.slice(0, 30),
        terminal: true,
        success: true,
        layout: {
          type: "SingleColumnLayout",
          children: [{ type: "Form", name: "form", children }],
        },
      },
    ],
  };
}

function metaErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; error_user_msg?: string } };
    return parsed.error?.error_user_msg || parsed.error?.message || `Meta API error (${status})`;
  } catch {
    return `Meta API error (${status}): ${body.slice(0, 200)}`;
  }
}

async function graph(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(metaErrorMessage(res.status, text));
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface WabaCredentials {
  token: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  accountId: string | null;
}

/**
 * Resolve WhatsApp Cloud credentials for a workspace from `channel_accounts`,
 * falling back to conventional environment variables for self-hosted installs.
 */
export async function resolveWabaCredentials(workspaceId: string): Promise<WabaCredentials | null> {
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: rows } = await (
      supabaseAdmin as never as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              a: string,
              b: string,
            ) => {
              eq: (
                a: string,
                b: string,
              ) => {
                order: (
                  c: string,
                  o: { ascending: boolean },
                ) => {
                  limit: (
                    n: number,
                  ) => Promise<{ data: Array<{ id: string; status: string }> | null }>;
                };
              };
            };
          };
        };
      }
    )
      .from("channel_accounts")
      .select("id, status")
      .eq("workspace_id", workspaceId)
      .eq("provider", "whatsapp_cloud")
      .order("is_default", { ascending: false })
      .limit(5);

    const account =
      (rows ?? []).find((r) => r.status === "active" || r.status === "connected") ??
      (rows ?? [])[0];

    if (account?.id) {
      const registry = await import("./registry.server");
      const record = await registry.loadChannelAccount(account.id);
      const creds = registry.loadCredentials(record);
      if (creds.accessToken) {
        return {
          token: creds.accessToken,
          wabaId: record.wabaId ?? null,
          phoneNumberId: record.phoneNumberId ?? null,
          accountId: account.id,
        };
      }
    }
  } catch {
    // fall through to env-based credentials
  }

  const token = process.env["WHATSAPP_ACCESS_TOKEN"] ?? process.env["META_ACCESS_TOKEN"] ?? null;
  if (!token) return null;
  return {
    token,
    wabaId: process.env["WHATSAPP_WABA_ID"] ?? null,
    phoneNumberId: process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? null,
    accountId: null,
  };
}

/** List flows on a WABA — used for duplicate-name recovery. */
async function listMetaFlows(
  wabaId: string,
  token: string,
): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await graph(`/${wabaId}/flows?fields=id,name&limit=100`, token);
    const data = (res as { data?: Array<{ id: string; name: string }> }).data ?? [];
    return data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp-flows] listMetaFlows failed", err);
    return [];
  }
}

/**
 * Create a Flow on the WABA. Returns the Meta flow id.
 *
 * If Meta rejects the name as a duplicate, we search the WABA's existing flows
 * for a matching name and return that id — this recovers from the case where
 * the flow was previously created on Meta but the flow_id was lost in our DB.
 */
export async function createMetaFlow(
  wabaId: string,
  token: string,
  name: string,
  category: string,
): Promise<string> {
  try {
    const res = await graph(`/${wabaId}/flows`, token, {
      method: "POST",
      body: JSON.stringify({ name: name.slice(0, 200), categories: [category] }),
    });
    const id = (res as { id?: string }).id;
    if (!id) throw new Error("Meta did not return a Flow ID");
    return id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Meta error: "Flow name should be unique within one WhatsApp business account"
    if (/unique|duplicate|already exists/i.test(msg)) {
      const existing = await listMetaFlows(wabaId, token);
      const match = existing.find((f) => f.name.toLowerCase() === name.slice(0, 200).toLowerCase());
      if (match?.id) return match.id;
    }
    throw err;
  }
}

/** Upload (replace) the Flow JSON asset. */
export async function uploadFlowAsset(
  flowId: string,
  token: string,
  flowJson: Record<string, unknown>,
): Promise<{ warnings: string[] }> {
  const form = new FormData();
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  form.append(
    "file",
    new Blob([JSON.stringify(flowJson)], { type: "application/json" }),
    "flow.json",
  );
  const res = await graph(`/${flowId}/assets`, token, { method: "POST", body: form });
  const allErrors =
    (res as { validation_errors?: Array<{ message?: string; error_severity?: string }> })
      .validation_errors ?? [];
  // Meta marks fatal errors with error_severity "error"; warnings are "warning".
  const fatal = allErrors.filter((e) => e.error_severity === "error");
  if (fatal.length > 0) {
    throw new Error(
      `Flow JSON rejected by Meta: ${fatal.map((e) => e.message ?? "Validation error").join("; ")}`,
    );
  }
  const warnings = allErrors.map((e) => e.message ?? "Validation warning").filter(Boolean);
  return { warnings };
}

/** Publish a Flow. Treats "already published" as success. */
export async function publishMetaFlow(flowId: string, token: string): Promise<void> {
  try {
    await graph(`/${flowId}/publish`, token, { method: "POST" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already\s+published/i.test(msg)) return;
    throw err;
  }
}

/** Deprecate a published Flow (Meta has no "unpublish"). */
export async function deprecateMetaFlow(flowId: string, token: string): Promise<void> {
  await graph(`/${flowId}/deprecate`, token, { method: "POST" });
}
