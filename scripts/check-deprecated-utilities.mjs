#!/usr/bin/env node
/**
 * CI audit: fail when deprecated Tailwind utility classes appear in source.
 *
 * Add a new rule by appending to DEPRECATED. `pattern` runs against each
 * source line; `replacement` is shown in the failure message.
 *
 * Suppress a specific line with a trailing `// deprecated-utility-ok` comment.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html", ".mdx"]);
const IGNORE = new Set(["node_modules", "dist", "build", ".next", ".turbo", "routeTree.gen.ts"]);

const DEPRECATED = [
  {
    name: "text-muted",
    // Match `text-muted` NOT followed by `-` (so `text-muted-foreground` is fine).
    pattern: /\btext-muted\b(?!-)/,
    replacement: "text-muted-foreground",
  },
  // Extend with more rules as the project migrates off v3 aliases, e.g.:
  // { name: "bg-gradient-to-*", pattern: /\bbg-gradient-to-[rlbt]{1,2}\b/, replacement: "bg-linear-to-*" },
  // { name: "flex-shrink-0", pattern: /\bflex-shrink-0\b/, replacement: "shrink-0" },
  // { name: "flex-grow", pattern: /\bflex-grow\b(?!-)/, replacement: "grow" },
];

const SUPPRESS = /\/\/\s*deprecated-utility-ok\b|\/\*\s*deprecated-utility-ok\s*\*\//;

/** @type {{file:string,line:number,col:number,rule:string,replacement:string,snippet:string}[]} */
const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (EXTS.has(extname(entry))) scan(full);
  }
}

function scan(file) {
  const rel = relative(ROOT, file);
  if (rel.endsWith("routeTree.gen.ts")) return;
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SUPPRESS.test(line)) continue;
    for (const rule of DEPRECATED) {
      const m = line.match(rule.pattern);
      if (m) {
        violations.push({
          file: rel,
          line: i + 1,
          col: (m.index ?? 0) + 1,
          rule: rule.name,
          replacement: rule.replacement,
          snippet: line.trim().slice(0, 200),
        });
      }
    }
  }
}

for (const d of SCAN_DIRS) {
  try {
    walk(join(ROOT, d));
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
}

if (violations.length === 0) {
  console.log("[audit:deprecated-utilities] OK — no deprecated utility classes found.");
  process.exit(0);
}

console.error(`\n[audit:deprecated-utilities] Found ${violations.length} deprecated utility usage(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}:${v.col}  ${v.rule}  →  ${v.replacement}`);
  console.error(`    ${v.snippet}`);
}
console.error(
  "\nReplace the class, or append `// deprecated-utility-ok` on the line if intentional.\n",
);
process.exit(1);
