# 3. Tips

**Goal:** now and then the app notices something in the user's plan and says one useful thing
about it. A tip is a remark from someone who looked at *this* plan, not a "did you know" banner.

Read `README.md` first (decision 7, voice rules, seen flags, demo marker).

## What the user sees

```
 ┌───────────────────────────────────────────────────────────────┐
 │ TIP                                                        ×  │
 │ “Run after work” was kept about a third of the time.          │
 │ A smaller routine that you keep beats a bigger one that you   │
 │ miss. Try twice a week, and raise it when it holds.           │
 │                                                               │
 │ [ Edit the routine ]  Why this helps  Another tip             │
 │                                       Don't show this again   │
 └───────────────────────────────────────────────────────────────┘
```

- **Where.** On the Overview, under the summary (under the walkthrough card if that is there).
  Also at the top of the one view the tip is about (the "View" column below), so that someone
  who lives in Activities sees it too. Same tip in both places; never two tips at once.
- **Buttons.**
  - The **action** does the thing the tip suggests (opens the form, the view, the dialog).
  - **Why this helps** opens the Guide article. Left out for tips without one.
  - **×** is *Not now*: it hides the tip for 7 days (owner, 2026-11-19).
  - **Don't show this again** means "not this one again" for this tip and this item.
  - **Another tip** shows the next tip that is true now; see "Asking for a tip" in
    `docs/specs/2026-11-19-tips.md`. *Show me a tip* in the Guide's Tips and tricks does the same.
- The first three tips a user ever sees carry a last line: *Tips can be turned off in
  Settings.*
- **Settings › Display › Tips** (switch, on by default). Off: no tip is chosen or shown, and
  nothing is recorded.
- The Guide's Start here group gets one more article, `tips-all` "Tips and tricks", listing the
  discovery tips (class D below) as plain text, so they can be read without waiting for them.

## Rules

**One a day.** On the first render of a day, the app chooses at most one tip: the *tip of the
day*. It stays for that day. If what it says stops being true (the user did it), the card goes
away and nothing takes its place until tomorrow. Acting on a tip is the best outcome; do not
answer it with another tip.

**When no tip is chosen.**
- Tips are off; the plan is a demo; the plan is empty.
- The walkthrough is on and its first stage is not finished. (One voice at a time.)
- Fewer than 2 days since this user's first item was created.
- A dialog, a form or the welcome card is open (the card simply is not drawn over them; choice
  happens on a view render).

**How the tip is chosen.** From all tips whose condition is true now and whose history allows
it: lowest class first (A before B before C before D), then the one shown longest ago (never
shown wins), then the order of the catalogue. No randomness, so tests are exact.

**History.** Preference `tips`:
`{ off: boolean, day: date, current: key | null, shown: { [key]: { n, last, closed? , snoozed? } } }`
where `key` is the tip id, plus the item id for tips about one item (`routine-low:<id>`).

- Class A and B tips may come back for the same item after their **cooldown** (below) while the
  condition still holds, at most **3 times** in all. After that the app has said it; stop.
- Class C and D tips show **once** per key.
- **Don't show this again** sets `closed`: never again for that key.
- **×** (Not now) sets `snoozed` to today + 7 days.

**A tip about several items** names the one that fits best (most overdue, lowest kept share,
nearest deadline) and is keyed to it.

**Conditions are pure.** Each tip is `{ id, class, view, cooldown, when(plan, visions, seen,
today) → item | true | null, action }` in `core/guidance/`. The choice function takes the
catalogue, the data and the history and returns a key or nothing.

**"Days since" facts** come from what the plan already holds: `updatedAt` of items, check-in
dates, measurement dates, start and due dates. *Last activity* is the newest of all of these.
Do not add new timestamps to items for tips. Where a tip needs something the data does not
hold, the catalogue says to use a `seen` flag.

**Per device.** Tip history is not synced. A user with two devices may see a tip twice; accept
that.

**Never** show a tip as a popup, a toast, a badge on the app icon or a notification.

## Catalogue

Texts use `{name}` for the item's title, `{n}`, `{pct}`, `{days}` for numbers. Keys:
`tip.<id>.text`, `tip.<id>.btn`. All thresholds are named constants in one place, so the owner
can tune them.

