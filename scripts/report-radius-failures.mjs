#!/usr/bin/env node
/**
 * Renders a human-readable failure report for the tabs-radius Playwright
 * suite. Consumed by the `tabs-radius-regression` CI job — runs after
 * Playwright to translate raw JSON results into an actionable summary
 * whenever a border-radius invariant changes.
 *
 * Input : ./test-results/results.json (Playwright JSON reporter)
 * Output: markdown to stdout + $GITHUB_STEP_SUMMARY when present
 * Exit  : 0 always (does not double-fail the job; Playwright already did)
 */

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { relative } from "node:path";

const RESULTS = "./test-results/results.json";
const SPEC_MATCH = /tabs-radius/;

if (!existsSync(RESULTS)) {
  console.log("No Playwright results.json found — skipping radius report.");
  process.exit(0);
}

/** @type {any} */
const report = JSON.parse(readFileSync(RESULTS, "utf8"));

const failures = [];
const walk = (suite) => {
  for (const s of suite.suites ?? []) walk(s);
  for (const spec of suite.specs ?? []) {
    if (!SPEC_MATCH.test(spec.file ?? "")) continue;
    for (const t of spec.tests ?? []) {
      for (const r of t.results ?? []) {
        if (r.status === "passed" || r.status === "skipped") continue;
        failures.push({
          file: spec.file,
          title: spec.title,
          project: t.projectName,
          status: r.status,
          errors: (r.errors ?? []).map((e) => e.message ?? String(e)),
          attachments: (r.attachments ?? []).filter((a) =>
            /(expected|actual|diff)\.png$/.test(a.name ?? ""),
          ),
        });
      }
    }
  }
};
for (const s of report.suites ?? []) walk(s);

const lines = [];
lines.push("## 🟥 Tabs / segmented-control radius regression");
lines.push("");
if (failures.length === 0) {
  lines.push("✅ All `rounded-control` (6px) invariants held across tabs, toggle, and toggle-group primitives.");
  const out = lines.join("\n");
  console.log(out);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n");
  process.exit(0);
}

lines.push(
  `**${failures.length} radius invariant(s) failed.** The design contract requires every tabs, toggle, and toggle-group primitive to render at \`--radius-control\` (6px) in every state (active, hover, focus, disabled) and every theme (light, dark, forced-colors).`,
);
lines.push("");
lines.push("### What changed");
lines.push("A component, utility, or token edit changed the computed `border-radius` (or altered the pixel output enough to fail the snapshot diff). Common causes:");
lines.push("- A primitive replaced `rounded-control` / `rounded-control` with `rounded-control`, `rounded-control`, or a hardcoded value.");
lines.push("- `--radius-control` in `src/styles.css` was retuned.");
lines.push("- A wrapper added `overflow-hidden` on a differently-rounded ancestor, clipping the corners.");
lines.push("");
lines.push("### How to fix");
lines.push("1. Reproduce locally: `bunx playwright test tests/e2e/tabs-radius.spec.ts tests/e2e/tabs-radius-states.spec.ts --project=chromium`.");
lines.push("2. Inspect the diff artifacts uploaded by this job (`tabs-radius-report` → `test-results/`).");
lines.push("3. Restore `rounded-control` / `rounded-control` on the offending primitive, OR — if the change is intentional — update snapshots with `--update-snapshots` in the same PR and note the design decision.");
lines.push("");
lines.push("### Failing tests");
for (const f of failures) {
  lines.push(`- **${f.title}** _(${f.project}, ${f.status})_ — \`${relative(process.cwd(), f.file)}\``);
  for (const msg of f.errors.slice(0, 1)) {
    const first = msg.split("\n").slice(0, 4).join("\n");
    lines.push("  ```");
    lines.push("  " + first.replace(/\n/g, "\n  "));
    lines.push("  ```");
  }
  if (f.attachments.length) {
    lines.push(`  Artifacts: ${f.attachments.map((a) => `\`${a.name}\``).join(", ")}`);
  }
}

const out = lines.join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n");
