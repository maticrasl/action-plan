# Guide page content (English)

Each article: `id` · group · title, then the body. **Action** is the button under the article.
**Related** lists article ids. **Live** marks text that depends on the app's state.
⚠ marks a statement about the code to check before shipping.

Words in “quotes” that name buttons or fields are the interface labels; use the real label of
the language being written.

---

## Group: Start here

### `method` · How Action Plan works

Action Plan is built on one idea: a goal is a distance between where you are and where you want
to be, and you cross it by steps.

- A **vision** is a state you wish for and never finish, such as “To be fit and live
  healthily”. It answers *what for*.
- A **goal** is a place on the way that you can reach and tick off: “Run 10 km without stopping
  by 1 June”. It answers *what, by when*.
- A **current state** is where you stand today, as a number you measure again and again: your
  longest run, your savings. It answers *how far still*.
- **Activities** are the steps. Some you do once, some are **routines** you repeat. They answer
  *what do I do this week*.

The app links these, so that a tick on a routine or a new measurement moves the goal's progress
by itself. The Map shows what serves what, the Timeline shows when, and Graphs show whether it
is working.

The method in use is small:

1. Choose one goal that matters to you.
2. Write down honestly where you stand.
3. Plan the next two or three steps, the first one small enough for today.
4. Do, tick, measure.
5. Once a week, look at the plan and change what no longer fits.

A plan that changes is a plan that is being used.

Related: `words`, `what-goal`, `review`

### `words` · The words the app uses

- **Plan** – one set of goals, states and activities. You can keep several, for example one for
  health and one for the house.
- **Vision** – a wished-for state without an end. Shared by all your plans.
- **Purpose** – the one vision all your other visions and active goals lead to, once you have
  linked them that way.
- **Goal** – a result with a deadline. **Active**, **Paused** or **Achieved**.
- **Sub-goal** – a smaller goal on the way to a bigger one.
- **Current state** – something you measure. Either each new value replaces the last (weight),
  or the amounts **add up** (kilometres run).
- **Activity** – a step. A **one-time activity**, a **list** (a checklist), a **routine**
  (repeats) or a **routine list** (a checklist that repeats).
- **Relationship** – a link between two items: an activity *contributes to* a goal, *improves*
  a state, *depends on* another activity; a state *describes the current state of* a goal.
- **SMART** – the five things the goal form asks for: Specific, Measurable, Achievable,
  Relevant, Time-bound.

Related: `method`

### `tips-all` · Tips and tricks

Things the app can do that are easy to miss: the class D tips of `03-tips.md` as general
sentences, without item names (the text itself is in `src/i18n/guide.en.ts`). Ends with: “Tips
appear on the Overview now and then. Settings › Display turns them off. When you are open to one,
ask for it here.” Action: **Show me a tip** (opens the Overview with a tip asked for).

Related: `method`

---

## Group: When you are stuck

### `what-goal` · I don't know what goal to set

This is the most common place to stop, and it does not mean you lack ambition. Most people know
what bothers them long before they know what they want.

Try one of these, with pen and paper, ten minutes:

- **Start from what bothers you.** Write three things in your life that you would like to be
  different a year from now. Turn one around: “I'm always tired” becomes “I sleep seven hours
  on work nights”.
- **Start from a good day.** Describe an ordinary Tuesday three years from now, if things went
  well. Where do you wake up, what do you do, who is there? What in that day is missing today?
- **Start from what you already do.** Something you return to without being told is a clue.
  What would “a step further” be?

Then pick **one**. Not the most important one: the one you would be glad to work on this
month. A first goal that takes four to eight weeks teaches you more than a perfect five-year
goal.

If nothing comes, open the templates and read a few. You do not have to use one; seeing how
others have put a wish into steps often shakes loose your own.

Action: Start from a template
Related: `vision-how`, `smart-fit`, `too-many`

### `vision-how` · I don't know what my visions are

A vision is not a goal. You never finish “To be a present father” or “To live without money
worries”; you only move closer or further. That is what makes it useful: when a goal is
reached, or fails, the vision is still there and tells you what the next goal is.

To find one, take a goal you already have and ask “what for?”. Then ask again of the answer.
“Run 10 km” – what for? “To be fit.” – what for? “To have energy for my kids when I'm fifty.”
When the answer stops changing, you have a vision. Write it as if it were already true, in your
own words, not in words that sound good.

