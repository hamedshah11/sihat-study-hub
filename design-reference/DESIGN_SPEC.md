# Sihat redesign: implementation spec

This is the brief for restyling the Sihat student app. The mockups in
`design-reference/student/` show every screen at 390 × 844 (open any
`.html` file in a browser; links between them work), with PNGs in
`design-reference/screenshots/`. This file explains the
system behind them and where each piece goes in the code.

**Scope: visual only.** Do not change server functions, edge functions,
RLS, XP, streak or FSRS logic. The one data change is a `colour` column
on `subjects` (section 3). Everything in `CLAUDE.md` still applies,
including British spelling in all copy.

**Mockup content is sample data.** Names, numbers and chapter text in the
mockups are placeholders. Always render real data from the existing
queries. If a mockup shows something the app has no data for, leave it
out rather than inventing it (each case is called out below).

---

## 1. Design tokens

Replace the current palette in `src/styles.css` (warm neutral + navy +
teal). Teal is removed entirely: every `accent` use becomes the cobalt
primary. Keep the existing token names so shadcn/ui components follow
automatically, and add the new ones below.

### Light (`:root`)

| Token | Value | Use |
|---|---|---|
| `--background` | `#EEF3FB` | App background (cool ice blue) |
| `--card`, `--surface`, `--popover` | `#FFFFFF` | Cards, sheets |
| `--foreground` | `#0B1F3F` | Body text, headings |
| `--muted-foreground` | `#5A6B88` | Secondary text |
| `--border`, `--input` | `#DCE4F2` | Hairlines, inputs |
| `--primary` | `#1F4FD8` | Cobalt. Buttons, active nav, links |
| `--primary-deep` | `#163C9E` | Pressed states, text on tints |
| `--primary-tint` | `#DCE7FB` | Tinted tiles, tab bar background |
| `--primary-tint-2` | `#C5D6F6` | Progress tracks, inactive bars |
| `--primary-foreground` | `#FFFFFF` | |
| `--accent` | same as `--primary` | Kept for shadcn compatibility |
| `--ring` | `#1F4FD8` | Focus ring |
| `--streak` / `--streak-bg` / `--streak-ink` | `#F97316` / `#FFF1E6` / `#B84708` | Streak and XP only |
| `--success` / `--success-bg` / `--success-ink` | `#16A06A` / `#E2F5EC` / `#0E6B47` | Correct answers, done chapters |
| `--destructive` / `--destructive-bg` / `--destructive-ink` | `#E0533F` / `#FDECEA` / `#B42318` | Wrong answers, "Again" |
| `--warning-bg` / `--warning-ink` | `#FFF4E0` / `#8A4B00` | Exam-trap callouts, "Hard" |

### Dark (`.dark`, see section 6)

| Token | Value |
|---|---|
| `--background` | `#07111F` |
| `--card`, `--surface`, `--popover` | `#0E1C33` |
| `--foreground` | `#EAF1FF` |
| `--muted-foreground` | `#93A6C6` |
| `--border`, `--input` | `#1C3154` |
| `--primary` | `#2E66EA` |
| `--primary-tint` | `#13284A` |
| `--primary-tint-2` | `#1C3862` |
| `--primary-deep` (text on tints) | `#A9C4FF` |
| `--streak-bg` / `--streak-ink` | `#2A1A0E` / `#FDBA74` |

Derive dark success, destructive and warning pairs the same way (dark
tinted background, light ink) and check them for 4.5:1 contrast.

### Shape and depth

- Radius: cards 20px, large cards and heroes 24 to 30px, buttons and inputs
  16px, icon tiles 12 to 14px, chips and pills fully rounded. Set
  `--radius: 1rem`.
- Borders: 1px `--border` on white cards. No border on coloured fills.
- Shadows: soft and rare. `0 10px 30px rgba(11,31,63,.08)` on floating
  items (bottom nav, flashcard, notes card over a colour band). Nothing
  else needs a shadow.
- Remove `.hero-gradient`, `.progress-shine` and the `AmbientBackdrop`
  blobs in `AppShell.tsx`. The new look uses flat colour, not gradients.

### Typography

Replace Sora and Inter:

- **Display: Instrument Serif** (400, and italic for the odd accent word).
  Used only for screen titles and "moment" text: greetings, page `h1`s,
  chapter titles, flashcard questions, quiz questions, the results
  headline. Sizes 30 to 42px, line-height about 1.05.
