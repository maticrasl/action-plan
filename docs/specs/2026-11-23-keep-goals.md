# Keep goals (feature 07)

Built from `docs/features/07-keep-goals.md`; this records only what the build decided.

## Data

`goal.keep = { min?, max? }`, numbers. Present only on keep goals. `normalize` keeps numbers
(a numeric string becomes a number) and drops a `keep` with neither, or with `min >= max`. A keep
goal saved by the form stores no `baseline`, `current`, `target` or `progress`. Templates keep
`keep` (it is not personal). Plan data only: no new storage key, sync file version unchanged (the
field rides along like `cost`; the later edit wins whole). Fixture: `tests/fixtures/keep.storage.json`.

## Modules

- `core/keep.ts`: `inRange`, `validKeep`, `keepMarks` (one mark per complete period since the
  start), `keepShare`, `keepNow`, `isKeep`. Plain state: weeks, value at each Sunday, unknown when
  older than 28 days. Adds up: the goal's period; a period before the first entry is unknown.
- `core/progress.ts`: `smartCheck` (M: metric and a limit in order; T: a start date), `goalErrors`
  (no limit / wrong order stop a save), `goalProgress` (share), `goalCurrent`, `goalReached` (never),
  `goalState` (late only while out), `lowerBetter`, `hasPercent`. `core/pace.ts`: no pace.
- Tips: new `keep-out` (2 complete periods out in a row); `goal-past` and `too-many-goals` skip keep goals.
- `ui/forms/keep-form.ts`: kind choice, At least / At most, Until label, the draft from a reached goal.
- `ui/goal-card.ts`: share with ten marks, value and in/out/above/below/stale, Until / no end / Ended.
- `ui/plan-switcher.ts`: badge red while out of range, Until is no due date.
- `views/graphs/band.ts`: shaded range on line and period bar graphs; dots outside in the warning colour.
- `views/timeline/render.ts`: no end runs to the right edge (already fading, no end grip).
- `ui/closing.ts`: "Keep this result?" for a goal with a target measured by a state.

## Choices made while building

- The kind is a select, like "Progress from", not two radio buttons.
- "Counts: in total" on a state that adds up is refused under the Counts field.
- In the first period of a state that adds up, "at least" not yet met shows "Nothing measured yet"
  rather than "out": the period can still meet it.
- Range errors show under At least (the target field is hidden).

## Tests

Unit: `core/keep.test.ts`, keep cases in `progress.test.ts`, `normalize.test.ts`, `guidance/tips-a.test.ts`.
Page: `tests/browser/goals.keep.js` (form, card, badge, graph, total refused, offer, timeline).