Signs that a vision is really yours: you would want it even if nobody knew; it would still
matter if you never got praise for it.

You do not need visions to use the app. They help most on the days when a goal feels like a
chore, because they remind you why you set it.

When every vision leads to one vision at the top and every active goal serves it, the app marks
that one as your **Purpose**. Treat it as a tidy picture of what you are working for now, not
as a final answer; people's purposes change.

Action: Add a vision
Related: `what-goal`, `h-visions`, `let-go`

### `too-many` · I want to change everything at once

You probably can, just not in the same month. Every active goal asks for attention on most
days, and attention is the one thing a plan cannot add.

- Keep **two or three** goals Active. More than that and each one moves so slowly that it stops
  feeling worth it.
- Set the others to **Paused** (open the goal, “Status”). Paused goals keep everything and do
  not count as late. They are a queue, not a graveyard.
- When one goal is achieved or has become routine, bring the next one in.
- If two goals pull against each other (save money, travel more), decide which goes first this
  season. The plan cannot settle that for you, but leaving it open slows both.

Action: Open Goals
Related: `what-goal`, `pressure`

### `smart-fit` · My goal doesn't fit the form

The goal form asks five things and will not save until each has an answer. That is meant to
turn a wish into something you can act on, but it can feel like an exam. Some ways through:

- **Specific** – describe what you would see on the day it is done. “Get fit” becomes “Run from
  home to the lake and back without walking”.
- **Measurable** – if no number fits, change “Progress from” to **“Activities done”** (the goal
  is done when its steps are done) or **“Routines kept”** (the goal is how steadily you keep at
  it). Both are honest ways to measure.
- **Achievable** – one sentence on why you can do this: time you have, something similar you
  did before, help you can get. If you cannot write that sentence, make the goal smaller until
  you can.
- **Relevant** – why it matters *to you*. “My doctor said so” is a start; “I want to climb
  stairs without stopping” is better.
- **Time-bound** – a date is a guess, not a promise. Choose one, and move it when you know
  more.

A first version that is roughly right is enough. Open the goal again in two weeks and improve
it; by then you will know things you cannot know today.

When the task is new to you, set the goal on **learning**, not on a result: “Try three ways to
study Spanish and choose one by March” instead of “Know 1,500 words”.

Related: `no-number`, `what-goal`, `h-goals`

### `no-number` · I can't put a number on it

Some things worth wanting have no natural number: being calmer, a better marriage, feeling at
home in a new town. Four ways to measure them anyway:

- **Count what you do.** “Routines kept”: two evenings a week without the phone, a walk
  together every Sunday. You cannot command a feeling, but you can keep an appointment.
- **Count steps.** “Activities done”: five things that, once done, mean you gave it a real try.
- **Rate it yourself.** A current state “How calm was this week, 1–10”, recorded every Sunday.
  It is rough, and the line on the graph will still tell you something after two months.
- **Count a visible sign.** Nights slept through. Days without a cigarette. Dinners at the
  table.

Choose a measure you can influence by what you do this week. A number that depends mostly on
other people or on luck will discourage you however hard you work.

Related: `smart-fit`, `h-states`

### `first-steps` · I don't know what the steps are

You do not need the whole road, only the next piece of it.

- Ask: **“What is the first thing I would do if I started today?”** Often it is finding
  something out: look up prices, ask someone who has done it, book the appointment. That is a
  real step. Add it.
- Add a step called **“Find out how”** with a due date this week. When it is done, you will
  know the next two.
- Work backwards: what must be true just before the goal is reached? And before that?
- Look at a **template** for a similar goal and borrow its steps.
- For a skill or a health goal, one hour with someone who knows (a trainer, a teacher, a
  doctor) saves months. Make “Book an hour with…” the first activity.

Plan in detail only two or three steps ahead. Further out, a rough note is enough; you will
rewrite it anyway.

Action: Add an activity
Related: `not-starting`, `h-activities`

### `not-starting` · I planned it, but I don't start

Wanting to do something and doing it are further apart than they feel. The gap is usually not
laziness; the step is too big, too vague, or has no place in your day.

- **Make it smaller.** If a step has waited more than a few days, cut it until it takes ten
  minutes. “Write the CV” becomes “Open the old CV and list what is out of date”. Starting is
  the hard part; most people keep going once they have begun.