- **Body: Plus Jakarta Sans** 400 / 500 / 600 / 700. Everything else.
  Body 14 to 15px, labels 12 to 13px, eyebrows 11 to 12px uppercase with
  `letter-spacing: .04em` to `.08em`.

Load both from Google Fonts in the root route head, with system fallbacks.
Use `tabular-nums` for counters, XP and percentages.

---

## 2. App shell and navigation (`src/components/AppShell.tsx`)

Mockup: bottom of `02-home.html`.

- Floating bottom bar: 16px from the sides, 20px above the safe area,
  64px tall, white card, 22px radius, soft shadow.
- **Active item** is a cobalt pill (44px tall) showing icon + label in
  white. **Inactive items** are icon only (46 × 44 touch target) in
  `--muted-foreground`, with an `aria-label`.
- Animate the pill between items (width and background, 200 to 250ms
  ease-out).
- Admin/instructor still get the extra Admin item.
- **Focus mode:** hide the bottom nav while a flashcard session, quiz or
  exam is running (not on the chapter notes). A close (×) button top left
  exits.
- Desktop side nav: same tokens, cobalt active state, new logo tile
  (cobalt square with a serif "S").

---

## 3. Subject colours

Each subject has a colour **family**. The subject colour is used for
subject content (headers, progress, subject buttons). App chrome (nav,
primary actions outside a subject) stays cobalt. Semantic colours
(success, destructive, warning, streak) never change with the subject.

### Palette

| Key | Fill | Tint | Ink on tint | Dark tint | Dark ink |
|---|---|---|---|---|---|
| `cobalt` | `#1F4FD8` | `#DCE7FB` | `#163C9E` | `#13284A` | `#A9C4FF` |
| `violet` | `#6D4AE8` | `#ECE6FF` | `#4B2DB8` | `#231A4A` | `#C9B8FF` |
| `pink` | `#BE185D` | `#FCE7F1` | `#9D174D` | `#3A1226` | `#F9A8D4` |
| `mint` | `#0B7A6E` | `#D8F3EF` | `#0B6B61` | `#0A2E2B` | `#7EDCCF` |
| `sky` | `#0369A1` | `#DDF1FB` | `#075985` | `#0C2A3D` | `#8FD3F7` |
| `indigo` | `#4338CA` | `#E3E2FB` | `#3730A3` | `#1C1B45` | `#B7B4FA` |
| `aqua` | `#0E6E8C` | `#D6F3F8` | `#0E6377` | `#0B2A33` | `#86DDEE` |
| `slate` | `#475569` | `#E8EDF3` | `#334155` | `#1E2633` | `#CBD5E1` |

Every fill passes 4.5:1 with white text. Also define a second, lighter
tint per family for stacked shapes and progress tracks (mix the fill
about 25% into white).

### Family assignment (HEC BSN 2024 curriculum)

| Key | Family | Courses |
|---|---|---|
| `cobalt` | Clinical nursing | Fundamentals of Nursing I and II, Medical Surgical Nursing I and II, Critical Care Nursing, Clinical Practicum |
| `violet` | Body and disease | Anatomy and Physiology I and II, Pathophysiology I and II, Health Assessment I and II |
| `pink` | Care across the lifespan | Pediatric Health Nursing, Maternal Neonatal and Child Health Nursing, Mental Health Nursing, Geriatric Nursing |
| `mint` | Microbes and public health | Microbiology, Infectious Diseases, Public Health Nursing |
| `sky` | Drugs and chemistry | Biochemistry, Applied Nutrition, Clinical Pharmacology and Drug Administration I and II |
| `indigo` | Language and teaching | English (Functional English), Professional Communication Skills, Expository Writing, Principles of Teaching and Learning |
| `aqua` | Numbers and research | Information and Communication Technology, Quantitative Reasoning I, Introduction to Biostatistics, Epidemiology, Introduction to Nursing Research |
| `slate` | Society, ethics and profession | Ideology and Constitution of Pakistan, Islamic Studies / Ethics, Theoretical Basis of Nursing, Applied Psychology, Professional Ethics for Nurses, Civics and Community Engagement, Culture Health and Society, Leadership and Management, Entrepreneurship, Trends and Issues in Health Care, Electives |

### Data

