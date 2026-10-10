// `npm run test:e2e`: runs the Playwright suite with the browser inside the
// official Playwright image, so screenshots render with exactly the same
// Chromium and fonts on every machine and in CI. The tests themselves, the
// app server and the local Supabase stack stay on this machine; the browser
// reaches them through Playwright's loopback tunnel. Arguments go to
// `playwright test`, e.g. `npm run test:e2e -- --update-snapshots`.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";

const { version } = JSON.parse(
  readFileSync("node_modules/@playwright/test/package.json", "utf8"),
) as { version: string };
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const port = Number(process.env.E2E_BROWSER_PORT ?? 3333);
const name = `florence-e2e-browser-${port}`;

function docker(args: string[], quiet = false) {
  return spawnSync("docker", args, { stdio: quiet ? "ignore" : "inherit", encoding: "utf8" });
}

async function listening(timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (open) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

docker(["rm", "-f", name], true);
// The browser server comes from this project's own node_modules (plain
// JavaScript), so its version always matches the test runner's.
const started = docker([
  "run",
  "-d",
  "--rm",
  "--init",
  "--ipc=host",
  "--name",
  name,
  "-p",
  `127.0.0.1:${port}:3333`,
  "-v",
  `${process.cwd()}/node_modules:/e2e/node_modules:ro`,
  image,
  "node",
  "/e2e/node_modules/playwright-core/cli.js",
  "run-server",
  "--port",
  "3333",
  "--host",
  "0.0.0.0",
]);
if (started.status !== 0) {
  console.error(`[e2e] Couldn't start the browser container (${image}). Is Docker running?`);
  process.exit(1);
}

let status = 1;
try {
  if (!(await listening(120_000))) throw new Error("[e2e] The browser container didn't start.");
  const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, E2E_BROWSER_WS: `ws://127.0.0.1:${port}/` },
  });
  status = result.status ?? 1;
} catch (error) {
  console.error(error);
} finally {
  docker(["rm", "-f", name], true);
}
process.exit(status);
