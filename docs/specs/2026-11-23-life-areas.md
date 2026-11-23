# Life areas (feature 03)

What: an optional **Area** on a vision, its tag on the vision card, and a **Tree · Areas** switch on
the Visions view. The plan is `docs/features/03-life-areas.md`; this file records only what the
build settles or changes.

## Data shape

- Vision: `area?: string`. `normalizeVisions` keeps a string, drops anything else. An empty area is
  not stored. Older copies keep the unknown field (items are kept whole), so nothing is lost.
- Device preference `visionsMode`: `'tree' | 'areas'` (missing means tree).
- Device preference `hiddenAreas`: names hidden from "Nothing here yet" (compared ignoring case).
- Fixture `tests/fixtures/areas.storage.json`: a vision with an area, a goal with a category, both
  preferences.

## Rules settled here

- **Counting effort.** Each done step, ticked list item and ticked routine day in the last 30 days
  (today and the 29 days before it) is one event. It reaches the goals (not paused, and for an
  achieved goal only on or before the day it was achieved) whose tree holds it
  (`treeActivities`). Each such goal gives the event `1 / its number of areas` for each of its areas;
  an area takes the largest of these. So a step for a Health goal and a Finance goal counts for
  both, a step for a goal and its sub-goal in the same area counts once, and a goal in two areas
  gives half to each. The count shown is the number of events reaching the area; the bar is the
  area's share of all the weights.
- A vision's area is its own `area` only; a narrower vision does not take the area of the one above.
- Context menus are replaced by visible buttons, which work the same with a finger: a ✎ button on a
  block (Rename area…, asked with the browser's text prompt, like a user's name) and a × button on
  each "Nothing here yet" chip (Not for me).
- Rename: visions saved as usual; goal categories through `editPlan` for each other plan, all in
  one `undoable` action. The "No area" block has no rename.
- "Rated" waits for feature 01 and is left out.

## Modules

`core/areas.ts` (rules), `core/visions.ts` (normalize), `ui/forms/vision.ts` and `ui/forms/form.ts`
(the field), `views/areas.ts` (the Areas side), `views/visions.ts` (switch, tag),
`views/events.ts` (clicks), i18n, Guide, help, one class D tip, styles.

## Tests

Unit (`core/areas.test.ts`): goal areas from visions, parent goal's visions, category, none;
names ignoring case and spaces; the 30-day edge; list items; routine days; two goals; one goal
in two areas; shares sum to 100; paused; achieved; sentences on both sides; rename in two plans.
Normalize: `area` kept as string, dropped otherwise. Page (`tests/browser/visions.areas.js`): area
on a vision shows a tag and a block; a tick changes the count; a chip opens the form filled in;
Not for me stays hidden after a reload; rename changes a goal in a plan that is not open, Undo
reverts it; escaped names; phone shot.
