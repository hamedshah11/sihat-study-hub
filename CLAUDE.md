# Sihat

Sihat is a mobile-first PWA study companion for BSN (Bachelor of Science in
Nursing) students at Sindh Institute, Karachi, following the Pakistani
HEC/PNMC curriculum. Students read chapter notes, take quizzes, review
flashcards on a spaced-repetition schedule, ask an AI tutor scoped to the
current chapter, and track XP/streaks/leaderboard progress against their
batch.

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
  (stale-while-revalidate for HTML and Supabase REST GETs, cache-first for
  static assets). Bump `CACHE_VERSION` on every deploy.

## Security model — read this before touching progress/gamification tables

`xp_events`, `streaks`, `quiz_attempts`, `chapter_progress`,
`flashcard_reviews` and `tutor_messages` are **read-only from the browser**.
RLS on these tables (see
`supabase/migrations/20260614170000_lock_progress_integrity.sql`) grants
authenticated users `SELECT` only (`auth.uid() = user_id`); admins get full
access via `is_admin()`. There is no client-writable policy — this was a
deliberate fix for a bug where the browser could forge XP/streaks/quiz
scores directly from devtools.

**Never propose a client-side `.insert()`/`.update()`/`.upsert()` against any
of those six tables.** All writes go through one of two trusted paths, both
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
   mirrored in `study.functions.ts`) — never let a caller pick their own XP
   value.

Streaks roll over at **Pakistan Standard Time midnight** (UTC+5, no DST) —
see `pakistanDate()` / `pktDate()` in both places above. Keep both in sync
if you change the rollover logic.

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

## Conventions

- **Routes**: file-based under `src/routes/`, mirroring URL structure.
  `_authenticated.tsx` is a pathless layout route gating everything under
  `src/routes/_authenticated/` (home, subjects/$subjectId, chapters/$chapterId,
  progress, leaderboard, profile, tutor, admin/*). Each route file exports
  `Route = createFileRoute("/path")({ head, component })`.
- **Server functions**: one file per domain in `src/lib/*.functions.ts`
  (`study.functions.ts`, `admin.functions.ts`, `invite.functions.ts`).
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
  (`InstallPrompt.tsx`); no web-push subscription/backend exists yet.
- No payment/subscription layer — access is invite-code gated
  (`invite_codes` table, `internal` vs `external` `student_type`), not
  billed.
- No automated tests (no test runner configured in `package.json`) —
  verification is manual + `bun run lint` + `bun run build`.
- `tutor-practice` and `award-badges`/`backfill-question-options` edge
  functions exist but are thinner/ops-oriented; not documented in depth
  here — read them directly before modifying.
- No offline write queue — the service worker deliberately never
  intercepts POST/PUT/PATCH/DELETE, so writes (quiz submits, reviews,
  tutor questions) simply fail offline rather than syncing later.
