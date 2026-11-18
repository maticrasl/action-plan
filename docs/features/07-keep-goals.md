# 7. Keep goals

**Goal:** a goal can be about holding something, not reaching it: "stay at or under 75 kg",
"keep at least three months of expenses", "spend no more than 400 a month on eating out". Most
results need upkeep, and today a goal simply ends when it is achieved.

Needs `08-pace-and-forecast.md` (shared graph work) and `15-notes.md` (the closing dialog).

If `06-goal-form.md` exists by the time this is built, follow its layout. This file is written
against the form as it is at `5b71e59`.

## What the user sees

### In the goal form

Section **M** gets a choice above "Progress from":

> **Kind of goal**   ( Reach a target )   ( Keep within a range )

With **Keep within a range**:

- "Progress from" is fixed to "A measurement" and hidden.
- Instead of start value, current value and target, two fields: **At least** and **At most**.
  One of them is enough; both give a range.
- For a state that adds up, the field "Counts" (per day, week, month, year) shows as today and
  must not be "in total": a running total cannot be kept in a range.
- Section **T**: the start date stays; the deadline becomes **Until** and is optional ("no end"
  when empty).
- The SMART letters: **M** lights with a metric and at least one limit (and At least below At
  most); **T** lights with a start date.

### On the goal card

```
 Keep weight at or under 75 kg                                    S M A R T
 Health
 In range 9 of 10 weeks                              ▮▮▮▮▮▮▮▮▮▯
 Body weight: 74.2 kg  ✓ in range
 Until: no end · ◐ Body weight
```

- The headline is the share of time in range since the start, said in the goal's own unit of
  time (see the rules), with a row of small marks for the last ten periods: filled when in
  range, hollow when out, dotted when there was no value.
- The current value with **in range** or **out of range** (or "above", "below" with the
  distance: "1.2 kg above").
- When the last value is old (see the rules): "Last measured 5 weeks ago" in place of the
  status, and the card's edge is plain, not red.
- The card is red (late) only while the latest value is out of range.

### On the graph

The state's graph shades the range as a band (between At least and At most; open above or
below when one is missing) in place of a target line. Points outside the band are drawn in the
warning colour. The legend says "Range of {goal}".

### Offered when a goal is reached

The closing dialog of 15 ("You reached…") gets a second part when the goal was measured by a
state:

> **Keep this result?**
> Reaching it and keeping it are two things. A keep goal watches the same measurement and tells
> you when it drifts.
> [ Set up a keep goal ]

The button opens the goal form for a new goal, filled in:

- Kind: Keep within a range; the same metric, unit, category, visions and measuring state;
- At most = the old target when lower was better; At least = the old target when higher was
  better;
- title "Keep {metric} at {target} {unit}" (editable);
- start today, no end;
- a checklist **Routines that continue**: the routines that contributed to the reached goal,
  none ticked. The ticked ones are linked to the new goal on Save.

Nothing is created until the form is saved.

## Rules

### Stored data

On the goal: `keep: { min?, max? }`, numbers. Its presence makes the goal a keep goal.
`normalize` drops a `keep` that is not an object, has neither number, or has `min` ≥ `max`.

A keep goal stores no `baseline`, `current` or `target` and no `progress` (it is always by
measurement). `deadline` may be empty. `period` as for other goals.

Everything that reads `target` must first ask `isKeep(goal)`. At `5b71e59` those are:
`smartCheck`, `goalCurrent`, `goalProgress`, `metricProgress`, `goalReached`, `lowerBetter`,
`goalCard`, `goalState`, the graph's targets (`stateTargets`, `graphCard`), the timeline's goal
bars, the "target reached" offer, the planned tips that name a target (`goal-behind`,
`goal-past`, `wrong-way`, `no-measure`), and pace (08).

### In range

`core/keep.ts`, pure:

- `inRange(keep, value)`: `min ≤ value ≤ max`, with a missing side open.
- **Plain state.** The unit of time is the week. For each complete week since the goal's
  start: the value that held at the end of the week is the latest measurement on or before
  that Sunday. A week is *in range* when that value is in range, *out* when not, and *unknown*
  when there is no measurement at all yet or the latest one is older than 28 days at that
  Sunday.
- **State that adds up**, counted per period: the unit is that period. Each complete period
  since the start is in range when its total is. A period with no entries is a total of 0 (and
  so out of range for "at least", in range for "at most"), except before the first entry ever:
  unknown.
- `keepShare(goal)`: periods in range ÷ periods that are not unknown. Nothing to judge yet
  (no complete period): none.
- `keepNow(goal)`: `in`, `out` (with the distance to the nearer limit) or `stale`:
  - plain state: `stale` when the latest measurement is older than 28 days;
  - adds up: judged on the running period only when it can no longer change the answer ("at
    most" already exceeded is `out` at once; "at least" not yet met is not `out` until the
    period ends); otherwise on the last complete period.

### How it shows as a goal

- `goalProgress`: `keepShare × 100`, or 0 when none. It enters the Overview's average like any
  goal.
