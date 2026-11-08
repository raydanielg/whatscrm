import { readFileSync } from "node:fs";

const envFile = process.argv[2] || ".env";
const entries = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]),
);

const url = entries.VITE_SUPABASE_URL || entries.SUPABASE_URL;
const key = process.argv[3] === "server"
  ? entries.SUPABASE_PUBLISHABLE_KEY
  : entries.VITE_SUPABASE_PUBLISHABLE_KEY || entries.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL or publishable key in .env");
const configuredProject = readFileSync("supabase/config.toml", "utf8")
  .match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];

const tables = {};
for (const table of ["pm_projects", "pm_tasks", "pm_project_members"]) {
  const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const result = await response.json().catch(() => ({}));
  tables[table] = { status: response.status, code: result.code, message: result.message };
}
console.log(JSON.stringify({
  envFile,
  keySource: process.argv[3] === "server" ? "server" : "browser",
  matchesConfigProject: !!configuredProject && new URL(url).hostname.includes(configuredProject),
  keyKind: key.startsWith("sb_publishable_") ? "publishable" : key.startsWith("eyJ") ? "legacy-jwt" : "other",
  keyLength: key.length,
  publishableKeysMatch: !entries.VITE_SUPABASE_PUBLISHABLE_KEY || !entries.SUPABASE_PUBLISHABLE_KEY
    ? null
    : entries.VITE_SUPABASE_PUBLISHABLE_KEY === entries.SUPABASE_PUBLISHABLE_KEY,
  tables,
}));
