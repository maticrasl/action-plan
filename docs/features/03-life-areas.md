# 3. Life areas and balance

**Goal:** see at a glance which parts of life the plans cover, where the effort goes, and which
parts are empty. Goals have a category today; visions have nothing, and there is no view of the
whole.

Needs `00-foundation.md` (`editPlan`) and `13-done-log.md` (dates of done steps).

Read `README.md` first (decisions 7 and 8).

## What the user sees

### An area on a vision

The vision form gets a field **Area**, a text field with suggestions, exactly like "Category" on
the goal form and with the same suggestions (Health, Finance, Career, Learning, Relationships,
Travel, Home) plus the areas already used. Optional.

A vision card shows its area as a small tag.

### The Areas view

The Visions view gets a switch above its content: **Tree · Areas**. Tree is the view as it is.
Areas:

```
 Most of your effort in the last 30 days went to Health. Relationships has a vision and no
 active goal.

 HEALTH                                             rated 6 on 2 Nov  (was 5)
   ◇ To be fit and live healthily
   3 active goals · 14 steps and routine days in 30 days        ████████████░░░  64 %

 FINANCE                                            rated 4 on 2 Nov
   ◇ To live without money worries
   1 active goal · 5 steps and routine days                     ████░░░░░░░░░░░  23 %

 RELATIONSHIPS                                      not rated
   ◇ To be a present father
   No active goal                                               [ What is next? ]

 NO AREA
   ◇ To keep learning
   1 active goal · 3 steps and routine days                     ██░░░░░░░░░░░░░  13 %

 NOTHING HERE YET
   Career · Learning · Travel · Home                            tap one to add a vision
```

- One block per area that has a vision or a goal. Order: by effort, most first; areas without
  effort after them by name; "No area" last.
- In a block: its visions (tags, tap to open), the number of active goals, the effort count and
  a bar with its share of all effort.
- **Rated**: the latest rating from the discovery exercise "Where things stand" (01), with its
  date and the rating before it. "not rated" when there is none. Without feature 01 built, leave
  the right-hand text out.
- **Nothing here yet**: the suggested areas that no vision and no goal uses. Tapping one opens
  the new-vision form with that area filled in. Each can be hidden ("Not for me", from its
  context menu); hidden ones stay away on this device.
- Two sentences at most above the list, chosen by the rules below. None when there is nothing
  to say.
- A block's menu offers **Rename area…**, which renames it on every vision and on every goal
  category that has the same text, in all plans.
- The switch remembers its position.

## Rules

### What an area is

- A vision's area is its `area` text, trimmed. Empty means none.
- A goal's areas are the areas of the visions it serves (`goalVisionIds`, which includes those
  of the goals it is part of). When that gives none, its own `category`. When that is empty
  too, none.
- Names are compared ignoring case and spaces around them. The first spelling seen is shown.

### Effort

`core/areas.ts`, pure, taking `[{ plan, data }]`, the visions and today:

- For each goal that is not paused: `effort(goal)` over the last 30 days =
  - one-time activities and list items of the goal done in that time (their `doneAt`, with the
    fallback in 13), counting the goal's own tree as the goal's progress does
    (`treeActivities`),
  - plus routine days ticked in that time for the goal's routines.
- A step that contributes to two goals counts for both.
- A goal with several areas splits its effort equally among them, so shares add up to 100 %.
- Goals without any area go to "No area".
- Achieved goals count for the time before they were achieved. Demo plans are left out.

### The sentences

Chosen in this order, at most two, each only when true:

1. One area has more than half of all effort and there are at least two areas with visions:
   "Most of your effort in the last 30 days went to {area}."
2. An area has a vision and no active goal: "{area} has a vision and no active goal." (the
   first by name; "and {n} more" when several).
3. No effort anywhere in 30 days and at least one active goal: "Nothing was ticked in the last
   30 days."

No judgement words. The view reports; it does not advise.

### Stored data

