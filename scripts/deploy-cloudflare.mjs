/** Deploy one generated Cloudflare Worker to exactly one custom domain. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const loadEnvValues = async (path) => {
  const source = await readFile(path, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    values[match[1]] = value;
  }
  return values;
};

const fileEnv = {
  ...(await loadEnvValues(resolve(".env"))),
  ...(await loadEnvValues(resolve(".env.local"))),
};

if (args.includes("--help")) {
  console.log(`Usage:
  npm run deploy:cloudflare

Target selection (in .env or .env.local):
  CLOUDFLARE_WORKER_NAME, CLOUDFLARE_DOMAIN, CLOUDFLARE_ZONE_NAME
  Optional command-line values override the local environment.`);
  process.exit(0);
}

const workerName = valueFor("--name") ?? process.env.CLOUDFLARE_WORKER_NAME ?? fileEnv.CLOUDFLARE_WORKER_NAME;
const domain = valueFor("--domain") ?? process.env.CLOUDFLARE_DOMAIN ?? fileEnv.CLOUDFLARE_DOMAIN;
const zoneName = valueFor("--zone") ?? process.env.CLOUDFLARE_ZONE_NAME ?? fileEnv.CLOUDFLARE_ZONE_NAME;

if (!workerName || !/^[a-z0-9][a-z0-9_-]*$/i.test(workerName)) {
  throw new Error("Provide a valid Worker name with --name or CLOUDFLARE_WORKER_NAME.");
}
if (!domain || !/^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.(?!-)[a-z0-9-]+)+$/i.test(domain)) {
  throw new Error("Provide a valid hostname with --domain or CLOUDFLARE_DOMAIN.");
}
if (zoneName) {
  const normalizedDomain = domain.toLowerCase();
  const normalizedZone = zoneName.toLowerCase();
  if (normalizedDomain !== normalizedZone && !normalizedDomain.endsWith(`.${normalizedZone}`)) {
    throw new Error(`Domain ${domain} is not inside zone ${zoneName}.`);
  }
}

const generatedPath = resolve(".output/server/wrangler.json");
const deployPath = resolve(".output/server/wrangler.deploy.json");
const generatedConfig = await readFile(generatedPath, "utf8").catch((error) => {
  if (error?.code === "ENOENT") {
    throw new Error("Prebuilt Cloudflare artifact not found. Run `npm run build` locally first.");
  }
  throw error;
});
const config = JSON.parse(generatedConfig);
const todayUtc = new Date().toISOString().slice(0, 10);

config.name = workerName;
config.routes = [{
  pattern: domain,
  custom_domain: true,
  ...(zoneName ? { zone_name: zoneName } : {}),
}];
config.workers_dev = true;
if (config.compatibility_date > todayUtc) config.compatibility_date = todayUtc;

await writeFile(deployPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Deploying Worker "${workerName}" to only "${domain}".`);

const wranglerArgs = ["wrangler", "deploy", "--config", deployPath];
if (args.includes("--dry-run")) wranglerArgs.push("--dry-run");

try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run deployment with `npm run deploy:cloudflare`.");
  const deploy = spawnSync(process.execPath, [npmCli, "exec", "--", ...wranglerArgs], { stdio: "inherit" });
  if (deploy.error) throw deploy.error;
  if (deploy.status !== 0) process.exitCode = deploy.status ?? 1;
} finally {
  await rm(deployPath, { force: true });
}
