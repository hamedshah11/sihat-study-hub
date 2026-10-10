// Starts and stops the local Supabase stack for the end-to-end tests.
//
//   node e2e/scripts/supabase.ts up     start the stack (needs Docker) and
//                                       serve the edge functions with the
//                                       test settings in e2e/supabase/functions.env
//   node e2e/scripts/supabase.ts down   stop both
//
// Nothing here talks to the hosted project: `supabase start` runs every
// service in local containers and applies supabase/migrations to a fresh
// local database.

import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { SUPABASE_CLI } from "../support/env.ts";

const CACHE = "e2e/.cache";
const PID_FILE = `${CACHE}/functions.pid`;
const LOG_FILE = `${CACHE}/functions.log`;
const FUNCTIONS_ENV = process.env.E2E_FUNCTIONS_ENV_FILE ?? "e2e/supabase/functions.env";
// Services the tests don't use. The edge runtime is started separately below
// so it gets the test settings.
const EXCLUDE = "studio,logflare,vector,imgproxy,supavisor,postgres-meta,edge-runtime";

function supabase(args: string[]) {
  const result = spawnSync("npx", [...SUPABASE_CLI, ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function running(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function functionsPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number(readFileSync(PID_FILE, "utf8"));
  return pid && running(pid) ? pid : null;
}

async function waitForFunctions(timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch("http://127.0.0.1:54321/functions/v1/tutor-ask", {
        method: "OPTIONS",
      });
      if (res.ok) return true;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function up() {
  mkdirSync(CACHE, { recursive: true });
  supabase(["start", "-x", EXCLUDE]);

  if (!functionsPid()) {
    const log = openSync(LOG_FILE, "a");
    const child = spawn(
      "npx",
      [...SUPABASE_CLI, "functions", "serve", "--env-file", FUNCTIONS_ENV],
      {
        detached: true,
        stdio: ["ignore", log, log],
      },
    );
    closeSync(log);
    child.unref();
    writeFileSync(PID_FILE, String(child.pid));
  }
  // The first boot downloads the functions' imports, so give it a while.
  if (await waitForFunctions(180_000)) {
    console.log("[e2e] Local Supabase and edge functions are ready.");
  } else {
    console.warn(
      `[e2e] The edge functions didn't start (see ${LOG_FILE}). Everything else works; ` +
        "the Ask Florence test will fail until they do.",
    );
  }
}

function down() {
  const pid = functionsPid();
  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
  }
  rmSync(PID_FILE, { force: true });
  supabase(["stop"]);
}

const command = process.argv[2];
if (command === "up") await up();
else if (command === "down") down();
else {
  console.error("Usage: node e2e/scripts/supabase.ts up|down");
  process.exit(1);
}