### Class A — coming back and struggling (cooldown 14 days)

| id | When | Text | Button | View | Guide |
|---|---|---|---|---|---|
| `back` | Last activity was 10 or more days ago, and the plan has an active goal. Shown on the first day back | Good to see you. There is no need to catch up on everything: choose one step for today, and move the dates that no longer hold. | Move late steps… | Overview | `fell-off` |
| `overdue-pile` | 3 or more activities are overdue | {n} steps are past their date. A passed date is an old guess, not a verdict. Take five minutes to move, split or delete them. | Move late steps… | Activities | `behind` |
| `routine-missed` | A routine is late: its last 2 or more due days or periods were missed | “{name}” has been missed a few times. One tick puts it back on track. If the schedule does not fit your weeks, change the schedule. | Edit the routine | Activities | `routine-slips` |
| `routine-low` | A routine running for 3 weeks or more was kept under half of the time | “{name}” was kept about {pct} of the time. A smaller routine that you keep beats a bigger one that you miss. Try a little less, and raise it when it holds. | Edit the routine | Activities | `routine-slips` |
| `goal-behind` | An active goal's deadline is within 14 days, and its card says “Behind pace” by more than 30 points of the whole way (the same rule as the tag, `core/pace.ts`) | “{name}” is at {pct} with {days} days to go. Three honest options: make room for it this week, move the date, or lower the target. | Open the goal | Goals | `behind` |
| `goal-past` | An active goal's deadline has passed | “{name}” passed its date at {pct}. That is {pct} further than where you began. Give it a new date, or pause it if now is not the time. | Open the goal | Goals | `behind` |
| `stuck-step` | An activity has been In progress for 21 days or more, is not a list and has no sub-activities | “{name}” has been in progress for {n} weeks. A step that will not finish is often several steps in one. Split it, or turn it into a list. | Open the activity | Activities | `not-starting` |
| `wrong-way` | A state that measures an active goal has moved away from the target over its last 3 measurements | “{name}” has moved away from the target three times in a row. More effort may not be the answer; the steps may be the wrong ones. Which activity was meant to move it? | Open Graphs | Graphs | `no-progress` |
| `too-many-goals` | 5 or more active goals, and either one is late or their average progress is under 25 % | You have {n} active goals. Most people move faster on two or three at a time. Pause the ones that can wait; they keep everything and come back with one tap. | Open Goals | Goals | `too-many` |
| `too-many-routines` | 6 or more routines running, kept under 60 % on average | {n} routines at once is a lot to keep. Which two matter most right now? Let the others end for the moment and bring them back one at a time. | Open Activities | Activities | `routine-slips` |

### Class B — the method (cooldown 30 days)

