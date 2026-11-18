# 8. Pace line and forecast

**Goal:** a measured goal says whether it is on the way, what it needs from here, and when it
would arrive at the present rate. Today a goal shows a percentage and a deadline, and the person
has to work out the rest.

## What the user sees

### On the graph (Graphs view)

For a current state that measures a goal with a target and a deadline:

- a thin dashed **pace line** from the goal's start (start date, starting value) to its target
  on the deadline,
- in the stats above the graph, two facts:

  > Needs **0.4 km a week** from here · At this rate: **14 March** (deadline 1 June)

- a faint dotted line continuing the recent trend to the right edge of the graph.

The legend gets "Pace to target". With several goals on one state, each goal has its line and
its facts on a line of its own, named by the goal.

### On the goal card

A small tag beside the deadline tag:

| Tag | When |
|---|---|
| **Ahead** | the value is beyond where the pace line is today |
| **On pace** | within the margin of the pace line |
| **Behind pace** | short of it; the card adds "needs 0.4 km a week" in the meta line |
| *(none)* | not enough to say (see the rules) |

For a goal measured by **activities done**: the tag compares the share done with the share of
the time gone, and the meta line says "3 of 8 steps · 60 % of the time gone" when behind.

A goal measured by **routines kept** shows no pace: it has no finishing line.

Paused and achieved goals show no pace.

### Words for the forecast

| Situation | Text |
|---|---|
| trend reaches the target before the deadline | At this rate: {date} |
| after the deadline | At this rate: {date}, {n} weeks after the deadline |
| trend is flat or moving away | At this rate the target is not reached. |
| fewer than 3 measurements, or all within 14 days | *(no forecast shown)* |
| target already reached | *(no pace, no forecast; the "target reached" offer covers it)* |

## Rules

`core/pace.ts`, pure. Everything takes the goal, the series of points and today.

### Which goals

- Own measurement (`ownMetric`), a numeric target, a deadline, a start date, a measuring state
  with at least one value.
- A plain state: the series is its measurements.
- A state that adds up, counted **in total**: the series is its running total (as
  `totalGraphCard` draws it); the starting value is the goal's baseline.
- A state that adds up counted **per day, week, month or year**: no pace and no forecast. Its
  target is met or not in each period; the graph's target line already shows that.
- Keep goals (07): none.

### Pace

- `paceAt(goal, day)` = baseline + (target − baseline) × share of the time between start and
  deadline that has passed on `day`, held between 0 and 1.
- `paceStatus(goal, current, today)`: the gap between the current value and `paceAt(today)`,
  as a share of |target − baseline|, signed toward the target:
  - more than +5 %: `ahead`; within ±5 %: `on`; below −5 %: `behind`.
  - before the start date: none. After the deadline: none (the late mark speaks).
- `neededRate(goal, current, today)`: (target − current) ÷ weeks left to the deadline, shown
  per week with the unit; when less than two weeks are left, per day. Rounded to two
  significant digits. Not shown when the target is reached or the deadline has passed.

### Forecast

- `trend(points, today)`: a straight line by least squares through the measurements of the
  last 42 days; when fewer than 3 fall in that time, through the last 5 measurements. It needs
  at least 3 points spanning at least 14 days; otherwise none.
- `forecast(goal, points, today)`: the day the trend line reaches the target, starting from
  the latest value. A slope that points away from the target, or is zero, gives "not reached".
  A day more than five years away also gives "not reached".
- The dotted line is the trend from the latest point to the right edge of the plot.

### Activities-done goals

- Share done = done ÷ counted activities (`countedActivities`); share of time = as in
  `paceAt`. Status by the same ±5 points. No needed rate, no forecast.

### One source

