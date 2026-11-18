# 30. What it costs

**Goal:** the goal form asks one honest question about room: every new goal takes time from
something else, and saying what makes the goal more likely to be kept and fewer goals to be
piled up.

If `06-goal-form.md` exists by the time this is built, follow its layout for where the field
goes. This file is written against the form as it is at `5b71e59`.

## What the user sees

In the goal form, in the section **R** (Relevant), under "Why does it matter?", an optional
field:

> **What will it cost?**
> What will you give up or do less of to make room for this?

Placeholder: "Two evenings a week that now go to series."

- It is never required and does not affect the SMART letters.
- On the goal card it does not show.
- In the monthly review (14) it shows beside the goal: "You said it would cost: …".
- When the user has 4 or more active goals (in all plans) and the field is empty while the form
  is open for a **new** goal, one line shows under it: "You have {n} active goals. Something
  will have to give way; it helps to say what." No blocking.

## Rules

- Stored on the goal: `cost`, a string, trimmed, at most 500 characters; absent when empty.
  `normalize` keeps a string and drops anything else.
- A **template** export clears it; a full copy and "start fresh" keep it (README, decision 12).
- The count of active goals for the hint uses `isActiveGoal` over `allPlansData()`, demo plans
  left out.

## Strings

| Key | English |
|---|---|
| `f.cost` | What will it cost? |
| `f.costHint` | What will you give up or do less of to make room for this? |
| `f.costPh` | Two evenings a week that now go to series. |
| `f.costMany` | You have {n} active goals. Something will have to give way; it helps to say what. |
| `review.cost` | You said it would cost: {text} |

## Guidance

- Guide, article `too-many`: add a bullet: "When you add a goal, the form asks what it will
  cost. If you cannot name anything you would give up for it, it may be a goal for later; set
  it to Paused."
- Guide, article `smart-fit`, under **Relevant**: one sentence naming the question.
- The planned tip `too-many-goals` is unchanged.

## Test cases

- Unit: `normalize` keeps a string; template export clears, full copy keeps.
- Page: the field saves and reopens; leaving it empty saves the goal; the hint line shows for a
  new goal with 4 active goals and an empty field, not when editing an existing goal, not with 3
  active goals, and goes away when text is typed.
- Edge: 500 characters accepted, more refused; markup shown as typed; goals in another plan
  count for the hint; both languages; phone width.
- Fixture: a goal with `cost`.
