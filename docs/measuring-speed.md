# Measuring speed

Florence times every server function. Each response carries a
`Server-Timing` header, the server logs one JSON line per call, and staff see
the last day's timings on **Faculty → Diagnostics**. This page is the
checklist for measuring real timings on a phone on Pakistani mobile data.

## What the numbers mean

- **Total**: how long the phone waited for a request, from sending it to the
  last byte arriving. This is what a student feels.
- **Server**: time spent inside the server function (Cloudflare), including
  its Supabase requests.
- **Network**: total minus server. The mobile network, the distance to
  Cloudflare and the phone itself.
- **Waits**: Supabase requests that had to run one after another. Each one
  costs a full round trip between Cloudflare and the Supabase region, so this
  matters more than the number of requests. The hot paths now need 2 (4 for
  submitting a quiz). One more on every call means sign-in is being checked
  with Supabase each time (see "Sign-in check" below).

## Before you start (once)

1. Apply `supabase/migrations/20261010150000_server_timings.sql` to
   production. Without it, everything below still works except the
   "Server, last 24 hours" list, which says the update hasn't been applied.
2. Have a student account in the real batch with a few cards to review (a
   test student is best, so real progress isn't changed), and your faculty
   account.

## On the phone

1. Turn Wi-Fi off. Note the network (Jazz, Zong, Telenor or Ufone), 4G or 3G,
   the signal bars, the city and the time.
2. In Chrome, open `https://<Florence address>/cdn-cgi/trace` and note the
   `colo=` line: the Cloudflare data centre serving the phone (KHI Karachi,
   LHE Lahore, ISB Islamabad; anything else means traffic leaves Pakistan).
3. Open Florence and sign in as the test student.
4. Go to `https://<Florence address>/speed` and tap **Clear**. Then tap
   **Today** in the bottom bar.
5. Use the app as a student would:
   - wait for Today to load,
   - **Start review**, rate 5 cards, and let the session-complete screen
     appear,
   - open **Batch**,
   - open a chapter, take its quiz (5 questions) and see the results.
6. Go back to `/speed` and tap **Refresh**. Tap **Copy as text** and paste it
   into a note or message, or take a screenshot.
7. Repeat steps 4 to 6 twice more, once in the evening (8 to 11 pm, when
   networks are busiest).
8. Sign in as faculty (on the phone or a laptop) and open **Faculty →
   Diagnostics → Server, last 24 hours**. Screenshot it. It covers every
   student's requests, not just yours.

## Reading the results

- **Total much larger than server** (for example 1,200 ms total, 150 ms
  server): the network is the cost. Server changes won't help much; fewer
  requests per screen and caching would.
- **Server time large, waits 2 or more**: Supabase round trips are the cost.
  Divide server time by waits to estimate one round trip between Cloudflare
  and Supabase. If that is over about 50 ms, running the Worker
  near Supabase (Cloudflare placement, explained in the pull request that
  added this page) would help.
- **Slow far above typical** on the faculty list: occasional slow requests
  (cold starts, busy database, retries on a weak signal). Worth a look if it
  is several seconds.
- **getProgressSnapshot shows 3 waits instead of 2**: see "Sign-in check".

## Sign-in check

Every server function first confirms who is signed in. If the project signs
sessions with its shared secret (the older setting; the public key in `.env`
is of that kind), supabase-js asks Supabase Auth on every call, which is one
more wait. Supabase's asymmetric "JWT signing keys" let the server check the
session itself after fetching the public keys once. It's a project setting
(Supabase dashboard → Project Settings → JWT Keys), so changing it is a
decision for whoever manages the project on Lovable Cloud.

## Where the Supabase project runs

The region isn't in this repository's config or environment: `.env` holds
only the project id and URL, which don't name it. To find it:

- Supabase dashboard → Project Settings → General → Region, or
- the database connection string (for example the
  `LOVABLE_DB_MIGRATION_URL` that `drizzle.config.ts` reads): a pooler host
  such as `aws-0-ap-south-1.pooler.supabase.com` names the region
  (`ap-south-1` is Mumbai), or
- ask Lovable support.

## For developers

- `src/lib/server-timing.ts` (global middleware, first in `src/start.ts`) and
  `src/lib/timing.server.ts` time each call and count requests to
  `SUPABASE_URL` by wrapping `fetch`. `src/lib/timing.ts` holds the pure
  parts (tested in `timing.test.ts`).
- Rows go to `public.server_timings` after the response is sent (Workers
  `waitUntil`); about three days are kept. No user ids, names or answers.
- Log lines look like
  `{"event":"server_fn","fn":"getProgressSnapshot","ms":182.4,"supabase_calls":8,"supabase_waits":2,"supabase_ms":150.1,"ok":true}`.
- Locally, `E2E_SERVER_LOGS=1 npm run test:e2e` prints them, and Chrome
  DevTools shows the header under Network → Timing.
- `/speed` is unlisted and open to any signed-in user; it reads only this
  tab's timings, kept in sessionStorage by `src/lib/phone-speed.ts`.
