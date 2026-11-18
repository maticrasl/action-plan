# 14. Reviews

**Goal:** the plan is looked at on a rhythm that matches its levels: steps every week, goals
every month, visions every year. Each review shows what happened, asks one or two questions,
lets the plan be fixed on the spot, and keeps what was written. The planned Guide has a
five-line weekly checklist that stores nothing; this replaces it with a real screen.

Three sessions: **A** weekly, **B** monthly, **C** yearly. A needs `00-foundation`, `09-today`,
`12-replan`, `13-done-log`, `15-notes`. B also uses `03`, `08`, `16`, `21`, `30` where they are
built. C also uses `01`.

Read `README.md` first (decisions 5 and 6, "Navigation", "Voice").

## The Review view

A new view, **Review**, in the navigation after Graphs. At its top, a switch:

**This week · This month · This year · Done log · Past reviews**

- *Done log* is feature 13.
- *Past reviews* lists finished reviews, newest first, by kind. Opening one shows what was
  written and the facts kept with it, read-only, with Delete in its menu.
- The view opens on "This week".
- All reviews cover every plan that is not a demo. Where a list has items from more than one
  plan, items carry a small plan name.
- The Add button adds to the open plan, as on the Overview.

A small dot shows on the Review nav item when the week that ended last Sunday has no finished
weekly review and the user has at least one active goal. It goes when that review is finished
or when the next Sunday passes. No other reminder exists; the planned tips `week`, `month` and
`new-year` open the matching review with their button.

## A. The weekly review

One scrolling page of five numbered parts, each a section with a short lead. Nothing is forced:
any part can be left as it is.

**Which week.** Monday to Thursday it reviews the week that ended last Sunday; Friday to Sunday
it reviews the week under way. Arrows beside the title go to other weeks; a week with a
finished review shows it (editable, see below).

```
 Weekly review · 10–16 November                                          ◂  ▸

 1  WHAT YOU DID
    4 steps done · 9 routine days ticked · 2 values recorded
    [the week's done log, folded to five lines, "Show all"]
    Forgot to tick something?
      Run after work           M T W T F S S
      ○ Buy running shoes                                 ▸ Run 5 km

 2  MEASURE
    These have no value from this week:
      Longest run        last: 3.2 km on 4 Nov        [ 3.4      ] km  [Record]
      Savings            last: 1,200 € on 1 Nov       [          ] €   [Record]

 3  LOOK BACK
    What went well?                         [                                  ]
    What got in the way?                    [                                  ]

 4  FIX THE PLAN
    3 steps are past their date                                    [ Move late steps… ]
    “Write the CV” has been in progress for 4 weeks                [ Open ]
    “Run after work” was kept about a third of the time            [ Edit the routine ]
    “Run 5 km” passed its date at 60 %                             [ Open the goal ]

 5  NEXT WEEK'S ONE THING
    Which step matters most next week?
    ( Book the sports-medicine check-up ▾ )      or  [ Add a step ]

 [ Finish review ]
```

1. **What you did.** The week's counts and done log (13), all plans. Under it, "Forgot to tick
   something?": routines with a due day in the week that is not ticked (their week strip, set
   to that week), and steps that were due in the week and are not done (with the status circle).
   Ticking here is the normal tick, dated as the strip says.
2. **Measure.** Current states that measure an active goal and have no value dated in the
   reviewed week (for a state that adds up: no amount in the week). Each with its last value
   and a field; Record saves it with today's date (or, when reviewing a past week, asks nothing
   more: today's date). At most eight are listed, the longest unmeasured first, then "and {n}
   more" linking to Current states.
3. **Look back.** Two optional text fields. Saved with the review.
4. **Fix the plan.** Lines for what needs a decision, each with one button. The conditions are
   the ones of the planned tips, reused from `core/guidance/`: late steps (opens the dialog of
   12 for that plan), a step in progress for 21 days or more (`stuck-step`), a routine kept
   under half over three weeks (`routine-low`), a goal past its deadline (`goal-past`), a goal
   behind with the deadline near (`goal-behind`), a step waiting for one not started
   (`waiting`). When nothing applies: "Nothing needs fixing."
