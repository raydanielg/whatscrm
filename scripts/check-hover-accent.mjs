#!/usr/bin/env node
/**
 * CI guard: fail if any component/route uses `hover:bg-accent` or
 * `hover:bg-[var(--accent)]`. The project rule is `hover:bg-muted`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const scanDirs = [join(ROOT, "src")];
const exts = new Set([".ts", ".tsx", ".jsx", ".js", ".css", ".mdx"]);

const patterns = [
  /\bhover:bg-accent\b(?!-)/,
  /\bhover:bg-\[var\(\s*--accent\s*\)\]/,
];

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
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(walk(p));
    else if (exts.has(p.slice(p.lastIndexOf(".")))) out.push(p);
  }
  return out;
}

for (const d of scanDirs) {
  for (const file of walk(d)) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const re of patterns) {
        if (re.test(line)) {
          errors.push(
            `${relative(ROOT, file)}:${i + 1}  uses ${re.source} — use hover:bg-muted instead.`,
          );
          break;
        }
      }
    }
  }
}

if (errors.length) {
  console.error("\n❌ hover-accent check failed:\n");
  for (const e of errors) console.error("  " + e);
  console.error(
    `\n${errors.length} violation(s). Replace hover:bg-accent / hover:bg-[var(--accent)] with hover:bg-muted.\n`,
  );
  process.exit(1);
}

console.log("✅ hover-accent check passed — no hover:bg-accent references.");
