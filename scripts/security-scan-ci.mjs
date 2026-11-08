#!/usr/bin/env node
/**
 * CI security gate.
 *
 * Collects security findings from several static sources, fingerprints each
 * one, and compares the set against the committed baseline in
 * `security/baseline.json`. The job fails when a fingerprint appears that is
 * not in the baseline — i.e. the pull request introduced a NEW finding.
 * Pre-existing (baselined) findings do not block merges, so the gate is
 * additive-only and safe to turn on for an existing codebase.
 *
 * Sources:
 *   1. dependency audit          — bun audit (falls back to npm audit)
 *   2. SQL migration review      — missing GRANT / RLS, anon write policies,
 *                                  SECURITY DEFINER without search_path
 *   3. client-bundle secret leak — service-role key usage in client code
 *   4. DOM XSS surface           — dangerouslySetInnerHTML without sanitizer
 *
 * Usage:
 *   node scripts/security-scan-ci.mjs                    # gate, exit 1 on new findings
 *   node scripts/security-scan-ci.mjs --update-baseline  # accept current findings
 *   node scripts/security-scan-ci.mjs --json             # machine readable report
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "security", "baseline.json");
const args = new Set(process.argv.slice(2));
const UPDATE = args.has("--update-baseline");
const JSON_OUT = args.has("--json");

/** @type {{source:string,id:string,severity:'critical'|'high'|'moderate',title:string,file?:string}[]} */
const findings = [];

const add = (f) => findings.push(f);
const fingerprint = (f) =>
  createHash("sha1").update(`${f.source}|${f.id}`).digest("hex").slice(0, 16);

/* ------------------------------------------------------------------ *
 * 1. Dependency audit
 * ------------------------------------------------------------------ */
function runDependencyAudit() {
  const attempts = ["bun audit --json", "npm audit --json"];
  for (const cmd of attempts) {
    let raw;
    try {
      raw = execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (err) {
      // Both tools exit non-zero when vulnerabilities exist; the JSON is still on stdout.
      raw = err.stdout?.toString() ?? "";
    }
    if (!raw.trim()) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const advisories = data.vulnerabilities ?? data.advisories ?? {};
    for (const [name, entry] of Object.entries(advisories)) {
      const severity = String(entry.severity ?? "moderate").toLowerCase();
      if (severity !== "high" && severity !== "critical") continue;
      add({
        source: "dependency",
        id: `${name}@${severity}`,
        severity,
        title: `Vulnerable dependency ${name} (${severity})`,
      });
    }
    return;
  }
}

/* ------------------------------------------------------------------ *
 * 2. SQL migration review
 * ------------------------------------------------------------------ */
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

function reviewMigrations() {
  const files = walk(path.join(ROOT, "supabase", "migrations"), (f) => f.endsWith(".sql"));
  for (const file of files) {
    const sql = readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);

    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)) {
      const table = match[1];
      const grants = new RegExp(`grant[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${table}\\b`, "i").test(sql);
      const rls = new RegExp(`alter\\s+table[\\s\\S]*?public\\.${table}[\\s\\S]*?enable\\s+row\\s+level\\s+security`, "i").test(sql);
      if (!grants) {
        add({
          source: "sql",
          id: `missing-grant:${table}`,
          severity: "high",
          title: `public.${table} is created without GRANT statements`,
          file: rel,
        });
      }
      if (!rls) {
        add({
          source: "sql",
          id: `missing-rls:${table}`,
          severity: "critical",
          title: `public.${table} is created without ENABLE ROW LEVEL SECURITY`,
          file: rel,
        });
      }
    }

    for (const match of sql.matchAll(
      /create\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:public\.)?([a-z0-9_.]+)([\s\S]*?);/gi,
    )) {
      const [, name, table, body] = match;
      const targetsAnon = /\bto\s+[^;]*\banon\b/i.test(body);
      const isWrite = /\bfor\s+(insert|update|delete|all)\b/i.test(body);
      const alwaysTrue = /with\s+check\s*\(\s*true\s*\)/i.test(body) || /using\s*\(\s*true\s*\)/i.test(body);
      if (targetsAnon && isWrite && alwaysTrue) {
        add({
          source: "sql",
          id: `anon-write:${table}:${name.trim()}`,
          severity: "critical",
          title: `Policy "${name.trim()}" lets anon write to ${table} with an always-true check`,
          file: rel,
        });
      }
    }

    for (const match of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\$\$/gi,
    )) {
      const [, fn, body] = match;
      if (/security\s+definer/i.test(body) && !/set\s+search_path/i.test(body)) {
        add({
          source: "sql",
          id: `definer-search-path:${fn}`,
          severity: "high",
          title: `SECURITY DEFINER function ${fn}() has no "SET search_path"`,
          file: rel,
        });
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * 3 + 4. Source code review
 * ------------------------------------------------------------------ */
function reviewSource() {
  const files = walk(path.join(ROOT, "src"), (f) => /\.(ts|tsx|js|jsx)$/.test(f));
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const code = readFileSync(file, "utf8");
    const serverOnly = /\.server\.(ts|tsx)$/.test(rel) || rel.includes(`${path.sep}server${path.sep}`);

    if (!serverOnly && /SERVICE_ROLE|supabaseAdmin/.test(code) && !/await import\(/.test(code)) {
      add({
        source: "code",
        id: `service-role-in-client:${rel}`,
        severity: "critical",
        title: `Service-role client referenced from client-reachable module ${rel}`,
        file: rel,
      });
    }

    if (/dangerouslySetInnerHTML/.test(code) && !/sanitiz/i.test(code)) {
      add({
        source: "code",
        id: `unsanitized-html:${rel}`,
        severity: "high",
        title: `dangerouslySetInnerHTML without a sanitizer in ${rel}`,
        file: rel,
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Gate
 * ------------------------------------------------------------------ */
runDependencyAudit();
reviewMigrations();
reviewSource();

const current = new Map();
for (const f of findings) current.set(fingerprint(f), f);

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : { generatedAt: null, accepted: {} };

if (UPDATE) {
  const accepted = {};
  for (const [fp, f] of current) accepted[fp] = { title: f.title, severity: f.severity, file: f.file ?? null };
  mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), accepted }, null, 2)}\n`,
  );
  console.log(`Baseline updated with ${current.size} accepted finding(s).`);
  process.exit(0);
}

const newFindings = [...current].filter(([fp]) => !(fp in (baseline.accepted ?? {})));
const resolved = Object.keys(baseline.accepted ?? {}).filter((fp) => !current.has(fp));

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        total: current.size,
        new: newFindings.map(([fp, f]) => ({ fingerprint: fp, ...f })),
        resolved,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`Security gate — ${current.size} finding(s) detected, ${Object.keys(baseline.accepted ?? {}).length} baselined.`);
  if (resolved.length) console.log(`✔ ${resolved.length} baselined finding(s) no longer reproduce.`);
  for (const [fp, f] of newFindings) {
    console.error(`✖ NEW [${f.severity}] ${f.title}${f.file ? ` (${f.file})` : ""}  [${fp}]`);
  }
}

if (newFindings.length) {
  console.error(
    `\n${newFindings.length} new security finding(s) block this merge.\n` +
      "Fix them, or — if a finding is a reviewed false positive — run:\n" +
      "  bun run security:baseline\n" +
      "and commit security/baseline.json with an explanation in the PR.",
  );
  process.exit(1);
}

console.log("No new security findings. ✅");