- **Give it a time and a place.** “On Saturday after breakfast, at the kitchen table, I open
  the old CV.” A step tied to a moment gets done far more often than a step you mean to do
  “this week”. Put the moment in the activity's title and the day in its due date.
- **Name the obstacle before it comes.** What will most likely stop you? Tired after work?
  Then: “If I'm tired after work, I do just five minutes.” Write that in “Details”.
- **Remove one barrier tonight.** Shoes by the door. The form printed. The tab left open.

If a step still does not move, ask whether you want the goal or only think you ought to. That
is a fair question, and `let-go` is about it.

Related: `first-steps`, `overplanning`, `let-go`

### `routine-slips` · I keep missing my routine

Almost everyone does. A new routine takes anywhere from a few weeks to most of a year before it
feels automatic, and missing a day now and then does not set that back. What does harm is
the thought “I've broken it, so it's over”.

- **One tick puts you back.** In the app a routine counts as late only until you tick it again.
  Missed days are shown in grey, not red, because they are in the past.
- **Make it smaller.** If you keep less than half of it, the routine is too big for your life
  as it is now. Three runs a week become two. Thirty minutes become ten. Raise it when it holds
  for a month.
- **Tie it to something that already happens.** After the morning coffee. When I park the car.
  The old habit becomes the reminder. Put it in the routine's name.
- **Allow a small version for bad days.** “On a bad day, I put on the shoes and walk to the
  corner.” It counts. Tick it.
- **Loosen the days.** If set days do not fit your weeks, change the routine to a number of
  times a week, or switch on “A missed day can be made up on another day”.

The app has no reminders. Set an alarm on your phone, or put the routine in your calendar, for
the first few weeks.

Action: Open Activities
Related: `fell-off`, `too-busy`, `h-routines`

### `fell-off` · I haven't opened the plan in weeks

Welcome back. Nothing is lost, and you do not have to catch up.

It helps to know what usually happens here: after a break, the list of late things looks like a
bill, so we avoid looking, and the break gets longer. The way out is to treat today as a new
start, not as a return to the old schedule.

1. Do **not** tick or fix everything. Open the Overview and choose **one** step for today.
2. Move the dates. Open the Timeline and drag late bars to where they can really happen now.
   A date in the past is only an old guess. “Move late steps” on the Overview moves them all at
   once and keeps their order.
3. Pause what you will not work on this month.
4. For routines, tick today. That is all it takes to be on track again.
5. Ask what made you stop. Illness and busy weeks pass by themselves. If the plan was too heavy
   or the goal stopped mattering, change the plan, not yourself.

Action: Move late steps…
Related: `routine-slips`, `behind`, `let-go`, `review`

### `behind` · I'm behind and the deadline is close

First, this is normal. People almost always expect things to take less time than they do, even
when they know that they usually take longer.

You have three honest options, and all three are planning, not failing:

- **More time now.** Is there something you can drop this week to make room? Decide what, not
  only “I'll try harder”.
- **Move the date.** If the deadline was your own guess, guess again with what you know now.
  “Move late steps” on the Overview moves them all at once and keeps their order.
- **Shrink the target.** 8 km on the day is not 10, and it is a great deal more than where you
  started.

When the deadline is fixed from outside (an exam, a race), cut scope: which steps matter most
for the result? Do those, and delete the others without guilt.

For next time: when you set a date, ask how long similar things took you before, and use that,
not how long it ought to take.

Action: Move late steps…
Related: `no-progress`, `pressure`

### `no-progress` · I do the work, but the number doesn't move

Ticks without movement are a sign to look at the plan, and it is good that you can see it.

- **Is it too early?** Weight, fitness, savings and skills move slowly and unevenly. Look at
  the graph over six or eight weeks, not from one measurement to the next.
- **Is the measure right?** Perhaps you are getting fitter while the scale stays still. Add a
  second current state that catches what is changing: waist, pace, how the stairs feel.
- **Are these the right steps?** Being busy and moving forward are different things. Which
  activity was meant to move this number? If the link was a hope, test another step for a
  month.
- **Is the dose enough?** Once a week may hold you where you are; twice may move you.
- **Ask someone who knows.** A stuck number is the best moment to spend an hour with a trainer,
  teacher, doctor or adviser. Bring your graph.

If the goal depends mostly on things outside your hands, measure what you do (“Routines
kept”) and let the result be a bonus.