1. New migration in `supabase/migrations/`: add
   `subjects.colour text not null default 'cobalt'` with a check
   constraint limiting it to the eight keys above. Backfill existing rows
   by name (case-insensitive `ilike` matches on the course names above).
   Migrations are applied by hand in the Supabase SQL editor after merge,
   so make it idempotent (`add column if not exists`, guarded constraint)
   and put the backfill in the same file.
2. Update `src/integrations/supabase/types.ts` for the new column.
3. Admin: wherever a subject is created or edited in `/admin`, add a
   select for the colour (eight swatches). If there is no subject edit
   form yet, the backfill is enough for now; do not build a new admin
   screen for this.

### Implementation

- Add `src/lib/subject-colours.ts` exporting the palette, a
  `SubjectColour` type and a helper that returns the CSS variables for a
  key (falls back to `cobalt` for unknown values).
- Set them as CSS variables on a wrapper element: `--subject`,
  `--subject-deep`, `--subject-tint`, `--subject-tint-2`,
  `--subject-ink`, with dark values under `.dark`. Register them in the
  `@theme inline` block (`--color-subject: var(--subject)` etc.) so
  Tailwind classes like `bg-subject` and `text-subject-ink` work.
- Apply the wrapper on: subject page, chapter page (all tabs), flashcard
  sessions, quizzes and results, exam mode, and on each subject card or
  row in lists.

---

## 4. Motion

Keep it minimal and purposeful. All of it goes in `src/styles.css`
(reuse the existing `animate-fade-up`, `stagger-*`, `animate-flame`,
`animate-float-slow` classes) plus small transitions. No new animation
library.

| Motion | Where | Spec |
|---|---|---|
| Fade up, staggered | First paint of every screen's cards | 14px, 500 to 600ms, `cubic-bezier(.22,1,.36,1)`, 60ms steps |
| Ring draw | Level ring, subject mastery ring, quiz results | `stroke-dashoffset` from empty, 1.4s |
| Bar fill | Progress bars | `scaleX` from 0, origin left, 1.1s |
| Column grow | Progress weekly chart, leaderboard podium | `scaleY` from 0, origin bottom, staggered |
| Flame pulse | Streak pill | existing `animate-flame` |
| Slow float | One decorative circle on the home hero, confetti bits on results | existing `animate-float-slow` |
| Flashcard flip | Reveal answer | 3D `rotateY(180deg)`, 450ms, `backface-visibility: hidden` |
| Pop | Correct quiz option, XP pill on results | scale .94 → 1.04 → 1, 500ms |
| Press | Every tappable card and button | `active:scale-[.98]`, 120ms |
| Typing dots | Tutor while waiting | three dots, opacity pulse, 1.2s, staggered |
| Nav pill | Bottom nav active item | width/background transition 200 to 250ms |

Everything is disabled under `prefers-reduced-motion: reduce` (extend the
existing media query). Keep the existing `celebrate()` confetti for
level-ups and quiz passes.

---

## 5. Screens

Each item names the route file, the mockup, and what changes. Keep all
existing data fetching and behaviour unless noted.

### Home: `src/routes/_authenticated/home.tsx` (mockups `02-home.html`, `02b-home-dark.html`)

Goal: much calmer. Three blocks only.

1. **Header:** "Good evening," (small, muted) over the first name in
   serif 40px. Streak pill on the right (orange tint, pulsing flame).
2. **Today hero:** cobalt card, 30px radius, about 250px tall. Eyebrow
   "Today", the headline number (due card count, or the recommendation
   from the existing `recommendation` logic), a line under it with the
   estimate from `estimateMinutes`, and a full-width white "Start
   studying" button that calls the existing `startStudying()`. Decorative
   overlapping circles in the top right: sky `#38BDF8`, violet `#8B5CF6`
   (floating slowly), mint `#2DD4BF`. Handle the `empty` recommendation
   with the same card saying "You're all caught up" and a "Browse
   subjects" button.
3. **Continue learning:** heading with an "All subjects" link, then a
   horizontally scrolling row (scroll-snap) of subject cards, 150 × 170px,
   each filled with its subject colour: icon tile, short subject name,
   next chapter line, white progress bar. Order by most recent activity.
   Tapping opens the next unfinished chapter (or the subject page if none).
   Data: current semester subjects (already fetched for `nextChapter`),
   progress = completed published chapters / published chapters, from
   `chapter_progress`.
