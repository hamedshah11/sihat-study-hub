# Sihat redesign reference

Visual and interaction reference for restyling the student app. Translate
it into the existing React, Tailwind v4, shadcn/ui and TanStack Start code;
do not copy the HTML into production. **`DESIGN_SPEC.md` is the full
brief** (tokens, subject colours, per-screen notes mapped to route files,
rollout phases). This README says what was deliberately chosen and what is
open.

## What's here

- `student/` : 13 mobile screens, one self-contained HTML file each. Links
  between screens work. Every screen is a fixed 390 × 844 frame (element
  `#screen`).
- `screenshots/` : PNG of each screen at 390 × 844 (2x). These are the
  visual truth if the HTML renders differently.
- `assets/fonts/` : local copies of both fonts plus `fonts.css`
  (SIL Open Font License 1.1).
- `DESIGN_SPEC.md` : the implementation brief.

There are no images, illustrations or textures. Every decorative shape is
plain CSS (circles, tinted blocks) and every icon is an inline SVG.

**Not provided, because they weren't designed:** instructor or admin
screens, an offline screen, tablet or desktop layouts, and 360px variants.
Admin screens should only pick up the new tokens (no redesign). For
tablet and desktop, keep the current responsive behaviour (side nav from
`md`) with the new tokens. The layout should work down to 360px; the
fixed mockup frames just aren't drawn at that width.

## Overall direction

Calm, bright, modern study app for nursing students. Cool ice-blue
background, one cobalt blue as the app colour, a serif for titles, lots
of space, and one clear action per screen. Each subject gets its own
colour, and the chapter, flashcard and quiz screens take on that colour.

## Most important screens

1. Home (`02-home.html`)
2. Chapter notes (`05-chapter-notes.html`)
3. Flashcards (`08-flashcards.html`)
4. Quiz and results (`06-chapter-quiz.html`, `07-quiz-results.html`)
5. Subject detail (`04-subject-detail.html`)
6. Progress (`10-progress.html`)

## Must preserve (deliberate choices)

- **Cobalt blue `#1F4FD8` as the only app colour. Teal is removed
  completely**; the current teal accent becomes cobalt everywhere.
- **Subject colour families** (8 colours, table in `DESIGN_SPEC.md`
  section 3). Subject screens take the subject's colour; nav and app-level
  buttons stay cobalt.
- Semantic colours never change with the subject: green right, red wrong,
  amber exam traps, orange for streak and XP only.
- Instrument Serif for titles and "moment" text only; Plus Jakarta Sans for
  everything else.
- Floating bottom nav: active item is a cobalt pill with icon and label,
  inactive items are icons only.
- **Home has only three blocks:** Today card, Continue learning row of
  subject-coloured cards, one leaderboard line. (Plus a slim mistakes row
  when mistakes are due, which the mockup doesn't show.)
- Coloured header band on subject and chapter screens.
- **Focus mode:** no bottom nav during flashcards, quizzes and exams.
- Flashcard rating buttons show the next review interval.
- Rounded cards (20 to 30px), flat colour, no gradients, soft shadows only
  on floating elements.
- Dark mode (`02b-home-dark.html`).

## Open to interpretation

- Exact animation timings (the list of motions in the spec is the intent).
- Exact sizes and spacing within about 10%.
- Decorative circle positions and sizes.
- Icon choices, as long as they come from Lucide.
- Empty, loading and error states (use the new tokens, keep them simple).
- Desktop navigation details.
- Admin and utility pages.

## Must ignore (sample content in the mockups)

- All names, numbers and chapter text are placeholders. Use real data and
  leave out anything the app has no data for.
- The chapter screen shows a "Videos" tab. Keep the real tabs: Notes,
  Quiz, Cards, Diagrams, Tutor.
- The three bone-count tiles on the chapter screen are sample note content,
  not a component.
- The subject list filter chips are new; "In progress" and "Not started"
  are client-side filters.

## Fonts

- Heading: Instrument Serif 400 (and 400 italic for one accent word on log in)
- Body: Plus Jakarta Sans 400, 500, 600, 700

## Colours

- Primary: `#1F4FD8` (deep `#163C9E`, tint `#DCE7FB`, tint 2 `#C5D6F6`)
- Background: `#EEF3FB`
- Surface: `#FFFFFF`
- Text: `#0B1F3F`, muted `#5A6B88`
- Border: `#DCE4F2`
- Streak and XP: `#F97316` on `#FFF1E6`, text `#B84708`
- Success: `#16A06A` on `#E2F5EC`, text `#0E6B47`
- Wrong: `#E0533F` on `#FDECEA`, text `#B42318`
- Exam trap: `#FFF4E0`, text `#8A4B00`
- Dark mode and the 8 subject colours: `DESIGN_SPEC.md` sections 1 and 3

## Icons

The inline SVGs are Lucide-style strokes. Use these Lucide icons:
Home → `House`, Subjects → `BookOpen`, Tutor → `Sparkles`, Progress →
`TrendingUp`, Profile → `User`, streak → `Flame`, flashcards → `Layers`,
quiz → `ClipboardCheck`, leaderboard → `Trophy`, mistakes → `RotateCcw`,
exam trap → `Lightbulb`, practice exam → `Clock`, FON → `HeartPulse`,
A&P → `PersonStanding`, Microbiology → `Microscope`, Biochemistry →
`FlaskConical`, English → `Type`, Ideology → `Landmark`, plus `ArrowRight`,
`ArrowLeft`, `ChevronRight`, `ChevronDown`, `X`, `Check`, `Send`, `Search`,
`Moon`, `Bell`, `Target`, `Download`, `CircleHelp`, `LogOut`, `Lock`,
`Mail`, `Star`. Subjects keep using the existing `subjects.icon` column.

## Intended interactions

- Home "Start studying" runs the existing recommendation (`startStudying()`).
- A subject card on home opens that subject's next unfinished chapter.
- Tapping a subject in the list opens its chapters.
- The current chapter in a subject is highlighted; tapping a chapter opens
  it on the Notes tab.
- "Practice exam" on the subject header opens the existing exam route.
- Chapter tabs switch via `?tab=` as today.
- The top bar on the chapter screen shows reading progress (scroll
  position).
- "Done reading? Review" at the end of the notes opens the Cards tab.
- Flashcards: tap the card to flip it to the answer (3D flip), then rate
  Again / Hard / Good / Easy.
- Chapter quiz keeps the current flow: pick an option, tap Check, see
  feedback on that question, then Next. The mockup shows the state after
  Check. Exam mode still grades at the end.
- Quiz results: "Review N mistakes" opens the mistakes review; "Back to
  chapter" returns to the chapter.
- Tutor suggestion chips send that text as a message.
- Leaderboard line on home opens the leaderboard.
- Profile dark mode toggle switches the theme (system / light / dark).
- Close (×) on flashcards and quizzes exits focus mode back to the chapter.
