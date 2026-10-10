// Builds Florence against the local Supabase stack (build.ts) and serves the
// built Cloudflare worker with wrangler, the way production runs it.
// Playwright starts this as its web server (playwright.config.ts).
//
// The worker gets its server-side values as wrangler vars, all pointing at
// the local stack. The tracked .env (which names the hosted project) never
// reaches it: wrangler only reads .env files next to .output/server/.
//
// Set E2E_SKIP_BUILD=1 to serve the existing .output build (CI builds in an
// earlier step).

import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertLocal, e2eEnv, HOSTED_PROJECT_ID } from "../support/env.ts";
import { buildForE2E } from "./build.ts";

const env = e2eEnv();
const port = new URL(env.appUrl).port || "3000";

if (process.env.E2E_SKIP_BUILD !== "1") buildForE2E();

// Refuse to serve a bundle that was built for somewhere else.
const bundle = readdirSync(".output/public/assets")
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(join(".output/public/assets", name), "utf8"))
  .join("\n");
if (bundle.includes(HOSTED_PROJECT_ID) || !bundle.includes(env.supabaseUrl)) {
  console.error(
    `[e2e] The build in .output isn't pointed at ${env.supabaseUrl}. Rebuild without E2E_SKIP_BUILD.`,
  );
  process.exit(1);
}
const config = JSON.parse(readFileSync(".output/server/wrangler.json", "utf8")) as {
  main?: string;
};
if (!config.main) {
  console.error("[e2e] .output/server/wrangler.json is missing. Run the build first.");
  process.exit(1);
}

const vars = {
  SUPABASE_URL: env.supabaseUrl,
  SUPABASE_PUBLISHABLE_KEY: env.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
};
for (const [name, value] of Object.entries(vars)) {
  if (name.endsWith("_URL")) assertLocal(name, value);
}

const wrangler = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--config",
    ".output/server/wrangler.json",
    "--ip",
    "127.0.0.1",
    "--port",
    port,
    "--log-level",
    "warn",
    "--show-interactive-dev-session=false",
    ...Object.entries(vars).flatMap(([name, value]) => ["--var", `${name}:${value}`]),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
const stop = () => wrangler.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
wrangler.on("exit", (code) => process.exit(code ?? 0));
