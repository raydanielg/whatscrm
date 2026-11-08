#!/usr/bin/env node
/**
 * CI guard: fail the build if any forbidden Inter font-feature-settings
 * values reappear in the repo. See docs/typography-guide.md.
 *
 * Forbidden features (break visual regression baselines / Inter metrics):
 *   cv01..cv11, ss01..ss09, salt, case, cpsp, dlig, hlig, onum, pnum, lnum
 *
 * Scans src/ and any *.css/mdx docs. Ignores this script and the
 * typography guide (which documents the ban).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "docs", "tests"];
const exts = new Set([".ts", ".tsx", ".jsx", ".js", ".css", ".mdx", ".html"]);

const ALLOWLIST = new Set([
  "scripts/check-forbidden-font-features.mjs",
  "docs/typography-guide.md",
]);

// Match forbidden OpenType feature tags inside quoted strings, e.g. "cv02", 'ss01'.
const FORBIDDEN = /["'](cv0[1-9]|cv1[0-1]|ss0[1-9]|salt|case|cpsp|dlig|hlig|onum|pnum|lnum)["']/g;

const errors = [];

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === "build") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(walk(p));
    else if (exts.has(p.slice(p.lastIndexOf(".")))) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

for (const file of files) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (ALLOWLIST.has(rel)) continue;

  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    // Only flag lines that reference font-feature-settings context or the
    // Tailwind `font-feature-settings` arbitrary property. This keeps the
    // scan targeted while still catching every real usage.
    if (!/font-feature-settings|fontFeatureSettings|font-variant/i.test(line)) return;
    const matches = line.match(FORBIDDEN);
    if (matches) {
      errors.push(`${rel}:${i + 1}  forbidden feature(s): ${[...new Set(matches)].join(", ")}`);
    }
  });
}

if (errors.length) {
  console.error("Forbidden font-feature-settings detected:\n");
  for (const e of errors) console.error("  " + e);
  console.error(
    "\nSee docs/typography-guide.md — only kern, liga, calt (global) and tnum/zero (scoped) are allowed.",
  );
  process.exit(1);
}

console.log(`OK — no forbidden font-feature-settings found (${files.length} files scanned).`);