Action: Open Graphs
Related: `behind`, `no-number`

### `pressure` · The plan makes me feel bad

A plan is supposed to carry things for you so that your head does not have to. If opening it
feels like being told off, something in the plan is wrong, not in you.

- **Too much is active.** Pause goals until what remains looks doable in a normal week.
- **The dates are wishes.** Late marks pile up when every date was the best case. Move them,
  and add spare time when you set new ones.
- **The goals are someone else's.** A goal you set because you ought to weighs more than one
  you want. Read the “Why does it matter?” answer on each goal. If it does not sound like you,
  see `let-go`.
- **You only see what is missing.** Before looking at what is next, look at what is done: the
  Done column, the ticked days, the graph since the first measurement.

Being hard on yourself does not make you work better. People who meet a slip with some
kindness get back to it sooner than those who meet it with blame.

Some things need more than a plan. If you feel low or anxious most days, or if tracking food,
weight or exercise starts to rule your day, please talk to a doctor or a therapist, and set the
tracking aside for now.

Related: `too-many`, `let-go`, `limits`

### `too-busy` · My weeks are unpredictable

Shift work, small children, travel, illness: a plan made for regular weeks breaks in the first
irregular one. Build the plan for the weeks you really have.

- Use routines that ask for **a number of times per week or month**, on any days, not set
  days.
- Switch on **“A missed day can be made up on another day”** for routines that do have set
  days.
- Keep a **small version** of each routine for hard weeks, and count it.
- Plan fewer steps per week than fits in a good week. A plan you beat is better than one that
  beats you.
- Give goals longer deadlines than feels needed. Nobody takes points off for arriving early.
- In a truly bad stretch, pause the goal. Starting again from a pause is easier than from a
  pile of late marks.

Related: `routine-slips`, `behind`, `h-routines`

### `let-go` · This goal no longer feels right

Goals are set by a past you who knew less. Dropping one that no longer fits is good sense, and
people who can let go of goals that have become unreachable or pointless do better afterwards
than those who hang on.

How to tell a hard patch from a wrong goal:

- Read your own “Why does it matter?”. Is it still true?
- Would you set this goal today, knowing what you know now?
- Is it the goal that tires you, or only the current step? A dull step can be changed; the goal
  may be fine.

Then choose:

- **Change it.** Smaller target, later date, another way to the same vision.
- **Pause it.** Not now, perhaps later.
- **Delete it,** or mark it Achieved if it has done its job. Look at which vision it served
  and whether something else should serve it now.

The time you spent is not wasted; it is how you found out.

Related: `vision-how`, `pressure`, `reached`

### `reached` · I reached my goal. Now what?

Mark it Achieved and stop for a moment before the next one. It is easy to skip this, and it is
the part that makes the next goal easier.

- **Note what worked.** Which step or routine made the difference? The app asks when you
  mark the goal Achieved. Two lines are enough.
- **Decide what stays.** Many results need upkeep: the weight, the language, the savings. Keep
  one small routine and let the others end.
- **Choose what is next from the vision,** not from the momentum. What does “To be fit and
  live healthily” ask for now? Perhaps something quite different.
- **Take a paused goal out of the queue,** if one is waiting.

Feeling a little flat after reaching something you worked on for months is common. It passes,
usually when the next thing gets its first step.

Related: `let-go`, `too-many`, `vision-how`

### `overplanning` · I keep planning instead of doing

Arranging a plan feels like progress, and it is pleasant: boxes line up, nothing is hard yet.
If you have spent more time on the Map than on your steps this week, this is for you.

- A plan is good enough when you know **the next step and when you will do it**. Stop there.
- Set a limit: ten minutes of planning, then one step done before you open the app again.
- Do not polish goals that are months away. They will change.
- Use the weekly review as the one moment for tidying. On other days: open, tick, close.

Related: `not-starting`, `review`

### `review` · The weekly review

*(Interactive: five checkboxes and the button “Review done”. See `01-guide-page.md`.)*

Once a week, five minutes, on a day and at a time you choose. This is what keeps a plan alive.

1. **Tick what you did.** Activities, list items, routine days you forgot to tick.
   *(link: Activities)*
2. **Measure.** Record a fresh value for each current state that has changed.
   *(link: Current states)*
3. **Look back.** What moved this week? What helped? One sentence in your head is enough.
   *(link: Graphs)*
