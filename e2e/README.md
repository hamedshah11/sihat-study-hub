# End-to-end tests

Playwright tests that drive a production build of Florence against a **local**
Supabase stack. They catch broken journeys, security regressions and layout
changes before a pull request is merged. CI runs them on every pull request
(`.github/workflows/e2e.yml`).

Nothing here ever talks to the hosted Supabase project. `e2e/support/env.ts`
refuses any Supabase URL that isn't on this machine, the build overrides every
value from the tracked `.env`, and every browser context blocks outside
requests (a request to `*.supabase.co` fails the test).

## What's covered

| File                             | What it checks                                                                                                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/join-and-sign-in.e2e.ts`  | Welcome → batch code → "Code found" → name and email → emailed code → intro → Today, and the student really is in the batch. Signing in with an email code, with the test phone number, and a wrong code.                                      |
| `tests/review-session.e2e.ts`    | Today's review: rate 10 cards, session complete with the rose and "1 day in a row"; the ratings were scheduled on the server.                                                                                                                  |
| `tests/quiz-and-mistakes.e2e.ts` | One tap gives "Your answer" / "Correct answer" straight away; the result matches the `quiz_attempts` row the server wrote. A missed question comes back in Fix your mistakes the next day.                                                     |
| `tests/ask-florence.e2e.ts`      | A question goes through the real `tutor-ask` edge function to an Anthropic stub; the answer, its source chip and the saved messages.                                                                                                           |
| `tests/faculty-review.e2e.ts`    | At 1280 × 900: approve, edit (back to draft) and reject drafts; "Publish to students" stays off until the checklist passes; nothing is cut off at 1280 px.                                                                                     |
| `tests/theme.e2e.ts`             | Automatic, Light and Dark; Automatic waits for a study session to end before switching to Lamplight.                                                                                                                                           |
| `tests/security.e2e.ts`          | With the anon key and a student session: insert, update, upsert and delete fail on all eight progress tables; other students' rows stay hidden; `role` and `batch_id` can't be changed; quiz papers carry no answers until each one is locked. |
| `tests/screenshots.e2e.ts`       | Welcome, join, Today, Subjects, chapter notes, flashcard front and answer, quiz feedback, session complete, Progress, Batch, Settings and faculty review, in Light and Dark.                                                                   |

## Running them

You need Docker and Node 22.18 or later (the scripts are TypeScript run directly by Node).

```sh
npm install --no-package-lock --legacy-peer-deps   # bun install can't reach Lovable's registry
npm run e2e:supabase        # start local Supabase and the edge functions (first run pulls images)
npm run test:e2e            # build the app against it and run everything
npm run e2e:supabase:stop   # when you're done
```

`bun run test:e2e` works the same way. `test:e2e` seeds the database, builds the
app with the local Supabase URL and key, serves the build with wrangler on
<http://127.0.0.1:3000>, and runs the browser inside the official Playwright
Docker image so screenshots render identically on every machine. Pass
Playwright options after `--`, for example `npm run test:e2e -- e2e/tests/theme.e2e.ts`.

Set `E2E_SKIP_BUILD=1` to reuse the last build when only tests changed (run
`npm run e2e:build` after changing app code).

To watch or debug a test, run it with a browser on this machine:

```sh
npm run test:e2e:host -- --headed e2e/tests/quiz-and-mistakes.e2e.ts
npm run test:e2e:host -- --ui
npx playwright show-report   # the last run's report, with traces of failures
```

Screenshot tests are skipped in host runs: text renders a little differently on
each machine, so they're only compared in the pinned browser.

### Updating screenshots on purpose

When a change is meant to alter how a screen looks:

```sh
npm run test:e2e:update -- e2e/tests/screenshots.e2e.ts
```

Then look at every changed image in `e2e/tests/__screenshots__/` before
committing it. Never update the images just to make a failing check pass; open
the diff first (in CI it's in the `playwright-report` artifact, as
`*-diff.png` next to `*-expected.png` and `*-actual.png`).

## The test data

`e2e/seed.ts` (run by every test run, or `npm run e2e:seed`) resets:

- BSN Generic, Semester 1 and 2, and two batches: **BSN 2026 Section A** (batch
  code `E2E26-BSN1`) and **BSN 2026 Section B** (only the screenshot student).
- Fundamentals of Nursing: _Vital signs_ (published, passes the publish
  checklist: 15 approved questions, 25 approved flashcards, notes) and _Wound
  care_ (draft, with draft questions for faculty). Microbiology: _Sterilisation
  and disinfection_ and _Hand hygiene_ (published, exactly 5 questions).
- Accounts (password `florence-e2e-password` for all):

| Who                              | Sign in with                                                 | Used for                                                                                |
| -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Sana Baloch, student, Section A  | `sana@florence.test` or phone `0300 0000001` (code `246810`) | Sign-in tests; her rows in every progress table are what the security tests try to read |
| Ayesha Memon, student, Section B | `ayesha@florence.test`                                       | Screenshots only; reset before each screen                                              |
| Nadia Shaikh, instructor         | `faculty@florence.test`                                      | Faculty review                                                                          |

Most tests make their own throwaway student (the `student` fixture) so they can
run side by side. Set-up and checks use the local service-role key in Node
(`support/admin.ts`); the browser only ever has the anon key and a session.

Sign-in codes: emails land in Mailpit (<http://127.0.0.1:54324>), which the
tests read. Phone sign-in uses the test code for 0300 0000001 in
`supabase/config.toml`, so no SMS provider is needed.

Ask Florence: `e2e/supabase/functions.env` points `tutor-ask` at the stub in
`stubs/anthropic.ts` (`ANTHROPIC_BASE_URL`), which returns a fixed answer. The
real API is never called.

Time: progress data is stored relative to the real time, because the server
uses the real clock. Tests that care about the time of day move only the
browser clock (`recentPktTime`), always into the past.

## Troubleshooting

- **"The local Supabase stack isn't running"**: `npm run e2e:supabase`.
- **Ask Florence fails with "isn't available right now"**: the edge functions
  didn't start; see `e2e/.cache/functions.log`. The first start downloads their
  imports from esm.sh, so it needs internet access.
- **Screenshots differ only after a dependency update**: a new Playwright
  version means a new browser. Update the images on purpose, as above.
- **Start from a clean database**: `npx supabase@2.120.0 db reset` re-applies every
  migration; the next test run seeds again.
