#!/usr/bin/env node
/**
 * CI guard: menu-item state tokens.
 *
 * Menu-like primitives (DropdownMenu, ContextMenu, Menubar, Select, Command,
 * Popover items, etc.) must route hover / active / focus / data-highlighted /
 * data-state=open / data-selected styling through the shared
 * `menu-item-state` utility (or the `menuItemClass()` helper), which resolves
 * to `bg-muted` + `text-foreground`.
 *
 * This script flags any direct use of `accent` (or `accent-foreground`) tokens
 * on those interactive variants, since they bypass the shared contract and
 * cause drift between light and dark themes.
 *
 * See: docs/menu-item-states.md
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const scanDirs = [join(ROOT, "src")];
const exts = new Set([".ts", ".tsx", ".jsx", ".js"]);

// Menu-item primitives that must obey the shared state contract. Other
// components (dialog close, navigation-menu link, toggle, etc.) are not menu
// items and may keep their own accent hover tokens.
const SCOPED_FILES = new Set([
  "src/components/ui/dropdown-menu.tsx",
  "src/components/ui/context-menu.tsx",
  "src/components/ui/menubar.tsx",
  "src/components/ui/select.tsx",
  "src/components/ui/command.tsx",
  "src/components/ui/popover.tsx",
  "src/lib/menu-item-class.ts",
]);

// Files that legitimately own the utility definition itself.
const ALLOWLIST = new Set([
  "src/styles.css",
  "src/lib/menu-item-class.ts",
  "scripts/check-menu-item-tokens.mjs",
]);

// Variants that participate in the menu item state contract.
const VARIANTS = [
  "hover",
  "active",
  "focus",
  "focus-visible",
  "data-\\[highlighted\\]",
  "data-\\[state=open\\]",
  "data-\\[selected=true\\]",
  "aria-selected",
];

// Forbidden token targets on those variants.
const TOKENS = [
  "bg-accent",
  "bg-\\[var\\(\\s*--accent\\s*\\)\\]",
  "text-accent-foreground",
];

const patterns = [];
for (const v of VARIANTS) {
  for (const t of TOKENS) {
    patterns.push(new RegExp(`\\b${v}:${t}\\b(?!-)`));
  }
}

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
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out = out.concat(walk(p));
    else if (exts.has(p.slice(p.lastIndexOf(".")))) out.push(p);
  }
  return out;
}

for (const d of scanDirs) {
  for (const file of walk(d)) {
    const rel = relative(ROOT, file).split("\\").join("/");
    if (ALLOWLIST.has(rel)) continue;
    const content = readFileSync(file, "utf8");
    const inScope =
      SCOPED_FILES.has(rel) ||
      /from\s+["']@\/lib\/menu-item-class["']/.test(content);
    if (!inScope) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const re of patterns) {
        if (re.test(line)) {
          errors.push(
            `${rel}:${i + 1}  uses ${re.source} — route menu item states through \`menu-item-state\` / \`menuItemClass()\`.`,
          );
          break;
        }
      }
    }
  }
}

if (errors.length) {
  console.error("\n❌ menu-item-tokens check failed:\n");
  for (const e of errors) console.error("  " + e);
  console.error(
    `\n${errors.length} violation(s). See docs/menu-item-states.md — use the shared \`menu-item-state\` utility (via \`menuItemClass()\`) instead of accent-based hover/active/focus tokens.\n`,
  );
  process.exit(1);
}

console.log(
  "✅ menu-item-tokens check passed — no forbidden accent hover/active/focus tokens.",
);
