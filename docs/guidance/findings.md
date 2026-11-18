# Findings: the psychology, the app, and similar apps

For Matic. Written 2026-11-14. Not needed by Opus to build the three features.

How sure this is: the research below is well known and I checked the main papers by search, but
I read abstracts and summaries, not the full texts. Effect sizes are from those summaries. None
of these numbers appear in the app's texts. The comparison of apps comes from store listings and
review pages, not from using the apps; prices and features change.

## 1. What the research says about reaching goals

| # | Finding | Source | What it means here |
|---|---|---|---|
| 1 | Specific, hard goals beat "do your best", **when** the person is committed, gets feedback and has the skill | Locke & Latham 2002 | The base the app stands on. The three conditions matter as much as the goal |
| 2 | SMART as a checklist has thin scientific support: it is not derived from theory, its criteria overlap, and it ignores the kind of goal | Swann et al. 2022, *Health Psychology Review* | Use SMART as help, not as a gate |
| 3 | For tasks new to the person, a goal to *learn* works better than a goal to *perform* | Seijts & Latham 2005 | A beginner's first goal should often be "find out how" |
| 4 | Watching your progress helps you reach goals (138 experiments, about 20,000 people; average effect reported around d = 0.4). It helps more when written down and when told to someone | Harkin et al. 2016, *Psychological Bulletin* | The app's core loop is the right one. Telling someone is missing |
| 5 | "If X happens, I do Y" plans raise follow-through markedly (94 studies, d ≈ 0.65) | Gollwitzer & Sheeran 2006 | A step needs a when and a where, not only a due date |
| 6 | Imagining the result, then the obstacle, then an if-then plan (WOOP) has a small to medium effect (g ≈ 0.3) | Oettingen; Wang et al. 2021 | "What will get in the way?" is a better question than "Why is this realistic?" |
| 7 | Detailed planning helps with one goal and stops helping with several: planning many shows how hard it all is and weakens commitment | Dalton & Spiller 2012 | Start with one goal. Warn at many |
| 8 | Goals a person holds for their own reasons are worked on longer and satisfy more when reached | Sheldon & Elliot 1999; Koestner et al. 2002 | "Why does it matter?" and visions are not decoration |
| 9 | Habits take from 18 to an estimated 254 days to become automatic (median 66 in the modelled group); one missed day did not matter | Lally et al. 2010 | Say that it takes long, and that a miss is harmless |
| 10 | A broken streak, when shown, lowers later effort, more so when people blame themselves; being able to repair it softens this | Silverman & Barasch 2023 | The grey missed days and make-up days are well chosen. Do not make the streak the hero |
| 11 | People paid to exercise in a fixed two-hour slot went less often, during and after, than people who could go any time (2,508 people) | Beshears et al. 2021 | "N times a week" routines are a good default |
| 12 | After a slip people often give up the whole effort ("what-the-hell effect"); self-kindness after failure raises the will to improve | Polivy & Herman; Breines & Chen 2012 | The tone of every "late" message matters |
| 13 | New weeks, months and years raise goal-directed behaviour ("fresh start effect") | Dai, Milkman & Riis 2014 | Time the review and comeback messages there |
| 14 | People underestimate how long their own tasks take, even knowing past tasks ran over | Buehler, Griffin & Ross 1994 | Late dates are the normal case, so the app should make replanning easy |
| 15 | Near sub-goals raise effort and belief in oneself more than far goals | Bandura & Schunk 1981 | Sub-goals for anything beyond a few months |
| 16 | Early on, looking at what is done motivates; near the end, looking at what is left does | Koo & Fishbach 2008 | A percentage of a far goal is a poor thing to show a beginner |
| 17 | A sense of progress in meaningful work is the strongest day-to-day motivator | Amabile & Kramer 2011 | Show this week's done things |
| 18 | Being able to let go of unreachable goals and take up new ones goes with better well-being | Wrosch et al. 2003 | Pausing and deleting are healthy acts and should feel so |
| 19 | Goals framed as avoiding something go with lower well-being than goals framed as reaching something | Elliot & Sheldon 1997 | "Sleep seven hours", not "stop staying up" |
| 20 | Goals can also harm: narrow focus, risk-taking, cheating, less inner motivation | Ordóñez et al. 2009 | The Guide should say what the app is not for |

## 2. What the app does right

1. **The whole model is a gap being closed.** Goal, current state and activities are the three
   parts of the feedback loop that findings 1 and 4 describe. Most apps have one or two of the
   three.
2. **Measuring is a recorded, dated act**, with history and a graph against the target (4).
3. **Routines are forgiving.** "N times a week" as a first-class schedule (11), late only until
   the next tick, missed days grey and hatched, make-up days (9, 10, 12). This is better
   thought through than in most habit apps, where one miss resets a counter.
4. **Three kinds of progress.** "Routines kept" is a process goal, which is what people control.
   Few apps let a goal be measured by consistency.
