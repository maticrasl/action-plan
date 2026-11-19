# 1. Guided discovery

**Goal:** help someone who does not yet know what they want. Three short writing exercises in
the app, each ending in a vision in their own words. Today the Guide's advice for this is "pen
and paper, ten minutes", and the app begins only once a vision or goal is already known.

Needs `00-foundation.md` (journal), `03-life-areas.md` (areas) and `21-future-to-avoid.md`.

Read `README.md` first (decision 8, "Voice").

## What the user sees

### Where it starts

- Visions view: a button **Find your visions** beside the Add button, and in the view's empty
  state as the main button.
- Guide: the articles `what-goal` and `vision-how` get the action button "Find your visions".
- The yearly review (14) ends with it.

It opens a chooser:

```
 Find your visions
 Three ways to find out what you are working toward. Each takes about ten minutes, and what you
 write stays with you.

 ◇ A good ordinary day            Describe a day a few years from now, if things went well.
 ◇ What for?                      Start from a goal you have and ask what it is for.
 ◇ Where things stand             Look at the parts of your life and pick one to work on.

 REFLECTIONS
 2 Nov   Where things stand                                         ⋯
 12 Oct  A good ordinary day  · not finished                        ⋯
```

- "What for?" is offered only when the user has at least one goal; otherwise it is shown
  greyed with "Needs a goal to start from."
- **Reflections** lists past runs, newest first. Opening one shows what was written, each
  answer editable; an unfinished one continues where it stopped. `⋯` offers Delete.

### The exercise

A calm full-height dialog: one question at a time, a large text field, the step dots, **Back**
and **Next**, and "Save and close" in the corner. What is typed is saved as it is typed.
Closing never loses anything. No timer, no word count, no praise.

Every text field may be left empty; Next always works.

### Exercise `good-day` — A good ordinary day

| Step | Text | Field |
|---|---|---|
| 1 | It is an ordinary Tuesday, five years from now, and things have gone well. Not a holiday, not a special day. Where do you wake up, and who is there? | text |
| 2 | What do you do that day? Think of your work, the people around you, your body, the hours that are your own. | text |
| 3 | Read what you wrote. What in that day is missing from your days now? | text |
| 4 | Now the same Tuesday, if you let things slide for five years. What does that day look like? Write it plainly; you will not be asked to dwell on it. | text |
| 5 | Name what the good day is about. One sentence each, as if it were already true, in your own words. One is enough; three is plenty. | up to three single-line fields, each with an Area field |

Ending: **Add as visions** adds a vision for every sentence filled in, with its area. The text
of step 1–2 becomes the description of the first vision ("What does it look like?") and the
text of step 4 its "If I let this slide" (21), both only when there is exactly one sentence;
with several, the new visions get no description and the dialog says "Open each vision to
describe it." Then the Visions view opens with the new ones in view.

With no sentence filled in, the button reads **Finish**; the reflection is kept and nothing is
added.

### Exercise `what-for` — What for?

| Step | Text | Field |
|---|---|---|
| 1 | Choose a goal you already have. | picker: goals of all plans, active first |
| 2 | “{goal}”. What is it for? | text (one or two lines) |
| 3… | “{previous answer}”. And what is that for? | text; buttons **Ask again** and **That's it** |

- "Ask again" adds another step, up to five in all. "That's it" ends; it is also what Next does
  on the fifth.
- The lead above step 3 onward: "Stop when the answer no longer changes. That answer is usually
  the vision."

Ending: the last answer is offered as a vision title in an editable field with an Area field,
and a box "“{goal}” serves it" (ticked). **Add as a vision** adds it and links the goal. If a
vision with the same title exists (ignoring case), the button reads **Link to “{title}”** and
only links the goal.

### Exercise `areas` — Where things stand

| Step | Text | Field |
|---|---|---|
| 1 | For each part of your life: how content are you with it today? 1 is not at all, 10 is fully. Skip the ones that do not matter to you. | one row per area: name, a 1–10 scale, "skip" |
| 2 | Look at the lowest ones. For one or two of them: what would one point better look like? | one line per area rated 5 or lower (the lowest three at most) |
| 3 | Which one would you be glad to work on this season? Not the most important one: the one you would be glad to start on. | pick one of the rated areas |

- The areas are the suggested ones plus those in use (03), without the ones hidden there. A row
  "Add an area…" adds one for this run.
- The scale is ten small buttons, usable by touch and keyboard, not a slider.

Ending: shows the picked area and the line written for it. Two buttons: **Add a vision for
{area}** (opens the vision form with the area filled in and the line as its description) and
**Add a goal for {area}** (opens the goal form with the category filled in). Or **Finish**.

The ratings show in the Areas view (03) with their date.

## Rules

### Catalogue

`core/discovery.ts`: a list of exercises as data: `{ id, steps: [{ id, type, … }] }`. Texts in
the language files under `disc.<exercise>.<step>`. Adding an exercise later is one entry and
its texts. A pure function gives the next step from the answers so far (the "What for?" ladder
and the lines of step 2 in `areas` depend on earlier answers).

### Stored data

A run is a journal session (`00-foundation.md`):

```
{ id, exercise: 'good-day' | 'what-for' | 'areas', date, done: boolean,
  answers: { [stepId]: string | number | { [areaName]: number } | string[] },
  made: [visionId, …],            // visions added at the end
  updatedAt }
```

- `what-for` keeps `answers.goal = { plan, id, title }` (the title as it was, in case the goal
  is deleted later) and `answers.ladder = [text, …]`.
