/**
 * Vite 8/Rolldown can split TanStack Start's SSR entry into two chunks that
 * import each other: one exposes __exportAll and the other calls it while the
 * first is still being evaluated. Inline the tiny helper in the calling chunk
 * to break that generated ESM initialization cycle.
 */
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Nitro writes the SSR chunks to a different folder per preset: `.output` for the
// node / cloudflare builds, `.netlify/functions-internal` for the netlify preset.
const candidateDirectories = [
  ".output/server/_ssr",
  ".netlify/functions-internal/server/_ssr",
].map((dir) => resolve(process.cwd(), dir));
const helper = `var __exportAll = (all, no_symbols) => {
\tlet target = {};
\tfor (var name in all) Object.defineProperty(target, name, {
\t\tget: all[name],
\t\tenumerable: true
\t});
\tif (!no_symbols) Object.defineProperty(target, Symbol.toStringTag, { value: "Module" });
\treturn target;
};`;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function patchDirectory(ssrDirectory) {
  const entries = await readdir(ssrDirectory);
  let patched = 0;
  let alreadyPatched = 0;

  for (const entry of entries) {
    if (!/^server-.*\.mjs$/.test(entry)) continue;

    const filePath = resolve(ssrDirectory, entry);
    const source = await readFile(filePath, "utf8");
    if (!source.includes("var server_exports = /* @__PURE__ */ __exportAll(")) continue;

    const match = source.match(
      /import \{ n as __exportAll \} from "\.\/(server-[^"]+\.mjs)";/,
    );
    if (!match) {
      // A previous run (or an older build left in this folder) already inlined the helper.
      if (source.includes("var __exportAll = (all, no_symbols)")) alreadyPatched += 1;
      continue;
    }

    const fixed = source.replace(match[0], helper);
    await writeFile(filePath, fixed);
    patched += 1;
  }

  // Zero matches is a valid outcome: Vite's chunking is non-deterministic and
  // doesn't always generate the problematic __exportAll cycle. Only treat
  // more than one match as an error, since that means the entry chunk could
  // not be unambiguously identified.
  if (patched + alreadyPatched > 1) {
    throw new Error(
      `Expected at most one SSR entry chunk in ${ssrDirectory}; patched ${patched}, already patched ${alreadyPatched}.`,
    );
  }
}

const directories = [];
for (const dir of candidateDirectories) {
  if (await exists(dir)) directories.push(dir);
}

if (directories.length === 0) {
  throw new Error(`No SSR output found. Looked in: ${candidateDirectories.join(", ")}`);
}

for (const dir of directories) {
  await patchDirectory(dir);
}

console.log(`Patched Vite SSR __exportAll chunk cycle in ${directories.length} output folder(s).`);