4. **Fix the plan.** Move dates that no longer hold. Split a step that did not move. Pause what
   is too much. *(link: Timeline)*
5. **Choose next week's one thing.** The step that matters most. Give it a day.
   *(link: Overview)*

Related: `method`, `fell-off`, `overplanning`

---

## Group: How do I…

Keep these short. They replace the old tour's explanations.

### `h-goals` · Goals

Add a goal with the Add button in Goals. The form asks the five SMART things; the letters light
up as you fill them in, and the goal saves when all five are lit.

**“Progress from”** decides how the goal moves:

- **A measurement** – you give a metric, a starting value and a target. Link a current state
  and the goal follows its latest value.
- **Activities done** – the share of the goal's activities that are done.
- **Routines kept** – how steadily you keep the routines linked to the goal.

A goal can be **part of** a bigger goal (a sub-goal), can **depend on** another goal, and can
**serve** visions. “Status” sets it to Active, Paused or Achieved; when a goal reaches its
target the app asks whether to mark it achieved. A **category** (Health, Finance…) lets you
filter goals with the chips above the list. Long-press or right-click a goal for more: add a
sub-goal, add an activity for it, show it on the Map or the Timeline.

Notes at the end of the form keep dated remarks; long-press the card and choose “Add a note”
to write one quickly.

Action: Add a goal · Related: `smart-fit`, `no-number`

### `h-states` · Current states

A current state is something you measure. Say what the value means and how you take it, so that
every measurement is taken the same way. Tap its card to record a new value: one per day; a
second value on the same day replaces the first. Decimals work with a dot or a comma.

A state can **add up** instead (“Adds up: Yes”): kilometres run, money put aside. Then each
entry is an amount, several a day are fine, and the card shows the total. A goal measured by
such a state chooses how it counts: in total, or per day, week, month or year.

Link the state to a goal (“Describes the current state of goal(s)”) and the goal's progress
follows it. A wrong value is deleted in Graphs, in the table under the state's graph, or in the
state's form under the history.

A value can carry a short note, such as “after two weeks off”. It shows under the graph and on
the point.

Action: Add a current state · Related: `h-graphs`, `no-number`

### `h-activities` · Activities

An activity is a step. When you add one, choose its kind:

- **One-time activity** – done once.
- **List** – a checklist; done when every item is ticked.
- **Routine** and **Routine list** – repeat; see `h-routines`.

One-time activities and lists sit on the board: To do, In progress, Done. Drag a card, or tap
its circle to move it along. On its start date an activity moves to In progress by itself.

Link an activity to the goals it **contributes to** and the states it **improves**. It can be
**part of** a larger activity (a sub-activity), and it can **depend on** another activity that
must be done first; until then it shows as waiting. “Hide done and achieved” clears finished
cards from view.

Notes at the end of the form keep dated remarks; long-press the card and choose “Add a note”
to write one quickly.

Action: Add an activity · Related: `first-steps`

### `h-routines` · Routines

A routine is an activity that repeats. Under “Repeats” choose a number of times per week or
month, specific days, or “Custom…” for every few days, weeks, months or years, a day of the
month, or a weekday such as the second Friday. “Ends” sets a last day or a number of times.

Tick a routine on its **week strip**, in Activities or on the Overview. Days outlined in blue
are due; grey hatched days were missed; today is ringed. The arrows beside the strip go to
earlier weeks, so you can tick what you forgot. The green tag is your streak.

A routine is late only until you tick it again. With **“A missed day can be made up on another
day”** switched on, a tick on any other day stands in for a missed one.

A **routine list** is a checklist that starts afresh each time, such as a morning routine;
ticking its last item ticks the day.

When a routine improves a state that adds up, ticking it asks “how much?” and adds the amount
to the state in the same step.

Action: Add a routine · Related: `routine-slips`, `too-busy`

### `h-visions` · Visions and Purpose

Visions are in the Visions view and belong to all your plans together. Add one, describe what
it looks like as if it were already true, and choose the goals that serve it; or open a goal and
choose “Serves visions”. A vision can serve broader visions.

The view tells you how many visions are at the top and which active goals serve none. When one
vision is at the top of all the others and every active goal in every plan serves it, the app
shows it in gold as your **Purpose**.

Action: Add a vision · Related: `vision-how`

### `h-map` · Map