| id | When | Text | Button | View | Guide |
|---|---|---|---|---|---|
| `no-steps` | An active goal older than 2 days has no activity or routine contributing to it (not for goals with sub-goals that have some) | “{name}” has no steps yet. What is the smallest thing you could do for it this week? | Add an activity *(for this goal)* | Goals | `first-steps` |
| `steps-ran-out` | Every one-time activity of an active goal is done, the goal is under 100 % and no routine contributes to it | Every step for “{name}” is done, and the goal is not reached yet. What comes next? | Add an activity *(for this goal)* | Goals | `first-steps` |
| `no-dates` | 3 or more activities To do have no due date | {n} steps have no date. A step with a day and a moment gets done far more often than one for “sometime”. Give the next one a day. | Open Activities | Activities | `not-starting` |
| `only-result` | An active goal with “Progress from: A measurement”, older than 7 days, has no routine contributing to it | “{name}” is a result. What would you do every week that makes it likely? Add that as a routine. | Add a routine *(for this goal)* | Goals | `h-routines` |
| `stale-state` | A state (not adding up) that measures an active goal was last measured 14 or more days ago | “{name}” was last measured {days} days ago. A fresh value shows whether what you are doing is working. | Record a value | Current states | `h-states` |
| `no-measure` | An active goal with “A measurement” has no state describing it and is older than 7 days | “{name}” has a target and nothing that measures the way there. Add a current state for it, and the goal moves when you measure. | Add a current state *(for this goal)* | Goals | `h-states` |
| `far-goal` | An active goal's deadline is more than 6 months away and it has no sub-goals | “{name}” is {n} months away. A nearer sub-goal gives you something to reach sooner and shows whether you are on the way. | Add sub-goal | Goals | `h-goals` |
| `waiting` | An activity has waited 14 days or more for one that is still To do | “{name}” is waiting for “{other}”, which has not started. Start that one, or remove the link if it no longer holds. | Open “{other}” | Activities | `h-activities` |
| `many-doing` | 6 or more activities In progress | {n} activities are in progress. Finishing one will do more for you than starting another. Which is closest to done? | Open Activities | Activities | `not-starting` |
| `no-vision` | 2 or more active goals, no visions, first item 14 or more days ago | What are your goals for? A vision is one sentence about the life they add up to. It is the reason you will look at on the hard days. | Add a vision | Goals | `vision-how` |
| `week` | First opening of a new week (Monday or later), the plan has an active goal, and the last weekly review was 6 or more days ago or never | A new week. Five minutes now: what moved last week, and what is the one step that matters most this week? | Open the weekly review | Overview | `review` |
| `month` | First opening in a new month, and the plan has a state measuring an active goal not measured this month | A new month is a good moment to measure. Record fresh values for your current states. | Open Current states | Current states | `h-states` |
| `new-year` | 1–14 January, the plan has an active goal. Once per year | A new year is a good moment to begin again. Wishes fade by February; steps with dates do not. Look at your goals and choose this month's one. | Open Goals | Overview | `what-goal` |

`week`, `month`, `new-year` are keyed with their period (`week:2026-W47`), show once per
period, and have no cooldown.

### Class C — it is going well (once each)

Keep these few. Praise that comes too often stops meaning anything.

| id | When | Text | Button | View | Guide |
|---|---|---|---|---|---|
| `routine-holds` | A routine has met its week or month 4 times in a row | “{name}”: four in a row. This is about when it starts to feel easier. Raise it a little if you like, or leave it; holding steady counts. | — | Activities | — |
| `halfway` | An active goal passes 50 % (and was created under 40 %) | “{name}” is past halfway. | — | Goals | — |
| `achieved` | A goal was marked Achieved within the last 7 days | You reached “{name}”. Before the next one: what made the difference? And is there a small routine worth keeping so the result stays? | Open the goal | Goals | `reached` |
| `first-month` | First item 30 or more days ago and the app was opened on 8 or more of the last 30 days | A month of coming back to your plan. That habit is worth more than any single goal in it. | — | Overview | — |

### Class D — things the app can do (once each)

Each also needs "at least 5 days since the first item", so they never crowd the start.

