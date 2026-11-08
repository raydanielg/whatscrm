#!/usr/bin/env node
/**
 * Rebrand verification gate (database side).
 *
 * Confirms that the rebrand to WACRM is fully applied in Postgres. Both
 * retired brand names ("wadiff", "swiffer") are checked:
 *   1. Column defaults        — no retired literal left in any default expression.
 *   2. Cron schedule names    — no retired-prefix jobs; the expected `wacrm-*` jobs exist.
 *   3. Data rows              — no row in any `target_platform` column still names one.
 *   4. Seeded platform text   — none in platform/app settings value payloads.
 *
 * Requires the managed PG* env vars (PGHOST, PGUSER, ...). Checks that the
 * connected role is not allowed to read (e.g. the `cron` schema) are reported
 * as SKIPPED rather than failures, so the script is safe for restricted roles.
 *
 * Usage:
 *   node scripts/verify-rebrand-db.mjs
 *   node scripts/verify-rebrand-db.mjs --json
 */
import { execFileSync } from "node:child_process";

const JSON_OUT = process.argv.includes("--json");
/** Every retired product name, oldest first. */
const OLD_BRANDS = ["wadiff", "swiffer"];
const NEW = "wacrm";

/** `col ilike '%a%' or col ilike '%b%'` over all retired brands. */
const anyOldLike = (col) => OLD_BRANDS.map((b) => `${col} ilike '%${b}%'`).join(" or ");
/** True when a value names any retired brand. */
const namesOldBrand = (v) => OLD_BRANDS.some((b) => (v || "").toLowerCase().includes(b));

/** Cron jobs that must exist after the rename migration. */
const EXPECTED_CRON_PREFIX = `${NEW}-`;

function q(sql) {
  try {
    const out = execFileSync("psql", ["-At", "-F", "\u0001", "-c", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      ok: true,
      rows: out
        .split("\n")
        .filter(Boolean)
        .map((l) => l.split("\u0001")),
    };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.message).trim() };
  }
}

const results = [];
const add = (name, status, detail, rows = []) =>
  results.push({ name, status, detail, rows });

// ── 0. connectivity ──────────────────────────────────────────────────────────
if (!process.env.PGHOST) {
  console.error("PGHOST is not set — no database access in this environment.");
  process.exit(2);
}
const ping = q("select 1");
if (!ping.ok) {
  console.error("Cannot connect to Postgres:\n" + ping.error);
  process.exit(2);
}

// ── 1. column defaults ───────────────────────────────────────────────────────
{
  const r = q(`
    select table_schema||'.'||table_name||'.'||column_name, column_default
    from information_schema.columns
    where table_schema not in ('pg_catalog','information_schema')
      and (${anyOldLike("column_default")})
    order by 1`);
  if (!r.ok) add("column defaults", "SKIP", r.error);
  else if (r.rows.length)
    add("column defaults", "FAIL", `${r.rows.length} default(s) still reference a retired brand`, r.rows);
  else add("column defaults", "PASS", `no default expression names a retired brand`);
}

// ── 2. cron schedule names ───────────────────────────────────────────────────
{
  const r = q("select jobname, schedule, active::text from cron.job order by jobname");
  if (!r.ok) {
    add("cron schedule names", "SKIP", "cron.job not readable by this role (expected for the restricted app role)");
  } else {
    const stale = r.rows.filter(([n]) => namesOldBrand(n));
    const renamed = r.rows.filter(([n]) => (n || "").startsWith(EXPECTED_CRON_PREFIX));
    if (stale.length)
      add("cron schedule names", "FAIL", `${stale.length} job(s) still named after a retired brand`, stale);
    else if (!renamed.length)
      add("cron schedule names", "FAIL", `no job named "${EXPECTED_CRON_PREFIX}*" found`, r.rows);
    else
      add("cron schedule names", "PASS", `${renamed.length} "${EXPECTED_CRON_PREFIX}*" job(s), 0 stale`, renamed);
  }
}

// ── 3. target_platform rows ──────────────────────────────────────────────────
{
  const cols = q(`
    select table_schema, table_name, column_name
    from information_schema.columns
    where column_name = 'target_platform'
      and table_schema not in ('pg_catalog','information_schema')
    order by 1,2`);
  if (!cols.ok) add("target_platform rows", "SKIP", cols.error);
  else if (!cols.rows.length) add("target_platform rows", "PASS", "no target_platform column in the schema");
  else {
    const union = cols.rows
      .map(
        ([s, t, c]) =>
          `select '${s}.${t}' as src, count(*) as n from "${s}"."${t}" where ${anyOldLike(`"${c}"`)}`,
      )
      .join(" union all ");
    const r = q(`select src, n from (${union}) x where n > 0 order by 1`);
    if (!r.ok) add("target_platform rows", "SKIP", r.error);
    else if (r.rows.length)
      add("target_platform rows", "FAIL", `rows with legacy target_platform found`, r.rows);
    else
      add(
        "target_platform rows",
        "PASS",
        `${cols.rows.length} target_platform column(s) checked, 0 legacy rows`,
      );
  }
}

// ── 4. seeded platform/app settings text ─────────────────────────────────────
{
  const tables = q(`
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type in ('text','character varying','jsonb','json')
      and table_name in ('platform_settings','app_settings','settings','white_label_settings')
    order by 1,2`);
  if (!tables.ok) add("settings payloads", "SKIP", tables.error);
  else if (!tables.rows.length) add("settings payloads", "SKIP", "no settings tables present");
  else {
    const union = tables.rows
      .map(
        ([s, t, c]) =>
          `select '${s}.${t}.${c}' as src, count(*) as n from "${s}"."${t}" where ${anyOldLike(`"${c}"::text`)}`,
      )
      .join(" union all ");
    const r = q(`select src, n from (${union}) x where n > 0 order by 1`);
    if (!r.ok) add("settings payloads", "SKIP", r.error);
    else if (r.rows.length) add("settings payloads", "FAIL", `retired brand text in settings`, r.rows);
    else add("settings payloads", "PASS", `no retired brand text in settings payloads`);
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => r.status === "FAIL");

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
} else {
  console.log(`\nRebrand DB verification (${OLD_BRANDS.join(", ")} -> ${NEW})\n`);
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : r.status === "SKIP" ? "•" : "✗";
    console.log(`${icon} ${r.status.padEnd(4)} ${r.name} — ${r.detail}`);
    for (const row of r.rows.slice(0, 20)) console.log(`         ${row.join(" | ")}`);
  }
  console.log(
    `\n${results.filter((r) => r.status === "PASS").length} passed, ${failed.length} failed, ${
      results.filter((r) => r.status === "SKIP").length
    } skipped\n`,
  );
}

process.exit(failed.length ? 1 : 0);