The Map draws every item and link: visions and goals at the top, activities in the middle,
current states at the bottom. Tap a box or a line to select it and light up what it connects
to. Double-click or press Enter to edit, Delete to remove.

**To link two items** with a mouse, drag from one box onto the other. On a touch screen,
long-press a box, choose “Link to…” and tap the other box. The app offers only the
relationships that fit those two.

The chips above the Map hide kinds of links. Drag the background to move, pinch or Ctrl + scroll
to zoom. Right-click an empty spot to add something there.

Action: Open the Map

### `h-timeline` · Timeline

The Timeline shows goals and activities by date; an item needs a start or due date to appear.
Activities sit under the goals they contribute to. Arrows are dependencies, red stretches are
overdue time, and routines with set days show each day as done, missed or to come.

Tap a bar to select it, then drag the bar to move its dates or one end to change only that
date (on a touch screen, long-press first). ▾ beside a goal folds its rows away. Pinch or
Ctrl + scroll changes the scale. The toolbar’s “Move late steps…” re-dates
every overdue bar in one go.

Action: Open the Timeline

### `h-graphs` · Graphs

Each current state with measurements has a graph: your values over time, a dashed line for the
goal's target, and the change since the first measurement. A state that adds up shows sums per
day, week, month or year, or the running total; choose above the graph. Each routine has a
graph of how often you did it per period.

Hover or tap to read a value; pinch or Ctrl + scroll to zoom into a stretch of time. The table
under a graph lists the measurements; delete a wrong one there.

Action: Open Graphs

### `h-overview` · Overview

The Overview is the page for most days: how far along your active goals are on average, the
activities due by today or overdue (“Show all” adds the others in progress), the routines today
still asks for, and your active goals. Tick things here without going anywhere else.

Action: Open the Overview

### `h-plans` · Plans, templates and files

A plan is one set of goals, states and activities. Switch plans in the sidebar or, on a phone,
by tapping the plan's name above the title. Settings has the rest: new plan, rename, delete,
and **merge** one plan into another.

- **Start from a template** opens a ready-made plan as a new plan, with dates counted from
  today. Change everything to fit you.
- **Load sample plan** opens a filled example to look around in.
- **Export plan** saves a file: a *Full copy* with your progress, as a backup, or a *Template*
  without progress, to share with someone.
- **Import plan** adds a file as a new plan. It never overwrites one you have.

The coloured dot by each plan shows green when nothing is due, yellow when something is due
today, red when something is overdue.

Action: Open Settings · Related: `p-backup`

### `h-sync` · Several devices, several people

Log in with Google in Settings › Account and sync and your plans are the same on every device
where you log in. Google asks you to confirm about once an hour; when the cloud button says
sync is paused, click it. Changes made offline wait on the device and sync later. If two
devices change the same item, the later change wins, so keep their clocks set automatically.

Several people can use one device: each logs in with their own Google account and sees only
their own plans.

**Live:** when sync is not set up for this copy of the app, show instead: “Sync is not set up
for this copy of the app. Your plans stay on this device; use Export and Import to move them.”

Action: Open Account and sync · Related: `p-where`, `p-google`

### `h-install` · Install the app, use it offline

Action Plan can be installed from the browser and then opens from your home screen in its own
window, also without a connection. Use “Install app” in Settings. On an iPhone or iPad: open the
page in Safari, tap Share, then Add to Home Screen.

**Live:** hide the action when installed; show the browser-specific hint that Settings shows.

Action: Install app

### `h-shortcuts` · Shortcuts and gestures

- **Long-press or right-click** almost anything for a menu of what you can do with it.
- **Ctrl + Enter** saves the form you are in. **Esc** closes it.
- On the Map and Timeline: **Enter** edits the selected item, **Delete** removes it, **Esc**
  deselects.
- **Pinch** or **Ctrl + scroll** zooms the Map, the Timeline and graphs. With one finger: tap,
  then touch again and drag down or up.
- The **Add** button always adds what fits the view you are in.
- **Explanations on screen** (on this page and in Settings) adds a short note to each view and
  ⓘ marks on the controls.

---

## Group: Your data and privacy

### `p-where` · Where my plans are kept

⚠ Your plans are kept in this browser, on this device. Action Plan has no server of its own:
nothing you write is sent to the people who make the app, and they cannot see, read or restore
your plans.