4. **Leaderboard line:** one slim row, trophy icon tile, "#3 this week ·
   40 XP to pass Hira", chevron. Use the existing `peek` data; hide if
   there is none.

Removed from home: the level bar (it lives on Progress), and the four
secondary tiles (Continue chapter, Review flashcards, Take a quiz, Ask
tutor). Keep `InstallPrompt` above the hero when it shows. **Keep the
mistakes entry point:** when mistakes are due, show one slim row under
the hero ("Fix 5 mistakes", orange rotate icon) linking to `/review`.

### Subjects: `src/routes/_authenticated/subjects/index.tsx` (`03-subjects.html`)

Serif title "Subjects" with the semester as an eyebrow. Filter chips:
All / In progress / Not started (client-side filter). Each row: 44px
icon tile filled with the subject colour, name, "12 chapters · 6 done",
percentage (or a "New" chip at 0%), and a thin progress bar in the
subject colour.

### Subject: `src/routes/_authenticated/subjects/$subjectId.tsx` (`04-subject-detail.html`)

A full-width header band in the subject colour (bottom corners 34px)
with decorative circles, a translucent back button, an uppercase eyebrow
(semester), the subject name in white serif, a white mastery ring,
"3 of 10 chapters done", and a white "Practice exam" button linking to
the existing exam route. Below: chapter list. Done chapters get a green
check badge and "Mastery 91%". The current chapter gets a 2px subject
colour border, a soft coloured shadow and a filled number badge. Later
chapters get a tinted number badge. The mockup's textbook line under the
title is not in the data; leave it out.

### Chapter: `src/routes/_authenticated/chapters/$chapterId.tsx` (`05-chapter-notes.html`)

- Subject colour header band (about 300px): 4px reading-progress bar at
  the very top (white on translucent, tracks scroll position of the
  notes), translucent back and tutor buttons, eyebrow
  "A&P I · CHAPTER 4", chapter title in white serif 40px.
- Tabs sit inside the band as a translucent white pill; the active tab is
  solid white with subject-deep text. Keep the existing tab set and
  `?tab=` behaviour (Notes, Quiz, Cards, Diagrams, Tutor). The mockup
  shows a Videos tab; ignore that and keep the real tabs.
- The notes card is white and overlaps the bottom of the band by about
  24px, with a soft shadow.
- Markdown styling: `h2` 18px bold, paragraphs 14.5px / 1.65, tables with
  borders and padding. Style `blockquote` as the amber exam-trap callout
  (warning tint, bulb icon).
- Restyle `NextStepCard` as the dark "Done reading?" bar (subject-deep
  background, white "Review" button) at the end of the notes.
- The three stat tiles in the mockup are sample content, not a component.

### Flashcards: `src/components/ChapterFlashcards.tsx` (`08-flashcards.html`)

Focus mode (no bottom nav). Top row: close button, progress bar in the
subject colour, "7 / 18". Eyebrow with a small subject icon tile and
"THE SKELETON · A&P I". The card: white, 28px radius, with two tinted
cards stacked behind it (offset 12px and 24px). Question in serif 30 to
32px. Tapping flips the card (3D) to the answer. Rating buttons in a
4-column grid, 62px tall:

- Again: destructive tint · Hard: warning tint · Good: subject fill,
  white text · Easy: success tint.
- Under each label show the next interval ("1 min", "1 day"). Compute it
  for display only by calling `schedule(prev, rating)` from
  `src/lib/spacedRepetition.ts` for each rating. Do not write anything;
  the real review still goes through `recordReview`.

### Quiz: `src/components/ChapterQuiz.tsx` (`06-chapter-quiz.html`, `07-quiz-results.html`)

Focus mode. Top: close button and a segmented progress bar (one segment
per question: success for right, destructive for wrong, subject fill for
current, subject tint for upcoming). Eyebrow "QUESTION 4 OF 10", question
in serif 30 to 32px. Options are 58px rows with a letter badge. Keep the
existing flow: pick an option, tap Check, see feedback, then Next (the
mockup shows the state after Check). After checking: the correct option turns success (tint, 2px border, check
badge, pop); a wrong pick turns destructive; the others fade to 70%.
Feedback box in the subject tint. Full-width "Next question" button in
the subject fill.

