// `npm run e2e:supabase` — start the LOCAL Supabase stack for the end-to-end
// tests (needs Docker), with every migration in supabase/migrations applied.
//
// Before starting, it points the local tutor-ask edge function at the
// Anthropic stub (e2e/scripts/anthropic-stub.mjs) by writing
// supabase/functions/.env, which is git-ignored and only read locally. It
// leaves an existing file alone unless this script wrote it.
//
// Pass other Supabase CLI commands through: `npm run e2e:supabase -- stop`.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const SUPABASE_CLI = "supabase@2.120.0";
const ENV_FILE = "supabase/functions/.env";
const MARKER = "# Written by e2e/scripts/supabase.mjs for the end-to-end tests.";
const stubPort = process.env.E2E_ANTHROPIC_STUB_PORT ?? "54399";

const args = process.argv.slice(2);
const command = args.length ? args : ["start"];

if (command[0] === "start") {
  const existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : null;
  if (existing === null || existing.startsWith(MARKER)) {
    writeFileSync(
      ENV_FILE,
      [
        MARKER,
        "ANTHROPIC_API_KEY=local-e2e-stub",
        `ANTHROPIC_BASE_URL=http://host.docker.internal:${stubPort}`,
        "",
      ].join("\n"),
    );
  } else if (!existing.includes("ANTHROPIC_BASE_URL=http://host.docker.internal")) {
    // The tests must never call the real Anthropic API.
    console.error(
      `${ENV_FILE} exists and wasn't written by this script. Add ` +
        `ANTHROPIC_BASE_URL=http://host.docker.internal:${stubPort} to it, or move it aside, then try again.`,
    );
    process.exit(1);
  }
}

const result = spawnSync("npx", ["--yes", SUPABASE_CLI, ...command], { stdio: "inherit" });
process.exit(result.status ?? 1);
