#!/usr/bin/env node
/**
 * CI preflight: run typecheck (tsgo, incremental) + eslint in parallel.
 * Fails fast with a concise per-file summary instead of raw log dumps.
 *
 * Usage: node scripts/ci-preflight.mjs [--typecheck-only] [--lint-only]
 */
import { spawn, execSync } from "node:child_process";

const args = process.argv.slice(2);
const typecheckOnly = args.includes("--typecheck-only");
const lintOnly = args.includes("--lint-only");
// --changed: lint only files changed vs origin/main (or $PREFLIGHT_BASE) — fastest CI path
const changedOnly = args.includes("--changed");
const runTypecheck = !lintOnly;
const runLint = !typecheckOnly;

function changedFiles() {
  const base = process.env.PREFLIGHT_BASE || "origin/main";
  try {
    execSync(`git rev-parse --verify ${base}`, { stdio: "ignore" });
  } catch {
    return null; // base ref missing (shallow clone) — fall back to full lint
  }
  const out = execSync(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`, { encoding: "utf8" });
  return out
    .split("\n")
    .filter((f) => /\.[cm]?[tj]sx?$/.test(f) && !f.startsWith("node_modules/"));
}

const MAX_FILES_SHOWN = 25;
const MAX_ERRORS_PER_FILE = 5;

function run(name, cmd, cmdArgs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(cmd, cmdArgs, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (err) => resolve({ name, code: 1, out: String(err), ms: Date.now() - startedAt }));
    child.on("close", (code) => resolve({ name, code: code ?? 1, out, ms: Date.now() - startedAt }));
  });
}

/** Parse tsc/tsgo output: "path(line,col): error TS1234: message" */
function parseTsErrors(out) {
  const byFile = new Map();
  for (const line of out.split("\n")) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/);
    if (!m) continue;
    const [, file, ln, col, , code, msg] = m;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(`  ${ln}:${col} ${code} ${msg.trim()}`);
  }
  return byFile;
}

/** Parse eslint unix-ish output lines: "path:line:col: message [rule]" or default stylish blocks */
function parseLintErrors(out) {
  const byFile = new Map();
  let currentFile = null;
  for (const line of out.split("\n")) {
    const fileMatch = line.match(/^(\S+\.[tj]sx?)\s*$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!byFile.has(currentFile)) byFile.set(currentFile, []);
      continue;
    }
    const errMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.*?)\s{2,}(\S+)\s*$/);
    if (errMatch && currentFile) {
      const [, ln, col, , msg, rule] = errMatch;
      byFile.get(currentFile).push(`  ${ln}:${col} ${rule} ${msg.trim()}`);
    }
  }
  return byFile;
}

function report(title, result, parse) {
  const secs = (result.ms / 1000).toFixed(1);
  if (result.code === 0) {
    console.log(`✔ ${title} passed (${secs}s)`);
    return 0;
  }
  const byFile = parse(result.out);
  const files = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  const total = files.reduce((n, [, errs]) => n + errs.length, 0);
  console.log(`✘ ${title} FAILED (${secs}s) — ${total} problem(s) in ${files.length} file(s):`);
  for (const [file, errs] of files.slice(0, MAX_FILES_SHOWN)) {
    console.log(`\n  ${file} (${errs.length})`);
    for (const e of errs.slice(0, MAX_ERRORS_PER_FILE)) console.log(`  ${e}`);
    if (errs.length > MAX_ERRORS_PER_FILE) console.log(`   ${errs.length - MAX_ERRORS_PER_FILE} more`);
  }
  if (files.length > MAX_FILES_SHOWN) console.log(`\n   ${files.length - MAX_FILES_SHOWN} more files with errors`);
  if (total === 0) console.log(result.out.slice(0, 4000));
  return 1;
}

const jobs = [];
if (runTypecheck) jobs.push(run("Typecheck", "node_modules/.bin/tsgo", ["--noEmit", "-p", "tsconfig.json"]));
let lintNote = "";
if (runLint) {
  let lintTargets = ["."];
  if (changedOnly) {
    const files = changedFiles();
    if (files && files.length === 0) lintTargets = []; // nothing to lint
    else if (files) {
      lintTargets = files;
      lintNote = ` (${files.length} changed file(s))`;
    } else lintNote = " (base ref missing — full lint)";
  }
  if (lintTargets.length > 0) jobs.push(run("Lint", "node_modules/.bin/eslint", [...lintTargets, "--quiet"]));
}

const started = Date.now();
const results = await Promise.all(jobs);

console.log("\n──── CI preflight ────");
let failed = 0;
let i = 0;
if (runTypecheck) failed |= report("Typecheck", results[i++], parseTsErrors);
if (runLint) {
  if (jobs.length > (runTypecheck ? 1 : 0)) failed |= report(`Lint${lintNote}`, results[i++], parseLintErrors);
  else console.log(`✔ Lint${lintNote} — no changed lintable files, skipped`);
}
console.log(`\nTotal wall time: ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (failed) {
  console.log("\nPreflight failed. Fix the files above and re-run: npm run preflight\n");
  process.exit(1);
}
console.log("\nPreflight passed ✔\n");
