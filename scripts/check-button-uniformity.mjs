#!/usr/bin/env node
/**
 * CI guard: enforce uniform Button variant styling.
 *
 * 1. No occurrence of `hover:border-border-strong` anywhere under src/.
 * 2. Every interactive `variant` in src/components/ui/button.tsx must define
 *    hover, active, and focus-visible behavior consistently:
 *      - each non-link variant contains a `hover:` class
 *      - each non-link variant contains an `active:` class
 *    The shared base string owns `focus-visible:ring-*`, transitions, and
 *    the hover lift/shadow — so we assert those tokens exist on the base.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const exts = new Set([".ts", ".tsx", ".jsx", ".js", ".css", ".mdx"]);
const FORBIDDEN = /\bhover:border-border-strong\b/;

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
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(walk(p));
    else if (exts.has(p.slice(p.lastIndexOf(".")))) out.push(p);
  }
  return out;
}

// --- 1. Forbidden class scan --------------------------------------------
for (const file of walk(SRC)) {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (FORBIDDEN.test(lines[i])) {
      errors.push(
        `${relative(ROOT, file)}:${i + 1}  uses hover:border-border-strong — this class is banned; rely on the shared Button hover tokens instead.`,
      );
    }
  }
}

// --- 2. Button variant uniformity ---------------------------------------
const buttonPath = join(SRC, "components/ui/button.tsx");
let buttonSrc = "";
try {
  buttonSrc = readFileSync(buttonPath, "utf8");
} catch {
  errors.push(`missing ${relative(ROOT, buttonPath)} — Button component is required.`);
}

if (buttonSrc) {
  // Base string (first cva argument) must set focus-visible + transition + hover lift.
  const baseMatch = buttonSrc.match(/cva\(\s*(["'`])([\s\S]*?)\1/);
  if (!baseMatch) {
    errors.push(`${relative(ROOT, buttonPath)}: could not locate cva() base class string.`);
  } else {
    const base = baseMatch[2];
    const required = [
      "control-focus",
      "control-motion",
      "disabled:pointer-events-none",
    ];
    for (const token of required) {
      if (!base.includes(token)) {
        errors.push(
          `${relative(ROOT, buttonPath)}: Button base class string is missing required token \`${token}\`.`,
        );
      }
    }
  }

  // Every variant value (except link) needs hover: + active: state classes.
  const variantsBlock = buttonSrc.match(/variant:\s*\{([\s\S]*?)\n\s{6}\},/);
  if (!variantsBlock) {
    errors.push(`${relative(ROOT, buttonPath)}: could not locate variant map.`);
  } else {
    const body = variantsBlock[1];
    const entryRe = /(\w+):\s*(?:"([^"]+)"|\n\s*"([^"]+)")/g;
    let m;
    const seen = new Set();
    while ((m = entryRe.exec(body)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      const value = m[2] ?? m[3] ?? "";
      if (name === "link") continue;
      if (!/\bhover:/.test(value)) {
        errors.push(
          `${relative(ROOT, buttonPath)}: variant \`${name}\` is missing a hover: class.`,
        );
      }
      if (!/\bactive:/.test(value)) {
        errors.push(
          `${relative(ROOT, buttonPath)}: variant \`${name}\` is missing an active: class.`,
        );
      }
    }
  }
}

if (errors.length) {
  console.error("\n❌ button-uniformity check failed:\n");
  for (const e of errors) console.error("  " + e);
  console.error(`\n${errors.length} violation(s).\n`);
  process.exit(1);
}

console.log(
  "✅ button-uniformity check passed — no hover:border-border-strong, all variants define hover/active/focus tokens.",
);