- `goalReached`: never. No "target reached" toast.
- `goalState`: `late` while `keepNow` is `out`; else `doing` once started; `done` when its
  status is Achieved. The deadline does not make it late; after **Until** has passed, the card
  shows "Ended {date}" and offers "Mark as achieved" in its menu as other goals do.
- Plan badge (`planHealth`): red while out of range, as for a late goal.
- Timeline: a bar from the start to Until; with no end, to the right edge of the timeline with
  a fading end. It has no end grip to drag when there is no end.
- Map: as any goal.
- Pace (08): none.

### Tips (planned catalogue)

- New tip, class A, `keep-out`: a keep goal has been out of range for 2 complete periods
  running: "“{name}” has been out of range for {n} weeks. Is the range still the right one, or
  does the routine that held it need to come back?" Button: Open the goal. Guide: `reached`.
- `stale-state` already covers a state not measured for 14 days.

## Strings

| Key | English |
|---|---|
| `f.goalKind` | Kind of goal |
| `f.kindReach`, `f.kindKeep` | Reach a target · Keep within a range |
| `f.keepMin`, `f.keepMax` | At least · At most |
| `f.until` | Until |
| `f.untilHint` | Leave empty for no end. |
| `err.keepLimit` | Give at least one limit. |
| `err.keepOrder` | “At least” must be below “At most”. |
| `err.keepTotal` | A running total cannot be kept in a range. Choose per day, week, month or year. |
| `keep.share` | In range {n} of {total} {unit} |
| `keep.unit.*` | weeks · days · months · years |
| `keep.in`, `keep.out` | in range · out of range |
| `keep.above`, `keep.below` | {value} above · {value} below |
| `keep.stale` | Last measured {when} |
| `keep.noEnd` | no end |
| `keep.ended` | Ended {date} |
| `keep.legend` | Range of {goal} |
| `closing.keepTitle` | Keep this result? |
| `closing.keepText` | Reaching it and keeping it are two things. A keep goal watches the same measurement and tells you when it drifts. |
| `closing.keepBtn` | Set up a keep goal |
| `f.keepRoutines` | Routines that continue |
| `keep.titleFrom` | Keep {metric} at {value} |

## Guidance

- Guide, article `h-goals`: new paragraph "**Keep within a range** is for results that need
  upkeep: a weight, a balance, a limit on spending. Give “At least”, “At most” or both. The goal
  then shows how much of the time you were in range and warns when the latest value is
  outside."
- Guide, article `reached`, bullet "Decide what stays": "When you mark a measured goal
  Achieved, the app offers to set up a keep goal for the result, with the routines you choose to
  continue."
- Guide, article `words`: add "**Keep goal** – a goal about staying within a range instead of
  reaching a target."
- Templates and sample: unchanged.

## Notes for the builder

1. The form's kind choice hides and shows fields as "Progress from" does today
   (`updateProgressFields`). Switching kind on an existing goal keeps the hidden values in the
   form until Save, then stores only those of the chosen kind.
2. Switching an existing reach goal to keep (or back) is allowed. The measuring link stays.
3. The band is one `<rect>` behind the data in the existing plot, class `gr-band`. For bar
   graphs of a state that adds up it spans the plot's width at the limits' heights.
4. Do not show a streak of weeks in range as a number to beat. The share and the ten marks
   are enough, and a week out of range must not read as a counter reset.

## Test cases

Pure rules (unit tests, written first)
- `inRange`: both limits, only min, only max, on the limits.
- Plain state: weeks in range by the latest value at each Sunday; a week before the first
  measurement is unknown; a value 29 days old at a Sunday makes that week unknown, 28 does not;
  share leaves unknown weeks out.
- Adds up: per week and per month; an empty period counts as 0 after the first entry; "at
  most" exceeded on Wednesday is out at once; "at least" not met on Wednesday is not out.
- `keepNow`: in, out with distance to the nearer limit, stale.
- `normalize`: `keep` without numbers dropped; `min ≥ max` dropped; a `5b71e59` goal untouched.
- `goalProgress`, `goalReached`, `goalState` for keep goals; a keep goal never queues the
  reached toast.
- `smartCheck` for keep goals: M and T as described.

Page steps
- Create a keep goal with "At most 75", link a state, record 74: card says in range; record
  76: out of range, card red, plan badge red; record 74: back.
- The graph shows the band; a point outside is in the warning colour.
- A state that adds up with "Counts: in total" is refused with the message.
- Achieve a measured reach goal: the dialog offers the keep goal; the form is filled as the
  rules say; ticked routines are linked after Save; Cancel creates nothing.
- Timeline: a keep goal without an end draws to the edge and cannot be dragged at the end.
- The tip `keep-out` shows after two periods out of range and not after one.

Edge cases
- No measurement yet: card says "Nothing measured yet", no share, not red.
- Until in the past: "Ended", not late.
- Lower-is-better and higher-is-better prefill of the keep goal from a reached goal.
- Sync: `keep` edited on two devices, the later wins whole (it is a plain field).
- Export as template keeps `keep`; import of a file with `keep` into this version works; the
  import of such a file by a `5b71e59` copy shows a goal with no target (accepted: older copies
  update themselves).
- 360 px; both languages; plural forms of "weeks".
- Fixture: a plan with a keep goal on a plain state and one on a state that adds up.