Results: large ring (score / total) in the subject colour, serif headline
("Nicely done" for a pass; pick gentler copy below the pass mark), the
new chapter mastery line, "+80 XP" orange pill with pop, three stat tiles
(Correct, Missed, Time), then "Review N mistakes" (subject fill) and
"Back to chapter" (white). Show only stats you have; if time is not
tracked, drop that tile.

Apply the same look to exam mode (`src/components/exam/*`) and to
`/review`.

### Tutor: `src/routes/_authenticated/tutor.tsx` and `src/components/ChapterTutor.tsx` (`09-tutor.html`)

Serif title, chapter picker as a white pill button. User bubbles: cobalt,
white text, 20px radius with the bottom-right corner 6px. Tutor bubbles:
white card with a small sparkle avatar tile, the top-left corner 6px, and
a "From chapter 7 notes" source chip if the response has a source.
Typing indicator with three dots while waiting. Suggestion chips above
the input ("Quiz me on this", "Give me a mnemonic", "Explain simply")
that send that text. Input: 56px, white, 18px radius, cobalt send button.

### Progress: `src/routes/_authenticated/progress.tsx` (`10-progress.html`)

Cobalt level card (level, name, XP bar in white, "140 XP to level 8").
Four stat tiles in a 2 × 2 grid with tinted icon tiles (streak, cards
reviewed, quiz average, study time). A weekly bar chart (today in cobalt,
other days in tint-2). A badges row (earned: tinted circle, locked:
dashed circle with a lock). Only show tiles and charts backed by data
the page already loads; drop the ones that aren't.

### Leaderboard: `src/routes/_authenticated/leaderboard.tsx` (`11-leaderboard.html`)

Serif title with the batch name. Week / All time segmented control only
if the data supports both; otherwise keep the current single view. Podium
for the top three (1st in the middle, cobalt, tallest; columns grow in).
Highlight the current user. A tinted nudge line ("40 XP more to pass
Hira"). The rest as slim rows.

### Profile: `src/routes/_authenticated/profile.tsx` (`12-profile.html`)

Cobalt avatar tile with serif initials, name, batch line. Three stats in
one card (Level, Total XP, Day streak). Settings in grouped white cards
with 56px rows. Keep every existing setting. Add a **Dark mode** toggle
(section 6). Log out in its own card, destructive text.

### Log in, sign up, reset password: `src/routes/login.tsx`, `signup.tsx`, `reset-password.tsx` (`01-login.html`)

Cobalt logo tile, serif headline "Study smarter for every *shift.*"
(italic word in cobalt), one line of supporting text, 52px inputs with
leading icons, full-width cobalt button. Decorative tinted circles and a
small tilted, floating flashcard in the top right. Apply the same layout
to sign up and reset password.

---

## 6. Dark mode

`styles.css` already declares `@custom-variant dark (&:is(.dark *))`.

- Add the dark token values under `.dark` (section 1 and the subject
  palette).
- Add a small theme helper: preference `system` / `light` / `dark`,
  stored in `localStorage`, applying the `dark` class on `<html>`.
  Default `system` (follows `prefers-color-scheme`). Apply it before first
  paint (inline script in the root document) to avoid a flash.
- Profile gets a toggle. Mockup `02b-home-dark.html` shows the dark look.

---

## 7. Rollout (one PR per phase)

1. **Foundation:** tokens, fonts, dark mode helper, remove gradients and
   backdrop, AppShell nav and focus mode. The whole app should already
   look mostly right after this.
2. **Subject colours:** migration, types, `subject-colours.ts`, theme
   wrapper, subjects list and subject page.
3. **Home.**
4. **Study flow:** chapter page, flashcards, quiz and results, review,
   exam mode.
5. **The rest:** tutor, progress, leaderboard, profile, log in, sign up,
   reset password, admin touch-ups (tokens only, no redesign).

## 8. Checks for every PR

- `bun run lint` and `bun run build` pass.
- Checked at 390px wide in light and dark, and with reduced motion on.
- Text contrast at least 4.5:1 (3:1 for 24px+ text), touch targets at
  least 44px, visible focus states, icon-only buttons have `aria-label`.
- No changes to server functions, edge functions, RLS or scoring logic.
- British spelling in all copy.
- Bump `CACHE_VERSION` in `public/sw.js` so students get the new assets.
