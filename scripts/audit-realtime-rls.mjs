#!/usr/bin/env node
/**
 * Realtime RLS audit.
 *
 * Every table published to the `supabase_realtime` publication is streamed to
 * browser subscribers. Supabase Realtime enforces RLS per subscriber, so the
 * SELECT policies on those tables are the ONLY thing preventing one tenant
 * from receiving another tenant's rows. This audit fails when a published
 * table:
 *
 *   1. has RLS disabled,
 *   2. has no SELECT-capable policy at all,
 *   3. has a SELECT policy with an always-true qualifier, or
 *   4. has a SELECT policy that is not gated on the current user
 *      (auth.uid()) or on workspace / organization membership.
 *
 * Intentionally-public streams must be added to PUBLIC_ALLOWLIST below with a
 * written reason, which makes every exception explicit and reviewable.
 *
 * Usage:
 *   node scripts/audit-realtime-rls.mjs          # human report, exit 1 on violations
 *   node scripts/audit-realtime-rls.mjs --json   # machine readable
 *
 * Requires the managed Postgres env (PGHOST/PGUSER/...). Exits 0 with a notice
 * when no database connection is configured so CI without DB access is a no-op.
 */
import { execFileSync } from "node:child_process";

/** table -> reason. Policies on these tables may be readable by anon/public. */
export const PUBLIC_ALLOWLIST = {
  white_label_configs:
    "Branding-only columns; anon lookup by active custom_domain is required to theme the login page before sign-in.",
};

/** Expressions that count as proper tenant/user gating in a SELECT qualifier. */
const GATE_PATTERNS = [
  "auth.uid()",
  "is_workspace_member(",
  "has_workspace_role(",
  "is_org_member(",
  "is_organization_member(",
  "is_super_admin(",
  "has_role(",
  "workspace_id",
  "organization_id",
  "user_id",
];

const SQL = `
with pub as (
  select tablename from pg_publication_tables where pubname = 'supabase_realtime'
)
select json_agg(row_to_json(t)) from (
  select
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    coalesce(
      json_agg(
        json_build_object(
          'name', p.polname,
          'cmd', p.polcmd,
          'roles', (select coalesce(string_agg(r.rolname, ','), 'PUBLIC') from pg_roles r where r.oid = any(p.polroles)),
          'qual', coalesce(pg_get_expr(p.polqual, p.polrelid), '')
        )
      ) filter (where p.polcmd in ('r', '*')),
      '[]'::json
    ) as select_policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pub on pub.tablename = c.relname
  left join pg_policy p on p.polrelid = c.oid
  group by c.relname, c.relrowsecurity
  order by c.relname
) t;
`;

export function analyze(tables) {
  const violations = [];
  for (const t of tables) {
    const allowed = Object.prototype.hasOwnProperty.call(PUBLIC_ALLOWLIST, t.table_name);
    if (!t.rls_enabled) {
      violations.push({ table: t.table_name, kind: "rls_disabled", detail: "RLS is not enabled" });
      continue;
    }
    const policies = t.select_policies ?? [];
    if (policies.length === 0) {
      violations.push({
        table: t.table_name,
        kind: "no_select_policy",
        detail: "Published to realtime but has no SELECT policy",
      });
      continue;
    }
    for (const p of policies) {
      const qual = (p.qual ?? "").trim();
      if (qual === "" || qual === "true" || qual === "(true)") {
        if (allowed) continue;
        violations.push({
          table: t.table_name,
          kind: "always_true_policy",
          detail: `Policy "${p.name}" (${p.roles}) has an always-true qualifier`,
        });
        continue;
      }
      const gated = GATE_PATTERNS.some((g) => qual.includes(g));
      if (!gated && !allowed) {
        violations.push({
          table: t.table_name,
          kind: "ungated_policy",
          detail: `Policy "${p.name}" (${p.roles}) is not gated on auth.uid() or workspace/org membership: ${qual}`,
        });
      }
    }
  }
  return violations;
}

function fetchTables() {
  const out = execFileSync("psql", ["-At", "-c", SQL], { encoding: "utf8" });
  return JSON.parse(out.trim() || "[]") ?? [];
}

function main() {
  const json = process.argv.includes("--json");
  if (!process.env.PGHOST) {
    console.log("[realtime-rls] No PGHOST configured — skipping database audit.");
    return;
  }
  const tables = fetchTables();
  const violations = analyze(tables);
  if (json) {
    console.log(JSON.stringify({ tableCount: tables.length, violations }, null, 2));
  } else {
    console.log(`[realtime-rls] Audited ${tables.length} realtime-published tables.`);
    for (const [table, reason] of Object.entries(PUBLIC_ALLOWLIST)) {
      console.log(`[realtime-rls] allowlisted public stream: ${table} — ${reason}`);
    }
    if (violations.length === 0) {
      console.log("[realtime-rls] OK — every published table keeps workspace/user gating.");
    } else {
      console.error(`[realtime-rls] ${violations.length} violation(s):`);
      for (const v of violations) console.error(`  - ${v.table} [${v.kind}] ${v.detail}`);
    }
  }
  if (violations.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
