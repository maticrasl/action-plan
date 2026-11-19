# 12. Move late steps in one action

**Goal:** a plan that has slipped is brought up to date in one move, and that move reads as
planning, not as an admission. Today each late step must be opened and re-dated one by one,
under a red "Running late" mark.

Needs `17-undo-trash-snapshots.md` (session A, for Undo).

## What the user sees

### Where the button is

**Move late steps…** appears when the open plan has at least one late one-time activity or
list:

- on the Overview, at the end of the fact "3 running late",
- in Activities, beside "Hide done and achieved",
- on the Timeline's toolbar,
- in the weekly review's "Fix the plan" (14),
- on the Today view (09), under each plan's late steps.

### The dialog

```
 Move late steps
 A passed date is an old guess. Choose where the first one goes; the others keep their distance.

 First step moves to   [ 17/11/2026 ▾ ]         (tomorrow)

 ☑ Buy running shoes               was 10 Nov  →  17 Nov
 ☑ Book the check-up               was 12 Nov  →  19 Nov
 ☑ Gait analysis                   was 14 Nov  →  21 Nov

 ☐ Also move the steps that come after them        (4 steps, by 7 days)

 [ Move 3 steps ]   Cancel
```

- The list shows every late step of the plan, earliest first, all ticked. Unticking leaves a
  step where it is.
- The date is where the earliest ticked step goes. It defaults to tomorrow and cannot be before
  today. Every ticked step moves by the same number of days.
- **Also move the steps that come after them**: every other one-time activity or list in the
  plan that is not done and whose due date is on or after the earliest ticked step's old date
  moves by the same number of days. The count and the days show beside the box. Off by default.
- After moving, a toast: "3 steps moved · Undo".
- If a moved step now ends after the deadline of a goal it contributes to, a second line in the
  dialog says so before moving: "2 steps will end after “Run 5 km” (1 June)." with the choice
  **Move the goal's deadline too** (the goal's deadline moves by the same number of days).
  Without the choice the steps move and the goal stays.

## Rules

`core/replan.ts`, pure:

- `lateSteps(data, today)` → activities that are not routines, not done, with a due date before
  today, earliest first. A list counts as one step.
- `planMove(data, { ids, to, withLater, today })` → `{ days, moves: [{ id, start?, due }],
  later: [...], goals: [{ id, deadline, by }] }` and changes nothing. `applyMove(data, plan)`
  writes it.
- `days` = `to` minus the earliest chosen step's due date. Always at least 1.
- Start dates: a step that is To do moves its start date by the same days (its length stays). A
  step that is In progress keeps its start date; only its due date moves.
- The automatic start (`autoStarted`, which moves a To do step to In progress on its start
  date once) is left as it is; a new start date starts it again on that day, as today.
- Sub-activities: a chosen step moves by itself. A parent that is late and whose sub-activities
  are late shows all of them in the list; nothing is moved twice.
- Dependencies are not re-ordered: every chosen step moves by the same days, so the order
  between them is kept. A step that depends on an unticked late step may now come before it; the
  dialog does not police this (the Timeline shows it).
- Routines never move. A routine with an end date in the past is not a late step.
- Goals move only through the explicit choice, and only goals that are not Achieved.
- The whole change runs inside `undoable` (17) as one action.

From the Today view the dialog works on the plan of the group it was opened from, through
`editPlan` (foundation). It never mixes plans.

## Strings

| Key | English |
|---|---|
| `replan.btn` | Move late steps… |
| `replan.title` | Move late steps |
| `replan.lead` | A passed date is an old guess. Choose where the first one goes; the others keep their distance. |
| `replan.to` | First step moves to |
| `replan.was` | was {date} |
| `replan.later` | Also move the steps that come after them |
| `replan.laterCount` | `{ one: '{n} step, by {days} days', other: '{n} steps, by {days} days' }` |
| `replan.pastGoal` | `{ one: '{n} step will end after “{goal}” ({date}).', other: '{n} steps will end after “{goal}” ({date}).' }` |
| `replan.moveGoal` | Move the goal's deadline too |
| `replan.do` | `{ one: 'Move {n} step', other: 'Move {n} steps' }` |
| `replan.done` | `{ one: '{n} step moved', other: '{n} steps moved' }` |
| `err.replanPast` | Choose today or a later day. |

Wording elsewhere: the Overview's late fact keeps its count but the Activities view's tag
"Running late" stays as it is; this feature does not rename states.

## Guidance

- Guide, articles `fell-off` (step 2) and `behind` ("Move the date"): add the action button
  **Move late steps…** and the sentence "“Move late steps” on the Overview moves them all at
  once and keeps their order."
- Tips `back` and `overdue-pile`: their button changes from "Open the Timeline" to **Move late
  steps…**, opening this dialog.
- Guide, article `h-timeline`: "The toolbar's “Move late steps…” re-dates every overdue bar in
  one go."

## Notes for the builder

1. The date field is the app's own date control (dd/mm/yyyy with the calendar), not a native
   one.
2. The preview column must update as the date or the ticks change, without a full re-render of
   the dialog (keep focus in the field).
3. Do not add "move to today for all": a pile of steps on one day is the next late pile.

## Test cases

Pure rules (unit tests, written first)
- `lateSteps`: due yesterday is late, due today is not; done, routines and steps without a due
  date are left out; lists included.
- `planMove`: three steps 10, 12, 14 Nov moved to 17 Nov land on 17, 19, 21; unticking the
  earliest makes the next one the anchor; `to` = today gives the earliest today; `to` before
  today is refused.
- Start dates: To do moves both; In progress moves only the due date; a step with start after
  its new due date cannot happen (both move).
- `withLater`: includes not-done steps due on or after the anchor's old date, excludes done
  ones, routines and the chosen ones; counts match.
- Goal check: a step contributing to two goals is tested against both deadlines; an achieved
  goal is ignored; with the choice the deadline moves by `days`.
- `applyMove` changes exactly what `planMove` listed.

Page steps
- The button shows only with late steps, in each of its places; after moving, it is gone and the
  late count on the Overview is gone.
- Undo puts every date back, including a moved goal deadline.
- From Today, moving late steps of a plan that is not open changes that plan only; the open
  plan's items keep their `updatedAt`.
- The plan badge in the plan menu turns from red to green after the move.

Edge cases
- One late step: plural forms right in both languages.
- 40 late steps: the list scrolls inside the dialog, the buttons stay visible.
- A late step that waits for another (blocked): it moves like the others.
- Phone width and phone landscape: the dialog fits; the date control opens above the keyboard.
- Sync: two devices move the same steps to different dates; the later move wins per item
  (existing rule), no error.
