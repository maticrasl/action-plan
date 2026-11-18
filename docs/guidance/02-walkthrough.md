# 2. Walkthrough ("Getting started")

**Goal:** a new user ends the first week with a real plan of their own: one goal, a starting
point, steps, one routine, a backup, and the habit of coming back. The guided tour, which showed
buttons on a sample plan, is removed.

Read `README.md` first (decisions 1, 2, 5; shared pieces: demo marker, seen flags, spotlight).

## What the user sees

### First visit

1. Language picker, as today.
2. **Welcome card** (centred, like the old tour's first card):

   > **Welcome to Action Plan**
   > Action Plan turns something you want into steps you can take: a goal, where you stand
   > today, and what you do about it this week.
   > How would you like to begin?
   >
   > [ **Start with my own goal** ]  [ Start from a template ]  [ Look at a sample plan first ]
   >
   > I'll find my own way

   - *Start with my own goal* closes the card; the walkthrough card is on the Overview.
   - *Start from a template* opens the template dialog. The walkthrough runs on the plan made.
   - *Look at a sample plan first* loads the sample plan, marked as a demo, with the banner
     below. The walkthrough waits.
   - *I'll find my own way* sets the walkthrough to off. A toast says "Getting started is in the
     Guide whenever you want it."
   - Esc and a click outside do the same as *Start with my own goal*.

3. **Demo banner**, at the top of every view while a demo plan is open:

   > This is a sample plan. Look around and change anything; it is not your data.
   > [ Start my own plan ]  [ Remove sample ]

   *Start my own plan* switches to the user's own plan (the empty starter plan) and keeps the
   sample. *Remove sample* deletes it and switches. Both land on the Overview.

### The card on the Overview

Above everything else on the Overview of a plan that is not a demo, also when the plan is empty
(then it sits above the empty state, whose own text stays).

```
 GETTING STARTED                                            3 of 13   [–]
 ●━━━━━━━◉─────────────────────────────○       (the goal trail, same component)

 Your first goal                                     ✓ done
 Make it a rhythm                                    1 of 4
   ✓ Add one routine
   ○ Tick it off                                             <- the next task, open
       The first time you do it, tick the day on its week strip, here on
       the Overview or in Activities. If you miss a day, nothing is lost:
       the next tick puts you back on track.
       [ Show me ]   Skip this step
   ○ Record a new value
   ○ Come back on three days                    1 of 3
 Keep it safe                                        0 of 2
 See the whole picture                               0 of 3
```

- It is drawn with the app's own parts: the goal card's trail for progress, the list ticks for
  tasks. The user learns the look of a goal and a list by using one.
- Four stages. The stage holding the next open task is unfolded; others show a count. Any stage
  can be unfolded by tapping it; tasks can be done in any order.
- The **next task** is the first open one in order. Only it shows its text and buttons.
  Tapping another open task shows that one instead.
- **Show me** goes to the right view and either opens the right form or points at the right
  control with the spotlight until the next click.
- **Skip this step** marks the task skipped (hollow tick, counts as done for progress). A
  skipped task that later becomes true turns into a real tick.
- `[–]` folds the card to one line: "Getting started · 3 of 13 · Next: Tick it off". The
  choice is remembered.
- A small menu on the card: "Hide getting started". It sets the walkthrough to off, with the
  toast above.
- Ticks cannot be set by hand, except the one task that says so. Tasks tick when the plan shows
  they are done.
- When a task ticks while the user is elsewhere in the app, a toast: "Getting started: {task}
  ✓ Next: {next task}". Not more than one such toast per render; if several tick at once, name
  the last.
- When a stage is completed the stage line shows its done-text for the rest of that day.
- When all are done: the card shows the closing text with one button, "Close". After that the
  card is gone; the Guide keeps the finished list.

### On the Guide page

The line "Getting started · n of 13 · [Continue]" opens the same list, in the page. When the
walkthrough is off or finished it reads "Getting started · [Start]" or "· done · [Look again]".
*Start* turns it on for the current plan. *Look again* shows the list with its ticks; it does
not reset them. A link "Start over" under the list clears the ticks that are not true in the
current plan.

## Stages, tasks and texts

Keys: `walk.<id>.title`, `walk.<id>.text`, `walk.<id>.btn`; stages `walk.stage.<id>.title`,
`.lead`, `.done`. "Guide" names the article the text links to with "More on this".

### Stage `first` — Your first goal

Lead: *One goal, where you stand, and the first steps. About ten minutes.*
Done: *You have a goal, a starting point and a first step done.*

| id | Title | Text | Button → what it does | Ticks when | Guide |
|---|---|---|---|---|---|
| `goal` | Write one goal | Pick one thing you would like to be different a few months from now. One goal is enough to begin; others can follow when this one is moving. The form asks five things: what exactly, how you will measure it, why it is realistic, why it matters, and by when. If no number fits, set “Progress from” to “Activities done” or “Routines kept”. A rough first version is fine; you can improve it later. | *Write a goal* → Goals, new goal form | the plan has a goal | `what-goal`, `smart-fit` |
| `state` | Record where you stand | A goal is a distance, and a distance needs a starting point. Add a current state: what you measure, how you measure it, and today's honest value. Link it to your goal and the goal's progress follows it. | *Add a current state* → new state form with the first goal chosen under “Describes the current state of goal(s)” | a state with a value describes a goal | `h-states`, `no-number` |
| `steps` | Plan the first steps | List two or three things you can do for this goal. Make the first one so small that you can do it today or tomorrow; ten minutes is fine. Give each a due date: a step with a day gets done far more often than a step for “sometime”. | *Add an activity* → new activity form with the first goal chosen | two activities (any kind) contribute to a goal | `first-steps` |
| `firstDone` | Do the first step | Do the small one, now or today. Then tap the circle on its card until it says Done. A plan starts working when the first thing is finished. | *Show me* → Activities, spotlight on the first card's circle | an activity is done, or a list item or routine day is ticked | `not-starting` |

`state` when no goal in the plan uses “A measurement”: the task shows as done with the note
*Not needed: your goal is measured by what you do.* It reopens if such a goal appears before the
walkthrough is finished.

### Stage `rhythm` — Make it a rhythm

Lead: *Goals are reached by what you repeat. This stage takes about a week.*
Done: *You have a routine going and you came back. That is the hard part.*

| id | Title | Text | Button | Ticks when | Guide |
|---|---|---|---|---|---|
| `routine` | Add one routine | Something you will do again and again: three runs a week, ten minutes of Spanish a day, a look at your money on the first of the month. Put the moment in its name, like “Run after work”, so the decision is already made when the moment comes. Start smaller than you think you need to; you can raise it later. | *Add a routine* → new activity form with the kind Routine chosen | the plan has a routine or routine list | `h-routines`, `routine-slips` |
| `tick` | Tick it off | The first time you do it, tick the day on its week strip, here on the Overview or in Activities. If you miss a day, nothing is lost: the next tick puts you back on track. | *Show me* → spotlight on the routine's week strip (Overview if listed there, else Activities) | a routine has a check-in | `h-routines` |
| `measure` | Record a new value | Measure again and tap the state's card to record the value. Two points make a line: from now on Graphs shows which way you are going. | *Show me* → Current states, spotlight on the first card | a state has values on two different days (a state that adds up: two entries) | `h-graphs` |
| `days` | Come back on three days | Open your plan on three different days. Half a minute is enough: tick what you did, look at what is next. Choose a moment that already exists in your day, such as the morning coffee. | — (shows “{n} of 3”) | the app was opened on three different days since the walkthrough started | `review` |

`measure` when the plan has no states: done, with the note *Not needed: this plan has no current
states.*

### Stage `safe` — Keep it safe

Lead: *Your plan lives in this browser. Two minutes to make sure it cannot get lost.*
Done: *Your plan has a copy outside this browser.*

| id | Title | Text | Button | Ticks when | Guide |
|---|---|---|---|---|---|
| `backup` | Make a copy | Log in with Google and your plans are kept the same on all your devices, in a hidden folder of your own Google Drive that only this app can read. Or export a full copy to a file now and then. | *Open Account and sync* → Settings scrolled to that section · second button *Export plan* | sync has completed once for this user, or a full copy was exported on this device | `p-backup`, `p-google` |
| `install` | Install the app *(optional)* | Put Action Plan on your home screen. It opens in its own window like any other app, also without a connection. | *Install app* → the install prompt, or Settings at the App section where only a hint exists | the app runs installed | `h-install` |

`backup` when sync is not set up for this copy: text without the first sentence, one button
*Export plan*. `install` is left out (not counted) when the app is already installed at start
or the browser cannot install and has no hint to show.

### Stage `picture` — See the whole picture

Lead: *Three other ways to look at your plan, and the question behind it.*
Done: *You have seen all of it.*

| id | Title | Text | Button | Ticks when | Guide |
|---|---|---|---|---|---|
| `views` | Look at your plan three ways | The Map shows what serves what. The Timeline shows when. Graphs show whether it is working. Open each once. (Shows three small ticks: Map · Timeline · Graphs.) | *Open the Map* / *Open the Timeline* / *Open Graphs* → the first not yet opened | each of the three views was opened in a plan that is not a demo | `h-map`, `h-timeline`, `h-graphs` |
| `vision` | Say what it is for *(optional)* | Above goals sit visions: a state you wish for that is never finished, such as “To be fit and live healthily”. Add one and link your goal to it. On the days a goal feels like a chore, this is the sentence that reminds you why. | *Add a vision* → new vision form | a vision is served by a goal | `vision-how` |
| `review` | Do a weekly review | Once a week, five minutes: tick what is done, record fresh values, move dates that no longer hold, and choose the one step that matters most next week. Go through the list once now. | *Open the weekly review* → Guide, article `review` | “Review done” was pressed | `review` |

### Closing text (`walk.finished`)

> **You are set up**
> You have a goal, a starting point, steps, a routine and a rhythm of coming back. From here the
> plan is yours. The Guide has help for the moments when you get stuck, and a tip will appear now
> and then; Settings turns tips off.

### Other strings

| Key | English |
|---|---|
| `walk.title` | Getting started |
| `walk.count` | {done} of {total} |
| `walk.next` | Next: {task} |
| `walk.showMe` | Show me |
| `walk.skip` | Skip this step |
| `walk.more` | More on this |
| `walk.optional` | optional |
| `walk.hide` | Hide getting started |
| `walk.hidden` | Getting started is in the Guide whenever you want it. |
| `walk.ticked` | Getting started: {task} ✓ |
| `walk.tickedNext` | Getting started: {task} ✓ Next: {next} |
| `walk.start`, `walk.continue`, `walk.again`, `walk.over` | Start · Continue · Look again · Start over |
| `walk.close` | Close |
| `welcome.*` | the welcome card above |
| `demo.banner`, `demo.own`, `demo.remove` | the demo banner above |

## Rules

**State.** Preference `walk`:
`{ state: 'on' | 'off' | 'finished', started: date, done: { [taskId]: date }, skipped: [taskId], folded: boolean }`.
Opening days and opened views come from the shared `seen` flags.

**Checks are pure.** One function per task: `(plan, visions, seen, env) → boolean`, where `env`
carries what is not data (sync set up, synced once, installed, can install). A second function
turns all checks plus the stored state into what the card shows. Both in `core/guidance/`.

**Latching.** A task once ticked stays ticked, even when the user later deletes the goal. Ticks
are latched on every render of a plan that is not a demo, whatever view is open.

**Which plan.** Checks look at the plan that is open. A user with several plans sees the same
ticks in each (the ticks belong to the user, not the plan).

**When it is offered.**
- First visit (no stored plans for this user): welcome card, then `state: 'on'`.
- A new user on a device whose plans arrive from Drive at first sign-in: not offered
  (`drive.js` already holds the tour back in this case; keep that condition).
- Upgrade: a user who has `tourSeen` set or any item in any plan gets `state: 'off'` without a
  welcome card. They find it in the Guide.
- The walkthrough never opens a dialog over the user's work. Apart from the welcome card it only
  ever shows the card, the spotlight after "Show me", and toasts.

**Removed with the tour.** `TOUR_STEPS`, `startTour`, `showStep`, `endTour`, `tourKeys`, the
`tour.*` strings and `btn.tutorial`, the Settings button, the temporary "Tutorial" plan, the
pause of sync during the tour, and the tour checks in `enterUser` and in the Purpose popup
(`app.js:2202` at `5b71e59`). Kept: `chooseLanguage`, `pickLanguage`, the spotlight placement,
help mode. A switch of user while a spotlight is up removes the spotlight.

**Purpose popup.** With the tour gone, nothing holds it back. It must not open over the welcome
card; it cannot, since a first visit has no visions.

## Test cases

Pure rules (unit tests, written first)
- Each task's check: false on an empty plan, true on the smallest plan that meets it, for every
  task. `steps` needs two activities that contribute to a goal, not two unlinked ones.
- `state` and `measure` report "not needed" in the cases above, and `state` reopens when a
  measured goal is added.
- `days`: two opens on one day count once; three different days tick it; days before `started`
  do not count.
- Latching: tick, delete the goal, still ticked. Skipped then true becomes ticked.
- Next task: first open in order; all done gives "finished"; optional tasks left out do not
  count in the total (13 becomes 12).
- Offer rule: first visit → on; `tourSeen` → off; items in any plan → off.

Page steps
- First visit: language picker, then welcome card; each of its four choices does what it says.
- Sample from the welcome card: demo banner shows on every view; no walkthrough card; nothing
  ticks; "Start my own plan" and "Remove sample" both end on the Overview of the own plan with
  the card showing 0 done.
- Adding a goal through the form ticks `goal`, shows the toast with the next task, and the
  card's trail moves.
- "Show me" for each task lands on the right view; where a form opens, the goal is preselected;
  where the spotlight shows, it surrounds a visible element and goes away on the next click.
- Fold, unfold, hide; hidden card comes back from the Guide's Start.
- Finishing the last task shows the closing text; "Close" removes the card for good; the Guide
  shows the list as done.
- Template path: a plan made from a template has `goal`, `state`, `steps`, `routine` ticked at
  once and `firstDone` as the next task.
- Both languages: every `walk.*` key exists in both; no text overflows the card at 360 px.

Edge cases
- Storage full when saving `walk`: the card still works for the session, nothing else breaks.
- Two tabs: a tick made in one shows in the other on its next render; the other tab does not
  overwrite newer ticks with older ones (merge by union of `done`).
- Second user on the device gets their own walkthrough state.
- Switching to a demo plan hides the card; switching back shows it unchanged.
- Sync not configured: `backup` shows the export-only variant.
- Phone landscape (icon rail layout): the card fits and can be folded.
- Keyboard only: every task, "Show me", "Skip" and the fold button reachable; the spotlight
  closes with Esc.
