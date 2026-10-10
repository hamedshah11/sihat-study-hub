# End-to-end tests

Playwright tests that use Florence the way students and faculty do: join with a
batch code, sign in, review cards, take a quiz, fix mistakes, ask Florence,
review drafts as faculty, and switch themes. They also check the security
model from a student's browser, and compare screenshots of the main screens
in Light and Dark.

They run against the **production build**, served on this machine by the
Cloudflare Workers runtime (`wrangler dev`), and a **local Supabase stack** in
Docker with every migration in `supabase/migrations` applied. Playwright itself
runs inside its official Docker image (`mcr.microsoft.com/playwright:v1.56.1-noble`),
so screenshots are drawn the same way on every machine and in CI. They never touch
the live Supabase project: the URL and keys come from `supabase status`, every
script refuses a Supabase URL that isn't on this machine, and the browser is
cut off from the internet (a request to a hosted Supabase project fails the
test).

## Run them

You need Docker and Node 22.18 or newer. The first run also pulls the Playwright image (about 1 GB).

```sh
npm install --no-package-lock --legacy-peer-deps
npm run e2e:supabase              # start local Supabase (first run pulls the images)
bun run test:e2e                  # or: npm run test:e2e
```

`test:e2e` builds the app against the local stack, then runs Playwright in its
Docker image (sharing this machine's network): it seeds the database, serves
the build on http://127.0.0.1:8788 and runs every test. Arguments after `--`
go to `playwright test`:

```sh
npm run test:e2e -- e2e/tests/study.e2e.ts       # one file
npm run test:e2e -- -g "chapter quiz"            # tests whose name matches
E2E_SKIP_BUILD=1 npm run test:e2e                # reuse the last build
E2E_SERVER_LOGS=1 npm run test:e2e               # show the Worker's request log
E2E_NO_DOCKER=1 npm run test:e2e                 # run Playwright on this machine instead
npx playwright show-report                       # the HTML report of the last run
npm run e2e:supabase -- stop                     # stop local Supabase
```

With `E2E_NO_DOCKER=1` you need Chromium (`npx playwright install chromium`),
and the screenshot tests will fail because text is drawn slightly differently
outside the image; everything else behaves the same.

`npm run e2e:seed` and `npm run e2e:build` run those two steps on their own (CI
runs them as separate steps).

## Update the screenshots on purpose

When a change is meant to alter how a screen looks:

```sh
npm run test:e2e:update
```

This re-runs the screenshot tests and overwrites the images in
`e2e/tests/__screenshots__/`. Look at every changed image before committing
it: the diff in the pull request is the review. The baselines are made in the
Playwright image, like CI, so this works the same on any machine with Docker.

When CI fails on a screenshot, the `playwright-report` artifact on the run has
the expected image, the actual one and a diff for each failure.

What keeps the pictures stable: the browser clock starts at 10 am Pakistan
time, animations and reduced motion are off, the Google Fonts the app loads
are served from `e2e/fixtures/fonts/` (latin subsets, SIL Open Font License),
the server's random quiz order is put in id order on the way to the browser,
and the parts that follow the real weekday or other tests' data (the week's
flames on Today, the batch totals) are masked.

## What's where

| Path                             | What it is                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright.config.ts`           | Phone viewport (390 × 844), Pakistan timezone, one worker, web servers                                                                                   |
| `e2e/seed.ts`                    | Idempotent seed: programme, semesters, batch and code `SIHAT-E2E-26`, two subjects with published chapters, a Semester 2 draft chapter, and the accounts |
| `e2e/fixtures/`                  | Curriculum, accounts and fonts                                                                                                                           |
| `e2e/support/scenarios.ts`       | Puts each test's student into a known state before it starts                                                                                             |
| `e2e/tests/*.e2e.ts`             | The tests (`.e2e.ts` so Vitest leaves them alone)                                                                                                        |
| `e2e/scripts/supabase.mjs`       | `npm run e2e:supabase`: starts local Supabase, pointing tutor-ask at the Anthropic stub                                                                  |
| `e2e/scripts/run.mjs`            | `npm run test:e2e`: builds, then runs Playwright in its Docker image                                                                                     |
| `e2e/scripts/serve.mjs`          | Builds against local Supabase and serves with `wrangler dev`                                                                                             |
| `e2e/scripts/anthropic-stub.mjs` | Fixed replies in place of the Anthropic API                                                                                                              |

### Sign-in in tests

- Email codes are read from the local mail catcher (Mailpit, http://127.0.0.1:54324).
- Phone: `supabase/config.toml` gives the fake number 0300 0000001 the fixed
  code 123456, so the SMS flow runs without an SMS provider.
- Other tests sign in with a password session from the local auth server, so
  they don't depend on the sign-in screens. Every seeded account's password is
  in `e2e/fixtures/accounts.ts`; they exist only in the local database.

### Ask Florence

`tutor-ask` runs in the local edge runtime. `npm run e2e:supabase` writes
`supabase/functions/.env` (git-ignored) with `ANTHROPIC_BASE_URL` pointing at
the stub, so the tests never call the real API. It refuses to start if you
already have that file without the stub URL in it.

The edge runtime downloads the function's imports from esm.sh when it boots.
Where Docker containers have no internet, it can't, so the Ask Florence test
skips itself locally; in CI it always runs.

## Troubleshooting

- **"Local Supabase isn't running"**: start it with `npm run e2e:supabase`.
- **A migration fails on start**: the local stack applies every file in
  `supabase/migrations` in order, as a fresh database would. Fix the migration.
- **Port 8788 or 54399 in use**: a previous run is still serving; stop it, or
  reuse it (outside CI an existing server is reused).
- **Start from scratch**: `npm run e2e:supabase -- stop --no-backup`, then
  `npm run e2e:supabase` again.
