# 13. Completion dates and the done log

**Goal:** the app knows *when* something was finished, and can show what was done this week.
Today a step only has a status and a last-changed time, so "what did I do last week?" cannot be
answered. Features 03, 09, 14 and 18 build on this.

Read `README.md` first ("Stored data", decision 11).

## What the user sees

### A line on the Overview

Under the summary, above "Next":

> **This week:** 4 steps done · 9 routine days ticked · 2 values recorded

- Counts the open plan, Monday to today. Parts that are zero are left out. When all are zero
  the line is not shown (no "nothing done").
- The line is a button: it opens the Review view on the done log.
- A goal reached this week is named in front: "Reached “Run 5 km” · 4 steps done · …".

### "Done on" in the activity form

When the status is Done, a date field **Done on** shows beside the status, filled with the day
it was finished. It can be changed, so "I did that on Friday" can be recorded on Monday. It
cannot be after today. For a list it shows when the list is complete.

The goal form shows **Achieved on** the same way when the status is Achieved.

### The done log

In the Review view (the view itself comes with `14-reviews.md`; if 13 is built first, add the
view with only this tab, and the nav item "Review").

```
 Done log                                   [ This plan ▾ ]   [All] [Steps] [Routines] [Values] [Goals]

 THIS WEEK · 10–16 Nov                                   4 steps · 9 routine days · 2 values
   Sat 15 Nov
     ✓ Buy running shoes                                 ▸ Run 5 km
     ⟳ Run after work
     ◐ Longest run: 3.2 km
   Thu 13 Nov
     ✓ Book the check-up  (list: Paperwork, 2 of 5)      ▸ Run 5 km
     ⟳ Run after work · Stretch after running
 LAST WEEK · 3–9 Nov                                     2 steps · 7 routine days · 1 value
   …
 [ Show earlier ]
```

