#!/usr/bin/env node
/**
 * RLS / security-policy regression gate.
 *
 * `security-scan-ci.mjs` blocks NEW findings. This gate does the opposite:
 * it pins findings that were already FIXED, so a later migration or refactor
 * cannot quietly re-open them. Each assertion in
 * `security/policy-assertions.json` records the resolved finding plus the
 * exact policy/grant shape that closed it.
 *
 * Scopes:
 *   migrations — concatenated supabase/migrations/*.sql
 *   src        — concatenated client-reachable source (excludes *.server.* )
 *
 * Usage: node scripts/security-policy-assertions.mjs [--json]
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, "security", "policy-assertions.json");
const JSON_OUT = process.argv.includes("--json");

function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

function readScope(scope) {
  if (scope === "migrations") {
    return walk(path.join(ROOT, "supabase", "migrations"), (f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
  }
  if (scope === "src") {
    return walk(
      path.join(ROOT, "src"),
      (f) =>
        /\.(ts|tsx)$/.test(f) &&
        // Server-only modules and API route handlers never reach the browser bundle.
        !/\.server\.(ts|tsx)$/.test(f) &&
        !f.includes(`${path.sep}routes${path.sep}api${path.sep}`) &&
        !f.endsWith("types.ts"),
    )
      .sort()
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
  }
  throw new Error(`Unknown assertion scope: ${scope}`);
}

if (!existsSync(CONFIG)) {
  console.error(`Missing ${path.relative(ROOT, CONFIG)} — cannot run policy assertions.`);
  process.exit(1);
}

const { assertions } = JSON.parse(readFileSync(CONFIG, "utf8"));
const corpus = new Map();
const failures = [];
const passed = [];

for (const a of assertions) {
  if (!corpus.has(a.scope)) corpus.set(a.scope, readScope(a.scope));
  const text = corpus.get(a.scope);
  let ok = true;
  const reasons = [];

  if (a.mustMatch && !new RegExp(a.mustMatch, "i").test(text)) {
    ok = false;
    reasons.push(`expected pattern is gone: /${a.mustMatch}/`);
  }
  if (a.mustNotMatch && new RegExp(a.mustNotMatch, "i").test(text)) {
    ok = false;
    reasons.push(`forbidden pattern reappeared: /${a.mustNotMatch}/`);
  }

  if (ok) passed.push(a.id);
  else failures.push({ id: a.id, severity: a.severity, finding: a.finding, reasons });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ total: assertions.length, passed, failures }, null, 2));
} else {
  console.log(`Security policy assertions — ${passed.length}/${assertions.length} holding.`);
  for (const f of failures) {
    console.error(`✖ REGRESSION [${f.severity}] ${f.id}: ${f.finding}`);
    for (const r of f.reasons) console.error(`   ↳ ${r}`);
  }
}

if (failures.length) {
  console.error(
    `\n${failures.length} previously-fixed security finding(s) regressed.\n` +
      "Restore the policy/grant, or update security/policy-assertions.json with a reviewed replacement.",
  );
  process.exit(1);
}

console.log("All resolved security findings remain fixed. ✅");
