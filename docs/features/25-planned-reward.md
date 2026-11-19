# 25. Planned reward

**Goal:** a step or a routine can name the small good thing that follows it, and the app says it
at the moment of the tick. What keeps people at a long goal is what they get out of doing it
today, more than what waits at the end.

## What the user sees

### In the activity form

For every kind of activity (one-time, list, routine, routine list), an optional field under
"Details":

> **After I do it, I…**
> have a coffee on the balcony

Hint under the field: "Something small that you can have right away."

### At the tick

When the step is set to Done, a list's last item is ticked, or a routine's day is ticked, the
toast says:

> Done. Now: have a coffee on the balcony.

- It replaces the usual toast for that tick ("Done today: …", "That's this week done" and the
  line-of-sight toast of 05). When a routine's tick completes its week or month, both are said:
  "That's this week done. Now: have a coffee on the balcony."
- It stays twice as long as a plain toast (it is meant to be read).
- Unticking says nothing about the reward.
- A tick for a past day (catching up on the week strip) shows the plain toast: the moment has
  passed.
- A tick that first asks "how much?" shows it after the amount is entered or skipped.

### On the card

The activity card and the routine card show the reward as one muted line: "Then: have a coffee
on the balcony". Rows on the Overview and Today do not show it (they are short).

## Rules

- Stored on the activity: `reward`, a string, trimmed, at most 120 characters; absent when
  empty. `normalize` keeps a string and drops anything else.
- `rewardToast(activity, base)` in `core/`, pure: returns the text for the toast from the
  reward and the usual text.
- The text is the person's own words placed after "Now:". The field's label ends in "I…", so
  what is typed usually starts with a verb. The app does not change its first letter.
- A **template** export clears `reward`; a full copy and "start fresh" keep it (README,
  decision 12).
- Ticks made by the assistant (20) show no reward toast.

## Strings

| Key | English |
|---|---|
| `f.reward` | After I do it, I… |
| `f.rewardPh` | have a coffee on the balcony |
| `f.rewardHint` | Something small that you can have right away. |
| `reward.toast` | Done. Now: {reward}. |
| `reward.toastWith` | {base} Now: {reward}. |
| `reward.card` | Then: {reward} |

In Slovenian the sentence must read naturally with a verb phrase in the first person after it;
choose the label and the toast together.

## Guidance

- Guide, article `not-starting`, new bullet: "**Give it something to look forward to.** In the
  activity's form, “After I do it, I…” names a small thing you will have right after: a coffee,
  ten minutes of your book. The app reminds you when you tick."
- Guide, article `routine-slips`: the same idea in one sentence, with "Related: `not-starting`".
- Guide, article `h-activities`: one sentence naming the field.
- Sample plan: one routine gets a reward (decision 11).
- No tip.

## Notes for the builder

1. If the reward ends with a full stop already, do not add another.
2. Keep it out of the status circle's `aria-label`; the toast is announced by the live region
   as other toasts are.

## Test cases

- Unit: `rewardToast` with and without a base text; a reward ending in "." or "!" gets no extra
  stop; an empty reward returns the base unchanged; `normalize` keeps strings only; template
  export clears it, full copy keeps it.
- Page: set a reward on a one-time activity, tick it: the reward toast; untick: the plain toast.
  A list's last item: the reward toast. A routine today: the reward toast; a tick that completes
  the week: both sentences; a tick on last Tuesday: the plain toast. A tick with the amount
  popover: toast after the amount.
- Edge: 120 characters accepted, more refused; markup shown as typed; at 360 px the toast wraps
  to two lines and is not cut; both languages.
- Fixture: an activity with `reward`.
