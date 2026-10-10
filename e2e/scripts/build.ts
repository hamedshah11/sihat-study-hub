// Builds Florence for the end-to-end tests: a normal production build, with
// the browser bundle pointed at the LOCAL Supabase stack. Every VITE_ value
// the tracked .env sets is overridden here (Vite lets the environment win
// over .env files), so the hosted project never ends up in the bundle.

import { spawnSync } from "node:child_process";
import { e2eEnv } from "../support/env.ts";

export function buildForE2E() {
  const env = e2eEnv();
  console.log(`[e2e] Building Florence against ${env.supabaseUrl}…`);
  const build = spawnSync("npx", ["vite", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: env.supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: env.anonKey,
      VITE_SUPABASE_PROJECT_ID: "local",
      SUPABASE_URL: env.supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: env.anonKey,
    },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

if (import.meta.url === `file://${process.argv[1]}`) buildForE2E();
