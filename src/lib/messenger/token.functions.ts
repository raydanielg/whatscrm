/**
 * Client-callable server functions for Messenger Page token health.
 *
 * These wrap the `token.server.ts` helpers behind auth + workspace scope
 * so the UI can trigger a verification pass and reflect status without
 * ever seeing the decrypted token.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

export const verifyMessengerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Auth check: the caller must be able to see this row under RLS.
    const { data: row, error } = await context.supabase
      .from("messenger_accounts")
      .select("id, page_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (error || !row) throw new Error("Messenger account not found");

    // Read the encrypted token via admin (never crosses the RPC boundary).
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokRow } = await (sbAny(supabaseAdmin).from("messenger_accounts" as any) as any)
      .select("access_token_ciphertext")
      .eq("id", data.accountId)
      .maybeSingle();
    if (!tokRow?.access_token_ciphertext) {
      const { markMessengerAccountExpired } = await import("./token.server");
      await markMessengerAccountExpired(data.accountId, "Missing stored token — reconnect the page");
      return { ok: false, expired: true, reason: "Missing stored token — reconnect the page" };
    }

    const { verifyMessengerPageToken, markMessengerAccountExpired, markMessengerAccountConnected } =
      await import("./token.server");
    const result = await verifyMessengerPageToken(row.page_id, tokRow.access_token_ciphertext);
    if (result.ok) {
      await markMessengerAccountConnected(data.accountId, {
        expiresAt: result.expiresAt,
        scopes: result.scopes,
      });
    } else if (result.expired) {
      await markMessengerAccountExpired(data.accountId, result.reason ?? "Token invalid");
    }
    return {
      ok: result.ok,
      expired: result.expired,
      reason: result.reason,
      expiresAt: result.expiresAt,
      scopes: result.scopes,
    };
  });

export const verifyAllMessengerAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messenger_accounts")
      .select("id, page_id")
      .eq("workspace_id", data.workspaceId)
      .in("status", ["connected", "expired", "error"]);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { verifyMessengerPageToken, markMessengerAccountExpired, markMessengerAccountConnected } =
      await import("./token.server");

    let ok = 0;
    let expired = 0;
    for (const row of rows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tokRow } = await (sbAny(supabaseAdmin).from("messenger_accounts" as any) as any)
        .select("access_token_ciphertext")
        .eq("id", row.id)
        .maybeSingle();
      if (!tokRow?.access_token_ciphertext) {
        await markMessengerAccountExpired(row.id, "Missing stored token — reconnect the page");
        expired++;
        continue;
      }
      const r = await verifyMessengerPageToken(row.page_id, tokRow.access_token_ciphertext);
      if (r.ok) {
        await markMessengerAccountConnected(row.id, { expiresAt: r.expiresAt, scopes: r.scopes });
        ok++;
      } else if (r.expired) {
        await markMessengerAccountExpired(row.id, r.reason ?? "Token invalid");
        expired++;
      }
    }
    return { checked: (rows ?? []).length, ok, expired };
  });
