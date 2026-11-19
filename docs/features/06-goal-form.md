# 6. Goal form: save any goal, ask about obstacles, earn the golden glow

**Goal:** the goal form stops being an exam. A goal can be saved with a title and finished
later; the question that mostly got a sentence written to pass the check ("Why is this
realistic?") is replaced by the two that help ("What will get in the way? What will you do
then?"). So that the easier form is not a shortcut for people who know better, **the golden
glow of a Purpose shows only while every active goal is SMART.**

Agreed with the owner on 2026-11-15. Not in this plan: a status "Idea" for wishes (parked, see
`README.md`).

Build before `07-keep-goals.md` and `30-what-it-costs.md`, which add to the same form.

## What the user sees

### 1. A goal saves with a title

- The form keeps its five sections and letters. A letter lights when its part is filled in, by
  the rules below, exactly as today.
- **Save always works when there is a title.** Nothing else is required.
- The line at the top of the form changes with the count:

  | Lit | Text |
  |---|---|
  | 5 | This goal is SMART. |
  | 0–4 | {n} of 5. You can save now and finish it when you know more. |

- Only contradictions are refused, with the error at the field as today:
  the deadline is not after the start date; the target equals the starting value; a number
  field holds something that is not a number; "At least" is not below "At most" (07).
- The messages that used to block ("Describe exactly what will be accomplished (at least 15
  characters)", "Set a deadline." and the others) are no longer errors. Each shows as a quiet
  hint under its field while the letter is unlit, in the hint style, not the error style.
- After saving a goal with unlit letters the toast reads "Goal added. {n} of 5: finish it when
  you know more." (and the same for "updated").

### 2. An unfinished goal elsewhere in the app

The SMART letters on the goal card already show which parts are lit. In addition:

| Missing | What shows |
|---|---|
| target (goal measured by a measurement) | The card shows the line "No target yet" in place of the trail and the value. The goal has no percentage |
| metric name, but a target is there | The trail and value show; the label reads "Progress" |
| deadline | No deadline tag. The goal is never late. On the Timeline it draws from its start date to today with a fading end, and has no end to drag |
| "What exactly?", obstacle, "Why does it matter?" | Nothing more than the unlit letter |

- **The Overview's average** ("On average you're 38 % of the way to your 4 active goals")
  counts only active goals that have a percentage. When some have none, the sentence adds:
  "1 goal has no target yet." When none has one, the sentence is replaced by
  "{n} active goals, none with a target yet."
- A goal measured by "Activities done" or "Routines kept" has a percentage as today, whatever
  else is missing.
- Pace (08), the "target reached" offer and the target line on graphs need a target and, for
  pace, a deadline. Without them they simply do not show.
- The plan badge in the plan menu is not affected by unlit letters.

### 3. Section A: the obstacle and the plan

Section **A** keeps its letter and name (Achievable). Its content changes:

> **What is most likely to get in the way?**
> [ I'm tired after work and skip the run.                              ]
>
> **What will you do then?**
> [ If I'm tired, I put on my shoes and walk for ten minutes.           ]

- Placeholders as shown (greyed).
- A goal that already has an answer to the old question keeps it. It shows under the two new
  fields as a third, editable field with its old label, **Why is this realistic?**, only when
  it has text. Clearing it removes the field the next time the form opens. New goals never see
  it. Goals made from a template bring a template's text there, which reads rightly under that
  label.
- **A** lights when both new fields are filled in, or when the old answer is there.

### 4. The golden glow

Today, once a Purpose is found, the glow round everything that works toward a vision turns
gold. From now on:

- The glow is **gold only while every active goal, in every plan, is SMART** (all five letters
  lit).
- While any active goal is not, the glow stays as it is without a Purpose (silver), and so does
  the blaze at the top left (owner, 2026-11-18: "The glow and the Action App icon (top left).
  Purpose is always golden."). The vision keeps its gold card and its "Purpose" tag, and the
  message "You have found your Purpose" is shown as before.
- The Visions view says why, under the line "You have found your Purpose: {name}":

  > The golden glow returns when every active goal is SMART. Still to finish: “Learn to cook”,
  > “Sleep better”.

  Each name opens that goal's form. Goals in other plans are named with their plan, as the
  "doesn't serve a vision yet" line does today.
- Paused and achieved goals do not count. Finishing the last unfinished goal brings the gold
  back at the next render, with no message.

### 5. "New to this?" (dropped by the owner on 2026-11-18; not built)

Under "Progress from" a link: **New to this? Make it a learning goal.** It sets "Progress from"
to "Activities done" and shows the hint: "When something is new to you, aim at finding out how:
“Try three ways to study Spanish and choose one by March”. The goal is done when its steps
are." It is a preset, not a kind of goal; nothing is stored for it.

## Rules

### What counts as SMART

`smartCheck(goal)` keeps its shape (`{ S, M, A, R, T, errs }`) and its thresholds, so a goal
that was SMART stays SMART:

| Letter | Lit when |
|---|---|
| S | title of 4 or more characters and "What exactly?" of 15 or more |
| M | measured by a measurement: a metric name and a numeric target different from the starting value; measured by activities or routines: always; a keep goal (07): a metric and at least one limit |
| A | obstacle of 10 or more characters and plan of 10 or more; or the old answer of 10 or more |
| R | "Why does it matter?" of 10 or more characters |
| T | a deadline after the start date; a keep goal (07): a start date |

`errs` now only feeds the hints. New: `goalErrors(values)` returns the contradictions that stop
a save (deadline order, target equals start, limits out of order). `submitForm` for a goal
calls that, plus the existing checks for a missing title and for number fields; it no longer
refuses on `smartCheck`.

`isSmart(goal)` = all five lit. Used by the glow and by the tip below.

### Stored data

On the goal, two new strings, trimmed, at most 500 characters each, absent when empty:

| Field | Question |
|---|---|
| `obstacle` | What is most likely to get in the way? |
| `ifThen` | What will you do then? |

`achievable` keeps its name and meaning (the old answer) and is neither renamed nor reused.
`normalize` keeps strings and drops other types. All three travel in a full copy and in a
template (a template's goals may carry them).

Fields that may now be empty on a stored goal: `specific`, `metric`, `target`, `achievable`,
`relevant`, `deadline`. Every reader must cope. At `5b71e59` the ones to check: `goalCard`
(`g.specific`, `g.metric`, `fmtNum(g.target)`), `metricProgress` (already returns 0 without a
target), `goalCurrent`, `goalState` and `deadlineTag` (already guard a missing deadline),
`byDeadline` (already sorts missing ones last), the timeline's rows and goal bars (`endOf`),
the graph targets (already filter on a numeric target), `planHealth`, `resetProgress` and the
date shifting of templates, the search (`matchesSearch` reads `specific`), the Map's node
texts, the planned tips that read a deadline or target, and the MCP tools of 20.

### Percentage or none

`hasProgress(goal)`: false for a goal measured by a measurement without a numeric target; true
otherwise. `goalProgress` still returns 0 for such a goal (callers that only draw a bar are
unchanged); the Overview's average and the card ask `hasProgress` first.

### The glow

In the visions module, `purposeState()` gets one more field and keeps the rest:

- `vague`: the active goals, in every plan, that are not SMART, as `{ plan, goal }` (the same
  walk that collects `unlinked`; `smartCheck` reads the open plan's relationships for nothing,
  so it can be called on any plan's goal; a keep goal's check may need its measuring state,
  then run it inside `withPlan`).
- `golden`: `on` and no `vague` goals.

`markVisions` sets the page's `purpose` class from `on` as today, and a second class,
`golden`, from `golden`. In the styles, the rule that turns the glow gold
(`:root.purpose { --vglow: var(--vglow-gold) }`) and the gold blaze move to `:root.golden`. The
gold Purpose card and tag, and the first-time message stay on `purpose` and `on`.

The "found" line in the Visions view takes its glow from `--vglow`, so it follows by itself.

Existing users: every goal saved before this feature passed the old gate, so it is SMART and
nothing changes for them until they save an unfinished goal.

## Strings

| Key | English |
|---|---|
| `smart.partial` | {n} of 5. You can save now and finish it when you know more. *(replaces "…complete all to save.")* |
| `toast.goalAddedPartial` | Goal added. {n} of 5: finish it when you know more. |
| `toast.goalUpdatedPartial` | Goal updated. {n} of 5: finish it when you know more. |
| `goals.noTarget` | No target yet |
| `goals.progress` | Progress |
| `dash.noTarget` | `{ one: '{n} goal has no target yet.', other: '{n} goals have no target yet.' }` |
| `dash.headlineNone` | `{ one: '{n} active goal, without a target yet.', other: '{n} active goals, none with a target yet.' }` |
| `f.obstacle` | What is most likely to get in the way? |
| `f.obstaclePh` | I'm tired after work and skip the run. |
| `f.ifThen` | What will you do then? |
| `f.ifThenPh` | If I'm tired, I put on my shoes and walk for ten minutes. |
| `hint.obstacle` | Name one thing, and what you will do when it comes. |
| `vis.vague` | The golden glow returns when every active goal is SMART. Still to finish: {names}. |
| `f.learning` | New to this? Make it a learning goal. |
| `f.learningHint` | When something is new to you, aim at finding out how: “Try three ways to study Spanish and choose one by March”. The goal is done when its steps are. |

The texts of `err.specific`, `err.metric`, `err.target`, `err.achievable`, `err.relevant` and
`err.deadline` are reused as hints; reword any that sound like a refusal ("Set a deadline."
becomes "A date makes it a goal: choose one, and move it when you know more."). `err.achievable`
is replaced by `hint.obstacle`. `f.achievable` and its placeholder stay for the old field.

## Guidance

- Guide, article `smart-fit`: rewrite the opening. Old: "The goal form asks five things and
  will not save until each has an answer." New: "The goal form asks five things. You can save
  with only a title and come back; the letters show what is still open. Some ways through:".
  Replace the **Achievable** bullet by: "**Achievable** – name the one thing most likely to get
  in your way, and what you will do when it comes. “If I'm tired after work, I walk for ten
  minutes instead.” A plan for the bad day is what makes a goal realistic." Keep the closing
  paragraphs; the learning-goal paragraph names the link when part 5 is built.
- Guide, article `h-goals`: "…the letters light up as you fill them in, and the goal saves when
  all five are lit" becomes "…the letters light up as you fill them in. A goal saves with a
  title alone; finish the rest when you know more."
- Guide, article `not-starting`, bullet "Name the obstacle before it comes": "Write that in
  “Details”" becomes "The goal form asks this under Achievable; for a single step, write it in
  “Details”."
- Guide, article `h-visions`: add "The glow round everything that serves your Purpose is gold
  while every active goal is SMART. A goal saved half-finished turns it silver until you finish
  it."
- Guide, article `words`, **SMART**: unchanged.
- Walkthrough, task `goal`: its text says "The form asks five things…"; add "Fill in what you
  know; the rest can wait." The task still ticks when the plan has a goal.
- Tip, class B, `goal-unfinished` (cooldown 30 days): an active goal older than 7 days is not
  SMART: "“{name}” is at {n} of 5. The open part is {part}. A few minutes now make the goal
  easier to act on." Button: Open the goal. View: Goals. Guide: `smart-fit`. `{part}` is the
  name of the first unlit letter.
- Templates and the sample plan are all SMART already; leave them.

## Notes for the builder

1. `smartCheck`'s thresholds do not change. They no longer decide whether a goal saves; they
   decide whether a letter lights, and with that the golden glow. Loosening them would give
   back the shortcut this plan takes away.
2. Many page tests fill all five parts only because the form demanded it. They still pass.
   The tests that assert a refused save (missing deadline and the like) change to assert a
   saved goal with an unlit letter.
3. The hints under the fields must not look like errors: no red, no icon. A person who saves
   with two letters unlit has done nothing wrong.
4. The glow is drawn in several views (cards, timeline rows, the map). It is one custom
   property; do not touch the drawing.
5. The Purpose message appeared once per user (`purposeFound`). It is not shown again when the
   gold comes back.

## Test cases

Pure rules (unit tests, written first)
- `smartCheck`: every letter on both sides of its threshold, unchanged from today for S, M, R,
  T. A: both new fields at 10 characters lights it; one alone does not; the old answer alone
  does; all three empty does not.
- `goalErrors`: deadline equal to and before the start refused, after it accepted; no deadline
  accepted; target equal to the start refused; no target accepted.
- `hasProgress`: measurement without target false; with target true; activities and routines
  true.
- Overview average: four goals of which one has no target averages three and reports one;
  none with a target gives the other sentence.
- `purposeState`: `vague` lists exactly the active goals that are not SMART, across two plans;
  paused and achieved ones are not listed; `golden` is true only with `on` and no `vague`;
  `on` itself is unchanged by vague goals.
- `normalize`: `obstacle` and `ifThen` kept as strings, dropped otherwise; a `5b71e59` goal
  loads unchanged and is SMART.

Page steps
- Save a goal with a title only: it is saved, the toast says "0 of 5", the card shows the
  letters unlit and "No target yet"; the Overview's sentence reports it.
- Fill the parts one by one: the top line counts up and ends in "This goal is SMART."
- A deadline before the start is refused at the field; clearing the deadline saves.
- A goal without a deadline is never late, shows no deadline tag, and draws on the Timeline
  from its start with a fading end.
- Section A: a new goal shows two fields; an old goal shows its old answer as a third; clearing
  it and saving removes the field at the next opening; the letter follows the rules.
- Golden glow: with a Purpose and all goals SMART the page has the `golden` class and the glow
  is gold (computed style of a glowing card); add an unfinished active goal that serves the
  Purpose: the class goes, the glow is silver, the Purpose card and tag and the blaze stay
  gold, and the Visions view names the goal; finish the goal: gold again. Pausing the
  unfinished goal also brings the gold back.
- An unfinished goal in a plan that is not open removes the gold and is named with its plan.
- The tip `goal-unfinished` shows for an 8-day-old unfinished goal and not for a 6-day-old one.
- The "New to this?" link sets "Progress from" to "Activities done" and shows the hint.

Edge cases
- A goal with a target and no metric name: trail shows, label "Progress".
- Import of a plan from before this feature: all goals SMART. Export as template and import:
  `obstacle`, `ifThen` and `achievable` are there.
- Merge: `obstacle` edited on two devices, the later goal wins whole (plain fields).
- A goal made by the assistant (20) with a title only is saved and counts as vague.
- The views' search does not look into `obstacle` or `ifThen` (it stays on title and
  description). Assert it, so that it is a decision and not an accident.
- 360 px: the three fields of section A stack; hints wrap; both languages.
- Fixture: a plan with an unfinished goal (title only) and one with `obstacle` and `ifThen`.
