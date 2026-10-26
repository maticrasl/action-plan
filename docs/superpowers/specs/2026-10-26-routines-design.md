# Routines (repeating activities) – design

## Why
The app tracks one-off steps (activities) and numbers moving toward a target (states, goals).
Changing behaviour needs something that repeats – "exercise 3× a week" – with a sense of whether
this week is on track, how long the streak is, and how consistent the habit has been. The aim is
to add this without new tabs or a new item kind, keeping everything that exists working as before.

## Decisions (agreed)
- A routine is an **activity that repeats**. One-off activities are unchanged.
- Two schedules, chosen per routine: **N times per week / per month** (any days), or
  **specific weekdays** (e.g. Mon, Wed, Fri; all seven days = daily).
- A routine links like any activity (contributes to goals, improves states, sub-activity,
  depends on). A goal can optionally measure progress **by its routines' consistency** –
  a third option next to "by a metric" and "by its activities".
- Developed on the `routines` branch; not merged into `main` until reviewed.

## Data
Stored on the activity (absent = one-off activity):
- `repeat`: `{ times: 3, per: 'week' | 'month' }` or `{ days: [0, 2, 4] }` (0 = Monday).
- `checkins`: `{ 'yyyy-mm-dd': 1 | 0 }` – 1 = done that day; 0 = un-ticked (kept so sync merges
  removals). One check-in per day.
- The routine runs from `startDate` (default: when created) to `dueDate` (optional end).
  `status` is not used for routines (kept as `todo`).

Sync: activities still merge newest-wins, except check-ins, which merge per date like
current-state history (the newer version wins on the same date).

## Rules
- Weeks start on Monday; months are calendar months.
- **This period** (count mode): check-ins in the current week/month vs `times`.
  (Days mode): ticked due days this week vs due days this week.
- **State** (colours on map, timeline): ended → done; not started → to do; waiting for a
  dependency → waiting; period already met → done; can no longer be met this period (count) or a
  due day this week was missed (days) → late; some progress → in progress; else to do.
- **Streak**: count mode – consecutive met periods (the current one counts once met);
  days mode – consecutive ticked due days (today counts once ticked).
- **Consistency** from a date: count mode – share of met periods (the current one only once met;
  a partial first period only if met); days mode – share of ticked due days up to yesterday,
  plus today once ticked. Nothing to judge yet → no value.
- A routine counts as complete (for dependencies) once its end date has passed.
- **Goal "by routines"**: average consistency of the routines contributing to the goal and its
  sub-goals, from the goal's start date. No metric/target needed (like "by activities").

## UI
- **Activity form**: "Repeats" select (doesn't repeat / times per week / times per month /
  on specific days), a "how many times" field or weekday toggles, a hint that start/due dates
  bound the routine. Status is hidden for routines. Existing routines show check-ins, streak
  and consistency.
- **Activities board**: a "Routines" strip above the columns. Each card shows the schedule, this
  period's progress, the streak, and a Mon–Sun strip of this week: tap a past or today's day to
  tick/untick it. Board columns, counts and drag & drop hold one-off activities only.
- **Overview**: a "Routines" list (active routines) with a one-tap "done today" check and this
  period's progress; next actions, done/late/waiting counts leave routines out.
- **Goal form/card**: progress option "By routines"; the card shows consistency and the number
  of routines.
- **Map**: routine boxes show this period's progress and streak, coloured by the rules above.
- Tour step and help tip for routines; all text in English and Slovenian.
- **Sample plan**: a goal "Exercise regularly" measured by routines, with "Run 3 times a week"
  and "Strength training" (Mon, Thu); "Cook at home 5 days a week" becomes a routine.

## Testing
Browser tests for: period/streak/consistency maths for both schedules, state rules, check-in
toggling from board and overview, the form (create, edit, validation, switching off), goal
progress by routines, exclusion from one-off counts, sync merge of check-ins, sample plan and the
tour step.
