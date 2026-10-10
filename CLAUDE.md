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
- **Offline**: `public/sw.js`, a hand-written Workbox service worker
  (stale-while-revalidate for HTML and cache-first for static assets). It does
  not cache authenticated Supabase REST responses because Workbox's URL-only
  cache keys could leak RLS-scoped data between accounts on a shared device.
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
the first pass that day. Exam XP is capped once per subject per day.

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
  (`is_staff`). An open report blocks approving that item, and the faculty
  chapter page's publish checklist (15 approved questions, 25 approved
  flashcards, notes written, no open reports) blocks publishing.
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
  Settings, intro, review, tutor, admin/*). Each route file exports
  `Route = createFileRoute("/path")({ head, component })`.
- **Server functions**: one file per domain in `src/lib/*.functions.ts`
  (`study.functions.ts`, `exam.functions.ts`, `admin.functions.ts`,
  `invite.functions.ts`).
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

## Commands

- `bun dev` — start the dev server.
- `bun run lint` — ESLint (flat config, TypeScript + react-hooks +
  react-refresh + Prettier).
- `bun run build` — production build (Vite + Cloudflare plugin).

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
- Phone-number sign-in from the design needs a Supabase SMS provider; joining
  uses email for now.
- Faculty console: per-option reasoning, highlighted source passages and
  learning-objective coverage need `generate-content` to store them first.
- No payment/subscription layer — access is invite-code gated
  (`invite_codes` table, `internal` vs `external` `student_type`), not
  billed.
- Automated coverage is currently limited to focused Vitest unit/regression
  tests; continue to run `bun run test`, `bun run lint`, and `bun run build`.
- `tutor-practice` and `award-badges`/`backfill-question-options` edge
  functions exist but are thinner/ops-oriented; not documented in depth
  here — read them directly before modifying.
- No offline write queue — the service worker deliberately never
  intercepts POST/PUT/PATCH/DELETE, so writes (quiz submits, reviews,
  tutor questions) simply fail offline rather than syncing later.
- Curriculum API responses are not yet stored for offline reading. Add an
  explicit, account-scoped IndexedDB download flow rather than restoring a
  shared runtime cache for authenticated Supabase REST requests.
