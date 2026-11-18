# 16. "Is it working?"

**Goal:** for a routine that is meant to improve a current state, show whether the state moved
more in the weeks the routine was kept than in the weeks it was not. The link "improves" is a
guess the person made; the app holds both series of data and can say, carefully, whether the
guess shows in them.

## What the user sees

### In Graphs

The card of a current state that at least one routine improves gets a fold under its table:

```
 ▾ Is it working?

 Run after work  (3 times a week)
   Weeks you kept it (7):      Longest run rose 0.4 km a week on average      ▮▮▮▮▮▮▮▮
   Weeks you did not (5):      Longest run rose 0.1 km a week on average      ▮▮
   In your numbers, the weeks you kept it went better.

 Stretch after running  (after every run)
   No clear difference yet between weeks kept (6) and not kept (4).

 Strength workout  (twice a week)
   Not enough weeks to compare yet: 2 kept, 1 not. It takes at least 4 of each.

 This is a pattern in your own numbers, not proof. Other things changed in those weeks too.
```

The routine's own graph card shows the same lines for each state it improves, under the same
fold.

- The two bars are drawn to the same scale; a fall is drawn to the left of a centre line.
- When lower is better for the goal the state measures, "went better" follows that (a larger
  fall is better). When no goal says which way is better, the last line only states the
  difference: "The weeks you kept it, it rose more."
- The closing sentence is always shown when any result is shown.

### In the monthly review (14)

One line per result of the kind "went better" or "went worse", the clearest first, at most
three.

### Nowhere else

No tag on cards, no tip that says "this routine works". The planned tip `wrong-way` gets a
second button, "Is it working?", that opens the state's graph with the fold open.

## Rules

`core/working.ts`, pure: `compare(routine, state, goals, today)` →
`{ kind: 'better' | 'worse' | 'none' | 'few', kept: { n, mean }, missed: { n, mean }, unit }`.

### Which pairs

- A routine (or routine list) with an *improves* link to the state.
- **Left out:** a state that adds up whose amounts come from this routine's ticks (ticking asks
  "how much?" and adds an amount carrying the routine's id). There the answer is built in: more
  ticks are more amounts. Decide by whether any of the state's amounts in the compared time
  carries this routine's id.
- One-time activities are not compared.

### Weeks