5. **Next week's one thing.** A picker of not-done steps from all plans, due soonest first
   (the picker of 09). The choice becomes the focus of the **coming** week when the review is
   done Friday to Sunday, and of the week under way when done Monday to Thursday.

**Finish review** stores the review, sets the focus, shows the toast "Review done. See you next
week.", sets `seen.lastReview` (so the planned tip `week` and the walkthrough task `review`
keep working), and shows the finished state: the same page, with the button replaced by "Done
on {date}" and an **Edit** link that makes the two text fields editable again.

### Rules (weekly)

- `reviewWeek(today)` → the Monday of the week under review. Pure.
- Stored in the journal (`00-foundation.md`):

  ```
  { id, kind: 'week', period: '2026-W46', doneAt,
    answers: { well, hard, focus: { plan, item, title } | null,
               stats: { steps, routineDays, values, goals } },
    updatedAt }
  ```

  `stats` is the count at the moment of finishing, kept so that a past review reads the same
  later. `focus.title` is kept in case the step is deleted.
- Parts 1, 2 and 4 are live views of the plans; they are not stored. Changes made in them are
  normal changes.
- A second "Finish" for a week that has a review updates that review.
- Text fields hold up to 2,000 characters and are saved as a draft in a device preference
  while the review is not finished (`reviewDraft.<period>`), so closing the app loses nothing.
- Demo plans are left out everywhere. With no plan that has items: the view shows "Nothing to
  review yet. Add a goal and come back at the end of the week." and the Guide link.

## B. The monthly review

The question of the month is about goals: are these still the right ones?

**Which month.** From the 1st to the 7th it reviews the month just ended; from the 8th on, the
month under way. Arrows move between months.

```
 Monthly review · October 2026                                            ◂  ▸

 1  THE MONTH
    17 steps done · 38 routine days ticked · 9 values recorded · 1 goal reached
    Most of your effort went to Health.                         (Areas, when 03 is built)

 2  YOUR GOALS                                                  4 active
    ┌────────────────────────────────────────────────────────────────────┐
    │ Run 5 km without stopping                    45 % → 60 %   On pace  │
    │ This month: 6 steps done · Run after work kept 3 of 4 weeks         │
    │ Why it matters: I want energy for the children in the evening.      │
    │ You said it would cost: two evenings a week.                        │
    │ ( Keep going )  ( Change it )  ( Pause )  ( Let it go )             │
    └────────────────────────────────────────────────────────────────────┘
    …

 3  WAITING
    Paused: “Learn Spanish”, “Paint the fence”                  [ Bring one back ]
    Visions with no active goal: “To be a present father”       [ What is next? ]

 4  IS IT WORKING?                                              (when 16 is built)
    In your numbers, weeks with “Run after work” went better for Longest run.

 5  ONE SENTENCE
    What was this month about?           [                                        ]

 [ Finish review ]
```

1. **The month.** Counts from the done log for the month; the first sentence of the Areas view
   (03) when built.
2. **Your goals.** Every active goal of every plan, soonest deadline first. On each card:
   - progress at the start of the month and now (see the rules), and the pace tag (08);
   - the month's facts for that goal: steps done, each of its routines "kept n of m weeks";
   - its own "Why does it matter?" text, and "You said it would cost: …" (30) when filled;
   - the vision it serves with that vision's "If I let it slide" (21) under a fold, when
     filled;
   - four choices. **Keep going** marks it reviewed. **Change it** opens the goal form.
     **Pause** sets it to Paused. **Let it go** asks "Delete “{name}”? It stays in Recently
     deleted for 30 days." and deletes it (through 17).
   A card is marked with what was chosen; choices can be changed until the review is finished.
