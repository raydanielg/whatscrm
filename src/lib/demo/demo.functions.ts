import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEMO_ACCOUNTS } from "./accounts";
import { DEMO_PASSWORDS } from "./credentials";

const inputSchema = z.object({
  key: z.enum(["user", "agent", "admin"]).optional(),
});

/**
 * Idempotently provisions demo auth users + platform roles via the admin
 * client. Safe to call from the public login page; only creates the
 * hardcoded demo accounts and never mutates other users.
 *
 * DEMO MODE ONLY. This endpoint is public and (re)sets the password of a
 * `superadmin` account to a published value, so in production it must be
 * unreachable: it throws before touching the admin client. Do not weaken this
 * check — the UI hiding the credentials picker is not a security boundary.
 *
 * Deliberately imports the RAW (unguarded) admin client, not
 * `@/lib/demo/admin-write-guard.server`: this is the one place that must
 * keep writing while the deployment is in demo mode — it's what lets anyone
 * sign in as a demo account in the first place. Every write below is scoped
 * to a `DEMO_ACCOUNTS` entry's own id/email, never an arbitrary user.
 */
export const provisionDemoAccounts = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { isServerDemoMode } = await import("./mode.server");
    if (!isServerDemoMode()) {
      throw new Error("Demo accounts are not available in production mode.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targets = data.key ? DEMO_ACCOUNTS.filter((a) => a.key === data.key) : DEMO_ACCOUNTS;

    const results: { email: string; created: boolean; ok: boolean; error?: string }[] = [];

    for (const acct of targets) {
      try {
        // Look up existing user by email (paginate small — only 3 demo users).
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (listErr) throw listErr;
        const existing = list.users.find((u) => u.email?.toLowerCase() === acct.email.toLowerCase());

        let userId: string;
        let created = false;

        if (existing) {
          userId = existing.id;
          // Ensure password + confirmed state match the published credentials.
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: DEMO_PASSWORDS[acct.key],
            email_confirm: true,
            user_metadata: { demo: true, demo_role: acct.key, full_name: `Demo ${acct.label}` },
          });
        } else {
          const { data: createRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: acct.email,
            password: DEMO_PASSWORDS[acct.key],
            email_confirm: true,
            user_metadata: { demo: true, demo_role: acct.key, full_name: `Demo ${acct.label}` },
          });
          if (createErr || !createRes.user) throw createErr ?? new Error("createUser failed");
          userId = createRes.user.id;
          created = true;
        }

        if (acct.platformRole) {
          await supabaseAdmin
            .from("user_roles")
            .upsert(
              { user_id: userId, role: acct.platformRole },
              { onConflict: "user_id,role", ignoreDuplicates: true },
            );
        }

        results.push({ email: acct.email, created, ok: true });
      } catch (err) {
        results.push({
          email: acct.email,
          created: false,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { ok: results.every((r) => r.ok), results };
  });
