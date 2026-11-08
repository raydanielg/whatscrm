/**
 * Release Readiness — a report of what can actually be verified.
 *
 * This used to hard-code "pass" for claims nothing checked ("No secrets committed
 * to the repo", "CI runs on every push", "All migrations use IF NOT EXISTS",
 * "Object storage with versioning", "2FA available" whenever a count was >= 0),
 * and then averaged them into a "ready" score. Two of those claims were false.
 *
 * Now every check is one of:
 *   - MEASURED  — read from the database, the environment or the platform, and
 *                 graded pass / warn / fail. Only these count towards the score.
 *   - DECLARED  — a statement the app cannot verify (documentation, provider-managed
 *                 backups, CI, licensing). Shown as `info`, never as `pass`, and
 *                 excluded from the score. Confirm these by hand.
 *
 * Platform staff only: the facts span every tenant and reveal infrastructure.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSignalReader } from "@/lib/security/signal-reader";
import { REQUIRED_BUCKETS } from "@/lib/storage/buckets";

export type Check = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
  /** measured = verified by the app and scored; declared = unverifiable, shown as info. */
  basis?: "measured" | "declared";
};

export type ReadinessSection = {
  key: "security" | "compliance" | "backup" | "devops" | "release";
  title: string;
  score: number; // 0..100, over MEASURED checks only
  checks: Check[];
};

export type ReleaseReadiness = {
  overall_score: number;
  status: "ready" | "needs-attention" | "blocked";
  sections: ReadinessSection[];
  generated_at: string;
};

/*
 * Buckets the app uploads to come from the canonical table (imported at the top
 * of this file) so this check cannot drift from what the uploaders and the
 * migrations actually use.
 */

type Facts = {
  public_tables: number;
  tables_without_rls: string[];
  cron_available: boolean;
  cron_jobs: number | null;
  cron_post_fn: boolean;
  cron_base_url: string | null;
  /** Where _wa_cron_post gets its target: Supabase Vault, literals in the function body, or nowhere. */
  cron_config_source: "vault" | "function-literal" | "none";
  /** SHA-256 of the Vault token, so it can be compared with INTERNAL_CRON_TOKEN without being returned. */
  cron_token_sha256: string | null;
  cron_token_literal: boolean;
  buckets: string[];
  staff_users: number;
  staff_with_2fa: number;
  completed_backups: number;
  demo_accounts: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
}

const measured = (c: Omit<Check, "basis">): Check => ({ ...c, basis: "measured" });
/** Something the app cannot verify. Never `pass`; never scored. */
const declared = (id: string, label: string, detail: string): Check => ({
  id, label, status: "info", basis: "declared",
  detail: `Not verified by the app — ${detail}`,
});

