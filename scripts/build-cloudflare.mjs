/** Build the Cloudflare Worker locally using the normal short build command. */
import { spawnSync } from "node:child_process";

const build = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  env: { ...process.env, NITRO_PRESET: "cloudflare-module" },
  stdio: "inherit",
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
