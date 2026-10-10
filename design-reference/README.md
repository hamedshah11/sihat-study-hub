# Florence design reference

The app's brand is **Florence**, powered by SIHAT ("Florence: BSN Nursing
Study", tagline "Watch your knowledge bloom."). Version 2 of the brand and
screens (10 October 2026, after an outside design review) is implemented in
this repo.

## Sources of truth

- Master brand book (v2, with review log): https://claude.ai/code/artifact/aeedd795-bdce-461e-b288-7686ef75740b
- Brand boards and app screens (six screen sheets): https://claude.ai/code/artifact/d32d940e-fcb1-48f3-ba76-50a935841d07
- Design canvas (masters for mark, lockups, boards, screens): https://claude.ai/artifact/PbAjCMkFXzSrw7zffn3oUu

These are private until shared from each page's Share menu.

## Where it lives in code

| Piece | File |
| --- | --- |
| Colour, type and shape tokens | `src/styles.css` |
| Mark, lockups, small-size mark | `src/components/brand/FlorenceMark.tsx`, `Lockup.tsx`, `rose-geometry.ts` |
| Progress rose and petal states | `src/components/brand/ProgressRose.tsx`, `StatusChip.tsx` |
| Mastery v1 | `src/lib/mastery.ts` |
| Themes (Light, Dark, Automatic) | `src/lib/theme.ts` |
| App icons, favicon, social card | `public/` (generated from the mark geometry) |

## Version 2 product rules

- Main button "Start review"; tab "Progress"; "days in a row" with a 4 am day boundary.
- Light, Dark or Automatic theme; Automatic is Lamplight mode 8 pm to 6 am and never switches mid-session.
- Today: the session card is the only filled card; the rose sits below as a summary.
- Batch: private by default, class totals and your own week; opt-in study circle of up to five friends, unsorted, no scores.
- At most one opt-in reminder a day (stored; sending isn't built yet).
- Join with a batch code; confirm college, programme and semester before anything is saved.
- Status is neutral chips with a glyph and a word; petal colours identify subjects only.
- Mastery v1 = 60% FSRS recall + 40% recent quiz scores over started chapters; "In bloom" needs evidence.
- Faculty: a chapter publishes only when its checklist passes; student reports block approval.
- Partner colleges: SIHAT stays on the lockup; the partner's name goes in the course header (to be tested with a real partner).

## Superseded

`student/`, `screenshots/`, `assets/` and `DESIGN_SPEC.md` describe the
earlier cobalt redesign of "Sihat". They are kept for history only; don't
build from them.