| id | When | Text | Button | View | Guide |
|---|---|---|---|---|---|
| `try-map` | 6 or more items, Map never opened | Your plan has enough in it now for the Map to be worth a look: it shows what serves what, and what serves nothing. | Open the Map | Overview | `h-map` |
| `try-timeline` | 4 or more items with dates, Timeline never opened | The Timeline shows your steps on a calendar. Drag a bar to move its dates. | Open the Timeline | Activities | `h-timeline` |
| `try-graphs` | A state has 3 or more measurements, Graphs never opened | “{name}” has enough measurements to draw a line. Graphs shows it against your target. | Open Graphs | Current states | `h-graphs` |
| `make-up` | A routine on set days has a missed day in the last 14 days and make-up is off | When a set day does not work out, a routine can let you make it up on another day. It is a switch under Repeats. | Edit the routine | Activities | `h-routines` |
| `adds-up` | A routine improves a state that does not add up, and that state has 3 or more values that only grow | If “{name}” is something you add to each time, such as kilometres or money, it can add up by itself: switch on “Adds up” and enter only what is new. | Open the state | Current states | `h-states` |
| `use-list` | An activity's details hold 3 or more lines or 3 or more commas, and it is not a list | “{name}” looks like several things in one. As a list, you can tick them one by one. | Open the activity | Activities | `h-activities` |
| `routine-list` | 3 or more daily routines | Several things you do every day can be one routine list, such as “Morning routine”: tick the items, and the day ticks itself. | Add a routine list | Activities | `h-routines` |
| `templates` | One goal, no activities, first item 3 or more days ago, templates never opened (`seen`) | Not sure how to break a goal into steps? The templates show how similar goals are laid out. Borrow what fits. | Start from a template | Goals | `first-steps` |
| `backup` | 10 or more items, 7 or more days, no sync and no export (`seen`) | Your plans are in this browser only. Log in with Google or export a copy, so that a cleared browser does not take them with it. | Open Account and sync *(Export plan when sync is not set up)* | Overview | `p-backup` |
| `install` | Opened on 5 or more days, not installed, can be installed | Action Plan can sit on your home screen and open like any other app, also without a connection. | Install app | Overview | `h-install` |
| `menu` | 10 or more items, context menu never used (`seen`) | Long-press or right-click any card for a menu: show it on the Map, add a step for it, change its status. | — | Overview | `h-shortcuts` |
| `ctrl-enter` | Desktop (fine pointer), 10 or more items | Ctrl + Enter saves the form you are in. | — | Overview | `h-shortcuts` |
| `share` | A goal was achieved, first item 30 or more days ago | A plan that worked for you may help someone else. Export it as a template: your steps without your numbers. | Export plan | Overview | `h-plans` |

### Other strings

| Key | English |
|---|---|
| `tip.label` | Tip |
| `tip.why` | Why this helps |
| `tip.later` | Not now |
| `tip.close` | Don't show this again |
| `tip.settingsHint` | Tips can be turned off in Settings. |
| `settings.tips` | Tips |

## Writing a new tip later

A tip earns its place when all of these hold:

1. It is about something visible in the plan, and it is true at the moment it shows.
2. It names the item.
3. It suggests one thing, and the button does it.
4. It would be welcome from a friend who looked over your shoulder. If it sounds like a
   teacher, rewrite it. If it still does, drop it.
5. It has a condition that turns false when the user acts.

At most three sentences. No "should", no "don't forget", no exclamation mark.

## Test cases

Pure rules (unit tests, written first)
- For every tip: a plan where the condition is just true, and one where it is just false (each
  threshold on both sides). Tips about one item return the right item when several qualify.
- Choice: class order; never-shown before shown; catalogue order as the last tie-break; same
  input gives the same tip.
- History: cooldown blocks until its last day and allows on the next; third showing is the
  last; `closed` blocks for good; `snoozed` blocks 7 days; class C and D once only.
- One a day: a second call the same day returns the same tip while its condition holds, and
  nothing once it is false.
- Blocks: tips off, demo plan, empty plan, walkthrough's first stage open, first two days.
- Period tips: `week` once per week, not again after a review within 6 days; `new-year` only
  1–14 January, once per year.
- Date edges: a week that starts in one year and ends in the next; the Monday rule with the
  app's own week start; today as the deadline day in `goal-behind` and `goal-past`.

Page steps
- A plan built to trigger `no-steps` shows the card on the Overview and on Goals; the button
  opens the activity form with that goal chosen; after saving, the card is gone and no other
  tip appears that day.
- "Why this helps" opens the right Guide article. "Not now" and "×" remove the card and are
  remembered after a reload.
- The Settings switch removes the card at once and brings tips back when switched on.
- The settings hint line shows on the first three tips only.
- Both languages: every `tip.*` key in both; `{name}` with a long title (80 characters) and
  with characters that need escaping (`<`, `&`, quotes) is shown safely and wraps.

Edge cases
- The named item is deleted while its tip shows: the card goes on the next render, no error.
- Two tabs: a tip closed in one is closed in the other on its next render.
- Clock set back a day: no second tip, no error.
- Plan switch: the tip of the day belongs to the user, but its condition is checked against the
  open plan; in a plan where it is false, nothing shows.
- 360 px width: the card's buttons wrap below the text.
- Speed: choosing a tip on a plan with 1,100 measurements and 300 items stays within the
  render budget (conditions run once a day, then only the current tip's condition per render).
