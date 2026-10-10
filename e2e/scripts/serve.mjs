// Builds the production bundle against the LOCAL Supabase stack and serves it
// with `wrangler dev` (the Cloudflare Workers runtime, run on this machine).
// Playwright starts it as its web server (see playwright.config.ts).
//
//   node e2e/scripts/serve.mjs              build, then serve on 127.0.0.1:8788
//   node e2e/scripts/serve.mjs --build-only build only (`npm run e2e:build`)
//   E2E_SKIP_BUILD=1                        serve the last build again

import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { APP_PORT, localSupabase } from "../support/env.ts";

// From `supabase status`; refuses any Supabase URL that isn't on this machine.
const { url, anonKey, serviceRoleKey } = localSupabase();
const buildOnly = process.argv.includes("--build-only");

if (buildOnly || process.env.E2E_SKIP_BUILD !== "1") {
  // Variables already in the environment win over the committed .env (which
  // points at production), so the browser bundle talks to the local stack.
  const build = spawnSync("npx", ["vite", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: anonKey,
      VITE_SUPABASE_PROJECT_ID: "local-e2e",
    },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

// Server-side settings for the Worker. Wrangler reads .dev.vars next to the
// generated wrangler.json, so the production values in the root .env are never used.
writeFileSync(
  ".output/server/.dev.vars",
  [
    `SUPABASE_URL=${url}`,
    `SUPABASE_PUBLISHABLE_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
    "",
  ].join("\n"),
);
if (buildOnly) process.exit(0);

const server = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--config",
    ".output/server/wrangler.json",
    "--ip",
    "127.0.0.1",
    "--port",
    process.env.E2E_APP_PORT ?? String(APP_PORT),
    "--show-interactive-dev-session=false",
  ],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