5. **Sub-goals, sub-activities, dependencies** (15, and honest sequencing).
6. **"Why does it matter?" and visions** tie goals to reasons (8).
7. **Paused** exists as a state (7, 18).
8. **Templates** give a beginner a worked example, which is how people learn to break a goal
   down.
9. **Private by design.** People record honest numbers about weight and money only where
   nobody else sees them.
10. **Restraint.** No points, no confetti, no nagging. Praise is short ("That's this week
    done").

## 3. What could be improved

In order of how much I expect each to help. None of this is in the three plans, except where
noted.

1. **The SMART gate.** A goal cannot be saved until all five letters are lit, with minimum text
   lengths. This is where a first-time user is most likely to give up, and research finding 2
   says the gate has no evidence behind it. Suggestion: let any goal with a title be saved; show
   unlit letters as an invitation ("3 of 5: finish when you know more"); and offer a "learning
   goal" that needs no target. *The Guide and walkthrough work around the gate for now.*
2. **Replace "Why is this realistic?" with an obstacle and a plan.** "What is most likely to get
   in the way?" and "What will you do then?" are the two questions with evidence (5, 6). The
   current field mostly gets a sentence written to pass validation.
3. **A weekly review screen.** The Guide gets a five-line checklist; a real screen would show
   last week's ticks, the states waiting for a value and the late dates, with a "move to…"
   action on each, and end with "this week's one thing". This is the single feature most likely
   to keep people using the app.
4. **A cue on routines.** A field "When and where" (after what, in which place) beside the
   schedule (5). Today the advice is to put it in the title.
5. **Reminders.** The app is silent until opened, and remembering at the right moment is the
   main reason intentions fail. Real push messages need a server. Cheaper steps: export
   routines and deadlines as a calendar file; a count on the installed app's icon where the
   platform allows.
6. **Show what was done, not only what is left.** The Overview opens with an average percentage
   and the late list. Early in a goal, that discourages (16, 17). Add a line such as "This
   week: 4 steps done, 5 routine days ticked".
7. **Replanning in one move.** "Running late" in red, item by item, reads as a list of
   failures (12, 14). Offer "Move all late steps…" and count a moved date as a plan kept up to
   date.
8. **A small version of a routine.** "On a bad day: …", ticked as a half tick or a normal one.
   Slack that is planned in keeps people going (Sharif & Shu 2017).
9. **Notes on measurements and on achieved goals** (your parked idea). "What made the
   difference?" is how a person gets better at planning.
10. **Telling someone.** Finding 4: progress reported to another person helps more. A weekly
    summary that can be shared as text or picture would do, without accounts or a server.
11. **The Purpose message.** "You have found your Purpose" appears when the boxes are linked a
    certain way. A purpose is not found by linking, and the claim may ring hollow to someone
    who linked things to tidy the map. Softer: "Your goals now point one way".
12. **Self-host the typeface.** The font is loaded from Google Fonts, so "nothing leaves your
    device unless you log in" is not quite true. Shipping the font with the app makes the
    privacy text simple and true. *Done 2026-11-18: the font ships with the app.*
13. **A warning beside sensitive measures** is not needed, but the Guide now says when to stop
    tracking. For weight and food, tracking can do harm to some people.

## 4. What the app cannot help with

- **Wanting.** It can ask why; it cannot make a goal one's own. Goals taken on because one
  ought to are the ones that stall (8).
- **The moment of action.** It is not there when the alarm rings or the cigarette is offered.
  Without reminders it only works for people who open it.
- **Knowing the right steps.** Whether three runs a week or a 20 % savings rate is right is
  expert knowledge. Templates help a little.
- **Circumstances.** Time, money, health, caring for others. A plan arranges what exists.
- **Other people.** Encouragement, shared effort and someone who asks "how did it go?" are
  strong helpers, and the app is for one person.
- **Honesty.** It sees only what is entered.
- **Planning as avoidance.** A rich planning tool can itself become the way to put things off.
  The Map invites it.
- **Outcomes one does not control.** Promotions, other people's decisions, luck.
- **Illness.** Depression, anxiety, burnout, attention difficulties, eating disorders. For some
  of these, counting makes things worse.

## 5. Similar apps

Action Plan is early; the others have had years and teams. The table compares ideas, not polish.

| App | What it is | Has that Action Plan lacks | Lacks that Action Plan has |
|---|---|---|---|
| **Griply** | The nearest in idea: life areas → vision → goals → habits → tasks, SMART goals, charts. iOS, Mac, Windows, web. Free tier (2 habits), subscription | Reminders, widgets, calendar with time blocks, task inbox, native apps | Map of relationships, current states with history as their own kind of item, dependencies, progress by routines kept, free, data in your own Drive |
| **Timestripe** | Goals laid out over horizons from day to life | Horizon view (week, month, year, life), reminders | States and measurements, links between items |
| **Strides** | Goal and habit tracker with four tracker types (target, habit, average, milestone). iOS | Reminders, polished charts, average-type trackers | Activities with dependencies, visions, map, other platforms |
| **GoalsOnTrack** | Web, SMART goals with sub-goals, tasks, habits, journal, vision board. About $68 a year, no free plan | Journal, vision board with pictures, time tracking | Free, offline, private, map, flexible routine schedules |
| **Lifetick** | Web, core values → SMART goals → tasks, journal. Free for 2 goals | Journal, values step before goals, shared goals | Measurements with graphs, map, routines with make-up days |
| **Loop Habit Tracker**, **Streaks**, **Way of Life** | Habit trackers only. Loop is free, open source and keeps data on the phone | Reminders, widgets, habit-strength score (Loop) | Goals, states, steps; anything above the habit |
| **Habitica**, **Finch** | Habits as a game or a pet to care for | Fun, social groups | A goal model; quiet |
| **Beeminder**, **stickK** | You pledge money and lose it when you go off track | Real stakes, automatic data from devices (Beeminder) | Planning; kindness. Stakes suit few people |
| **WOOP app** | Walks you through wish, outcome, obstacle, plan | The obstacle step, which has the evidence | Everything after the plan is made |
| **Notion, Todoist, TickTick, ClickUp** | General task and note tools, often with goal templates | Everything general: reminders, calendar, sharing, integrations | A model of goals. The user builds it and it measures nothing by itself |

What this shows:

- **Where Action Plan stands out:** the measured current state as its own thing, the map of
  what serves what, progress by consistency, forgiving routines, visions above goals, no
  account and no server. I found no other app with this combination. Griply is the only one
  with a similar ladder from vision to daily action.
- **Where every rival is ahead:** reminders, widgets and native apps. For a tool built around
  routines this is the biggest gap, and it is the one users will name first.
- **What several rivals have and users expect:** a journal or notes on progress (GoalsOnTrack,
  Lifetick), and a today view that mixes tasks and habits with a calendar (Griply).
- **What not to copy:** points, pets, money pledges and streak counters that reset. They work
  for some people for a while, and they go against findings 10 and 12 and against the tone
  this app already has.
- **The opening for this app:** the others teach their buttons. None that I found teaches the
  method or helps at the moments people give up. The Guide, the walkthrough and the tips are
  aimed at exactly that.

## Sources

Research: Locke & Latham (2002) *American Psychologist*; Swann et al. (2022) *Health Psychology
Review*, doi 10.1080/17437199.2021.2023608; Seijts & Latham (2005) *Academy of Management
Executive*; Harkin et al. (2016) *Psychological Bulletin* 142(2); Gollwitzer & Sheeran (2006)
*Advances in Experimental Social Psychology*; Wang, Wang & Gai (2021) *Frontiers in
Psychology*; Dalton & Spiller (2012) *Journal of Consumer Research* 39(3); Sheldon & Elliot
(1999) *JPSP*; Koestner et al. (2002) *JPSP*; Lally et al. (2010) *European Journal of Social
Psychology*; Silverman & Barasch (2023) *Journal of Consumer Research* 49(6); Beshears et al.
(2021) *Management Science* 67(7); Polivy & Herman (1985); Breines & Chen (2012) *PSPB*; Dai,
Milkman & Riis (2014) *Management Science*; Buehler, Griffin & Ross (1994) *JPSP*; Bandura &
Schunk (1981) *JPSP*; Koo & Fishbach (2008) *JPSP*; Amabile & Kramer (2011) *The Progress
Principle*; Wrosch et al. (2003) *PSPB*; Elliot & Sheldon (1997) *JPSP*; Ordóñez et al. (2009)
*Academy of Management Perspectives*; Sharif & Shu (2017) *Journal of Marketing Research*.

Checked by search on 2026-11-14:
[Harkin et al.](https://eprints.whiterose.ac.uk/id/eprint/91437/) ·
[Swann et al.](https://pubmed.ncbi.nlm.nih.gov/35094640/) ·
[Lally et al., summary](https://bps.org.uk/research-digest/how-form-habit) ·
[Dalton & Spiller](https://ideas.repec.org/a/oup/jconrs/doi10.1086-664500.html) ·
[Beshears et al.](https://econpapers.repec.org/RePEc:inm:ormnsc:v:67:y:2021:i:7:p:4139-4171) ·
[Silverman & Barasch](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions) ·
[Wang et al.](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8149892/).
The others are cited from memory.

Apps: [Griply features](https://griply.app/help/features) ·
[Griply on the App Store](https://apps.apple.com/us/app/goals-oriented-tracker-griply/id1556692747) ·
[Tool Finder on Griply](https://toolfinder.co/tools/griply) ·
[GoalsOnTrack on Capterra](https://www.capterra.com/p/163963/GoalsOn-Track/) ·
[Lifetick on Fitgap](https://us.fitgap.com/products/043427/lifetick) ·
[Beeminder on stickK](https://help.beeminder.com/article/49-why-should-i-use-beeminder-over-stickk) ·
[habit tracker comparison](https://goalsandprogress.com/best-habit-tracking-apps-comparison/) ·
[goal app roundup](https://reclaim.ai/blog/goal-tracker-apps).
Timestripe, Strides' tracker types and the WOOP app are described from memory.
