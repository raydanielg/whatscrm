#!/usr/bin/env node
/**
 * CI guard: fail if any route/component or semantic surface token derives a
 * background color from `var(--neutral-*)` instead of an explicit `oklch(...)`
 * value. Neutral scale references are still allowed inside the low-level
 * `@theme inline` block in src/styles.css (Tailwind numeric utilities like
 * `bg-neutral-500`), and inside this checker itself.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const SEMANTIC_BG_TOKENS = [
  "--background",
  "--surface",
  "--surface-sunken",
  "--surface-elevated",
  "--card",
  "--popover",
  "--muted",
  "--sidebar",
  "--secondary",
  "--gradient-subtle",
];

const errors = [];

// 1) styles.css: semantic background tokens must not point at var(--neutral-*)
const stylesPath = join(SRC, "styles.css");
const styles = readFileSync(stylesPath, "utf8");
const lines = styles.split("\n");

// Detect `@theme inline` block ranges to exclude them.
const excludedRanges = [];
{
  let depth = 0;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (start === -1 && /@theme\s+inline\s*\{/.test(line)) {
      start = i;
      depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      continue;
    }
    if (start !== -1) {
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      if (depth <= 0) {
        excludedRanges.push([start, i]);
        start = -1;
      }
    }
  }
}
const inExcluded = (i) => excludedRanges.some(([a, b]) => i >= a && i <= b);

const tokenRegex = new RegExp(
  `^\\s*(${SEMANTIC_BG_TOKENS.map((t) => t.replace(/[-]/g, "\\-")).join("|")})\\s*:\\s*([^;]+);`,
);

for (let i = 0; i < lines.length; i++) {
  if (inExcluded(i)) continue;
  const m = lines[i].match(tokenRegex);
  if (!m) continue;
  const value = m[2];
  if (/var\(\s*--neutral-/.test(value)) {
    errors.push(
      `${relative(ROOT, stylesPath)}:${i + 1}  ${m[1]} resolves to ${value.trim()} — use an explicit oklch(...) value.`,
    );
  }
}

// 2) routes/components: forbid `background: var(--neutral-*)` and
// `background-color: var(--neutral-*)` in any file under src/routes or src/components.
const scanDirs = [join(SRC, "routes"), join(SRC, "components")];
const exts = new Set([".css", ".ts", ".tsx", ".jsx", ".js"]);
const bgInlineRegex =
  /background(?:-color)?\s*:\s*var\(\s*--neutral-[^)]+\)/i;
const bgArbitraryClassRegex =
  /\bbg-\[var\(\s*--neutral-[^)]+\)\]/i;

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
    else if (exts.has(p.slice(p.lastIndexOf("."))) ) out.push(p);
  }
  return out;
}

for (const d of scanDirs) {
  for (const file of walk(d)) {
    const content = readFileSync(file, "utf8");
    const fileLines = content.split("\n");
    for (let i = 0; i < fileLines.length; i++) {
      const line = fileLines[i];
      if (bgInlineRegex.test(line) || bgArbitraryClassRegex.test(line)) {
        errors.push(
          `${relative(ROOT, file)}:${i + 1}  background references var(--neutral-*) — use a semantic surface token or explicit oklch(...).`,
        );
      }
    }
  }
}

if (errors.length) {
  console.error("\n❌ background-token check failed:\n");
  for (const e of errors) console.error("  " + e);
  console.error(
    `\n${errors.length} violation(s). Semantic background tokens must use explicit oklch(...) values, not var(--neutral-*).\n`,
  );
  process.exit(1);
}

console.log("✅ background-token check passed — no var(--neutral-*) background references.");
