#!/usr/bin/env node
/**
 * Accent usage style audit.
 *
 * Reports every occurrence of `bg-accent` (and the closely-coupled
 * `text-accent`, `text-accent-foreground`, `border-accent`,
 * `ring-accent`, and `[var(--accent)]` escape hatches) across the app
 * source, classified by how it's applied:
 *
 *   - HOVER    → hover:bg-accent / md:hover:bg-accent / group-hover:
 *                (banned — the app rule is hover:bg-muted)
 *   - ACTIVE   → active:bg-accent, group-active:
 *                (banned — active state should not switch to accent)
 *   - FOCUS    → focus:bg-accent, focus-visible:bg-accent
 *                (banned — focus uses the muted surface + ring)
 *   - DATA     → data-[state=]:bg-accent, aria-:bg-accent
 *                (usually inherited from shadcn primitives; flagged so
 *                 you can decide per case)
 *   - STATIC   → plain `bg-accent` / `bg-accent/10` / `bg-accent-muted`
 *                (kept — this is where accent is used for INTENTIONAL
 *                 emphasis: badges, timelines, stat tiles, etc.)
 *
 * Also breaks out `bg-accent-muted`, `bg-accent/NN` opacity, and
 * `text-accent*` on the STATIC line to help decide whether an
 * "emphasis" call site is truly intentional.
 *
 * Exit codes:
 *   0 — no HOVER / ACTIVE / FOCUS matches (accent is emphasis-only)
 *   1 — one or more disallowed-state matches present
 *   2 — the audit itself crashed (bad glob, unreadable file)
 *
 * Flags:
 *   --json         emit machine-readable JSON instead of the text report
 *   --strict       also fail on DATA matches (opt-in)
 *   --root <dir>   audit a directory other than ./src
 */

import { readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const flagValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ROOT = resolve(process.cwd(), flagValue("--root", "src"));
const AS_JSON = flag("--json");
const STRICT = flag("--strict");

const CODE_EXT = /\.(tsx?|jsx?|mdx?|css)$/;
const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".output",
  ".vinxi",
  ".turbo",
  ".cache",
  "playwright-report",
  "test-results",
]);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name) || e.name.startsWith(".git")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && CODE_EXT.test(e.name)) yield p;
  }
}

/**
 * A single accent-related token, e.g. `hover:bg-accent`, `bg-accent/10`,
 * `data-[state=open]:bg-accent`, `text-accent-foreground`,
 * `border-accent`, `ring-accent`, `[var(--accent)]`.
 *
 * We look for tokens inside quoted strings (className) and CSS values,
 * not raw prose.
 */
const TOKEN_RX = new RegExp(
  [
    "(?<prefix>(?:[a-z0-9-]+:)*)", // any variant chain: sm:hover:group-focus:
    "(?<core>", // the actual utility
    [
      "bg-accent(?:-muted)?(?:\\/\\d{1,3})?",
      "text-accent(?:-foreground)?",
      "border-accent",
      "ring-accent",
      "outline-accent",
      "fill-accent",
      "stroke-accent",
      "from-accent",
      "to-accent",
      "via-accent",
      "\\[(?:var\\(--accent[^)]*\\)|--accent[^\\]]*)\\]",
    ].join("|"),
    ")",
  ].join(""),
  "g",
);

function classify(prefix) {
  if (!prefix) return "STATIC";
  const parts = prefix.replace(/:$/, "").split(":");
  const has = (...names) => parts.some((p) => names.some((n) => p === n || p.endsWith("-" + n)));

  if (has("hover", "group-hover", "peer-hover")) return "HOVER";
  if (has("active", "group-active", "peer-active")) return "ACTIVE";
  if (has("focus", "focus-visible", "focus-within", "group-focus", "peer-focus")) return "FOCUS";
  if (parts.some((p) => p.startsWith("data-[") || p.startsWith("aria-") || p.startsWith("group-data-["))) {
    return "DATA";
  }
  // Any other pseudo variant (dark:, sm:, disabled:, etc.) on a plain
  // bg-accent is still "static" from an intent standpoint — the class
  // is unconditional at that breakpoint / theme.
  return "STATIC";
}

