# Plan emoji, collapsed plan list, activities without columns (2026-11-20)

Owner's five points; choices confirmed in conversation the same day.

## What

1. Every plan has an emoji, shown before its name wherever plans are listed. New and Rename
   open one dialog: name field, a grid of common emojis, "More" expands to every emoji.
   Save needs a name and an emoji. A plan without one shows 🙁.
2. Collapsed sidebar: the plan list stays, each row shows only its dot and emoji.
3. List ticks (round checkmarks) in the Day view get a visible ring.
4. Activities view: no To do / Doing / Done columns, no drag between them. Activities sit in
   their own section below Routines, cards laid out like routines, sorted Doing, To do, Done,
   then by due date. Status changes with the round check button (as before).
5. Routine and activity cards flow in columns of their own height (masonry), still ordered
   left to right, then top to bottom.

## Data shape

`Plan.emoji?: string` in the plan index (`actionplan.plans`, Drive sync file's `plans.list`).
Optional; no default is written: a missing emoji is shown as 🙁. Older versions ignore and keep
the field (the whole entry is merged). A rename or emoji change stamps `updatedAt`
(`stampPlanChanges` compares name and emoji). Existing fixtures (written by old code, no emoji)
prove old data still loads and shows 🙁.

Not carried: plan export files and the trash keep only the name; an imported or restored
plan shows 🙁 until the user picks one.

## Modules

`core/model.ts`, `core/merge.ts`, `ui/plan-switcher.ts`, new `ui/plan-name.ts` (dialog,
emoji list), `index.html`, `views/activities.ts`, styles, i18n, Guide articles.

## Tests

- unit: emoji list holds only emojis and the common ones; stamp on emoji change.
- page `plans.js`: new/rename via dialog; Save disabled without emoji or name; taken name
  refused; old plan shows 🙁; collapsed list shows emoji.
- page `activities.js`: no columns; order Doing, To do, Done, due date; masonry order.