- Vision: `area`, a string. `normalizeVisions` keeps a string, drops anything else.
- Device preference `hiddenAreas`: names hidden from "Nothing here yet".
- Rename: the visions through the normal save; goals through `editPlan` for each plan that
  holds a goal with that category. One `undoable` action (17) when 17 is built.

## Strings

| Key | English |
|---|---|
| `f.visionArea` | Area |
| `f.visionAreaPh` | For example Health |
| `areas.tree`, `areas.areas` | Tree · Areas |
| `areas.none` | No area |
| `areas.goals` | `{ one: '{n} active goal', other: '{n} active goals' }` |
| `areas.noGoal` | No active goal |
| `areas.effort` | `{ one: '{n} step or routine day in 30 days', other: '{n} steps and routine days in 30 days' }` |
| `areas.rated` | rated {n} on {date} |
| `areas.ratedWas` | (was {n}) |
| `areas.notRated` | not rated |
| `areas.empty` | Nothing here yet |
| `areas.emptyHint` | tap one to add a vision |
| `areas.hide` | Not for me |
| `areas.rename` | Rename area… |
| `areas.most` | Most of your effort in the last 30 days went to {area}. |
| `areas.unserved` | {area} has a vision and no active goal. |
| `areas.unservedMore` | {area} and {n} more have a vision and no active goal. |
| `areas.quiet` | Nothing was ticked in the last 30 days. |

## Guidance

- Guide, article `h-visions`: add "Give a vision an **area**, such as Health or Relationships.
  The Areas side of the Visions view then shows, for each area, your visions, your active goals
  and how much you ticked for it in the last 30 days."
- Guide, article `too-many`, last bullet (two goals pulling against each other): add "The Areas
  view shows where your effort has been going."
- Help banner for the Visions view (`help.view.visions`): add one sentence: "Switch to Areas to
  see how your effort is spread."
- Tip, class D, `try-areas`: when 2 or more visions have an area and the Areas side was never
  opened (`seen`): "Your visions cover {n} areas of life. The Areas view shows how your effort
  is spread among them." Button: Open Areas. View: Visions.

## Notes for the builder

1. The bars are the app's progress bar (`progressBar`), not a new chart. If a chart is ever
   wanted here, use the `dataviz` skill first.
2. "Rated" reads the journal's sessions of the exercise `areas` (01): the two newest that hold a
   rating for that area name.
3. The goal form's "Category" stays as it is. Do not rename it to "Area": a goal that serves a
   vision takes the vision's area, and the category remains for goals without visions.
4. The first decision of 2026-11-08 holds: visions are global. Areas therefore count goals of
   all plans.

## Test cases

Pure rules (unit tests, written first)
- Goal areas: from its visions; from its parent goal's visions; from its category when it
  serves none; none.
- Names: "health", " Health " and "HEALTH" are one area, shown as first seen.
- Effort: a step done 30 days ago counts, 31 does not; list items count one each; routine ticks
  count per day; a step for two goals counts for both; a goal in two areas gives half to each;
  shares sum to 100; paused goals do not count; achieved ones count before the date.
- Sentences: each rule on both sides of its threshold; at most two; order.
- Rename: every vision and every matching goal category in two plans changes; others do not.

Page steps
- Set an area on a vision: the tag shows; the Areas side lists the block.
- Tick a step for a goal serving that vision: the block's count and bar change.
- "Nothing here yet": tapping an area opens the vision form with it filled; "Not for me" hides
  it and it stays hidden after a reload.
- Rename from the block menu changes the vision and a goal's category in a plan that is not
  open; Undo reverts both.
- With 01 built: a rating from the exercise shows with its date and the earlier value.

Edge cases
- No visions and no goals: the Areas side shows only "Nothing here yet".
- One area only: no "most of your effort" sentence.
- An area name with `<`, `&` and quotes; an 80-character name wraps.
- Phone width: blocks stack; the bar goes under the counts.
- Both languages; the suggestion list comes from the language file as today.
- Fixture: a visions store with `area`.
