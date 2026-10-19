# Florence (repo: sihat-study-hub)

Florence ("Florence: BSN Nursing Study", powered by SIHAT) is a mobile-first
PWA study companion for BSN (Bachelor of Science in Nursing) students in
Pakistan, following the HEC/PNMC curriculum. SIHAT (Sindh Institute of Health
and Technology, Khairpur Mirs; said "sehat") is the founding partner and its
faculty review the content. Students read chapter notes, review flashcards on
a spaced-repetition schedule, take quizzes, ask the chapter-scoped AI tutor
("Ask Florence") and watch their progress grow as a Nightingale rose, one
petal per subject. "Sihat" was the working name; code identifiers, storage
keys and cache prefixes may still say sihat.

## Brand and design (Florence v2, October 2026)

The brand book and screen sheets are the source of truth; see
`design-reference/README.md` for links and the product rules. In code:
- Tokens live in `src/styles.css` (Night ward, Lamplight, Linen, Deep amber,
  essential borders). Light = Linen paper; Lamplight mode = the `.dark` class.
  Any element can force Night tokens with the `dark` class (session complete,
  intro, the Progress panel).
- Fonts: Fraunces (display `font-display`; the wordmark only `fl-wordmark`),
  Instrument Sans (everything else; every question uses `fl-question`, 21/30),
  IBM Plex Mono (numbers `fl-number`, decorative `fl-label` only).
- The mark, lockups and progress rose share one geometry:
  `src/components/brand/rose-geometry.ts`. `FlorenceMark` switches to the
  small-size version at 24 px and below.
- Petal colours identify subjects only (`src/lib/subject-colours.ts` maps the
  stored colour family keys to petals). Never use them for status or as text
  on light backgrounds; status is `StatusChip` (glyph + word).
- Voice: a calm senior nurse on the night shift. Brand words (lamp, rose,
  bloom) for headings and celebrations; buttons, errors and clinical text are
  plain. No exclamation marks, no "streak", no XP or ranks in student UI.
- Themes (`src/lib/theme.ts`): Light, Dark or Automatic (Lamplight 8 pm to
  6 am). Study runners call `useStudySessionLock()` so the theme never
  switches mid-session.

## Architecture

- **Frontend**: TanStack Start (file-based routing, SSR) + React 19 +
  TanStack Query for data fetching + shadcn/ui + Tailwind v4.
- **Backend**: Supabase — Postgres with RLS, storage (diagram images), and
  Deno edge functions (`supabase/functions/`).
- **Spaced repetition**: `ts-fsrs` (FSRS-6 algorithm), wrapped in
  `src/lib/spacedRepetition.ts`.
- **AI**: Anthropic Claude — `claude-haiku-4-5` for the chapter tutor
  (`tutor-ask`, `tutor-practice`) and content generation
  (`generate-content` — summaries, MCQs, flashcards from source material).
- **Deploy**: Cloudflare (via `@cloudflare/vite-plugin` + `wrangler.jsonc`,
  entry `src/server.ts`).
- **Offline**: `public/sw.js`, a hand-written service worker using the plain
  Cache API (no Workbox or CDN, so it installs with no outside network):
  stale-while-revalidate for pages, cache-first for scripts, styles, fonts and
  the app's images, and an app shell for pages it hasn't seen (see Offline
  downloads below). It handles only same-origin requests and Google Fonts, so
  it never caches Supabase REST, storage or auth responses (URL-only cache
  keys could leak RLS-scoped data between accounts on a shared device), and
  never server functions (`/_serverFn`, whose GET responses are personal).
  Bump `CACHE_VERSION` on every deploy.

## Security model — read this before touching progress/gamification tables

`xp_events`, `streaks`, `quiz_attempts`, `chapter_progress`,
`flashcard_reviews`, `tutor_messages`, `exam_attempts` and
`question_answers` are **read-only from the browser**.
RLS on these tables (see
`supabase/migrations/20260614170000_lock_progress_integrity.sql`) grants
authenticated users `SELECT` only (`auth.uid() = user_id`); admins get full
access via `is_admin()`. There is no client-writable policy — this was a
deliberate fix for a bug where the browser could forge XP/streaks/quiz
scores directly from devtools.