The planned tip `goal-behind` ("progress more than 30 points under the share of its time that
has passed") must use `paceStatus` and the gap it returns, so that the tip and the tag can
never disagree. Change the tip's condition to: `behind`, the gap is over 30 points, and the
deadline is within 14 days.

### Drawing

- The pace line and the trend line are two `<line>`/`<path>` elements in the existing plots
  (`graphCard` for plain states, `totalGraphCard` for running totals). No new chart type.
- The pace line starts at the goal's start date; when that is before the first measurement,
  the plot's left edge does not move: the line is clipped there.
- The time axis already runs to the latest deadline; nothing else changes the scales.
- Classes `gr-pace` (dashed, thin, in the target line's colour at lower strength) and
  `gr-trend` (dotted, muted). Both must read in the light and the dark theme.
- The hover tooltip of a point adds "pace: {value}" for that day when a pace line exists.
- Draw time stays inside the graph budgets in `npm run perf`.

## Strings

| Key | English |
|---|---|
| `pace.ahead`, `pace.on`, `pace.behind` | Ahead · On pace · Behind pace |
| `pace.needsWeek` | Needs {value} a week from here |
| `pace.needsDay` | Needs {value} a day from here |
| `pace.needsShort` | needs {value} a week |
| `pace.forecast` | At this rate: {date} |
| `pace.forecastLate` | `{ one: 'At this rate: {date}, {n} week after the deadline', other: 'At this rate: {date}, {n} weeks after the deadline' }` |
| `pace.never` | At this rate the target is not reached. |
| `pace.steps` | {done} of {total} steps · {pct} % of the time gone |
| `pace.legend` | Pace to target |
| `pace.tip` | pace: {value} |

## Guidance

- Guide, article `h-graphs`: add "For a goal with a target and a deadline, the graph also draws
  the pace: a thin dashed line from your start to the target. Above it you see how much is
  needed each week from here, and when you would arrive at the present rate."
- Guide, article `behind`: at the top, "The goal card says “Behind pace” and how much a week
  would be needed from here. That number is the honest starting point for the three options."
- Guide, article `no-progress`, first bullet ("Is it too early?"): add "The forecast looks at
  the last six weeks, not at the last measurement."
- No new tip.

## Notes for the builder

1. Early in a goal a tag saying "Behind pace" after two measurements would discourage. That is
   why status needs the start date to have passed and the forecast needs three points over two
   weeks. Do not loosen these.
2. Lower-is-better goals (weight) work by the sign of target − baseline. Test both directions.
3. The words "ahead" and "behind" are about the line, not about the person. No colour stronger
   than the existing tags (`ok`, plain, `warn`); `behind` is `warn`, not `bad`.

## Test cases

Pure rules (unit tests, written first)
- `paceAt`: at start = baseline, at deadline = target, halfway = middle, before and after held;
  lower-is-better.
- `paceStatus`: each border of ±5 % on both sides, both directions; none before the start and
  after the deadline.
- `neededRate`: per week; per day under two weeks; none when reached or past the deadline;
  rounding (0.4, 12, 1,500).
- `trend`: fewer than 3 points none; 3 points over 13 days none, over 14 days yes; uses 42 days
  when 3 or more fall inside, else the last 5.
- `forecast`: reaches before, after (weeks counted), flat, away, beyond five years.
- Running total series for a state that adds up; per-period goals give none.
- Activities-done: status by shares.
- The tip `goal-behind` fires exactly when `paceStatus` is `behind` with a gap over 30 and 14
  days or fewer are left.

Page steps
- A state measuring one goal: the pace line and both facts show; changing the deadline moves
  the line; a new measurement changes the tag on the goal card.
- Two goals on one state: two lines, two fact lines, each named.
- A routines-kept goal and a paused goal show no tag.
- Tooltip shows the pace value.

Edge cases
- Start date after today; deadline today; baseline equal to current; target equal to baseline
  (already refused by the form).
- A single measurement: tag shows, no forecast.
- Very long series (1,100 amounts): inside the draw budget.
- Light and dark theme screenshots; 360 px: the facts wrap to two lines.
- Both languages; numbers with decimal comma in Slovenian.