- Newest first, by week, then by day. A week's header carries its counts.
- Kinds of line: a step done (`✓`), a list item ticked (shown under its list's title), routine
  days ticked (one line per day, routines joined), a value recorded or an amount added (`◐`,
  with the value), a goal achieved (a gold-edged line), a note written (feature 15, once it
  exists; filter "All" only).
- The goal tag on the right is the goal the step contributes to (first one, "+1" when more);
  tapping it opens the goal.
- Tapping a line opens the item's form. In "All plans" that switches to the item's plan first,
  with the toast "Opened plan “{name}”".
- Scope switch: **This plan** (default) or **All plans**; in All plans each day's lines carry a
  small plan name when more than one plan appears that day. Demo plans are left out.
- Eight weeks are shown; "Show earlier" adds eight more. Weeks with nothing are skipped.
- Empty: "Nothing ticked yet. What you finish will be listed here, week by week."

## Rules

### Stored data

| Where | Field | Meaning |
|---|---|---|
| activity (one-time or list) | `doneAt` | the day it became Done, `yyyy-mm-dd`. Absent when not done |
| item of a list | `doneAt` | the day it was ticked. Absent when not ticked |
| goal | `achievedAt` | the day it became Achieved. Absent otherwise |

Routines need nothing new: their `checkins` are dated. A routine list's items are dated in
`listDays`. Measurements and amounts are dated.

### Setting the dates

One function in `core/`, called from the save path of a plan (where `stampChanges` and
`offerReached` run today), so that no way of changing a status can be forgotten (status circle,
board drag, form, context menu, the "target reached" toast, a list completing itself through
`followList`, sync is not a way: merged items keep their own dates):

`stampCompletion(data, before, day)` — `before` is what each item held at the last save (the
change-tracking snapshot already keeps every item's content).

- An activity that is Done now and was not Done before, or is new, and has no `doneAt`: set
  `doneAt = day`.
- An activity that is not Done now: remove `doneAt`.
- A `doneAt` set by hand in the form is kept (the form writes it before the save).
- List items: the same, per item, on `done`.
- Goals: the same, on `status === 'achieved'` and `achievedAt`.
- Routines never get `doneAt`.
- It must not touch items whose status did not change in this save. In particular, steps that
  were already Done when this feature arrives stay without `doneAt`.

`editPlan` (foundation) runs it for plans that are not open.

### Reading the dates

`doneDay(activity)`: its `doneAt`; without one, when it is Done, the local day of its
`updatedAt`; without that, none. The fallback covers steps finished before this feature. It is
an estimate (the last change may have been an edit, not the tick) and is only used for the log
and counts, never stored. Goals: `achievedAt`, else the day of `updatedAt` when Achieved.

### The log

`doneLog(plans, from, to)` in `core/`, pure: takes `[{ plan, data }]` and two days, returns
entries `{ day, kind: 'step' | 'item' | 'routine' | 'value' | 'amount' | 'goal' | 'note', plan,
id, title, detail?, goal? }` sorted by day, newest first. `weekCounts(entries)` gives
`{ steps, routineDays, values, goals }`:

- `steps`: activities done plus list items ticked, but a list completed on a day counts its
  items, not also itself.
- `routineDays`: ticks (`checkins[day] === 1`), one per routine and day; a made-up day counts
  on the day it was ticked.
- `values`: measurements plus amounts, except amounts added by ticking a routine (they carry
  the routine's id): those are already counted as the tick.
- `goals`: goals achieved.

### Export, import, sample

- `resetProgress` removes `doneAt` (activities and list items) and `achievedAt`.
- A full copy keeps them. Merging two plans keeps them.
- The sample plan's done steps get `doneAt` spread over the last two weeks, and its achieved
  goal an `achievedAt`, so the sample's log is not empty.

### Sync

`doneAt` and `achievedAt` are plain fields: the newer copy of the item wins, as for its status.
List items already merge one by one by their `at`; `doneAt` travels with the item.

## Strings

| Key | English |
|---|---|
| `nav.review`, `view.review` | Review |
| `log.title` | Done log |
| `log.week` | This week: {parts} |
| `log.steps` | `{ one: '{n} step done', other: '{n} steps done' }` |
| `log.ticks` | `{ one: '{n} routine day ticked', other: '{n} routine days ticked' }` |
| `log.values` | `{ one: '{n} value recorded', other: '{n} values recorded' }` |
| `log.reached` | Reached “{name}” |
| `log.thisWeek`, `log.lastWeek` | This week · Last week (other weeks show their dates) |
| `log.scope.plan`, `log.scope.all` | This plan · All plans |
| `log.filter.*` | All · Steps · Routines · Values · Goals |
| `log.more` | Show earlier |
| `log.empty` | Nothing ticked yet. What you finish will be listed here, week by week. |
| `log.openedPlan` | Opened plan “{name}” |
| `f.doneAt` | Done on |
| `f.achievedAt` | Achieved on |
| `err.doneFuture` | This day has not come yet. |

## Guidance

- Guide, article `h-overview`: add "The line “This week” counts what you finished since
  Monday; tap it for the done log."
- Guide, new article `h-review` (group "How do I…") is written in `14-reviews.md`; if 13 ships
  first, add a short one: "The done log lists what you finished, week by week: steps, routine
  days, values and goals reached."
- Guide, article `pressure`, the paragraph "You only see what is missing": add an action
  button "Open the done log".
- Help banner `help.view.review`: "What you did, and the weekly look at your plan. The done log
  lists every step, tick and value by week."
- No tip.

## Notes for the builder

1. The Overview's summary sentence ("On average you're 38 % of the way…") stays. The new line
   comes after it, so the page opens with what is done as well as what is left.
2. The log for one plan with 300 items and 1,100 amounts must stay inside the render budget.
   Build entries only for the weeks shown. Add a budget to `npm run perf`.
3. Do not add a counter or a streak for weeks. The log is a list, not a score.

## Test cases

Pure rules (unit tests, written first)
- `stampCompletion`: todo→done sets today; done→doing removes; done and unchanged keeps the old
  date; done before the feature (no `doneAt`) and edited (title only) stays without; a hand-set
  date survives the save; a list completing through its last item gets `doneAt` and so does the
  item; unticking an item removes the item's date and the list's; new item created as Done gets
  today; goals the same with `achievedAt`; routines never.
- `doneDay` fallback: uses the day of `updatedAt` in local time (a change at 23:30 and at 00:30
  fall on different days); none when there is no `updatedAt`.
- `doneLog`: each kind appears once on its day; amounts from routine ticks are not counted as
  values; made-up days count on the tick's day; range borders (Monday 00:00, Sunday) inclusive;
  a week across New Year; two plans merged in order.
- `weekCounts`: a list of 5 completed on one day counts 5 steps.
- `resetProgress` clears the three fields.

Page steps
- Tick a step on the Overview: the line appears with "1 step done"; untick: it goes.
- The form shows "Done on" only for Done; a changed date is kept; a future date is refused with
  the error.
- The log shows today's tick under today; the filter chips narrow it; "All plans" shows a step
  from another plan and opening it switches plan with the toast.
- "Show earlier" adds weeks; empty weeks are skipped.
- The "target reached" toast's button stamps `achievedAt`.

Edge cases
- Merge: a step ticked on device A on Friday and edited on device B on Saturday (title): the
  merged item has B's content; if B's copy was still To do, the step is To do again (existing
  rule, unchanged).
- Clock: status changed just after midnight gets the new day.
- Phone width: the line wraps; log lines wrap under the title, the goal tag drops below.
- Both languages; plural forms for 1, 2, 3–4 and 5+ in Slovenian.
- Fixture: a plan holding `doneAt`, item `doneAt` and `achievedAt`; the `5b71e59` fixtures load
  unchanged.