const BUCKETS = {
  HOVER: {
    label: "Hover state → bg-accent (BANNED — hover must use bg-muted)",
    fail: true,
    items: [],
  },
  ACTIVE: {
    label: "Active state → bg-accent (BANNED)",
    fail: true,
    items: [],
  },
  FOCUS: {
    label: "Focus state → bg-accent (BANNED — focus uses muted + ring)",
    fail: true,
    items: [],
  },
  DATA: {
    label: "Data / ARIA state → bg-accent (review — often from shadcn primitives)",
    fail: STRICT,
    items: [],
  },
  STATIC: {
    label: "Static accent usage (intentional emphasis — verify each is meaningful)",
    fail: false,
    items: [],
  },
};

function pushMatch(bucket, file, line, prefix, core, snippet) {
  BUCKETS[bucket].items.push({ file, line, token: `${prefix}${core}`, snippet });
}

async function main() {
  try {
    statSync(ROOT);
  } catch {
    process.stderr.write(`accent-audit: root not found: ${ROOT}\n`);
    process.exit(2);
  }

  for await (const path of walk(ROOT)) {
    const text = readFileSync(path, "utf8");
    if (!text.includes("accent")) continue;
    const rel = relative(process.cwd(), path);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes("accent")) continue;
      TOKEN_RX.lastIndex = 0;
      let m;
      while ((m = TOKEN_RX.exec(line)) !== null) {
        const { prefix = "", core = "" } = m.groups ?? {};
        const bucket = classify(prefix);
        pushMatch(bucket, rel, i + 1, prefix, core, line.trim());
      }
    }
  }

  const summary = Object.fromEntries(
    Object.entries(BUCKETS).map(([k, v]) => [k, v.items.length]),
  );
  const failing = Object.entries(BUCKETS)
    .filter(([, v]) => v.fail && v.items.length > 0)
    .map(([k]) => k);

  if (AS_JSON) {
    process.stdout.write(
      JSON.stringify({ root: ROOT, strict: STRICT, summary, buckets: BUCKETS, failing }, null, 2) +
        "\n",
    );
    process.exit(failing.length > 0 ? 1 : 0);
  }

  const bar = "─".repeat(72);
  const w = (n) => String(n).padStart(4);
  const out = [];
  out.push(`Accent style audit — ${relative(process.cwd(), ROOT) || "."}`);
  out.push(bar);
  out.push(
    `  ${w(summary.HOVER)} hover:*   ${w(summary.ACTIVE)} active:*   ` +
      `${w(summary.FOCUS)} focus:*   ${w(summary.DATA)} data/aria:*   ` +
      `${w(summary.STATIC)} static`,
  );
  out.push(bar);

  for (const key of ["HOVER", "ACTIVE", "FOCUS", "DATA", "STATIC"]) {
    const b = BUCKETS[key];
    if (b.items.length === 0) continue;
    out.push("");
    out.push(`${b.label}  (${b.items.length})`);
    out.push("-".repeat(b.label.length + 6));
    // Group by file for readability.
    const byFile = new Map();
    for (const it of b.items) {
      if (!byFile.has(it.file)) byFile.set(it.file, []);
      byFile.get(it.file).push(it);
    }
    const files = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [file, items] of files) {
      out.push(`  ${file}  (${items.length})`);
      // Cap noise on STATIC — you rarely need to eyeball every badge.
      const slice = key === "STATIC" && items.length > 6 ? items.slice(0, 6) : items;
      for (const it of slice) {
        out.push(`    ${String(it.line).padStart(5)}:  ${it.token}`);
      }
      if (slice.length < items.length) {
        out.push(`       +${items.length - slice.length} more`);
      }
    }
  }

  out.push("");
  if (failing.length > 0) {
    out.push(`FAIL — accent used in disallowed state(s): ${failing.join(", ")}`);
  } else {
    out.push("OK — no hover / active / focus usage of bg-accent detected.");
    if (BUCKETS.DATA.items.length > 0 && !STRICT) {
      out.push(`     (${BUCKETS.DATA.items.length} data-state matches — re-run with --strict to fail on those too.)`);
    }
  }

  process.stdout.write(out.join("\n") + "\n");
  process.exit(failing.length > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`accent-audit: ${err?.stack || err}\n`);
  process.exit(2);
});
