// `npm run test:e2e` — build the app against the LOCAL Supabase stack, then
// run Playwright inside the official Playwright Docker image, so screenshots
// are drawn the same way on every machine and in CI. Extra arguments go to
// `playwright test` (a file, `-g "name"`, `--update-snapshots`, ...).
//
//   E2E_SKIP_BUILD=1  reuse the last build
//   E2E_NO_DOCKER=1   run Playwright on this machine instead (screenshots will
//                     differ slightly from the baselines)

import { spawnSync } from "node:child_process";
import { localSupabase } from "../support/env.ts";

// Keep in step with the @playwright/test version in package.json.
const PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.56.1-noble";

// From `supabase status`; refuses any Supabase URL that isn't on this machine.
const { url, anonKey, serviceRoleKey } = localSupabase();
const supabaseEnv = {
  E2E_SUPABASE_URL: url,
  E2E_SUPABASE_ANON_KEY: anonKey,
  E2E_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
};

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...supabaseEnv, ...env },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.env.E2E_SKIP_BUILD !== "1") {
  const status = run("node", ["e2e/scripts/serve.mjs", "--build-only"]);
  if (status !== 0) process.exit(status);
}

const playwrightArgs = ["playwright", "test", ...process.argv.slice(2)];

if (process.env.E2E_NO_DOCKER === "1") {
  process.exit(run("npx", playwrightArgs, { E2E_SKIP_BUILD: "1" }));
}

// The repository is mounted at the same path, and the container shares this
// machine's network, so 127.0.0.1 means the same services inside and out.
const cwd = process.cwd();
const passThrough = ["CI", "E2E_SERVER_LOGS", "E2E_APP_PORT", "E2E_ANTHROPIC_STUB_PORT"];
const user =
  typeof process.getuid === "function" ? `${process.getuid()}:${process.getgid()}` : null;
const dockerArgs = [
  "run",
  "--rm",
  "--init",
  "--network=host",
  "--ipc=host",
  ...(user ? ["--user", user] : []),
  "-v",
  `${cwd}:${cwd}`,
  "-w",
  cwd,
  "-e",
  "HOME=/tmp/playwright-home",
  "-e",
  "E2E_SKIP_BUILD=1",
  ...Object.keys(supabaseEnv).flatMap((name) => ["-e", name]),
  ...passThrough.filter((name) => process.env[name] !== undefined).flatMap((name) => ["-e", name]),
  PLAYWRIGHT_IMAGE,
  "npx",
  ...playwrightArgs,
];
process.exit(run("docker", dockerArgs));