3. **Waiting.** Paused goals (button: sets one back to Active, after a picker when several),
   and visions that no active goal serves (the lines of 05).
4. **Is it working?** The clear results of 16, at most three.
5. **One sentence.** One optional text field.

**Finish review** stores it and shows "Review done." The choices are kept as a record; the
actions themselves were carried out when chosen.

### Rules (monthly)

- `reviewMonth(today)` → `'yyyy-mm'`. Pure.
- Progress at the start of the month, `progressAt(goal, day)` in `core/`, pure:
  - measured by a plain state: the progress formula with the latest measurement on or before
    that day (none: the goal's start value);
  - a state that adds up, in total: the running total up to that day; per period: the higher
    of the last two complete periods before that day, as the goal's own rule does today;
  - activities done: steps done on or before that day (`doneDay`, 13) ÷ counted steps now;
  - routines kept: consistency from the goal's start up to that day.
  It is an estimate where steps finished before feature 13 have no real date; show no arrow
  ("45 % → 60 %") when the two numbers are equal, only the present one.
- "Kept n of m weeks": the weeks of the month that are complete, counted as in 16 (kept /
  not kept; weeks in between count as not kept here).
- Stored:

  ```
  { id, kind: 'month', period: '2026-10', doneAt,
    answers: { sentence,
               goals: { [goalId]: { plan, title, choice: 'keep' | 'change' | 'pause' | 'drop',
                                    from, to } },
               stats: { steps, routineDays, values, goals } },
    updatedAt }
  ```

- A goal reviewed with "Keep going" shows nothing afterwards elsewhere. No badge, no date on
  the goal.

## C. The yearly review

The question of the year is about visions: what was the year for, and what is the next one for?

Offered in the switch as "This year". From 1 December to 31 January it reviews the year ending
or just ended (December: the current year; January: the previous one); in other months, the
year under way.

```
 Yearly review · 2026

 1  THE YEAR
    3 goals reached · 212 steps done · 486 routine days ticked · 97 values recorded
    Reached: “Run 5 km” (June) · “Starter emergency fund” (Sept) · “Read 12 books” (Dec)
       What made the difference: “Running with Ana on Sundays.”        (closing notes, 15)
    Biggest changes: Longest run 1.5 → 8 km · Savings 400 → 3,100 € · Body weight 82 → 76 kg
    By area: Health 58 % · Finance 27 % · Learning 15 %                 (when 03 is built)

 2  YOUR VISIONS
    ┌────────────────────────────────────────────────────────────────────┐
    │ To be fit and live healthily                                        │
    │ I run without getting out of breath and have energy in the evening. │
    │ If I let it slide: …                                                │
    │ This year: 2 goals reached, 1 active.                               │
    │ ( Still true )  ( Change it )  ( Let it go )                        │
    └────────────────────────────────────────────────────────────────────┘
    …

 3  LOOK BACK
    What are you glad you did this year?       [                              ]
    What would you do differently?             [                              ]

 4  LOOK AHEAD
    What do you want next year to be about?    [                              ]
    [ Find your visions ]    [ Add a goal ]

 [ Finish review ]
```

1. **The year.** Counts over the year from the done log; goals reached with their month and
   closing note; for each plain state with at least two measurements in the year, first and
   last value (the three with the largest change relative to their own range first; "Show
   all"); effort by area over the year.
2. **Your visions.** Every vision, in the tree's order. Each with its description, its "If I
   let it slide" (open), and the year's facts: goals serving it reached and active. Choices:
   **Still true** (marks it), **Change it** (opens the form), **Let it go** (deletes it,
   through 17, after the same kind of confirmation).
3. **Look back** and 4. **Look ahead**: optional text fields. The two buttons open the
   discovery chooser (01) and the goal form.

### Rules (yearly)

- `reviewYear(today)` → `'yyyy'`. Pure.
- Stored:

  ```
  { id, kind: 'year', period: '2026', doneAt,
    answers: { glad, differently, next,
               visions: { [visionId]: { title, choice: 'true' | 'change' | 'drop' } },
               stats: { steps, routineDays, values, goals } },
    updatedAt }
  ```

- Year counts over 3 plans with two years of data must be worked out once when the tab is
  opened, not on every render. Add a budget to `npm run perf`.
- With no visions: part 2 reads "You have no visions yet." with the button "Find your
  visions".

## Strings

Section titles and leads as in the mock-ups. The main ones:

| Key | English |
|---|---|
| `review.tab.week`, `.month`, `.year`, `.log`, `.past` | This week · This month · This year · Done log · Past reviews |
| `review.week.title` | Weekly review · {range} |
| `review.month.title` | Monthly review · {month} |
| `review.year.title` | Yearly review · {year} |
| `review.s.did`, `.measure`, `.back`, `.fix`, `.next` | What you did · Measure · Look back · Fix the plan · Next week's one thing |
| `review.forgot` | Forgot to tick something? |
| `review.noValue` | These have no value from this week: |
| `review.record` | Record |
| `review.well` | What went well? |
| `review.hard` | What got in the way? |
| `review.nothingToFix` | Nothing needs fixing. |
| `review.asToday` | As the plan stands today |
| `review.which` | Which step matters most next week? |
| `review.addStep` | Add a step |
| `review.finish` | Finish review |
| `review.toast.week` | Review done. See you next week. |
| `review.toast` | Review done. |
| `review.doneOn` | Done on {date} |
| `review.edit` | Edit |
| `review.empty` | Nothing to review yet. Add a goal and come back at the end of the week. |
| `review.s.month`, `.goals`, `.waiting`, `.working`, `.sentence` | The month · Your goals · Waiting · Is it working? · One sentence |
| `review.monthAbout` | What was this month about? |
| `review.why` | Why it matters: {text} |
| `review.kept` | {name} kept {n} of {m} weeks |
| `review.choice.keep`, `.change`, `.pause`, `.drop` | Keep going · Change it · Pause · Let it go |
| `review.dropConfirm` | Delete “{name}”? It stays in Recently deleted for 30 days. |
| `review.paused` | Paused: {names} |
| `review.bringBack` | Bring one back |
| `review.s.year`, `.visions`, `.ahead` | The year · Your visions · Look ahead |
| `review.reached` | Reached: {list} |
| `review.difference` | What made the difference: “{text}” |
| `review.changes` | Biggest changes: {list} |
| `review.byArea` | By area: {list} |
| `review.glad` | What are you glad you did this year? |
| `review.differently` | What would you do differently? |
| `review.nextYear` | What do you want next year to be about? |
| `review.vchoice.true`, `.change`, `.drop` | Still true · Change it · Let it go |
| `review.noVisions` | You have no visions yet. |
| `review.past.empty` | No reviews yet. |

## Guidance

- Guide, article `review` (planned as an interactive five-line checklist with "Review done"):
  it becomes plain text again, with the action button **Open the weekly review**. Its text:
  "Once a week, five minutes. The Review view walks you through it: tick what you forgot,
  record fresh values, write a line about how it went, fix dates that no longer hold, and
  choose the one step that matters most next week. Once a month it asks about your goals: keep
  going, change, pause or let go. Once a year it asks about your visions." Remove the stored
  checkbox logic and the `guide.review.*` strings of `docs/guidance/01-guide-page.md`;
  `seen.lastReview` is now set by finishing a weekly review.
- Guide, new article `h-review` (group "How do I…"): three short paragraphs, one per rhythm,
  and where past reviews are kept. Related: `review`, `h-today`.
- Walkthrough, task `review` ("Do a weekly review"): its button opens the Review view; it ticks
  when a weekly review is finished.
- Tips `week`, `month`, `new-year`: buttons open the weekly, monthly and yearly review. The
  `week` tip's condition "the last weekly review was 6 or more days ago or never" reads the
  journal's latest weekly review (falling back to `seen.lastReview`).
- Help banner `help.view.review` (set in 13): replace by "Look at your plan on a rhythm: steps
  every week, goals every month, visions every year. What you write is kept under Past
  reviews."
- Guide, article `fell-off`: add "The weekly review is the quickest way back in: it shows only
  what needs a decision."

## Notes for the builder

1. Use the `frontend-design` skill. The reviews are reading pages: one column no wider than
   about 70 characters of text, numbered sections, the app's own rows and cards inside them.
   No wizard, no progress bar, no step that blocks the next.
2. Build A first and ship it alone. B and C reuse its page frame, the journal calls and the
   "Past reviews" list.
3. Every list inside a review is the app's existing component with the plan it belongs to
   (`activityRow`, `routineRow`, `goalCard` reduced). Ticking and recording go through
   `editPlan`.
4. The conditions in "Fix the plan" must be the same functions the tips use. If the tips
   catalogue's conditions are not exported per item, export them; do not write the rules a
   second time.
5. Text fields are saved as drafts on the device while typing and move into the journal on
   Finish. Drafts are per user.
6. The reviews never give a score, a grade or a streak of weeks reviewed.

## Test cases

Pure rules (unit tests, written first)
- `reviewWeek`: Monday to Thursday give last week, Friday to Sunday this week; across New Year
  (ISO week 1 and 52/53); `period` string for those weeks.
- `reviewMonth`: the 7th gives last month, the 8th this month; January gives December of the
  year before.
- `reviewYear`: December, January and other months.
- Part 2 list: states measuring an active goal without a value in the week; a state that adds
  up without an amount in the week; a paused goal's state is not listed; order and the cap of
  eight.
- "Forgot to tick": due and unticked days of the week only; routines not running that week
  left out.
- `progressAt` for the four kinds of goal, and equal numbers giving no arrow.
- "Kept n of m weeks" for a month with a partial first week.
- Year facts: goals reached by `achievedAt`; biggest changes ordered; states with one
  measurement left out.
- Focus week: review done on Saturday sets next week's focus; on Tuesday, this week's.

Page steps (A)
- A week with ticks and a missed routine day: part 1 shows counts and the strip; ticking the
  missed day updates the counts.
- Record a value in part 2: the state leaves the list, the goal's progress changes.
- Part 4 shows a late-steps line; the dialog of 12 opens for the right plan.
- Choose the one thing and finish: toast, the review is under Past reviews, Today shows the
  focus in the right week, the dot on the nav item is gone, the tip `week` no longer applies.
- Reopen the same week: finished state; Edit changes the text; a second Finish updates the
  same review (no duplicate).
- Close the app in the middle: the text is there again.

Page steps (B, C)
- Monthly: each goal card shows from → to and the month's facts; Pause sets the goal to Paused
  at once; Let it go deletes after the confirmation and the goal is in Recently deleted; Finish
  stores the choices.
- "Bring one back" activates a paused goal.
- Yearly: counts, reached goals with closing notes, biggest changes; a vision's "Let it go"
  deletes it; the two buttons open discovery and the goal form.
- Past reviews lists all three kinds; Delete removes one and it stays removed after a sync.

Edge cases
- Two devices finish the same week before syncing: both are kept; the view shows the later;
  the other is listed.
- A goal deleted after a monthly review: the past review still shows its title.
- No active goals: no dot; the weekly review shows parts 1, 3 and 5 only.
- One plan: no plan names. A demo plan open: its items are not in any review.
- A review of a week two months ago: parts 1–2 show that week; part 4 always shows the plan as
  it is now and says so ("As the plan stands today").
- 360 px, phone landscape, keyboard only; both languages; plural forms.
- Fixture: a journal holding one review of each kind.