**Never propose a client-side `.insert()`/`.update()`/`.upsert()` against any
of those tables.** All writes go through one of two trusted paths, both
using the Supabase **service-role** key, which bypasses RLS entirely:

1. A `createServerFn` in `src/lib/*.functions.ts` (e.g.
   `src/lib/study.functions.ts` → `submitQuiz`, `recordReview`). These run
   on the server, get the caller's identity from the verified session
   (`requireSupabaseAuth` middleware, never from the request body), and
   recompute anything score-like server-side — the client's claimed score,
   XP amount, or streak state is always ignored and derived fresh.
2. A Deno edge function using the service-role client (e.g. `tutor-ask`,
   `tutor-practice`), which verifies the caller with an auth-scoped client
   first, then does trusted reads/writes with the admin client. XP amounts
   live in `supabase/functions/_shared/activity.ts::XP_AMOUNTS` (also
   mirrored in `src/lib/activity.server.ts`, which holds the shared
   `insertXp`/`bumpStreak` helpers for server functions) — never let a
   caller pick their own XP value.

"Days in a row" (the `streaks` table) counts study days that run **4 am to
4 am Pakistan Standard Time** (UTC+5, no DST): `studyDay()` in
`src/lib/streak.ts`, with a Deno copy in `supabase/functions/_shared/activity.ts`.
Keep both in sync. XP caps still roll over at PKT midnight
(`pakistanDate()` / `startOfTodayPkt()`). Streak rules, including freezes (a freeze
covers one missed day; one is earned every 7 streak days, max 2), live in
`src/lib/streak.ts::nextStreak`, with a Deno copy in
`supabase/functions/_shared/activity.ts` — keep those two in sync as well.
Screens show `displayStreak()`, not the raw `current_streak`, because the
stored value only changes when the student next studies.

`chapter_progress.mastery_score` is the average of the last 3 quiz attempts
(`MASTERY_WINDOW` in `study.functions.ts`), not the best score ever.

What students see as mastery is **mastery v1** (`src/lib/mastery.ts`, tested):
across started chapters, 60% FSRS recall (average retrievability of every
approved card, unreviewed = 0) + 40% quiz (the rolling quiz score above).
States: Needs light < 40%, Growing 40–79%, In bloom ≥ 80% with at least two
quizzes and two weeks of study. `getProgressSnapshot`
(`src/lib/progress.functions.ts`; pure assembly in
`src/lib/progress-snapshot.ts`) computes it server-side for Today, Subjects,
Progress and session complete, so phones don't download every card row.

Chapter quiz papers are selected by `getChapterQuiz` on the trusted server,
bound to a one-use `quiz_sessions` row, and returned without `correct_index` or
`explanation`. Florence shows each answer's feedback straight away:
`checkQuizAnswer` first **locks** the answer in `quiz_sessions.locked_answers`
and only then returns correctness and the explanation for that one question.
`submitQuiz` grades the locked answers (a different later selection is
ignored), accepts only the complete issued paper, and returns the review. If
the `locked_answers` column is missing, `checkQuizAnswer` returns
`{ available: false }` and the client falls back to feedback after submit. Authenticated browser clients have
column-level `SELECT` access to answer-free question fields; staff answer-key
views go through trusted server/MCP paths.

Quiz XP is capped per chapter per PKT day in `submitQuiz`: the first attempt
earns quiz XP (or pass XP), and a later attempt earns pass XP only if it is
the first pass that day (`quizXpSource` in `src/lib/quiz-grading.ts`, with the
other pure submit rules). Exam XP is capped once per subject per day.

