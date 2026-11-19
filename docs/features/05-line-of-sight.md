# 5. Line of sight

**Goal:** on the pages for today, a step shows what it is for; and a vision that nothing serves
right now asks what comes next. Today the Overview shows no vision anywhere, so the reason sits
three screens away from the action.

Needs `09-today.md`. Read `README.md` first (decision 8).

## What the user sees

### On Today and the Overview

Rows of steps and routines get one more small tag at the end of their goal tags, in the
vision's colour:

```
 ○  Buy running shoes        ▸ Run 5 km   ◇ To be fit and live healthily        3 days late
```

- It names the vision the step serves through its goal. With several, the first by title and
  "+1".
- A step that serves no vision shows nothing. No hint, no empty tag.
- Tapping the tag opens the Visions view with that vision's card in view.
- When a Purpose exists, the Today view's header carries one gold line under the date:
  "Purpose: {title}". Rows then show the tag only when their vision is not the Purpose itself
  (every vision leads to it, so naming it on each row says nothing).

### After a tick

The toast after finishing a step or ticking a routine day names the vision, when there is one
and the step has no planned reward (25):

> Done · for “To be fit and live healthily”

With a reward, the reward's toast is shown instead (25). Without a vision the toast is as
today.

### On goal cards

A goal card shows the visions it serves as a line of small tags under its meta line, labelled
"Serves". Goals without visions show nothing.

### In the Visions view

A vision that no **active** goal serves (in any plan, directly or through a narrower vision)
gets a quiet line on its card and a button:

> No active goal serves this now.   [ What is next? ]

- **What is next?** opens the new-goal form with this vision chosen under "Serves visions".
- When a goal that served it was achieved in the last 30 days, the line reads instead:
  "“Run 5 km” was reached on 3 Nov. What does this vision ask for now?"
- A vision that has narrower visions with active goals is served; it shows nothing.
- A user with no goals at all sees nothing on the cards (the view's own status lines cover
  that).

## Rules

`core/` functions, pure, taking the plan data and the visions:

- `stepVisions(data, activityId)` → vision ids: the visions (`goalVisionIds`) of the goals the
  activity contributes to, or, for a sub-activity with no goal of its own, those of the nearest
  parent that has one. For a routine that only improves a state: the visions of the goals that
  state measures.
- `shownVision(ids, purposeRootId)` → the first by title, leaving out the Purpose's own id when
  a Purpose is found; nothing when none remain.
- `unservedVisions(plans)` → visions with no active goal reaching them, each with the most
  recent goal achieved within 30 days that served it (uses `achievedAt` from 13; without 13,
  leave the second sentence out).

Other plans are read through `allPlansData()`; rows of another plan compute their vision inside
`withPlan`.

## Strings

| Key | English |
|---|---|
| `los.purpose` | Purpose: {title} |
| `los.done` | Done · for “{vision}” |
| `los.serves` | Serves |
| `los.unserved` | No active goal serves this now. |
| `los.next` | What is next? |
| `los.reached` | “{goal}” was reached on {date}. What does this vision ask for now? |

## Guidance

- Guide, article `h-visions`: add "On Today and on the Overview, each step shows the vision it
  serves. A vision that no active goal serves says so and offers “What is next?”."
- Guide, article `reached`, bullet "Choose what is next from the vision": add the action
  button **Open Visions**.
- No tip, no walkthrough change.
- The sample plan has no visions (your decision of 2026-11-08), so nothing of this shows there.

## Notes for the builder

1. The vision tag uses the existing vision tag style (`.tag.vision`), small. Do not add a new
   colour.
2. On a phone row, tags wrap under the title; the vision tag is the first to be dropped when a
   row would take more than two lines (CSS, not script).
3. The toast must stay one line at 360 px: cut the vision's title with an ellipsis at about
   30 characters.

## Test cases

Pure rules (unit tests, written first)
- `stepVisions`: through one goal; through a sub-goal's parent goal; sub-activity inheriting
  from its parent activity; a routine reaching visions through a state; a step with no goal
  gives none; a vision id that no longer exists is ignored.
- `shownVision`: alphabetical first; Purpose left out; "+1" count right.
- `unservedVisions`: a vision with only paused or achieved goals is unserved; one served through
  a narrower vision is not; goals in another plan count; the reached sentence appears for 30
  days and not on day 31.

Page steps
- A step linked to a goal that serves a vision shows the tag on Today and the Overview; tapping
  it lands on the vision.
- With a Purpose found: the gold line shows on Today; rows serving only the Purpose show no
  tag.
- Ticking shows the "for" toast; with a reward set, the reward toast.
- "What is next?" opens the goal form with the vision preselected; saving the goal removes the
  line.

Edge cases
- Very long vision title: tag and toast cut with an ellipsis; no sideways scrolling at 360 px.
- No visions at all: no tags, no lines, no errors.
- Both languages.