⚠ If you log in with Google, a copy is also kept in your own Google Drive, in a hidden app
folder. See `p-google`.

⚠ The app does not use advertising or tracking, and it does not count what you do in it.

⚠ When the app loads, its own files (the typeface among them) come from the site that hosts it.
The company running that site sees that your device asked for a file, as with any web page. It
does not receive anything from your plans.

Related: `p-google`, `p-backup`, `p-device`

### `p-google` · What logging in with Google does

⚠ Logging in gives Action Plan one permission: to keep its own data in a hidden folder of your
Google Drive. The app cannot see your other files, your mail or your contacts, and other apps
cannot see this folder. Your email address and name are read once, to show who is logged in on
this device.

⚠ The plans in that folder are stored by Google under your account and under Google's terms.
They are not encrypted by Action Plan beyond what Google does for all Drive files.

To stop: log out in Settings › Account and sync. To remove the copy in Drive: open your Google
Drive settings, “Manage apps”, find Action Plan and choose “Delete hidden app data”. You can
withdraw the permission in your Google account under “Third-party apps and services”.

Related: `p-where`, `h-sync`

### `p-device` · Who else can see my plans

⚠ Anyone who can open this browser on this device can open the plans in it. Action Plan has no
password of its own.

⚠ When several people are logged in on one device, each has their own plans, kept apart. This
keeps things tidy; it is not a lock. Do not rely on it for things that must stay private from
someone who uses the same device. Use a separate browser profile or device account for that.

On a shared or public computer, use “Remove from this device” in Settings › Account and sync
when you are done. What has synced stays in your Google Drive.

**Live:** show the second paragraph only when more than one user is on the device.

Related: `p-where`

### `p-backup` · Can I lose my plans?

Yes, if they exist in one place only. Plans kept only in the browser are gone when the
browser's site data is cleared, when the browser is removed, or when the device is lost. Some
browsers clear data of sites not visited for a long time; installing the app makes that less
likely.

To be safe, do one of these:

- **Log in with Google**, so that a copy is in your Drive and on your other devices.
- **Export a full copy** of each plan now and then, and keep the file somewhere else.

A deleted plan cannot be brought back; there is no recycle bin. With sync on, deleting a plan
deletes it on your other devices too. The delete dialog offers to download a backup first.

**Live:** if sync is off and no export has been made on this device, show at the top: “Your
plans are in this browser only right now.”

Action: Export plan · Related: `h-plans`, `h-sync`

### `p-delete` · How do I delete everything?

- **One plan:** Settings › Plan › Delete plan.
- **Everything on this device:** Settings › Account and sync › “Remove from this device”, or
  clear this site's data in the browser's settings.
- **The copy in Google Drive:** see `p-google`.

⚠ After that, nothing of yours remains anywhere that the app knows of. Files you exported are
yours to delete.

Related: `p-google`

---

## Group: What this app cannot do

### `limits` · What Action Plan cannot do for you

It is fair to say this plainly.

- **It cannot want the goal for you.** It can ask why a goal matters; it cannot supply the
  answer. A goal you do not want will sit here, late, however well it is written.
- **It cannot remind you.** The app only speaks when you open it. Make opening it part of your
  day: after breakfast, on the bus, before bed. Use your phone's alarm or calendar for
  reminders.
- **It does not know your field.** It cannot tell whether three runs a week is the right
  training or whether a savings rate is wise. Ask people who know, and put their advice in as
  steps.
- **It cannot see what you do.** It knows what you tick and enter. It is only as honest as you
  are with it, and it is private so that you can be.
- **It cannot give you time, money or health.** A plan arranges what you have. When
  circumstances are the limit, a smaller goal is the right goal.
- **It has no other people in it.** Telling one person what you are working on, and how it
  went, helps many people more than any app. Export a plan as a template to share it, or simply
  show someone your Overview once a week.
- **It is not treatment.** Low mood, anxiety, burnout, trouble with attention, and trouble with
  eating or body image need people trained for them. If counting and measuring make you feel
  worse, stop measuring and talk to someone.

Related: `pressure`, `method`

---

## Help banner for the Visions view

`help.view.visions` — Visions are states you wish for and never finish; goals are how you move
toward them. Add a vision, choose the goals that serve it, and put narrower visions under
broader ones. When one vision stands above all the others and every active goal serves it, it
is marked as your Purpose.