- `areas` keeps `answers.ratings = { [area]: 1–10 }`, `answers.better = { [area]: text }`,
  `answers.pick = area`.
- Saved as typed, at most once a second. A run with every answer empty is not stored.
- Text answers hold up to 4,000 characters.
- Sessions sync with the journal. They are in the full backup (17) and in no single-plan
  export.
- Unknown `exercise` ids (from a newer version) are kept untouched and listed under
  Reflections by date with the title "Reflection"; they open read-only.

### Making visions

Visions are added through the same code as the vision form (title trimmed and required, the
loop rules for parents do not apply as none are set). The goal link in `what-for` goes through
`setGoalVisions`, with `editPlan` when the goal is in another plan. Adding is one `undoable`
action (17).

### What it never does

- It does not suggest visions, score answers or compare the person with anyone.
- It does not open by itself. No tip leads here more than once.
- Nothing typed is sent anywhere by the exercise. (It syncs to the user's own Drive with the
  rest, when sync is on.)

## Strings

Texts of the steps as in the tables above, under `disc.good-day.s1` … `disc.areas.s3`.

| Key | English |
|---|---|
| `disc.btn` | Find your visions |
| `disc.title` | Find your visions |
| `disc.lead` | Three ways to find out what you are working toward. Each takes about ten minutes, and what you write stays with you. |
| `disc.good-day.title`, `.about` | A good ordinary day · Describe a day a few years from now, if things went well. |
| `disc.what-for.title`, `.about` | What for? · Start from a goal you have and ask what it is for. |
| `disc.areas.title`, `.about` | Where things stand · Look at the parts of your life and pick one to work on. |
| `disc.needsGoal` | Needs a goal to start from. |
| `disc.reflections` | Reflections |
| `disc.unfinished` | not finished |
| `disc.reflection` | Reflection |
| `disc.back`, `disc.next`, `disc.close` | Back · Next · Save and close |
| `disc.again`, `disc.enough` | Ask again · That's it |
| `disc.ladderLead` | Stop when the answer no longer changes. That answer is usually the vision. |
| `disc.addVisions` | `{ one: 'Add as a vision', other: 'Add as visions' }` |
| `disc.finish` | Finish |
| `disc.describeEach` | Open each vision to describe it. |
| `disc.linkTo` | Link to “{title}” |
| `disc.serves` | “{goal}” serves it |
| `disc.skip` | skip |
| `disc.addArea` | Add an area… |
| `disc.addVisionFor`, `disc.addGoalFor` | Add a vision for {area} · Add a goal for {area} |
| `disc.added` | `{ one: 'Vision added', other: '{n} visions added' }` |

## Guidance

- Guide, article `vision-how`: replace "To find one, take a goal you already have and ask “what
  for?”…" by a shorter paragraph that names the three exercises and keeps the "signs that a
  vision is really yours". Action: Find your visions.
- Guide, article `what-goal`: after the three "start from…" bullets add "The app can walk you
  through two of these: “A good ordinary day” and “Where things stand”." Second action button:
  Find your visions.
- Walkthrough, task `vision` ("Say what it is for"): add a second link under the text, "Not
  sure? Find your visions".
- The planned tip `no-vision` (2 or more active goals, no visions): its button changes from
  "Add a vision" to **Find your visions**.
- Guide, article `p-where`: ⚠ add that reflections and reviews are kept with the plans and, with
  sync on, in the same hidden Drive folder.

## Notes for the builder

1. Use the `frontend-design` skill. This is the quietest screen in the app: one question, a lot
   of white, text at reading size, the field tall enough for a paragraph. No cards inside cards.
   In phone landscape the question sits beside the field, not above it.
2. The dialog must survive the phone's keyboard: the field stays visible, Next stays reachable.
3. Step 4 of `good-day` asks for an unwanted picture. Its text says the person will not be asked
   to dwell on it, and the exercise moves on to the good sentence at once. Keep that order.
4. The evidence for exercises of this kind is modest (see `docs/guidance/findings.md` and the
   owner's report of 2026-11-15). The texts therefore promise nothing.
5. `seen` gets `discovery` (opened once), used by nothing yet.

## Test cases

Pure rules (unit tests, written first)
- Next step: `good-day` runs 1–5; `what-for` stops at "That's it" and after five answers;
  `areas` step 2 lists only areas rated 5 or lower, at most three, lowest first, and is skipped
  when none is that low; step 3 lists only rated areas.
- A session with only empty answers is not stored; one with one character is.
- `made` holds the ids of added visions; a second "Add" cannot add them twice.
- Unknown exercise id is kept by `normalizeJournal` and by a merge.

Page steps
- Each exercise from start to end: answers saved, visions added with area, description and
  "If I let this slide" as the rules say; Visions view shows them.
- `what-for` with a goal in another plan: the goal gets the link there, the open plan is not
  changed.
- Close in the middle, reopen from Reflections: continues at the same step with the text there.
- Edit an old answer in Reflections: saved; the visions made earlier are not changed.
- Delete a reflection: gone after a sync with a device that still had it.
- Undo after "Add as visions" removes them and the goal link.
- The Areas view shows the latest ratings.

Edge cases
- No goals: "What for?" is greyed. The picked goal is deleted later: the reflection still
  shows its title.
- A vision title that exists: link, not duplicate.
- 4,000 characters accepted; markup shown as typed.
- Two devices write in the same unfinished session: the later save wins (whole session), no
  error.
- Demo plan open: the exercises work (visions are not part of a plan); goals of demo plans are
  not offered in the picker.
- 360 px, phone landscape, keyboard only (Tab, Enter for Next, Esc for "Save and close"), both
  languages.
