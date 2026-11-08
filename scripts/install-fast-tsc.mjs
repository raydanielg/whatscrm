#!/usr/bin/env node
/**
 * Point `tsc` at the native TypeScript compiler (`tsgo`).
 *
 * Why: this project is large (~3k files, ~19M type instantiations). The classic
 * JS `tsc` needs many minutes to check it and gets killed by CI/build timeouts,
 * while `tsgo` (@typescript/native-preview) checks the same project in ~80s cold
 * and ~1s warm with identical diagnostics.
 *
 * This runs on postinstall so any tool that shells out to `tsc` (CI, the build
 * harness, editors using node_modules/.bin) gets the fast compiler automatically.
 * The original compiler stays available as `tsc-classic`.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { join } from "node:path";

const binDir = join(process.cwd(), "node_modules", ".bin");
const tscPath = join(binDir, "tsc");
const classicPath = join(binDir, "tsc-classic");
const tsgoPath = join(binDir, "tsgo");

const MARKER = "# fast-tsc shim";

try {
  if (!existsSync(tsgoPath)) {
    console.log("[fast-tsc] tsgo not installed; leaving tsc as-is.");
    process.exit(0);
  }
  if (!existsSync(tscPath)) {
    console.log("[fast-tsc] tsc not found; nothing to do.");
    process.exit(0);
  }

  const current = readFileSync(tscPath, "utf8");
  if (current.includes(MARKER)) {
    process.exit(0);
  }

  // Preserve the original compiler under a separate name.
  if (!existsSync(classicPath)) {
    renameSync(tscPath, classicPath);
    chmodSync(classicPath, 0o755);
  }

  writeFileSync(
    tscPath,
    `#!/bin/sh
${MARKER} — forwards to the native compiler (tsgo) for speed.
# Use "tsc-classic" for the original JavaScript implementation.
exec "$(dirname "$0")/tsgo" "$@"
`,
    "utf8",
  );
  chmodSync(tscPath, 0o755);
  console.log("[fast-tsc] tsc now runs tsgo (original available as tsc-classic).");
} catch (err) {
  console.warn("[fast-tsc] skipped:", err?.message ?? err);
}