- The unit is the calendar week (Monday to Sunday), whatever the routine's own period, except
  for routines that repeat monthly or yearly: those are not compared (too few periods; kind
  `few` with no counts shown, the line reads "Compared by week only; this routine repeats too
  seldom.").
- Compared weeks: complete weeks in which the routine was running for the whole week, and for
  which the state's change can be worked out (below). Not more than the last 52.
- **Kept** / **not kept** for a week:
  - flexible routine ("3 times a week"): kept when the week's target was met;
  - set days: the share of due days kept (made-up days count as kept, by `keptDay`): kept at
    75 % or more, not kept under 50 %; weeks in between are left out of both groups;
  - a routine with no due day in a week (every two weeks): that week is left out.

### The state's change in a week

- **Plain state.** The value at a Sunday is read off the straight line between the measurement
  before and the one after it (the measurement itself when one falls on that day). The change
  in a week is the value at its Sunday minus the value at the Sunday before. Weeks outside the
  first-to-last measurement cannot be worked out. Weeks in which neither that week nor a
  neighbouring week has a measurement (a gap of more than 21 days between the measurements
  around it) are left out: the line there is a guess.
- **State that adds up** (amounts not from this routine): the change is the week's total.

### Verdict

- Fewer than 4 kept weeks or fewer than 4 not-kept weeks: `few`.
- Otherwise the difference of the two means, divided by the spread of all compared weeks
  together (pooled standard deviation). When the spread is 0: `none` if the means are equal,
  else by the sign of the difference.
  - at least 0.5 toward the good direction: `better`;
  - at least 0.5 toward the bad direction: `worse`;
  - in between: `none`.
- The good direction: toward the target of an active goal the state measures (the first by
  deadline); for a keep goal (07) with only "At most", lower is good, with only "At least",
  higher is good; with no such goal, or a keep goal with both limits, the kinds
  `better`/`worse` are replaced by `more`/`less` and the wording only describes.

Constants (4 weeks, 0.5, 75 %, 50 %, 21 days, 52 weeks) are named in one place.

### Performance

Worked out when the fold is opened, per pair, and remembered until the plan changes. Not
computed while drawing the Graphs view.

## Strings

| Key | English |
|---|---|
| `work.title` | Is it working? |
| `work.kept` | `{ one: 'Week you kept it ({n}):', other: 'Weeks you kept it ({n}):' }` |
| `work.missed` | `{ one: 'Week you did not ({n}):', other: 'Weeks you did not ({n}):' }` |
| `work.rose`, `work.fell`, `work.flat` | {state} rose {value} a week on average · {state} fell {value} a week on average · {state} stayed the same on average |
| `work.total` | {state}: {value} a week on average |
| `work.better` | In your numbers, the weeks you kept it went better. |
| `work.worse` | In your numbers, the weeks you kept it went no better; the other weeks went better. |
| `work.more`, `work.less` | The weeks you kept it, it rose more. · The weeks you kept it, it rose less. |
| `work.none` | No clear difference yet between weeks kept ({kept}) and not kept ({missed}). |
| `work.few` | Not enough weeks to compare yet: {kept} kept, {missed} not. It takes at least 4 of each. |
| `work.seldom` | Compared by week only; this routine repeats too seldom. |
| `work.caution` | This is a pattern in your own numbers, not proof. Other things changed in those weeks too. |

## Guidance

- Guide, article `no-progress`, bullet "Are these the right steps?": add "Under a state's graph,
  “Is it working?” compares the weeks you kept a routine with the weeks you did not. It needs a
  couple of months of ticks and measurements before it says anything." Action: Open Graphs.
- Guide, article `h-graphs`: one sentence naming the fold, and "It shows a pattern, not a
  proof."
- Guide, article `limits`: the bullet "It does not know your field" stays true; add nothing.

## Notes for the builder

1. This is the feature most able to mislead. The limits (four weeks each side, the 0.5 margin,
   the caution line) are part of the design, not polish. A result that cannot be shown
   honestly is not shown.
2. A routine kept every single week has no "not kept" weeks and will always say `few`. That is
   right: there is nothing to compare with. The `few` text covers it.
3. The bars are plain rectangles in a small inline SVG, not the graph plot. Use the `dataviz`
   skill before drawing them.
4. All arithmetic on values goes through the app's number formatting (`fmtNum`, `withUnit`),
   including decimal commas.

## Test cases

Pure rules (unit tests, written first)
- Kept / not kept: flexible met and not met; set days at 75 % and just under, at 50 % and just
  under; made-up days; a week without due days left out; a week in which the routine started on
  Wednesday left out.
- Change of a plain state: measurement on the Sunday; between two measurements; outside the
  first-to-last range not computed; a 22-day gap leaves the weeks inside it out, 21 does not.
- State that adds up: weekly totals; amounts carrying this routine's id make the pair left out;
  amounts from another routine do not.
- Verdict: 3 and 4 weeks on each side; a difference of exactly 0.5 spreads is `better`; just
  under is `none`; opposite sign `worse`; zero spread.
- Direction: higher target, lower target, keep goal with one limit, no goal.
- Not more than 52 weeks used; monthly routine gives the `seldom` line.
- Same input, same output; nothing depends on today's date except which weeks are complete.

Page steps
- A sample built for the test (12 weeks, kept in 7, clear effect): the fold shows the two
  lines, the bars and the "went better" sentence; the routine's card shows the same.
- A pair with too little data shows the `few` text with the counts.
- The monthly review lists the clear result.
- The tip `wrong-way` has the second button and it opens the fold.

Edge cases
- A state improved by three routines: three blocks, one caution line.
- A routine improving a state with no measurements: nothing shown for it.
- Deleted measurement: the result changes on the next opening of the fold.
- 360 px: bars under the text; both languages; numbers with decimal comma.
- Speed: opening the fold on a state with 1,100 amounts and 2 years of ticks stays under
  100 ms; the Graphs view's own draw budget is unchanged.