**RLS helpers** (`public.` schema, defined across
`supabase/migrations/`):
- `is_admin(_user_id)` — `role = 'admin'` only.
- `is_staff(_user_id)` — `role in ('instructor', 'admin')`.
- `has_role_admin(_user_id)` — functionally identical to `is_admin`, kept
  separate so `protect_profile_fields()` doesn't depend on the
  `app_role` enum (role is stored as `text`).
- `protect_profile_fields()` — a `BEFORE UPDATE` trigger on `profiles` that
  silently reverts `role`, `batch_id`, `student_type`, and `email` back to
  their old values unless `has_role_admin(auth.uid())` is true. Trusted
  server code (e.g. `applyInviteCode` in `invite.functions.ts`) updates
  these columns via `supabaseAdmin`; if you touch this trigger or those
  code paths, verify the update actually sticks rather than assuming
  service-role access alone is enough to satisfy it.

`SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` must never be imported
into browser-reachable code — only `client.server.ts`, `*.functions.ts`
server functions, and edge functions. See `SECURITY_NOTES.md` for the
env-var split (`VITE_`-prefixed = public/bundled, unprefixed = server-only).

## Batch, circles, reports and settings

- The weekly leaderboard is gone (`/leaderboard` redirects to `/batch`).
  `getBatchOverview` (`src/lib/batch.functions.ts`) returns batch totals only
  (reviews this week; the subject with the lowest average mastery once 3+
  students have data) and the student's opt-in study circle: up to six
  people, joined by a 6-character code, showing only "studied today" for
  members who opted in (`student_settings.show_in_circles`). Never sorted by
  activity, never scores.
- `content_reports` holds "Report a problem" submissions
  (`src/lib/report.functions.ts`). Staff read and resolve them via RLS
  (`is_staff`). An open report blocks approving that item, and the publish
  checklist (`src/components/admin/PublishChecklist.tsx`: 15 approved
  questions, 25 approved flashcards, notes written, no open reports) blocks
  publishing, both on the faculty chapter page and on `/admin/review`.
- `/admin/review` is the faculty review screen from the For faculty sheet
  (Night sidebar `FacultySidebar` in `AppShell.tsx` on every `/admin` page,
  draft list, the draft with Approve/Edit/Reject, source passage, checklist).
  Editing goes through `updateStaffQuestion` and resets the question to
  draft. The "source" is the closest matching paragraph of the approved
  notes (`src/lib/source-passage.ts`), not stored provenance.

## Joining and signing in

