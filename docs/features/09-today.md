# 9. Today across all plans

**Goal:** one page that answers "what do I do today?" whatever plan it is in. Visions are
already shared by all plans; the day is not. Someone with a plan for health and one for the
house must open each to see what is due.

Needs `00-foundation.md` (journal for the focus, `withPlan`, `editPlan`) and `13-done-log.md`
(the "This week" line).

Read `README.md` first (decision 4, "Navigation").

## What the user sees

A new view, **Today**, first in the navigation.

```
 Today · Saturday 15 November

 THIS WEEK'S ONE THING
 ┌──────────────────────────────────────────────────────────────┐
 │ ○  Book the sports-medicine check-up        ▸ Run 5 km   Fri │
 └──────────────────────────────────────────────────────────────┘

 DUE TODAY AND OVERDUE
   Running plan                                        Move late steps…
   ○  Buy running shoes                     ▸ Run 5 km        3 days late
   ○  Paperwork (2 of 5)                    ▸ Run 5 km        today
   House
   ○  Call the plumber                      ▸ Bathroom        today

 ROUTINES TODAY
   Running plan
   Run after work          M T W T F S S    2 of 3 this week
   House
   Air the cellar          M T W T F S S    due today

 LATER THIS WEEK  (4)                                              ▾

 This week: 4 steps done · 9 routine days ticked · 2 values recorded
```

- **Due today and overdue**: one-time activities and lists that are not done, with a due date
  today or earlier, from every plan. Grouped by plan; the plan's name is a small heading and is
  left out when the user has one plan. Within a plan: by due date, as on the Overview.
- **Routines today**: the routines today still asks for, by the Overview's own rule (a set day
  not ticked, a missed day that can be made up, or a flexible routine whose period is not met),
  as the same rows with the week strip.
- **Later this week**: steps due tomorrow up to seven days from now, folded by default with a
  count. The fold is remembered.
- **This week** line at the bottom: as on the Overview (13), counted over all plans.
- Everything can be ticked here: the status circle, a list's items (through its form), a
  routine's days, the amount popover when a tick asks "how much?". Ticking never switches plan.
- Tapping a title opens the item's form. If the item is in another plan, the app opens that
  plan first and says "Opened plan “{name}”" in a toast. The view stays Today.
- The context menu works as on the Overview for items of the open plan. For items of another
  plan it offers only: status changes, "Make this week's one thing", and "Open in “{plan}”".
- Demo plans are left out. A user whose only plan is a demo sees the empty state.
- The Add button adds to the open plan, as on the Overview (a goal).

### This week's one thing

- A card at the top with one step chosen for the week, its status circle, goal tag and due
  date.
- **Choosing it:** the context menu of any one-time activity, list or routine, in any view, has
  **Make this week's one thing**. The weekly review (14) ends by choosing it. With none chosen,
  the card reads "No step chosen for this week." with a button **Choose…** that opens a picker:
  the not-done steps of all plans, due soonest first, with a search field.
- It holds for the week it was chosen in (Monday to Sunday). In a new week the card is empty
  again; last week's choice is not carried over.
- Done: the card shows it ticked for the rest of the week, with the line "That was this week's
  one thing." No confetti.
- The same card shows at the top of the Overview when the chosen step belongs to the open plan.
- **Clear** in the card's menu removes the choice.

### Empty states

- No plans with items: the Overview's empty state text, with its button.
- Nothing due and no routines today: "Nothing is due today." then, if any, "Later this week",
  then the "This week" line.

## Rules

### What is listed

`core/today.ts`, pure, taking `[{ plan, data }]`, the journal's focus and today:

- `todayItems(plans, today)` → `{ due: [{ plan, activity }], routines: [{ plan, activity }],
  later: [{ plan, activity }] }`.
- A step under a paused goal is listed like any other, as on the Overview.
- The core functions that decide a routine's day (`routineToday`, `routineState`,
  `periodProgress`) read the open plan from the module's state. Call them through `withPlan`
  for each plan, as `planHealth` does.
- Order of plans: the open plan first, then the others in the order of the plan list.

### Ticking in a plan that is not open

Every change goes through `editPlan(planId, fn)` (foundation). The handlers the Overview uses
today work on the open plan; give each a plan id and route through `editPlan`:

- status circle (`cycleStatus`), including the "waits for" toast,
- routine day (`toggleCheckin`, `setRoutineDay`), including the amount popover (remember the
  plan id while the popover is open; a click elsewhere leaves everything as it was),
- routine list items (`tickRoutineItem`),
- moving a routine's week strip back and forth (view state only, no save).

