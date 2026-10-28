# Cumulative states – design

## Why
A current state holds the latest value of a measurement: one value per date, a new one replaces
the old. Totals that grow – km run, money saved, pages read – have to be summed by hand, and a
goal like "run 30 km per week by June" has nothing to measure it. Routines know how often
something was done, but not how much, and a run has to be entered twice (tick the routine, update
the state).

Goals of this change:
- states that **add up**, either per calendar period (day, week, month, year) or in total;
- one entry after a run updates both the routine and the state;
- routines get their own graph (check-ins per period);
- goals can be measured by period totals ("30 km per week by June");
- every goal offers to be marked achieved when it reaches its target.

Constraint: no new item kind or tab; plain states and everything else keep working as before.

## Decisions (agreed)
- Cumulative is an **option on a state**: "Adds up: no / per day / per week / per month / per
  year / in total".
- Periods are **calendar periods** only (weeks run Monday–Sunday). "Every N weeks" can be added
  later without changing stored data.
- A cumulative state stores **separate entries** (several per day are fine). Plain states keep
  `history`, where a new value on the same date still replaces the old one.
- Routine ↔ state integration works **both ways**, through the existing *improves* link.
- A goal measured by a period state uses **the higher of this period's total and the last
  complete period's total**.
- Routines get their own graph in the Graphs view.
- A "target reached – mark as achieved?" toast for **all** goal kinds; goals never become
  achieved by themselves.

## Data
On the state; if `cumulative` is absent, it is a plain state (unchanged).

| Field | Value | Meaning |
|---|---|---|
| `cumulative` | `'none' \| 'day' \| 'week' \| 'month' \| 'year'` | Adds up in total (`'none'`) or per calendar period |
| `entries` | `[{ id, date, amount, routine? }]` | One per amount added; `amount` a numeric string like `value` |
| `entries[].routine` | activity id | The routine whose tick this entry belongs to |
| `droppedEntries` | `{ [entryId]: 1 }` | Deleted entries, so syncing with an older copy does not bring them back |

`value` and `date` stay on the state as a stored copy, refreshed after every change, so older
code and exports still see a number. Because a period total changes when a period ends without
any edit, readers go through `stateValue(s)` / `stateDate(s)`, computed from the entries:
- per period: the current period's total (0 when the period has no entries yet, '' when the state
  has no entries at all);
- in total: the sum of all entries;
- `date`: the latest entry's date.

Shared helpers (plain functions next to the routines' period code, reusing `unitIndex` and
`unitFrom`):
- `calPeriod(unit, iso)` → `{ from, to }` of the calendar day/week/month/year around a date;
- `periodTotals(s)` → `[{ from, to, total, entries }]` from the first entry's period to today's,
  empty periods included;
- `stateTotal(s, iso)` → the total of the period around `iso` (or of everything up to `iso`).

### Sync
`mergeState` (js/sync.js) for cumulative states: entries from both copies are combined by id;
an id in `droppedEntries` on either side is removed (and the tombstones are combined); on an id
clash the newer state's copy wins. Then `value`/`date` are recomputed. Plain states merge
`history` as today.

### Converting
In the state form, changing "Adds up":
- plain → cumulative: each measurement in `history` becomes one entry; `history` is kept on the
  state (unused) so switching back loses nothing that was not changed meanwhile;
- cumulative → plain: each day's entries are summed into one measurement for that date;
- between periods (week → month): nothing is converted, only the totals change.
Plain ↔ cumulative asks for confirmation, saying how the values will be read from now on.

## Entering amounts
**State side**
- Card: a cumulative state shows its total – "18 km this week", "€2,450 in total" – and a **+**
  button. It opens a small popover: amount (with the unit) and date (today). Enter adds the
  entry; Esc closes.
- Form: the Value field becomes **Add amount** (amount + date). The history list becomes the
  entry list, newest first, grouped by day; × marks an entry to delete when the form is saved
  (Cancel keeps it). An entry with a wrong amount or date is deleted and added again – entries
  are not edited in place.

**Routine side** (routine card week strip, earlier weeks, Overview routine rows)
- Ticking a day of a routine that *improves* one or more cumulative states opens a small amount
  popover by the tick, one field per such state (with its unit).
  - Enter: ticks the day and adds an entry (tagged `routine`) to each state with an amount.
  - Empty + Enter, or Esc: only ticks.
- Plain linked states are not touched.

**Keeping them in step**
| Action | Effect |
|---|---|
| Add an entry on a state | Ticks every linked routine on that date (when the routine runs then); tagged with the routine if exactly one is linked |
| Untick a routine's day | Removes that day's entries tagged with the routine |
| Delete a tagged entry | Unticks the routine that day if it has no other tagged entry then |

