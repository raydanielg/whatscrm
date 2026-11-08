#!/usr/bin/env node
/**
 * CI guard: outbound branding.
 *
 * Fails when a retired brand name ("Wadiff", "Swiffer") appears in user-facing outbound
 * content — anything a customer, prospect, or partner can read outside the
 * signed-in app shell:
 *
 *   - Transactional / marketing email templates and their subjects/bodies
 *   - Notification bodies (in-app, push, SMS, WhatsApp) rendered to end users
 *   - Public marketing routes (landing, pricing, contact, legal, docs, blog)
 *   - Client / customer portal surfaces
 *   - Public API docs, developer portal copy, changelogs, status pages
 *   - Public JSON manifests served from `public/` (web app manifest, etc.)
 *
 * Intentionally NOT scanned (internal-only identifiers, not user-facing copy):
 *
 *   - localStorage / cookie keys, custom DOM event names, iCal UID suffixes
 *   - Docker / nginx / deploy configs, `.env.example`, architecture docs
 *   - Tests, fixtures, mocks, generated code
 *   - Mobile app internals (scanned separately by the mobile pipeline)
 *
 * The check is case-insensitive. To exempt a specific line, append the marker
 *   //  wacrm-branding-ok: <reason>
 * or the block marker
 *   /* wacrm-branding-ok: <reason> *\/
 * on the same line. Prefer fixing the copy over adding exemptions.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
// Retired product names. Current brand is "WACRM"; both predecessors stay
// flagged so stale copy cannot creep back into outbound content.
const NEEDLE = /wadiff|swiffer/i;
const EXEMPT_MARKER = /wacrm-branding-ok\b/i;

// Roots that ship user-facing outbound copy. Everything under these paths is
// scanned unless excluded below.
//
// Deliberately NOT included:
//   - src/routes/_authenticated/**  — signed-in developer/admin surfaces
//     (CLI, SDK, sandbox, plugin generator). Their package/binary names come
//     from BRAND_SLUG in src/lib/branding/brand.ts, not hardcoded copy.
//   - src/routes/api/**             — server route handlers, not rendered copy.
const SCAN_ROOTS = [
  // Public marketing + legal + support routes rendered to visitors.
  { dir: "src/routes", recursive: false },
  // Component libraries that emit rendered outbound copy.
  "src/components/marketing",
  "src/components/landing",
  "src/components/emails",
  "src/components/notifications",
  // Server-side template / notification renderers.
  "src/lib/email-templates",
  "src/lib/emails",
  "src/lib/notifications",
  "src/lib/marketing",
  // Public static assets served to unauthenticated visitors.
  "public",
];

// File extensions that can carry rendered text.
const SCAN_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".md", ".mdx", ".html", ".htm", ".txt",
  ".json", ".webmanifest", ".yaml", ".yml",
]);

// Directory names that are never user-facing outbound content.
const EXCLUDE_DIR = new Set([
  "node_modules", ".git", "dist", "build", ".output", ".vinxi",
  "coverage", "playwright-report", "test-results",
  "__mocks__", "__fixtures__", "fixtures",
  "integrations", // src/integrations/* is generated backend glue
]);

// File-level allowlist. Matches by suffix on the project-relative POSIX path.
const EXCLUDE_FILE_SUFFIX = [
  "routeTree.gen.ts",
  ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx",
];

// Route files that are authenticated-only chrome (not outbound) can be listed
// here explicitly. Keep this list SHORT — err on the side of scanning.
const EXCLUDE_FILES = new Set([
  // Internal super-admin settings placeholder was rebranded; leave scanned.
]);

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (EXCLUDE_DIR.has(name)) continue;
    const abs = join(dir, name);
    let s;
    try { s = statSync(abs); } catch { continue; }
    if (s.isDirectory()) { walk(abs, out); continue; }
    if (!s.isFile()) continue;
    const ext = name.slice(name.lastIndexOf("."));
    if (!SCAN_EXTS.has(ext)) continue;
    const rel = relative(ROOT, abs).split(sep).join("/");
    if (EXCLUDE_FILES.has(rel)) continue;
    if (EXCLUDE_FILE_SUFFIX.some((suf) => rel.endsWith(suf))) continue;
    out.push({ abs, rel });
  }
}

const files = [];
for (const entry of SCAN_ROOTS) {
  const spec = typeof entry === "string" ? { dir: entry, recursive: true } : entry;
  const abs = join(ROOT, spec.dir);
  if (!existsSync(abs)) continue;
  if (spec.recursive === false) {
    for (const name of readdirSync(abs)) {
      const child = join(abs, name);
      let s;
      try { s = statSync(child); } catch { continue; }
      if (!s.isFile()) continue;
      const ext = name.slice(name.lastIndexOf("."));
      if (!SCAN_EXTS.has(ext)) continue;
      const rel = relative(ROOT, child).split(sep).join("/");
      if (EXCLUDE_FILE_SUFFIX.some((suf) => rel.endsWith(suf))) continue;
      files.push({ abs: child, rel });
    }
  } else {
    walk(abs, files);
  }
}

const failures = [];
for (const { abs, rel } of files) {
  let text;
  try { text = readFileSync(abs, "utf8"); } catch { continue; }
  if (!NEEDLE.test(text)) continue;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!NEEDLE.test(line)) continue;
    if (EXEMPT_MARKER.test(line)) continue;
    failures.push({ rel, line: i + 1, text: line.trim().slice(0, 200) });
  }
}

if (failures.length === 0) {
  console.log(`✓ outbound branding: no retired brand names in ${files.length} scanned files`);
  process.exit(0);
}

console.error(`\n✗ outbound branding: ${failures.length} retired brand reference(s) in user-facing content:\n`);
for (const f of failures) {
  console.error(`  ${f.rel}:${f.line}  ${f.text}`);
}
console.error(`
Fix by replacing the copy with "WACRM" (or the WACRM domain).
If a match is a false positive, append "// wacrm-branding-ok: <reason>" to that line.
`);
process.exit(1);
