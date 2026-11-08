/**
 * Cloud → Secrets checklist for the WhatsApp Cloud API integration.
 *
 * Reports, per required secret, whether the value is actually present on the
 * server. Values are NEVER returned — only a boolean plus a masked length hint
 * and a concrete remedy so admins can fix what is missing.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

export type SecretSeverity = "required" | "recommended";

export interface SecretCheck {
  /** Env var / Cloud secret name. */
  name: string;
  present: boolean;
  severity: SecretSeverity;
  /** What this secret is used for, in plain language. */
  purpose: string;
  /** Accounts that reference this secret. */
  usedBy: string[];
  /** Concrete next step when it is missing. */
  remedy?: string;
  /** Rough size of the stored value (never the value itself). */
  valueLength?: number;
}

export interface SecretsChecklist {
  checkedAt: string;
  missingRequired: number;
  missingRecommended: number;
  accountsChecked: number;
  secrets: SecretCheck[];
}

interface AccountRow {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  access_token_secret_name: string | null;
  app_secret_name: string | null;
  verify_token: string | null;
}

function label(acc: AccountRow): string {
  return acc.display_name || acc.phone_number || "WhatsApp account";
}

export const checkWhatsAppSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        channelAccountId: z.string().uuid().optional(),
        /** Extra secret names to verify (e.g. typed in the setup wizard). */
        secretNames: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(512),
              severity: z.enum(["required", "recommended"]).default("required"),
            }),
          )
          .max(20)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SecretsChecklist> => {
    let query = context.supabase
      .from("channel_accounts" as never)
      .select("id, display_name, phone_number")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "whatsapp_cloud");
    if (data.channelAccountId) query = query.eq("id", data.channelAccountId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    // Secret references are admin-only; merged in via the permission-checked RPC.
    const { data: accountSecrets } = await sbAny(context.supabase).rpc("channel_account_secrets" as never, {
      _workspace_id: data.workspaceId,
      _account_id: data.channelAccountId ?? null,
    } as never);
    const secretById = new Map(
      ((accountSecrets ?? []) as unknown as Array<{
        id: string;
        verify_token: string | null;
        access_token_secret_name: string | null;
        app_secret_name: string | null;
      }>).map((s) => [s.id, s]),
    );
    const accounts = ((rows ?? []) as Array<{ id: string }>).map((r) => ({
      ...r,
      ...(secretById.get(r.id) ?? {
        verify_token: null,
        access_token_secret_name: null,
        app_secret_name: null,
      }),
    })) as unknown as AccountRow[];

    // name -> aggregated check
    const byName = new Map<string, SecretCheck>();

    const track = (
      name: string,
      severity: SecretSeverity,
      purpose: string,
      remedy: string,
      usedBy?: string,
    ) => {
      const existing = byName.get(name);
      if (existing) {
        if (usedBy && !existing.usedBy.includes(usedBy)) existing.usedBy.push(usedBy);
        // required wins over recommended
        if (severity === "required") existing.severity = "required";
        return;
      }
      const value = process.env[name];
      byName.set(name, {
        name,
        present: Boolean(value && value.trim().length > 0),
        severity,
        purpose,
        usedBy: usedBy ? [usedBy] : [],
        remedy: value ? undefined : remedy,
        valueLength: value ? value.trim().length : undefined,
      });
    };

    if (accounts.length === 0 && !(data.secretNames && data.secretNames.length > 0)) {
      // Nothing connected yet — check the conventional defaults so the wizard
      // can still tell the user what to prepare.
      track(
        "WHATSAPP_ACCESS_TOKEN",
        "required",
        "Permanent Meta System User token used to send messages and read your WhatsApp Business Account.",
        "In Meta Business Settings → System Users, generate a token with whatsapp_business_messaging and whatsapp_business_management, then save it in Cloud → Secrets as WHATSAPP_ACCESS_TOKEN.",
      );
      track(
        "WHATSAPP_APP_SECRET",
        "recommended",
        "Meta app secret used to verify the X-Hub-Signature-256 signature on inbound webhooks.",
        "Copy the App secret from Meta App Dashboard → Settings → Basic and save it in Cloud → Secrets as WHATSAPP_APP_SECRET.",
      );
    }

    for (const acc of accounts) {
      const who = label(acc);
      const tokenName = acc.access_token_secret_name?.trim() || "WHATSAPP_ACCESS_TOKEN";
      track(
        tokenName,
        "required",
        "Permanent Meta System User token used to send messages and read your WhatsApp Business Account.",
        `Generate a permanent System User token in Meta Business Settings (permissions: whatsapp_business_messaging, whatsapp_business_management) and save it in Cloud → Secrets as ${tokenName}.`,
        who,
      );

      if (acc.app_secret_name?.trim()) {
        track(
          acc.app_secret_name.trim(),
          "recommended",
          "Meta app secret used to verify the X-Hub-Signature-256 signature on inbound webhooks.",
          `Copy the App secret from Meta App Dashboard → Settings → Basic and save it in Cloud → Secrets as ${acc.app_secret_name.trim()}.`,
          who,
        );
      }
    }

    for (const extra of data.secretNames ?? []) {
      track(
        extra.name.trim(),
        extra.severity,
        extra.severity === "required"
          ? "Permanent Meta System User token used to send messages and read your WhatsApp Business Account."
          : "Meta app secret used to verify the X-Hub-Signature-256 signature on inbound webhooks.",
        `Save this value in Cloud → Secrets using exactly the name ${extra.name.trim()}.`,
      );
    }

    const secrets = [...byName.values()].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "required" ? -1 : 1;
      if (a.present !== b.present) return a.present ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return {
      checkedAt: new Date().toISOString(),
      accountsChecked: accounts.length,
      missingRequired: secrets.filter((s) => !s.present && s.severity === "required").length,
      missingRecommended: secrets.filter((s) => !s.present && s.severity === "recommended").length,
      secrets,
    };
  });