After a change in another plan: re-render Today; the plan badges in the plan menu refresh (they
read stored plans by version).

### The focus

Stored in the journal: `focus = { week, plan, item, at }` (`00-foundation.md`).

- `setFocus(plan, item)` sets `week` to this week's Monday.
- `currentFocus(journal, plans, today)` → the item, or nothing when `week` is not this week, the
  plan is gone, or the item is gone.
- A routine as the one thing: its card shows the week strip; it counts as done for the card
  when this week's target is met (`periodProgress(...).met`), or for a set-day routine when no
  due day of the week is left unticked.
- Syncs with the journal: the later choice wins.

### Performance

`allPlansData()` is cached until a plan changes. Building Today for 5 plans of 300 items each
must stay inside the Overview's render budget; add a budget to `npm run perf`.

## Strings

| Key | English |
|---|---|
| `nav.today`, `view.today` | Today |
| `today.focus` | This week's one thing |
| `today.focusNone` | No step chosen for this week. |
| `today.choose` | Choose… |
| `today.focusDone` | That was this week's one thing. |
| `today.focusClear` | Clear |
| `today.pick` | Which step matters most this week? |
| `today.due` | Due today and overdue |
| `today.routines` | Routines today |
| `today.later` | Later this week |
| `today.none` | Nothing is due today. |
| `ctx.focus.week` | Make this week's one thing |
| `ctx.openIn` | Open in “{plan}” |
| `toast.focusSet` | This week's one thing: {name} |

(`ctx.focus` already exists for "Show only this goal"; use a new key.)

## Guidance

- Guide, new article `h-today` (group "How do I…"):
  "**Today** — Today lists what is due from all your plans: steps due today or overdue, and the
  routines today asks for. Tick them here without changing plan. At the top sits this week's one
  thing: the step you chose as the one that matters most. Choose it from any step's menu, or at
  the end of the weekly review." Action: Open Today. Related: `h-overview`, `review`.
- Guide, article `h-overview`: add "The Overview shows one plan. Today shows the same for all
  of them."
- Guide, article `review`, line 5 ("Choose next week's one thing"): its link opens the picker.
- Help banner `help.view.today`: "What is due from all your plans, to tick in one place. The
  card at the top is the one step you chose for this week."
- Tip, class D, `try-today`: when the user has 2 or more plans that are not demos, each with an
  active goal, and Today was never opened (`seen`): "You have more than one plan. Today lists
  what is due from all of them on one page." Button: Open Today. View: Overview.
- `seen` gets `today` among the views opened.

## Notes for the builder

1. Today is not the start view (decision 4). The view a user was last on is remembered as
   today.
2. The phone tab bar changes to Today · Overview · Goals · Activities · More; Current states
   moves into the More sheet. Check the tab bar at 360 px in both languages ("Aktivnosti" is the
   longest label).
3. The rows are the Overview's rows (`activityRow`, `routineRow`). Do not build a second look;
   give the existing functions the plan they belong to.
4. The walkthrough card stays on the Overview. Today shows no walkthrough card and no tips of
   its own, apart from the tip of the day when its view is "Today".

## Test cases

Pure rules (unit tests, written first)
- `todayItems`: due yesterday and today listed, tomorrow under later, eight days out nowhere;
  done steps nowhere; routines by the Overview's rule for set days, flexible ones and make-up
  days; two plans keep their own answers (a routine with the same id in two plans is judged in
  each).
- `currentFocus`: this week yes, last week no (Sunday 23:59 and Monday 00:00), missing plan or
  item gives nothing; a routine counts as done when its week is met.
- Order: open plan first.

Page steps
- With two plans, tick a step of the plan that is not open: it shows done, the open plan's
  items keep their `updatedAt`, the other plan's badge changes, and after switching plan the
  step is Done there with `doneAt` today.
- Tick a routine of another plan that improves a state that adds up: the amount popover asks,
  the amount lands in that plan's state.
- Open a title from another plan: the plan switches, the toast shows, the form is that item's.
- "Make this week's one thing" from Activities: the card shows on Today and on the Overview;
  choosing another replaces it; Clear empties it; a second device gets it by sync.
- With one plan: no plan headings.
- The picker lists steps of all plans, filters by search, and sets the focus.

Edge cases
- The plan of the focus is deleted: the card is empty, no error.
- A demo plan's items never show; a demo plan as the open plan shows the others' items only.
- A tick while a sync is running: the change is not lost (the sync runs again, as today).
- Phone width and phone landscape: rows wrap; the week strip fits; the tab bar fits.
- Keyboard: Tab reaches every circle and strip day; Enter ticks.
- Both languages.