- `/` shows a short Night splash, then a Night welcome ("I have a batch
  code" / "Sign in with phone or email"). `/signup` is one "Join your
  batch" screen: the batch code is looked up as it is typed, then name and
  phone number or email, then a 6-digit code (`CodeStep.tsx`, helpers in
  `src/lib/auth-otp.ts`). `/login` takes a phone number (SMS code) or an
  email (password, or a code if left empty).
- The batch code is redeemed after the first sign-in (`PendingInviteRedemption`
  in `AppShell.tsx` → `applyInviteCode` → the `redeem_invite_code` database
  function). `invite_codes` is keyed by `code`; it has no `id` column
  (fixed in `20261010130000_fix_invite_redemption.sql`).
- Phone codes need a Supabase SMS provider. Until one is set up and tested,
  `PHONE_SIGN_IN` in `src/lib/auth-otp.ts` stays `false` and the welcome,
  join and sign-in screens ask for an email only. Email codes need
  `{{ .Token }}` in the auth email templates (Lovable Cloud → Emails); the
  link in the email works either way.

## Privacy, account deletion and error reports

- `/privacy` (public) is the privacy notice. Joining needs its tick box
  (`PrivacyAgreement`); the agreement is saved on the auth user's metadata
  (`privacy_version`, `privacy_accepted_at`, `src/lib/privacy.ts`). Anyone
  signed in without the current version sees `ConsentGate` once (AppShell's
  `PrivacyConsentCheck`). Bump `PRIVACY_VERSION` when the notice changes in a
  way students should agree to again. `PRIVACY_CONTACT_EMAIL` is shown on the
  page once set.
- Settings → "Delete my account" (students only) calls `deleteMyAccount`
  (`src/lib/account.functions.ts`): every user table cascades from
  `auth.users`, `user_badges` (no foreign key) is cleared first, and a study
  circle the student started passes to its longest-standing member.
- `client_errors` (`20261014090000_pilot_readiness.sql`, service role only)
  collects errors from phones: `installErrorReporting()` in the root route
  (window errors and unhandled rejections) plus the root `ErrorComponent`,
  sent through `reportClientError` (`src/lib/client-errors.functions.ts`;
  rate-limited, works signed out, identity from the verified token only).
  Staff see them grouped on /admin/diagnostics ("Problems on phones").
  Rows older than 30 days are removed as new ones arrive.

## Answer colours

- Quiz options and mistake review use `AnswerOption` / `AnswerFeedback`
  (`src/components/study/AnswerOption.tsx`); flashcard ratings in
  `FlashcardDeck.tsx` use the `--rate-again/hard/good/easy` tokens. These
  are feedback colours, separate from petal colours, and always pair with a
  word.
- `student_settings` stores reminder preferences (off by default, one a day
  at most). Nothing sends reminders yet.
- All four come from `supabase/migrations/20261010120000_florence_redesign.sql`
  and are written only through service-role server functions. Every reader
  tolerates the migration not being applied yet.

## Conventions

- **Chapter tabs** follow `?tab=` (`quiz`, `flashcards`, `diagrams`, `tutor`;
  omitted means Notes), so links can open a chapter on a specific tab.
- **Routes**: file-based under `src/routes/`, mirroring URL structure.
  `_authenticated.tsx` is a pathless layout route gating everything under
  `src/routes/_authenticated/` (home = Today, session = today's review,
  subjects/$subjectId, chapters/$chapterId, progress, batch, profile =
  Settings, intro, review, tutor, speed (unlisted), admin/*). Each route file exports
  `Route = createFileRoute("/path")({ head, component })`.
- **Server functions**: one file per domain in `src/lib/*.functions.ts`
  (`study.functions.ts`, `exam.functions.ts`, `admin.functions.ts`,
  `invite.functions.ts`, `diagnostics.functions.ts`).
  Pattern: `createServerFn({ method })`, `.middleware([requireSupabaseAuth])`
  when the caller must be identified, `.inputValidator((data: unknown) =>
  ZodSchema.parse(data))` to validate untrusted input, `.handler(async ({
  data, context }) => ...)`. Always read `context.userId` for identity —
  never trust an id in `data`.
- **Edge functions** (`supabase/functions/*/index.ts`): plain `Deno.serve`
  handlers, manual CORS headers, manual auth (auth-scoped client to call
  `.auth.getUser()`, then a separate service-role `admin` client for
  trusted work). Shared logic lives in `supabase/functions/_shared/` (e.g.
  `activity.ts` for XP/streak awarding, `shuffle.ts` for option shuffling) —
  add new cross-function logic there rather than duplicating it per
  function.
- **Naming**: server-only modules end in `.server.ts`. Nothing enforces
  this at build time beyond the ESLint rule blocking the `server-only`
  package — never import a `.server.ts` file from client code. Components
  are PascalCase per file in `src/components/`; admin-only ones live in
  `src/components/admin/`.
- Client Supabase access (`src/integrations/supabase/client.ts`) is
  RLS-scoped and safe in browser code for the read-only tables above and
  ordinary curriculum reads (subjects, chapters, questions, flashcards).

## Exam mode

`/subjects/$subjectId/exam` (route file `subjects/$subjectId_.exam.tsx`,
non-nested so it doesn't render inside the subject page). Question counts,
time limits, difficulty mix and pass mark live in `src/lib/exam-config.ts`.
`startExam` picks the paper server-side (even spread across chapters, then
difficulty mix) and sends questions **without** `correct_index`;
`submitExam` grades server-side, stores the per-chapter breakdown in
`exam_attempts`, and awards exam XP at most once per subject per PKT day.
One unfinished attempt per subject: `startExam` returns it instead of
creating a new one. The runner keeps in-progress answers in localStorage
(keyed by attempt id) so a refresh or dropped signal doesn't lose them.

## Answer log and mistake review

`question_answers` logs every graded answer (source `quiz`, `exam` or
`review`), written via `logAnswers()` in `src/lib/activity.server.ts` from
`submitQuiz`, `submitExam` and `answerMistake`. Logging never throws, so a
logging failure can't break a submit. Rules in `src/lib/mistakes.ts`: a wrong
answer is due again after 1 day; after one right answer it's due once more 3
days later; two right answers clear it; a new wrong answer restarts it.
Chapter quizzes use `pickQuizQuestions` (due mistakes, capped at half the
quiz, then unseen, then least recently seen). `/review` ("Fix your
mistakes") serves due mistakes across all subjects, 10 per session, with
review XP once per PKT day. Browser reads go through
`src/lib/mistakes-data.ts`, which treats any read error as empty history.

## Offline downloads

A student can download a chapter (or a whole subject: every published
chapter, plus ones published later) and read its notes and flip its
flashcards with no signal.

- **Storage** (`src/lib/offline-store.ts`, tested): IndexedDB database
  `florence-downloads`, stores `chapters` (light metadata: title, subject,
  sizes, version), `content` (notes, approved flashcards, diagram list),
  `images` (the diagram image files as Blobs, from the private `diagrams`
  bucket) and `subjects` (subjects downloaded whole). Every row is keyed by
  and carries the user id, and every read checks the stored user id again,
  so one account never sees another's downloads on a shared phone, even if
  the first never logged out. Never put curriculum or personal data in the
  service worker's runtime caches instead.
- **Network side** (`src/lib/downloads.ts`): reads with the RLS-scoped
  browser client (curriculum tables only; nothing is written to Supabase),
  calls `navigator.storage.persist()` at the first download, shows
  `navigator.storage.estimate()` in Settings, and after a download asks the
  service worker (`florence:cache-pages` message) to keep `/home`,
  `/subjects`, `/profile` and the subject and chapter pages, with the
  scripts and styles each page names, so a cold start offline works.
- **Refresh**: each download stores `chapters.updated_at` and a version
  (`contentVersion`: updated time, approved card ids, diagram ids and update
  times). `useKeepDownloadsFresh` (in the authenticated layout) checks at
  most every 6 hours while online, downloads changed chapters again quietly,
  removes unpublished ones, adds chapters newly published in a subject
  downloaded whole, and downloads everything again weekly (card text edits
  don't change the version). A failed refresh keeps the old copy.
- **Reads with a fallback** (`src/lib/chapter-data.ts`): the chapter page and
  its flashcards read from Supabase, or from the download when the device is
  offline or the request fails (`readWithDownloadFallback`; queries use
  `networkMode: "always"` because TanStack Query pauses queries offline).
  The subject page and Subjects list fall back to downloaded chapters when
  the progress snapshot can't load. Images come from the stored file when
  the chapter is downloaded (`src/hooks/use-diagram-image.ts`), even online.
- **Offline sign-in** (`src/lib/offline-session.ts`): with no signal,
  supabase-js can't refresh an expired access token (and retries for up to
  30 seconds). `useSession` (AppShell) then trusts the session stored on the
  phone instead of sending the student to /login, and checks it with the
  server once the signal returns; a session the server rejects signs out as
  usual. `src/router.tsx` seeds TanStack Query's online state from
  `navigator.onLine`.
- **App shell**: the server renders the same signed-out "Loading…" shell for
  every account, so cached pages hold no personal data. For a page it never
  cached, the worker serves another cached page of the same route shape
  (`/chapters/:id`), then `/home` (precached at install), then a plain
  offline page.
- **Log out** (`src/lib/log-out.ts`) removes the student's downloads before
  ending the session; offline, the session is forgotten locally.
- **UI**: `ChapterDownload` / `SubjectDownload`
  (`src/components/DownloadForOffline.tsx`) with progress and size;
  `OfflineChip` ("Available offline", in `StatusChip.tsx`) on downloaded
  chapters in the subject page and chapter header; the Settings "Downloads"
  row lists them with sizes and Remove / Remove all. Screens that need the
  server use `NeedsInternet` (`OfflineBanner.tsx`) instead of failing
  silently: quizzes, practice exams, Batch, Progress, Today, today's review
  and Fix your mistakes; Ask Florence already says so. `FlashcardDeck`
  disables the ratings offline ("Saving reviews needs internet") and offers
  "Next card"; nothing is queued.
- Not offline: quizzes, exams, Ask Florence, the Diagrams labelling tab and
  videos.

## Speed

- Every server function is timed by the global middleware `serverTiming`
  (`src/lib/server-timing.ts`, first in `src/start.ts`, so the time includes
  auth). `src/lib/timing.server.ts` wraps `fetch` to count requests to
  `SUPABASE_URL` and their **waits** (the longest chain that ran one after
  another), adds a `Server-Timing` header, logs one JSON line (function name
  and numbers only, no user data) and saves a row to `public.server_timings`
  after the response (`afterResponse`, `src/lib/request-scope.server.ts`,
  using the Workers `waitUntil` from `src/server.ts`). Pure parts:
  `src/lib/timing.ts`.
- `server_timings` (`20261010150000_server_timings.sql`): service role only,
  no user ids; the app keeps about three days. `server_timing_summary(since)`
  gives median, 95th percentile and slowest per function; staff read it via
  `getServerSpeed` (`src/lib/diagnostics.functions.ts`) on
  /admin/diagnostics. Saving is skipped until the table exists.
- `/speed` (unlisted, any signed-in user) and /admin/diagnostics show the
  phone's own timings, recorded per tab in sessionStorage by
  `src/lib/phone-speed.ts`. Phone checklist: `docs/measuring-speed.md`.
- Each wait costs a full round trip from the Worker to the Supabase region.
  In hot paths, start independent reads together (`Promise.all`), follow
  foreign keys with PostgREST embeds instead of one read per step (profile →
  batch → semester → subjects → chapters is one read in
  `getProgressSnapshot`), write different tables together, and use
  `readStreak`/`writeStreak` to read the streak with the other reads
  (`bumpStreak` does both; same rules). `e2e/tests/speed.e2e.ts` fails if
  Today, Batch or a review goes above 3 waits. Batch tab rules are in
  `src/lib/batch-overview.ts`, curriculum helpers in `progress-snapshot.ts`.
- Cloudflare placement is the default (the Worker runs near the student).
  Smart or targeted placement near Supabase is not switched on; see
  `docs/measuring-speed.md`.

## Commands

- `bun dev` — start the dev server.
- `bun run lint` — ESLint (flat config, TypeScript + react-hooks +
  react-refresh + Prettier).
- `bun run build` — production build (Vite + Cloudflare plugin).
- `bun run test` — Vitest unit tests.
- `bun run test:e2e` — Playwright end-to-end tests against a local Supabase
  stack (start it first with `npm run e2e:supabase`; needs Docker).
  `npm run test:e2e:update` rewrites the screenshot baselines on purpose.
  How to run and what's covered: `e2e/README.md`.

## End-to-end tests

- Playwright (`playwright.config.ts`, `e2e/`) runs the production build,
  served locally by `wrangler dev`, against the **local** Supabase stack from
  `supabase start` with every migration applied. `npm run test:e2e`
  (`e2e/scripts/run.mjs`) runs Playwright inside
  `mcr.microsoft.com/playwright:v1.56.1-noble` so screenshots match CI; keep
  that tag in step with `@playwright/test`. Never point them at the live
  project: keys come from `supabase status`, every script refuses a non-local
  Supabase URL, and the browser can only reach this machine.
- `e2e/seed.ts` is an idempotent TS seed (local service-role key, Node side
  only): batch code `SIHAT-E2E-26`, two Semester 1 subjects with published
  chapters (one meets the publish checklist), an approved diagram in "The
  cell" with a real image in the local `diagrams` bucket, a Semester 2 draft
  chapter for the faculty tests, a student per journey and an instructor. Each test resets
  its own student first (`e2e/support/scenarios.ts`); one worker, one database.
- Journeys run on a 390 × 844 phone viewport; the faculty tests on 1280 × 900.
  Security tests use the anon key plus a student's session, like devtools
  would. Screenshot baselines (Light and Dark) live in
  `e2e/tests/__screenshots__/`; review every changed image.
- The `[auth]` block in `supabase/config.toml` is for local runs only (test
  phone code, dummy Twilio, raised rate limits, local site URL). Never run
  `supabase config push` against production.
- `tutor-ask` reads an optional `ANTHROPIC_BASE_URL` (unset in production);
  `npm run e2e:supabase` points it at `e2e/scripts/anthropic-stub.mjs` through
  the git-ignored `supabase/functions/.env`.
- CI: `.github/workflows/e2e.yml` runs the suite on every pull request and
  uploads the report and screenshot diffs when it fails.
- CI installs with `npm install --no-package-lock` (bun.lock points at
  Lovable's private registry), so every caret range floats to the newest
  release. `@tanstack/react-start`, `@tanstack/react-router` and
  `@tanstack/router-plugin` are pinned exactly in `package.json` because
  react-start 1.169+ breaks `@lovable.dev/vite-tanstack-config` 2.23.1 (the
  client build finds no entry: "Could not resolve entry module index.html").
  Move them only together with the Lovable config, and check `vite build`.
- Test files end in `.e2e.ts` so Vitest doesn't pick them up.
- The config blocks service workers; `offline.e2e.ts` allows them, downloads
  a chapter, goes offline with `context.setOffline(true)` and reloads cold.

## Content conventions

- **British spelling** in all generated/student-facing content (organise,
  colour, centre, paediatric, etc.) — this applies to system prompts for
  Claude (tutor answers, generated summaries/MCQs/flashcards) and any
  copy you write by hand.
- **Pakistani clinical context**: examples, drug names, and units should
  match Pakistani nursing practice (HEC/PNMC curriculum), not US/UK
  defaults. The tutor and content-generation system prompts already
  instruct Claude to never invent drug doses, lab values, or clinical
  guidelines not present in the source notes — preserve that constraint if
  you touch those prompts.

## Known deferred

- No native push notifications — PWA install prompt only
  (`InstallPrompt.tsx`, offered after the first useful session); no web-push
  subscription/backend exists yet. Reminder preferences are stored but unsent.
- Phone-number codes need a Supabase SMS provider; email works meanwhile.
- Faculty console: per-option reasoning, stored source passages (the review
  screen matches against the notes instead) and learning-objective coverage
  need `generate-content` to store them first.
- No payment/subscription layer — access is invite-code gated
  (`invite_codes` table, `internal` vs `external` `student_type`), not
  billed.
- Automated coverage: Vitest unit/regression tests plus the Playwright
  end-to-end suite (`e2e/`); continue to run `bun run test`, `bun run lint`,
  `bun run build` and `bun run test:e2e`. `bun run lint` already reports
  about a thousand problems on main, mostly Prettier formatting in generated
  Supabase files (`src/integrations/supabase/`).
- `tutor-practice` and `award-badges`/`backfill-question-options` edge
  functions exist but are thinner/ops-oriented; not documented in depth
  here — read them directly before modifying.
- No offline write queue — the service worker deliberately never
  intercepts POST/PUT/PATCH/DELETE, so writes (quiz submits, reviews,
  tutor questions) simply fail offline rather than syncing later.