/** Mean over MEASURED checks only. `info` (declared) is excluded, not counted as good. */
function score(checks: Check[]): number {
  const weight = { pass: 100, warn: 55, fail: 0 } as const;
  const scored = checks.filter((c): c is Check & { status: keyof typeof weight } => c.status !== "info");
  if (scored.length === 0) return 0;
  return Math.round(scored.reduce((a, c) => a + weight[c.status], 0) / scored.length);
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

export const getReleaseReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReleaseReadiness> => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);

    const r = createSignalReader(supabase);
    const day7 = new Date(Date.now() - 7 * 864e5).toISOString();

    const { resolveActiveWorkspaceId } = await import("@/lib/auth/active-workspace.server");
    const workspaceId = await resolveActiveWorkspaceId(supabase, userId);
    const scopeWs = <T,>(q: T) => (workspaceId ? (q as any).eq("workspace_id", workspaceId) : q); // eslint-disable-line @typescript-eslint/no-explicit-any
    const orgRows = workspaceId
      ? await r.select<{ organization_id: string | null }>("workspaces", "organization_id", (q) => q.eq("id", workspaceId))
      : [];
    const organizationId = orgRows[0]?.organization_id ?? null;
    // password_policy belongs to the organization; it has no workspace_id column.
    const scopeOrg = <T,>(q: T) => (organizationId ? (q as any).eq("organization_id", organizationId) : q); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Platform facts (service role): RLS coverage, cron target, buckets, 2FA, backups.
    let facts: Facts | null = null;
    let factsError: string | null = null;
    try {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { data, error } = await (supabaseAdmin as unknown as { rpc: (n: string) => Promise<{ data: unknown; error: { message: string } | null }> })
        .rpc("platform_readiness_facts");
      if (error || !data) throw new Error(error?.message ?? "no data");
      facts = data as Facts;
    } catch (e) {
      factsError = e instanceof Error ? e.message : String(e);
    }
    const noFacts = (id: string, label: string): Check =>
      measured({ id, label, status: "warn", detail: `Could not be checked — platform facts unavailable (${factsError}).` });

    const appMode = (process.env["APP_MODE"] ?? process.env["VITE_APP_MODE"] ?? "").toLowerCase() || "production";
    const appHost = hostOf(process.env["APP_ORIGIN"]);

    // ─── Security ──────────────────────────────────────────────────────────────
    const ipRules = await r.count("ip_allowlists", (q) => scopeWs(q));
    const auditLogs = await r.count("audit_logs", (q) => scopeWs(q));
    const securityEvents = await r.count("security_events", (q) => scopeWs(q).gte("created_at", day7));
    const passwordPolicy = await r.count("password_policy", (q) => scopeOrg(q));
    const need = ["SUPABASE_SERVICE_ROLE_KEY", "INTERNAL_CRON_TOKEN"] as const;
    const missingSecrets = need.filter((k) => !process.env[k]);
    // "Set" is not enough for the service-role key: a publishable key is present but powerless.
    const { inspectServiceRoleKey } = await import("@/lib/supabase/service-role-key.server");
    const serviceKeyVerdict = inspectServiceRoleKey(process.env["SUPABASE_SERVICE_ROLE_KEY"]);
    const unreadable =(id: string, label: string, t: string): Check | null => {
      const f = r.unavailable.find((u) => u.source === t);
      return f ? measured({ id, label, status: "warn", detail: `Could not be checked — ${t} could not be read (${f.reason}).` }) : null;
    };

    const secChecks: Check[] = [
      !facts ? noFacts("sec.rls", "Row-Level Security enabled on all tables")
        : measured({
            id: "sec.rls", label: "Row-Level Security enabled on all tables",
            status: facts.tables_without_rls.length === 0 ? "pass" : "fail",
            detail: facts.tables_without_rls.length === 0
              ? `All ${facts.public_tables} public tables have RLS enabled.`
              : `${facts.tables_without_rls.length} public table(s) have RLS disabled: ${facts.tables_without_rls.slice(0, 8).join(", ")}.`,
          }),
      unreadable("sec.ip", "IP allowlists configured", "ip_allowlists")
        ?? measured({ id: "sec.ip", label: "IP allowlists configured", status: ipRules > 0 ? "pass" : "warn", detail: `${ipRules} allowlist rule(s).` }),
      unreadable("sec.audit", "Audit logging active", "audit_logs")
        ?? measured({ id: "sec.audit", label: "Audit logging active", status: auditLogs > 0 ? "pass" : "warn", detail: `${auditLogs} audit entries recorded.` }),
      unreadable("sec.password", "Password policy configured", "password_policy")
        ?? measured({ id: "sec.password", label: "Password policy configured", status: passwordPolicy > 0 ? "pass" : "warn",
            detail: passwordPolicy > 0 ? "A password policy is set for this organization." : "No password policy row for this organization — platform defaults apply." }),
      !facts ? noFacts("sec.2fa", "Two-factor authentication enabled for platform admins")
        : facts.staff_users === 0
          ? measured({ id: "sec.2fa", label: "Two-factor authentication enabled for platform admins", status: "warn", detail: "No platform admin accounts found." })
          : measured({
              id: "sec.2fa", label: "Two-factor authentication enabled for platform admins",
              status: facts.staff_with_2fa === facts.staff_users ? "pass" : "warn",
              detail: `${facts.staff_with_2fa} of ${facts.staff_users} platform admin(s) have 2FA enabled.`,
            }),
      unreadable("sec.incidents", "No unresolved incidents (7d)", "security_events")
        ?? measured({ id: "sec.incidents", label: "No unresolved incidents (7d)", status: securityEvents < 10 ? "pass" : "warn", detail: `${securityEvents} events in the past week.` }),
      measured({
        id: "sec.secrets", label: "Required server secrets configured",
        status: missingSecrets.length === 0 && serviceKeyVerdict.ok ? "pass" : "fail",
        detail: missingSecrets.length > 0
          ? `Missing from the server environment: ${missingSecrets.join(", ")}.`
          : !serviceKeyVerdict.ok
            ? serviceKeyVerdict.reason
            : `${need.join(" and ")} are set in the server environment, and SUPABASE_SERVICE_ROLE_KEY is a privileged key (${serviceKeyVerdict.format}).`,
      }),
      !facts ? noFacts("sec.cron-token", "No credential embedded in database jobs")
        : measured({
            id: "sec.cron-token", label: "No credential embedded in database jobs",
            status: facts.cron_token_literal ? "warn" : "pass",
            detail: facts.cron_token_literal
              ? "The pg_cron helper _wa_cron_post has a literal token in its function body, and the same literal is in the migration history. Apply the latest migrations, store the token in Supabase Vault as wacrm_cron_token, and rotate INTERNAL_CRON_TOKEN."
              : facts.cron_config_source === "vault"
                ? "The scheduled-job token is read from Supabase Vault, not embedded in a database function."
                : "Scheduled-job credentials are not embedded in a database function.",
          }),
      declared("sec.owasp", "OWASP API Top-10 controls in place", "rate limiting, HMAC signing and encryption at rest exist as features; review them against your own threat model."),
    ].filter((c): c is Check => c !== null);

    // ─── Compliance ────────────────────────────────────────────────────────────
    const gdprOverdue = await r.count("gdpr_requests", (q) =>
      scopeWs(q).in("status", ["pending", "processing"]).lt("due_at", new Date().toISOString()));
    const gdprTotal = await r.count("gdpr_requests", (q) => scopeWs(q));
    const consents = await r.count("consent_records", (q) => scopeWs(q));
    const policies = await r.select<{ resource: string; is_active: boolean; last_run_at: string | null }>(
      "data_retention_policies", "resource, is_active, last_run_at", (q) => scopeWs(q));
    const activePolicies = policies.filter((p) => p.is_active);
    const enforced = activePolicies.some((p) => p.last_run_at && p.last_run_at >= day7);

    const compChecks: Check[] = [
      unreadable("gdpr.requests", "Privacy requests answered on time", "gdpr_requests")
        ?? measured({
          id: "gdpr.requests", label: "Privacy requests answered on time",
          status: gdprOverdue === 0 ? "pass" : "warn",
          detail: gdprOverdue === 0 ? `${gdprTotal} request(s) on record, none overdue.` : `${gdprOverdue} request(s) are past their due date.`,
        }),
      unreadable("gdpr.retention", "Data retention policies enforced", "data_retention_policies")
        ?? measured({
          id: "gdpr.retention", label: "Data retention policies enforced",
          status: activePolicies.length > 0 && enforced ? "pass" : "warn",
          detail: activePolicies.length === 0
            ? "No active retention policy is defined."
            : enforced
              ? `${activePolicies.length} active polic${activePolicies.length === 1 ? "y" : "ies"}; at least one ran in the last 7 days.`
              : `${activePolicies.length} active polic${activePolicies.length === 1 ? "y is" : "ies are"} defined but none has run in the last 7 days — nothing is enforcing them.`,
        }),
      { id: "gdpr.consent", label: "Consent tracking", status: "info", basis: "measured", detail: `${consents} consent record(s).` },
      declared("gdpr.delete", "Right to erasure (account deletion)", "account deletion cascades in the schema, but no erasure workflow is tested by the app."),
      declared("gdpr.dpa", "Data Processing Agreement template", "see /docs/compliance."),
      declared("gdpr.subproc", "Subprocessor list documented", "maintain it in your trust centre."),
      declared("soc2.access", "SOC 2 — access controls & least privilege", "role-based access with an audit trail exists; SOC 2 attestation is an audit outcome, not an app check."),
      declared("hipaa.baa", "HIPAA BAA available (if applicable)", "enable only for healthcare tenants."),
    ].filter((c): c is Check => c !== null);

    // ─── Backup & disaster recovery ────────────────────────────────────────────
    const missingBuckets = facts ? REQUIRED_BUCKETS.filter((b) => !facts!.buckets.includes(b)) : [];
    const backupChecks: Check[] = [
      declared("bk.db", "Automated database backups / point-in-time recovery",
        "these are provided by your database host (for example Supabase daily backups and PITR), not by this app. Confirm the retention window in the provider dashboard."),
      !facts ? noFacts("bk.inapp", "In-app backup files exist")
        : measured({
            id: "bk.inapp", label: "In-app backup files exist",
            status: facts.completed_backups > 0 ? "pass" : "warn",
            detail: facts.completed_backups > 0
              ? `${facts.completed_backups} completed backup(s) with a stored file.`
              : "No completed backup has a stored file. Backup Management records jobs but no worker produces backup files, so rely on your database host's backups.",
          }),
      !facts ? noFacts("bk.buckets", "File storage buckets exist")
        : measured({
            id: "bk.buckets", label: "File storage buckets exist",
            status: missingBuckets.length === 0 ? "pass" : "fail",
            detail: missingBuckets.length === 0
              ? `All ${REQUIRED_BUCKETS.length} storage buckets the app uploads to exist.`
              : `Missing buckets (uploads to them fail): ${missingBuckets.join(", ")}.`,
          }),
      declared("bk.restore", "Restore procedure documented & tested", "no restore has been exercised by the app; test one against a copy."),
      declared("bk.rto", "RTO / RPO targets defined", "set and document them in your DR runbook."),
    ].filter((c): c is Check => c !== null);

    // ─── DevOps ────────────────────────────────────────────────────────────────
    const cronHost = facts ? hostOf(facts.cron_base_url) : null;
    // Compared as hashes: the database returns a SHA-256, never the token. null = cannot tell.
    let tokenMatches: boolean | null = null;
    const envCronToken = process.env["INTERNAL_CRON_TOKEN"];
    if (facts?.cron_token_sha256 && envCronToken) {
      const { createHash } = await import("node:crypto");
      tokenMatches = createHash("sha256").update(envCronToken, "utf8").digest("hex") === facts.cron_token_sha256;
    }
    const devopsChecks: Check[] = [
      !facts ? noFacts("do.cron", "Scheduled jobs (pg_cron) configured")
        : measured({
            id: "do.cron", label: "Scheduled jobs (pg_cron) configured",
            status: facts.cron_available && (facts.cron_jobs ?? 0) > 0 ? "pass" : "warn",
            detail: facts.cron_available ? `${facts.cron_jobs ?? 0} scheduled job(s).` : "pg_cron is not available, so outbox, webhook and workflow jobs never run.",
          }),
      !facts ? noFacts("do.cron-target", "Scheduled jobs call this deployment")
        : !facts.cron_post_fn
          ? measured({ id: "do.cron-target", label: "Scheduled jobs call this deployment", status: "warn", detail: "The cron HTTP helper (_wa_cron_post) is missing, so scheduled jobs cannot call the app." })
          : facts.cron_config_source === "none" || !cronHost
            ? measured({
                id: "do.cron-target", label: "Scheduled jobs call this deployment",
                // With jobs scheduled but no target they all silently do nothing — that is a failure, not a nudge.
                status: (facts.cron_jobs ?? 0) > 0 ? "fail" : "warn",
                detail: "Scheduled jobs are paused: _wa_cron_post has no target. Store this deployment's origin and its INTERNAL_CRON_TOKEN in Supabase Vault as wacrm_cron_base_url and wacrm_cron_token (see migration 20260924170000). Until then outbox, webhook, workflow and sync jobs do not run.",
              })
            : !appHost
              ? measured({ id: "do.cron-target", label: "Scheduled jobs call this deployment", status: "warn",
                  detail: `Scheduled jobs POST to ${facts.cron_base_url}. Set APP_ORIGIN so the app can confirm that is this deployment.` })
              : cronHost !== appHost
                ? measured({ id: "do.cron-target", label: "Scheduled jobs call this deployment", status: "fail",
                    detail: `Scheduled jobs POST to ${cronHost} but this deployment is ${appHost}. Outbox, webhook, workflow and sync jobs are reaching a different app.` })
                : tokenMatches === false
                  ? measured({ id: "do.cron-target", label: "Scheduled jobs call this deployment", status: "fail",
                      detail: `Scheduled jobs POST to ${cronHost}, which matches APP_ORIGIN, but the Vault token (wacrm_cron_token) is not this deployment's INTERNAL_CRON_TOKEN — every scheduled request is rejected with 401.` })
                  : measured({ id: "do.cron-target", label: "Scheduled jobs call this deployment", status: "pass",
                      detail: tokenMatches === true
                        ? `Scheduled jobs POST to ${cronHost}, which matches APP_ORIGIN, with a token that matches INTERNAL_CRON_TOKEN.`
                        : `Scheduled jobs POST to ${cronHost}, which matches APP_ORIGIN. The token could not be compared with INTERNAL_CRON_TOKEN.` }),
      measured({
        id: "do.mode", label: "Deployment mode",
        status: appMode === "production" ? "pass" : "warn",
        detail: appMode === "production" ? "APP_MODE is production." : `APP_MODE is "${appMode}" — demo behaviour (read-only guards, sample data) is active.`,
      }),
      declared("do.ci", "CI/CD pipeline (build + typecheck + tests)", "there is no CI configuration the app can inspect."),
      declared("do.docker", "Self-host bundle (Docker + docker-compose)", "see /docs/self-hosting.md."),
    ];

    // ─── Release ───────────────────────────────────────────────────────────────
    const releaseChecks: Check[] = [
      !facts ? noFacts("rel.demo", "No demo accounts in this deployment")
        : appMode !== "production"
          // In a demo deployment demo accounts ARE the intended state, so this is a
          // pass — and it keeps the section from having nothing measured at all.
          ? measured({ id: "rel.demo", label: "Demo accounts match the deployment mode", status: "pass", detail: `Demo mode is on and ${facts.demo_accounts} demo account(s) exist, as expected. Switch APP_MODE to production and run scripts/purge-demo-data.sql before going live.` })
          : measured({
              id: "rel.demo", label: "No demo accounts in this deployment",
              status: facts.demo_accounts === 0 ? "pass" : "fail",
              detail: facts.demo_accounts === 0
                ? "No demo accounts exist."
                : `${facts.demo_accounts} demo account(s) still exist in a production deployment. Run scripts/purge-demo-data.sql.`,
            }),
      declared("rel.docs", "Buyer documentation (install + admin + user)", "see /docs/codecanyon/."),
      declared("rel.branding", "White-label / branding configurable", "logo, colours and domain settings exist; check them on your own deployment."),
      declared("rel.license", "License activation flow", "CodeCanyon purchase-code verification."),
      declared("rel.updates", "In-app update checker", "it points at a versioned release feed."),
      declared("rel.support", "Support channel & SLA published", "publish these on your site."),
      declared("rel.changelog", "Public changelog", "available at /developer/changelog."),
      declared("rel.legal", "Terms, Privacy, Refund policy templates", "in /docs/legal/."),
    ];

    const sections: ReadinessSection[] = [
      { key: "security",   title: "Security Hardening",         score: score(secChecks),     checks: secChecks },
      { key: "compliance", title: "Compliance",                 score: score(compChecks),    checks: compChecks },
      { key: "backup",     title: "Backup & Disaster Recovery", score: score(backupChecks),  checks: backupChecks },
      { key: "devops",     title: "DevOps & Operations",        score: score(devopsChecks),  checks: devopsChecks },
      { key: "release",    title: "Release",                    score: score(releaseChecks), checks: releaseChecks },
    ];
    const overall = Math.round(sections.reduce((a, s) => a + s.score, 0) / sections.length);
    const failing = sections.some((s) => s.checks.some((c) => c.status === "fail"));
    const status: ReleaseReadiness["status"] = failing ? "blocked" : overall >= 90 ? "ready" : "needs-attention";

    return { overall_score: overall, status, sections, generated_at: new Date().toISOString() };
  });
