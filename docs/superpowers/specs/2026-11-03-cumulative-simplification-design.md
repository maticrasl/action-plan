# Cumulative states, simplified – design

Builds on `2026-10-28-cumulative-states-design.md`; everything not mentioned here stays as built.

## Why
Today "Adds up" is one of *no / per day / per week / per month / per year / in total*, and that one
choice fixes the card text, the graph and how goals read the state. A state either adds up or it
does not; how its sums are looked at is a view choice, and how a goal counts it belongs to the goal.

## Decisions (agreed)
- A state is **cumulative or plain** – no period on the state.
- A cumulative state's graph has a scale switch: **Day · Week · Month · Year · Total**.
  Periods show bars of sums, Total shows the running-sum step line.
- The chosen scale is **stored on the state** (synced, exported) and also drives the card's
  "this period" line.
- A goal measured by a cumulative state **picks its own period** (in total / per day / week /
  month / year).
- The card shows the total, plus this period's sum when the scale is a period.

## Data
| Where | Field | Value | Meaning |
|---|---|---|---|
| State | `cumulative` | `true` | Adds up; absent = plain state (unchanged) |
| State | `scale` | `'day' \| 'week' \| 'month' \| 'year' \| 'total'` | Graph scale last chosen; default `'total'` |
| Goal | `period` | `'total' \| 'day' \| 'week' \| 'month' \| 'year'` | How a cumulative measuring state is counted; default `'total'`. Ignored for plain states |

`entries`, `droppedEntries`, the stored `value`/`date` copy and sync of entries are unchanged. The
stored `value` becomes the total of all entries (it no longer depends on a period).

### Helpers
- `stateTotal(s, period, iso)` – the sum of the `period` around `iso`, or of everything up to
  `iso` for `'total'`.
- `periodTotals(s, period)` – the bars for a period, as today but with the period passed in.
- `stateValue(s)` – for a cumulative state, the total of all entries ('' with no entries).

### Migration (on load, import, sync merge of an older copy)
A state whose `cumulative` is a string:
- `'day' | 'week' | 'month' | 'year'` → `cumulative: true, scale: <same>`;
- `'none'` → `cumulative: true, scale: 'total'`;
- every goal it *measures* that has no `period` gets the state's old setting (`'none'` → `'total'`),
  so existing goals keep counting exactly as before.

Idempotent; runs before goals are checked for the "target reached" toast. The Marathon template
(`cumulative: 'week'`) and the tour sample plan are written in the new form, their goals with
`period: 'week'`.

Known limit: a device still running the previous version reads `cumulative: true` wrongly until it
updates; the new version reads both forms.

### Converting
Plain ↔ cumulative as today (with the confirmation). "Between periods" no longer exists.

## State form and card
- Form: "Adds up" becomes a yes/no choice (a two-option select, like the form's other fields) (hint: "Each amount adds to the total"). Value field /
  entry list as today.
- Card: "2,450 km in total"; when `scale` is a period also "18 km this week" (this period's sum).
  The **+** button and popover are unchanged.

## Graphs
- A cumulative state's card gets a segmented switch above the chart: Day · Week · Month · Year ·
  Total, the current `scale` selected. Choosing one saves `scale` on the state (a normal saved
  change, synced) and redraws that card.
- Period scales: the bars as today (lighter current period, table newest first with expandable
  entries, "vs previous <period>" tag, legend, sideways scroll for long histories).
- Total: the step line as today ("added in the last 30 days" tag).
- Target lines: from goals measured by the state, as today. A goal's target is drawn only on the
  scale matching its `period` (a weekly target on monthly bars would mislead).
- Plain states and routine graphs are unchanged.

## Goals
- Goal form: when the goal is measured by a cumulative state, a **Counts** select appears:
  in total / per day / per week / per month / per year (default in total).
- Everything that read the state's period now reads the goal's `period`:
  - current value: per period – the higher of this and the last complete period; in total – the sum;
  - reached (toast): per period – only the last complete period counts;
  - goal card line "This week: 18 km · last week: 24 km";
  - in-total baseline hint in the goal form.
- Several goals can count the same state differently (e.g. 30 km per week and 1,000 km in total).

## Wording, tutorial, help
EN + SL for: the checkbox and hint, the scale switch, card lines, the Counts select, changed
goal-card lines. Tour steps (States, Graphs, Goals) and help tips (`help.view.states`,
`help.view.graphs`, `help.tip.stateValue`, the goal form) say that a state adds up or not, the graph
switches between periods, and a goal picks how it counts. Unused `cu.*` keys for the old
per-period options are removed.

## Testing (tests/more.js, full suite)
- Migration: each old value, goals getting `period`, idempotent, import of an old export, sync
  with an older copy.
- Graph switch: each scale renders, the choice is saved and synced, the card line follows it,
  target lines only on the matching scale.
- Goals: per-week goal on a state whose scale is month; in-total goal; two goals on one state;
  reached only on complete periods; Counts select shown only for cumulative measuring states.
- Converting plain ↔ cumulative; Marathon template; tour on the sample plan; phone width.

## Out of scope
- Quarters (for states and routines); "every N weeks" periods; notes on entries.