A day is ticked once; its amounts add up. A routine is only ticked on days it runs (from its
start date, up to its due date).

## Graphs
**Period states** – bars, one per period from the first entry's period to today's; the current
period's bar is lighter (not finished). The axis ends with the period under way (a far deadline
would squeeze the bars); target lines run across it, as on line graphs. Hover or
tap: "Week of 20 Oct: 24 km (3 entries)". The table lists periods newest first, each expandable to
its entries, which can be deleted there. The change tag compares the last complete period with
the one before ("+6 km vs previous week"). Bars are at most 44 px wide and at least 12 px per
period; a longer history (daily states, years of weeks) scrolls sideways inside the chart and
opens at its latest bars.

**In-total states** – a step line of the running sum, a step per entry; target lines as today;
the change tag shows what was added in the last 30 days.

**Routines** – a card for each routine with at least one check-in, after the state cards: bars
of check-ins per period (the routine's own period: week, month or year), a dashed line at the
period's target, bars that reach it filled as met. Hover: "Week of 20 Oct: 2 of 3". The tag shows
the current streak. The item menu's "Show in" offers Graphs for such routines.

## Goals
A goal measured by a cumulative state keeps baseline, target and the *measures* link; its
current value is:

| State | Current value |
|---|---|
| Plain | Latest measurement (unchanged) |
| Per period | The higher of this period's total and the last complete period's total |
| In total | The sum of all entries |

"The higher" also works for goals that go down (spend under €300 a month): a half-finished
month only counts once it is already worse than the last full one.

- The goal card of a period-measured goal adds a line: "This week: 18 km · last week: 24 km".
- In the goal form, a goal measured by an in-total state that has entries gets a hint under its
  starting value with the current total, so "save €6,000 more" can start from it and not count
  earlier savings (the field is not filled in for you).
- When several states measure a goal, the most recently updated one wins, as today.

### "Target reached" toast (all goals)
- `toast(msg, { label, run })`: an optional action button; a toast with an action stays about
  8 seconds. Existing calls are unchanged.
- After every saved change (and on each render, as a period can end without one), each active
  goal is checked: *reached* is progress ≥ 100 %, except for goals measured by a period state,
  where only the **last complete period** counts. Goals measured by their routines are never
  offered: consistency has no target and is 100 % after the first tick.
- Reached and not yet offered → toast "‘{goal}’ reached its target. Mark as achieved?" with
  **Mark achieved**, and the goal stores `offeredAt` (synced like any goal field). Several goals
  at once → one toast at a time, the rest after the next one closes.
- No longer reached → `offeredAt` is cleared, so it is offered again next time.
- The first check of each plan on a device (remembered in local preferences) sets `offeredAt`
  silently, so existing, imported and template plans do not show a burst of toasts.

## Wording, templates, tutorial
- EN + SL for every new and changed text: form option and labels, card totals, popovers, entry
  list, graph tooltips/table/legend, routine graph, the goal card line, the toast, conversion
  confirmations.
- Marathon template: **Weekly distance** becomes a weekly cumulative state; its description says
  each run adds to it.
- Tour sample plan: a weekly cumulative "km run" state with a few weeks of entries, improved by
  the "run 3 times a week" routine and measuring a "30 km per week" goal.
- Tour steps: States mentions adding up per day/week/month or in total; Graphs mentions bars for
  totals and routine graphs; Routines mentions that a tick can add an amount to a linked state.
- Help: `help.view.states`, `help.view.graphs`, `help.tip.stateValue` updated; new tips for the
  **+** button and the amount popover.

## Testing (tests/more.js, full suite)
- Totals: period boundaries (Sunday→Monday, month end, year end, day), in total, several entries
  a day; plain states still replace on the same date; `stateValue` changes when a period ends
  without an edit.
- Sync: entries added on both sides, deleted on one, clashing ids; tombstones; value recomputed.
- Routine link: tick → amount → entry; Esc only ticks; untick removes tagged entries; deleting the
  last tagged entry unticks; moving an entry moves the tick; an entry on the state ticks the
  routine; no tick outside the routine's dates; plain linked states untouched.
- Converting both ways and between periods.
- Goals: higher of this and last period (rising and falling goals), in-total baseline hint, the
  toast (complete periods only, offered once, offered again after dropping below, silent on
  first load, queued for several goals), the toast's button.
- Graphs: bars, step line, routine graph, tooltips, deleting entries from the table, Show in.
- Wording in both languages, the tour on the sample plan, phone width.

## Out of scope
- "Every N weeks" periods for states.
- Goals that ask for N periods in a row (routines cover streaks).
- Notes on entries (parked idea; an entry could later carry a `note`).
