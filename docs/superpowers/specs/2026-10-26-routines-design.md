# Routines (repeating activities) – design

## Why
The app tracks one-off steps (activities) and numbers moving toward a target (states, goals).
Changing behaviour also needs something that repeats – "exercise 3× a week" – with a sense of:
- whether this period is on track,
- how long the streak is,
- how consistent the habit has been.

Constraint: no new tabs and no new item kind; everything that exists keeps working as before.

## Decisions (agreed)
- A routine is an **activity that repeats**. One-off activities are unchanged.
- The schedule works like a calendar's custom recurrence: every N days, weeks, months or years,
  counted from the start date. Each routine is one of two kinds:
  - **Flexible** – a number of times per period, on any days (e.g. 3× a week, 2× every 2 weeks).
  - **Fixed** – on set days: weekdays (Mon, Wed, Fri; all seven = daily), a day of the month,
    the last day of the month, the n-th or last weekday of the month, or once a year.
- A routine ends never, on a date, or after a number of occurrences.
- A routine links like any activity: contributes to goals, improves states, sub-activity,
  depends on.
- A goal can measure progress **by its routines' consistency** – a third option next to
  "by a metric" and "by its activities".
- Built on the `routines` branch; now merged into `main`.

## Data
Stored on the activity. If `repeat` is absent, it is a one-off activity.

`repeat` is `{ every, unit, … }`:

| Field | Value | Meaning |
|---|---|---|
| `every` | number ≥ 1 | Every N units, counted from the start date |
| `unit` | `'day' \| 'week' \| 'month' \| 'year'` | The unit of `every` |
| `times` | number | Flexible: any that many days per period (week or month) |
| `days` | `[0, 2, 4]` | Fixed weekly: the weekdays (0 = Monday); default the start's weekday |
| `on` | `'day' \| 'lastDay' \| 'nth'` | Fixed monthly: a day of the month, the last day, or the n-th weekday |
| `day` | 1–31 | `on: 'day'`: the day of the month (29–31 fall on the last day of shorter months) |
| `nth`, `weekday` | 1–5 or -1 (last); 0–6 | `on: 'nth'`: e.g. the second Friday, the last Wednesday |
| `count` | number, optional | Ends after that many occurrences |

Yearly routines fall on the start's day and month.

Other activity fields:

| Field | Value | Meaning |
|---|---|---|
| `checkins` | `{ 'yyyy-mm-dd': 1 \| 0 }` | 1 = done that day; 0 = un-ticked (kept so sync merges removals). One check-in per day. |
| `startDate` | date | Routine starts (default: when created) |
| `dueDate` | date, optional | Routine ends. With `count`, set to the last occurrence. |
| `status` | always `todo` | Not used for routines |

**Older plans** stored `{ times, per: 'week' | 'month' }` or `{ days }`, and monthly `on: 'weekday'`
or `'last'` (the start's n-th or last weekday). `sched()` reads all of these, so they keep working
unchanged.

**Sync:** activities still merge newest-wins, except `checkins`, which merge per date like
current-state history (the newer version wins on the same date).

## Rules
Weeks start on Monday; months are calendar months.

**Period** – what progress is shown for:
- Flexible: its own period of `every` weeks or months, starting at the start date's week or month.
- Fixed: the calendar week (daily and weekly), month or year.

| Rule | Flexible | Fixed |
|---|---|---|
| **This period** | Check-ins in the period vs `times` | Ticked due days in the period vs due days in it |
| **Streak** | Consecutive met periods (the current one counts once met) | Consecutive ticked due days (today counts once ticked) |
| **Consistency** (from a date) | Share of met periods; the current one only once met; a partial first period only if met | Share of ticked due days up to yesterday, plus today once ticked |

Consistency with nothing to judge yet → no value. Days before the start or after the end never
count. When nothing is due in the current period (an off week, before the start), the next due
day is shown instead.

**State** (colours on map and timeline) – first match wins:
1. Ended → done
2. Not started → to do
3. Waiting for a dependency → waiting
4. Period already met → done
5. Late → flexible: can no longer be met this period; fixed: a due day this period was missed
6. Some progress → in progress
7. Otherwise → to do

**Other rules**
- For dependencies, a routine counts as complete once its end date has passed.
- **Goal "by routines"**: average consistency of the routines contributing to the goal and
  its sub-goals, measured from the goal's start date. No metric/target needed (like
  "by activities").

## UI
- **Activity form**
  - "Repeats" select: doesn't repeat / a number of times per week / a number of times per
    month / on specific days / custom….
  - Custom: "Repeats every" N day(s)/week(s)/month(s)/year(s), and what it falls on for that
    unit (weekdays, a day of the month, the last day, the n-th weekday, or a number of times).
  - "Ends": never / on a date / after N occurrences.
  - Hint that the routine runs from its start date until it ends.
  - Status is hidden for routines.
  - Existing routines show check-ins, streak and consistency.
- **Activities board**
  - A "Routines" strip above the columns. Each card shows the schedule (e.g. "every Mon, Thu",
    "3× a week"), this period's progress, the streak, and a Mon–Sun strip of a week; tap a past
    day or today to tick/untick it. The strip can step back to earlier weeks of the routine.
  - Board columns, counts and drag & drop hold one-off activities only.
- **Overview**
  - A "Routines" list of active routines with a one-tap "done today" check and this
    period's progress.
  - Next actions and done/late/waiting counts leave routines out.
- **Goal form/card**: progress option "By routines"; the card shows consistency and the
  number of routines.
- **Map**: routine boxes show this period's progress and streak, coloured by the state rules.
- **Timeline**: a routine is a bar from start to end (or a marker when it never ends). Dragging
  its dates works as for any activity, except that a routine ending after N occurrences only
  moves as a whole: its end follows from its start.
- **Tour and help**: a tour step and help tip for routines; all text in English and Slovenian.
- **Sample plan**
  - Goal "Exercise regularly", measured by routines, with "Run 3 times a week" and
    "Strength training" (Mon, Thu).
  - "Cook at home 5 days a week" is a routine.

## Testing
Browser tests for:
- period, streak and consistency maths for flexible and fixed schedules, including every N
  units, monthly rules and ending after N occurrences
- reading older `repeat` formats
- state rules
- check-in toggling from the board and the overview
- the form: create, edit, validation, switching off
- goal progress by routines
- exclusion from one-off counts
- sync merge of check-ins
- sample plan and the tour step
