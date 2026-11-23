/** The Guide's articles in English (texts from docs/guidance/guide-content.en.md). */
import type { Article } from './guide';

export const guideEn = [
  /* ---------- Start here ---------- */
  {
    id: 'method',
    group: 'start',
    title: 'How Action Plan works',
    body: `<p>Action Plan is built on one idea: a goal is a distance between where you are and where you want to be, and you cross it by steps.</p>
<ul>
<li>A <strong>vision</strong> is a state you wish for and never finish, such as “To be fit and live healthily”. It answers <em>what for</em>.</li>
<li>A <strong>goal</strong> is a place on the way that you can reach and tick off: “Run 10 km without stopping by 1 June”. It answers <em>what, by when</em>.</li>
<li>A <strong>current state</strong> is where you stand today, as a number you measure again and again: your longest run, your savings. It answers <em>how far still</em>.</li>
<li><strong>Activities</strong> are the steps. Some you do once, some are <strong>routines</strong> you repeat. They answer <em>what do I do this week</em>.</li>
</ul>
<p>The app links these, so that a tick on a routine or a new measurement moves the goal’s progress by itself. The Map shows what serves what, the Timeline shows when, and Graphs show whether it is working.</p>
<p>The method in use is small:</p>
<ol>
<li>Choose one goal that matters to you.</li>
<li>Write down honestly where you stand.</li>
<li>Plan the next two or three steps, the first one small enough for today.</li>
<li>Do, tick, measure.</li>
<li>Once a week, look at the plan and change what no longer fits.</li>
</ol>
<p>A plan that changes is a plan that is being used.</p>`,
    related: ['words', 'what-goal', 'review'],
  },
  {
    id: 'words',
    group: 'start',
    title: 'The words the app uses',
    body: `<ul>
<li><strong>Plan</strong> – one set of goals, states and activities. You can keep several, for example one for health and one for the house.</li>
<li><strong>Vision</strong> – a wished-for state without an end. Shared by all your plans.</li>
<li><strong>Purpose</strong> – the one vision all your other visions and active goals lead to, once you have linked them that way.</li>
<li><strong>Goal</strong> – a result with a deadline. <strong>Active</strong>, <strong>Paused</strong> or <strong>Achieved</strong>.</li>
<li><strong>Keep goal</strong> – a goal about staying within a range instead of reaching a target.</li>
<li><strong>Sub-goal</strong> – a smaller goal on the way to a bigger one.</li>
<li><strong>Current state</strong> – something you measure. Either each new value replaces the last (weight), or the amounts <strong>add up</strong> (kilometres run).</li>
<li><strong>Activity</strong> – a step. A <strong>one-time activity</strong>, a <strong>list</strong> (a checklist), a <strong>routine</strong> (repeats) or a <strong>routine list</strong> (a checklist that repeats).</li>
<li><strong>Relationship</strong> – a link between two items: an activity <em>contributes to</em> a goal, <em>improves</em> a state, <em>depends on</em> another activity; a state <em>describes the current state of</em> a goal.</li>
<li><strong>SMART</strong> – the five things the goal form asks for: Specific, Measurable, Achievable, Relevant, Time-bound.</li>
</ul>`,
    related: ['method'],
  },
  {
    id: 'tips-all',
    group: 'start',
    title: 'Tips and tricks',
    body: `<p>Things the app can do that are easy to miss:</p>
<ul>
<li>The <strong>Map</strong> shows what serves what, and what serves nothing.</li>
<li>The <strong>Timeline</strong> shows your steps on a calendar. Drag a bar to move its dates.</li>
<li><strong>Graphs</strong> draw a current state’s measurements as a line, against your target.</li>
<li>When a set day does not work out, a routine can let you make it up on another day: a switch under Repeats.</li>
<li>A current state you add to each time, such as kilometres or money, can add up by itself: switch on “Adds up” and enter only what is new.</li>
<li>An activity that holds several things can be a list, so you can tick them one by one.</li>
<li>Several things you do every day can be one routine list, such as “Morning routine”: tick the items, and the day ticks itself.</li>
<li>The templates show how similar goals are laid out. Borrow what fits.</li>
<li>Your plans are in this browser only until you log in with Google or export a copy.</li>
<li>Action Plan can sit on your home screen and open like any other app, also without a connection.</li>
<li>Long-press or right-click any card for a menu: show it on the Map, add a step for it, change its status.</li>
<li>Ctrl + Enter saves the form you are in.</li>
<li>A plan that worked for you can be exported as a template: your steps without your numbers.</li>
</ul>
<p>Tips appear on the Overview now and then. Settings › Appearance turns them off. When you are open to one, ask for it here.</p>`,
    action: { do: 'ask-tip', label: 'Show me a tip' },
    related: ['method'],
  },

  /* ---------- When you are stuck ---------- */
  {
    id: 'what-goal',
    group: 'stuck',
    title: 'I don’t know what goal to set',
    body: `<p>This is the most common place to stop, and it does not mean you lack ambition. Most people know what bothers them long before they know what they want.</p>
<p>Try one of these, with pen and paper, ten minutes:</p>
<ul>
<li><strong>Start from what bothers you.</strong> Write three things in your life that you would like to be different a year from now. Turn one around: “I’m always tired” becomes “I sleep seven hours on work nights”.</li>
<li><strong>Start from a good day.</strong> Describe an ordinary Tuesday three years from now, if things went well. Where do you wake up, what do you do, who is there? What in that day is missing today?</li>
<li><strong>Start from what you already do.</strong> Something you return to without being told is a clue. What would “a step further” be?</li>
</ul>
<p>The app can walk you through two of these: “A good ordinary day” and “Where things stand”.</p>
<p>Then pick <strong>one</strong>. Not the most important one: the one you would be glad to work on this month. A first goal that takes four to eight weeks teaches you more than a perfect five-year goal.</p>
<p>If nothing comes, open the templates and read a few. You do not have to use one; seeing how others have put a wish into steps often shakes loose your own.</p>`,
    action: { do: 'templates', label: 'Start from a template' },
    more: { do: 'find-visions', label: 'Find your visions' },
    related: ['vision-how', 'smart-fit', 'too-many'],
  },
  {
    id: 'vision-how',
    group: 'stuck',
    title: 'I don’t know what my visions are',
    body: `<p>A vision is not a goal. You never finish “To be a present father” or “To live without money worries”; you only move closer or further. That is what makes it useful: when a goal is reached, or fails, the vision is still there and tells you what the next goal is.</p>
<p>The app can help you find one. <strong>Find your visions</strong> offers three short writing exercises: “A good ordinary day”, “What for?” (start from a goal you have and ask what it is for, until the answer stops changing) and “Where things stand”. Each ends with a vision in your own words, written as if it were already true.</p>
<p>Signs that a vision is really yours: you would want it even if nobody knew; it would still matter if you never got praise for it.</p>
<p>It can help to write the other side too: where you would be in a few years if you let this slide. The vision form has a field for it. Keep it honest and short, and keep it where it is: goals work better when they say what you are moving toward, so set them from the vision, not from the fear.</p>
<p>You do not need visions to use the app. They help most on the days when a goal feels like a chore, because they remind you why you set it.</p>
<p>When every vision leads to one vision at the top and every active goal serves it, the app marks that one as your <strong>Purpose</strong>. Treat it as a tidy picture of what you are working for now, not as a final answer; people’s purposes change.</p>`,
    action: { do: 'find-visions', label: 'Find your visions' },
    related: ['what-goal', 'h-visions', 'let-go'],
  },
  {
    id: 'too-many',
    group: 'stuck',
    title: 'I want to change everything at once',
    body: `<p>You probably can, just not in the same month. Every active goal asks for attention on most days, and attention is the one thing a plan cannot add.</p>
<ul>
<li>Keep <strong>two or three</strong> goals Active. More than that and each one moves so slowly that it stops feeling worth it.</li>
<li>Set the others to <strong>Paused</strong> (open the goal, “Status”). Paused goals keep everything and do not count as late. They are a queue, not a graveyard.</li>
<li>When one goal is achieved or has become routine, bring the next one in.</li>
<li>If two goals pull against each other (save money, travel more), decide which goes first this season. The plan cannot settle that for you, but leaving it open slows both. The Areas side of the Visions view shows where your effort has been going.</li>
<li>When you add a goal, the form asks what it will cost. If you cannot name anything you would give up for it, it may be a goal for later; set it to Paused.</li>
</ul>`,
    action: { do: 'view-goals', label: 'Open Goals' },
    related: ['what-goal', 'pressure'],
  },
  {
    id: 'smart-fit',
    group: 'stuck',
    title: 'My goal doesn’t fit the form',
    body: `<p>The goal form asks five things. You can save with only a title and come back; the letters show what is still open. Some ways through:</p>
<ul>
<li><strong>Specific</strong> – describe what you would see on the day it is done. “Get fit” becomes “Run from home to the lake and back without walking”.</li>
<li><strong>Measurable</strong> – if you already measure it as a current state, pick that state under <strong>“Measured by”</strong>: the unit and current value then follow it. If no number fits, change “Progress from” to <strong>“Activities done”</strong> (the goal is done when its steps are done) or <strong>“Routines kept”</strong> (the goal is how steadily you keep at it). Both are honest ways to measure.</li>
<li><strong>Achievable</strong> – name the one thing most likely to get in your way, and what you will do when it comes. “If I’m tired after work, I walk for ten minutes instead.” A plan for the bad day is what makes a goal realistic.</li>
<li><strong>Relevant</strong> – why it matters <em>to you</em>. “My doctor said so” is a start; “I want to climb stairs without stopping” is better. Below it, <strong>“What will it cost?”</strong> asks what you will give up to make room for it.</li>
<li><strong>Time-bound</strong> – a date is a guess, not a promise. Choose one, and move it when you know more.</li>
</ul>
<p>A first version that is roughly right is enough. Open the goal again in two weeks and improve it; by then you will know things you cannot know today.</p>
<p>When the task is new to you, set the goal on <strong>learning</strong>, not on a result: “Try three ways to study Spanish and choose one by March” instead of “Know 1,500 words”.</p>`,
    related: ['no-number', 'what-goal', 'h-goals'],
  },
  {
    id: 'no-number',
    group: 'stuck',
    title: 'I can’t put a number on it',
    body: `<p>Some things worth wanting have no natural number: being calmer, a better marriage, feeling at home in a new town. Four ways to measure them anyway:</p>
<ul>
<li><strong>Count what you do.</strong> “Routines kept”: two evenings a week without the phone, a walk together every Sunday. You cannot command a feeling, but you can keep an appointment.</li>
<li><strong>Count steps.</strong> “Activities done”: five things that, once done, mean you gave it a real try.</li>
<li><strong>Rate it yourself.</strong> A current state “How calm was this week, 1–10”, recorded every Sunday. It is rough, and the line on the graph will still tell you something after two months.</li>
<li><strong>Count a visible sign.</strong> Nights slept through. Days without a cigarette. Dinners at the table.</li>
</ul>
<p>Choose a measure you can influence by what you do this week. A number that depends mostly on other people or on luck will discourage you however hard you work.</p>`,
    related: ['smart-fit', 'h-states'],
  },
  {
    id: 'first-steps',
    group: 'stuck',
    title: 'I don’t know what the steps are',
    body: `<p>You do not need the whole road, only the next piece of it.</p>
<ul>
<li>Ask: <strong>“What is the first thing I would do if I started today?”</strong> Often it is finding something out: look up prices, ask someone who has done it, book the appointment. That is a real step. Add it.</li>
<li>Add a step called <strong>“Find out how”</strong> with a due date this week. When it is done, you will know the next two.</li>
<li>Work backwards: what must be true just before the goal is reached? And before that?</li>
<li>Look at a <strong>template</strong> for a similar goal and borrow its steps.</li>
<li>For a skill or a health goal, one hour with someone who knows (a trainer, a teacher, a doctor) saves months. Make “Book an hour with…” the first activity.</li>
</ul>
<p>Plan in detail only two or three steps ahead. Further out, a rough note is enough; you will rewrite it anyway.</p>`,
    action: { do: 'add-activity', label: 'Add an activity' },
    related: ['not-starting', 'h-activities'],
  },
  {
    id: 'not-starting',
    group: 'stuck',
    title: 'I planned it, but I don’t start',
    body: `<p>Wanting to do something and doing it are further apart than they feel. The gap is usually not laziness; the step is too big, too vague, or has no place in your day.</p>
<ul>
<li><strong>Make it smaller.</strong> If a step has waited more than a few days, cut it until it takes ten minutes. “Write the CV” becomes “Open the old CV and list what is out of date”. Starting is the hard part; most people keep going once they have begun.</li>
<li><strong>Give it a time and a place.</strong> “On Saturday after breakfast, at the kitchen table, I open the old CV.” A step tied to a moment gets done far more often than a step you mean to do “this week”. Put the moment in the activity’s title and the day in its due date.</li>
<li><strong>Name the obstacle before it comes.</strong> What will most likely stop you? Tired after work? Then: “If I’m tired after work, I do just five minutes.” The goal form asks this under Achievable; for a single step, write it in “Details”.</li>
<li><strong>Remove one barrier tonight.</strong> Shoes by the door. The form printed. The tab left open.</li>
<li><strong>Give it something to look forward to.</strong> In the activity’s form, “After I do it, I…” names a small thing you will have right after: a coffee, ten minutes of your book. The app reminds you when you tick.</li>
</ul>
<p>If a step still does not move, ask whether you want the goal or only think you ought to. That is a fair question, and [[let-go]] is about it.</p>`,
    related: ['first-steps', 'overplanning', 'let-go'],
  },
  {
    id: 'routine-slips',
    group: 'stuck',
    title: 'I keep missing my routine',
    body: `<p>Almost everyone does. A new routine takes anywhere from a few weeks to most of a year before it feels automatic, and missing a day now and then does not set that back. What does harm is the thought “I’ve broken it, so it’s over”.</p>
<ul>
<li><strong>One tick puts you back.</strong> In the app a routine counts as late only until you tick it again. Missed days are shown in grey, not red, because they are in the past.</li>
<li><strong>Make it smaller.</strong> If you keep less than half of it, the routine is too big for your life as it is now. Three runs a week become two. Thirty minutes become ten. Raise it when it holds for a month.</li>
<li><strong>Tie it to something that already happens.</strong> After the morning coffee. When I park the car. The old habit becomes the reminder. Put it in the routine’s name.</li>
<li><strong>Allow a small version for bad days.</strong> “On a bad day, I put on the shoes and walk to the corner.” It counts. Tick it.</li>
<li><strong>Loosen the days.</strong> If set days do not fit your weeks, change the routine to a number of times a week, or switch on “A missed day can be made up on another day”.</li>
<li><strong>Look forward to something.</strong> “After I do it, I…” in the routine’s form names a small reward the app mentions when you tick; see [[not-starting]].</li>
</ul>
<p>The app has no reminders. Set an alarm on your phone, or put the routine in your calendar, for the first few weeks.</p>`,
    action: { do: 'view-activities', label: 'Open Activities' },
    related: ['fell-off', 'too-busy', 'h-routines'],
  },
  {
    id: 'fell-off',
    group: 'stuck',
    title: 'I haven’t opened the plan in weeks',
    body: `<p>Welcome back. Nothing is lost, and you do not have to catch up.</p>
<p>It helps to know what usually happens here: after a break, the list of late things looks like a bill, so we avoid looking, and the break gets longer. The way out is to treat today as a new start, not as a return to the old schedule.</p>
<ol>
<li>Do <strong>not</strong> tick or fix everything. Open the Overview and choose <strong>one</strong> step for today.</li>
<li>Move the dates. Open the Timeline and drag late bars to where they can really happen now. A date in the past is only an old guess. “Move late steps” on the Overview moves them all at once and keeps their order.</li>
<li>Pause what you will not work on this month.</li>
<li>For routines, tick today. That is all it takes to be on track again.</li>
<li>Ask what made you stop. Illness and busy weeks pass by themselves. If the plan was too heavy or the goal stopped mattering, change the plan, not yourself.</li>
</ol>
<p>The weekly review is the quickest way back in: it shows only what needs a decision.</p>`,
    action: { do: 'replan', label: 'Move late steps…' },
    related: ['routine-slips', 'behind', 'let-go', 'review'],
  },
  {
    id: 'behind',
    group: 'stuck',
    title: 'I’m behind and the deadline is close',
    body: `<p>The goal card says “Behind pace” and how much a week would be needed from here. That number is the honest starting point for the three options.</p>
<p>First, this is normal. People almost always expect things to take less time than they do, even when they know that they usually take longer.</p>
<p>You have three honest options, and all three are planning, not failing:</p>
<ul>
<li><strong>More time now.</strong> Is there something you can drop this week to make room? Decide what, not only “I’ll try harder”.</li>
<li><strong>Move the date.</strong> If the deadline was your own guess, guess again with what you know now. “Move late steps” on the Overview moves them all at once and keeps their order.</li>
<li><strong>Shrink the target.</strong> 8 km on the day is not 10, and it is a great deal more than where you started.</li>
</ul>
<p>When the deadline is fixed from outside (an exam, a race), cut scope: which steps matter most for the result? Do those, and delete the others without guilt.</p>
<p>For next time: when you set a date, ask how long similar things took you before, and use that, not how long it ought to take.</p>`,
    action: { do: 'replan', label: 'Move late steps…' },
    related: ['no-progress', 'pressure'],
  },
  {
    id: 'no-progress',
    group: 'stuck',
    title: 'I do the work, but the number doesn’t move',
    body: `<p>Ticks without movement are a sign to look at the plan, and it is good that you can see it.</p>
<ul>
<li><strong>Is it too early?</strong> Weight, fitness, savings and skills move slowly and unevenly. Look at the graph over six or eight weeks, not from one measurement to the next. The forecast looks at the last six weeks, the recent ones most, not at the last measurement.</li>
<li><strong>Is the measure right?</strong> Perhaps you are getting fitter while the scale stays still. Add a second current state that catches what is changing: waist, pace, how the stairs feel.</li>
<li><strong>Are these the right steps?</strong> Being busy and moving forward are different things. Which activity was meant to move this number? If the link was a hope, test another step for a month. Under a state’s graph, “Is it working?” compares the weeks you kept a routine with the weeks you did not. It needs a couple of months of ticks and measurements before it says anything.</li>
<li><strong>Is the dose enough?</strong> Once a week may hold you where you are; twice may move you.</li>
<li><strong>Ask someone who knows.</strong> A stuck number is the best moment to spend an hour with a trainer, teacher, doctor or adviser. Bring your graph.</li>
</ul>
<p>If the goal depends mostly on things outside your hands, measure what you do (“Routines kept”) and let the result be a bonus.</p>`,
    action: { do: 'view-graphs', label: 'Open Graphs' },
    related: ['behind', 'no-number'],
  },
  {
    id: 'pressure',
    group: 'stuck',
    title: 'The plan makes me feel bad',
    body: `<p>A plan is supposed to carry things for you so that your head does not have to. If opening it feels like being told off, something in the plan is wrong, not in you.</p>
<ul>
<li><strong>Too much is active.</strong> Pause goals until what remains looks doable in a normal week.</li>
<li><strong>The dates are wishes.</strong> Late marks pile up when every date was the best case. Move them, and add spare time when you set new ones.</li>
<li><strong>The goals are someone else’s.</strong> A goal you set because you ought to weighs more than one you want. Read the “Why does it matter?” answer on each goal. If it does not sound like you, see [[let-go]].</li>
<li><strong>You only see what is missing.</strong> Before looking at what is next, look at what is done: the activities marked done, the ticked days, the graph since the first measurement.</li>
</ul>
<p>Being hard on yourself does not make you work better. People who meet a slip with some kindness get back to it sooner than those who meet it with blame.</p>
<p>Some things need more than a plan. If you feel low or anxious most days, or if tracking food, weight or exercise starts to rule your day, please talk to a doctor or a therapist, and set the tracking aside for now.</p>`,
    related: ['too-many', 'let-go', 'limits'],
    action: { do: 'view-review', label: 'Open the done log' },
  },
  {
    id: 'too-busy',
    group: 'stuck',
    title: 'My weeks are unpredictable',
    body: `<p>Shift work, small children, travel, illness: a plan made for regular weeks breaks in the first irregular one. Build the plan for the weeks you really have.</p>
<ul>
<li>Use routines that ask for <strong>a number of times per week or month</strong>, on any days, not set days.</li>
<li>Switch on <strong>“A missed day can be made up on another day”</strong> for routines that do have set days.</li>
<li>Keep a <strong>small version</strong> of each routine for hard weeks, and count it.</li>
<li>Plan fewer steps per week than fits in a good week. A plan you beat is better than one that beats you.</li>
<li>Give goals longer deadlines than feels needed. Nobody takes points off for arriving early.</li>
<li>In a truly bad stretch, pause the goal. Starting again from a pause is easier than from a pile of late marks.</li>
</ul>`,
    related: ['routine-slips', 'behind', 'h-routines'],
  },
  {
    id: 'let-go',
    group: 'stuck',
    title: 'This goal no longer feels right',
    body: `<p>Goals are set by a past you who knew less. Dropping one that no longer fits is good sense, and people who can let go of goals that have become unreachable or pointless do better afterwards than those who hang on.</p>
<p>How to tell a hard patch from a wrong goal:</p>
<ul>
<li>Read your own “Why does it matter?”. Is it still true?</li>
<li>Would you set this goal today, knowing what you know now?</li>
<li>Is it the goal that tires you, or only the current step? A dull step can be changed; the goal may be fine.</li>
</ul>
<p>Then choose:</p>
<ul>
<li><strong>Change it.</strong> Smaller target, later date, another way to the same vision.</li>
<li><strong>Pause it.</strong> Not now, perhaps later.</li>
<li><strong>Delete it,</strong> or mark it Achieved if it has done its job. Look at which vision it served and whether something else should serve it now.</li>
</ul>
<p>The time you spent is not wasted; it is how you found out.</p>`,
    related: ['vision-how', 'pressure', 'reached'],
  },
  {
    id: 'reached',
    group: 'stuck',
    title: 'I reached my goal. Now what?',
    body: `<p>Mark it Achieved and stop for a moment before the next one. It is easy to skip this, and it is the part that makes the next goal easier.</p>
<ul>
<li><strong>Note what worked.</strong> Which step or routine made the difference? The app asks when you mark the goal Achieved. Two lines are enough.</li>
<li><strong>Decide what stays.</strong> Many results need upkeep: the weight, the language, the savings. Keep one small routine and let the others end. When you mark a measured goal Achieved, the app offers to set up a keep goal for the result, with the routines you choose to continue.</li>
<li><strong>Choose what is next from the vision,</strong> not from the momentum. What does “To be fit and live healthily” ask for now? Perhaps something quite different.</li>
<li><strong>Take a paused goal out of the queue,</strong> if one is waiting.</li>
</ul>
<p>Feeling a little flat after reaching something you worked on for months is common. It passes, usually when the next thing gets its first step.</p>`,
    action: { do: 'view-visions', label: 'Open Visions' },
    related: ['let-go', 'too-many', 'vision-how'],
  },
  {
    id: 'overplanning',
    group: 'stuck',
    title: 'I keep planning instead of doing',
    body: `<p>Arranging a plan feels like progress, and it is pleasant: boxes line up, nothing is hard yet. If you have spent more time on the Map than on your steps this week, this is for you.</p>
<ul>
<li>A plan is good enough when you know <strong>the next step and when you will do it</strong>. Stop there.</li>
<li>Set a limit: ten minutes of planning, then one step done before you open the app again.</li>
<li>Do not polish goals that are months away. They will change.</li>
<li>Use the weekly review as the one moment for tidying. On other days: open, tick, close.</li>
</ul>`,
    related: ['not-starting', 'review'],
  },
  {
    id: 'review',
    group: 'stuck',
    title: 'The weekly review',
    body: `<p>Once a week, five minutes. The Review view walks you through it: tick what you forgot, record fresh values, write a line about how it went, fix dates that no longer hold, and choose the one step that matters most next week. Once a month it asks about your goals: keep going, change, pause or let go. Once a year it asks about your visions.</p>`,
    action: { do: 'view-review', label: 'Open the weekly review' },
    related: ['method', 'fell-off', 'overplanning'],
  },

  /* ---------- How do I… ---------- */
  {
    id: 'h-goals',
    group: 'how',
    title: 'Goals',
    body: `<p>Add a goal with the Add button in Goals. The form asks the five SMART things; the letters light up as you fill them in. A goal saves with a title alone; finish the rest when you know more.</p>
<p><strong>“Progress from”</strong> decides how the goal moves:</p>
<ul>
<li><strong>A measurement</strong> – you give a metric, a starting value and a target. Link a current state and the goal follows its latest value.</li>
<li><strong>Activities done</strong> – the share of the goal’s activities that are done.</li>
<li><strong>Routines kept</strong> – how steadily you keep the routines linked to the goal.</li>
</ul>
<p><strong>Keep within a range</strong> (“Kind of goal”) is for results that need upkeep: a weight, a balance, a limit on spending. Give “At least”, “At most” or both. The goal then shows how much of the time you were in range and warns when the latest value is outside.</p>
<p>A goal can be <strong>part of</strong> a bigger goal (a sub-goal), can <strong>depend on</strong> another goal, and can <strong>serve</strong> visions. “Status” sets it to Active, Paused or Achieved; when a goal reaches its target the app asks whether to mark it achieved. A <strong>category</strong> (Health, Finance…) lets you filter goals with the chips above the list. Long-press or right-click a goal for more: add a sub-goal, add an activity for it, show it on the Map or the Timeline.</p>
<p>Notes at the end of the form keep dated remarks; long-press the card and choose “Add a note” to write one quickly.</p>`,
    action: { do: 'add-goal', label: 'Add a goal' },
    related: ['smart-fit', 'no-number'],
  },
  {
    id: 'h-states',
    group: 'how',
    title: 'Current states',
    body: `<p>A current state is something you measure. Say what the value means and how you take it, so that every measurement is taken the same way. Its card is in Graphs; tap + on it to record a new value: one per day; a second value on the same day replaces the first. Decimals work with a dot or a comma.</p>
<p>A state can <strong>add up</strong> instead (“Adds up: Yes”): kilometres run, money put aside. Then each entry is an amount, several a day are fine, the card shows the total, and + adds an amount. A goal measured by such a state chooses how it counts: in total, or per day, week, month or year.</p>
<p>Link the state to a goal (“Describes the current state of goal(s)”) and the goal’s progress follows it. A wrong value is deleted in Graphs, in the table under the state’s graph, or in the state’s form under the history.</p>
<p>Values you already keep in a spreadsheet can be brought in: in the state’s menu (right-click or long-press its card or graph) or its form, “Import from CSV…” reads a file with a date and a value on each line. “Export as CSV” takes them out again.</p>
<p>A value can carry a short note, such as “after two weeks off”. It shows under the graph and on the point.</p>`,
    action: { do: 'add-state', label: 'Add a current state' },
    related: ['h-graphs', 'no-number'],
  },
  {
    id: 'h-activities',
    group: 'how',
    title: 'Activities',
    body: `<p>An activity is a step. When you add one, choose its kind:</p>
<ul>
<li><strong>One-time activity</strong> – done once.</li>
<li><strong>List</strong> – a checklist; done when every item is ticked. Ticked items are hidden; <strong>Show completed items</strong> brings them back.</li>
<li><strong>Routine</strong> and <strong>Routine list</strong> – repeat; see [[h-routines]].</li>
</ul>
<p>To turn an activity into a list later, open it and choose <strong>Make it a list</strong>; a routine becomes a routine list.</p>
<p>One-time activities and lists sit below the routines: in progress first, then to do, then done, each by due date. Tap a card’s circle to move it along: To do, In progress, Done. On its start date an activity moves to In progress by itself.</p>
<p>Link an activity to the goals it <strong>contributes to</strong> and the states it <strong>improves</strong>. It can be <strong>part of</strong> a larger activity (a sub-activity), and it can <strong>depend on</strong> another activity that must be done first; until then it shows as waiting. “Hide done and achieved” clears finished cards from view.</p>
<p>“After I do it, I…” names a small reward; the card shows it, and the message after your tick says it.</p>
<p>Notes at the end of the form keep dated remarks; long-press the card and choose “Add a note” to write one quickly.</p>`,
    action: { do: 'add-activity', label: 'Add an activity' },
    related: ['first-steps'],
  },
  {
    id: 'h-routines',
    group: 'how',
    title: 'Routines',
    body: `<p>A routine is an activity that repeats. Under “Repeats” choose a number of times per week or month, specific days, or “Custom…” for every few days, weeks, months or years, a day of the month, or a weekday such as the second Friday. “Ends” sets a last day or a number of times.</p>
<p>Tick a routine on its <strong>week strip</strong>, in Activities or on the Overview. Days outlined in blue are due; grey hatched days were missed; today is ringed. The arrows beside the strip go to earlier weeks, so you can tick what you forgot. The green tag is your streak.</p>
<p>A routine is late only until you tick it again. With <strong>“A missed day can be made up on another day”</strong> switched on, a tick on any other day stands in for a missed one.</p>
<p>In Activities the most urgent routines come first: late ones, then those due today, then the rest by the next day they are due. Routines already done for this period, and those not running, come last.</p>
<p>A <strong>routine list</strong> is a checklist that starts afresh each time, such as a morning routine; ticking its last item ticks the day.</p>
<p>When a routine improves a state that adds up, ticking it asks “how much?” and adds the amount to the state in the same step.</p>`,
    action: { do: 'add-routine', label: 'Add a routine' },
    related: ['routine-slips', 'too-busy'],
  },
  {
    id: 'h-visions',
    group: 'how',
    title: 'Visions and Purpose',
    body: `<p>Visions are in the Visions view and belong to all your plans together. Add one, describe what it looks like as if it were already true, and choose the goals that serve it; or open a goal and choose “Serves visions”. A vision can serve broader visions. “If I let this slide” keeps the other side, folded away on the card until you open it.</p>
<p>The view tells you how many visions are at the top and which active goals serve none. When one vision is at the top of all the others and every active goal in every plan serves it, the app shows it in gold as your <strong>Purpose</strong>.</p>
<p>On Today and on the Overview, each step shows the vision it serves. A vision that no active goal serves says so and offers “What is next?”.</p>
<p>Give a vision an <strong>area</strong>, such as Health or Relationships. The Areas side of the Visions view (the switch at the top) then shows, for each area, your visions, your active goals and how much you ticked for it in the last 30 days. The pencil renames an area on every vision and on every goal with that category.</p>
<p>The glow round everything that serves your Purpose is gold while every active goal is SMART. A goal saved half-finished turns it silver until you finish it.</p>`,
    action: { do: 'add-vision', label: 'Add a vision' },
    related: ['vision-how'],
  },
  {
    id: 'h-map',
    group: 'how',
    title: 'Map',
    body: `<p>The Map draws every item and link: visions and goals at the top, activities in the middle, current states at the bottom. Tap a line to select it and light up its two ends. Tap a box to light up its whole chain: everything that leads to it and everything it leads to, step by step. Double-click or press Enter to edit, Delete to remove.</p>
<p><strong>To link two items</strong> with a mouse, drag from one box onto the other. On a touch screen, long-press a box, choose “Link to…” and tap the other box. The app offers only the relationships that fit those two.</p>
<p>Tap a band’s name (Visions, Goals, Activities, Current states) to fold it away; tap again to open it. Your folds are kept on every device. Drag the background to move, pinch or Ctrl + scroll to zoom. Right-click an empty spot to add something there.</p>`,
    action: { do: 'view-map', label: 'Open the Map' },
  },
  {
    id: 'h-timeline',
    group: 'how',
    title: 'Timeline',
    body: `<p>The Timeline shows goals and activities by date; an item needs a start or due date to appear. Activities sit under the goals they contribute to. Red stretches are overdue time, a bar’s colour is its status, and routines with set days show each day as done, missed or to come.</p>
<p>Tap a bar to select it, then drag the bar to move its dates or one end to change only that date (on a touch screen, long-press first). ▾ beside a goal folds its rows away; Collapse all, top left, folds every goal, and the menu on a goal (right-click or long-press) offers both. Pinch or Ctrl + scroll changes the scale. The toolbar’s “Move late steps…” re-dates every overdue bar in one go.</p>`,
    action: { do: 'view-timeline', label: 'Open the Timeline' },
  },
  {
    id: 'h-graphs',
    group: 'how',
    title: 'Graphs',
    body: `<p>Graphs is where you keep your current states. Each has a card: + records a new value (or adds an amount), right-click or long-press edits it, and the goals it measures are listed on it. A state with measurements also has a graph: your values over time, a dashed line for the goal’s target, and the change since the first measurement. A state that adds up shows sums per day, week, month or year, or the running total; choose above the graph. Each routine has a graph of how often you did it per period.</p>
<p>For a goal with a target and a deadline, the graph also draws the pace: a thin dashed line from your start to the target. Above it you see how much is needed each week from here, and when you would arrive at the present rate.</p>
<p>Hover or tap to read a value; pinch or Ctrl + scroll to zoom into a stretch of time. The table under a graph lists the measurements; delete a wrong one there.</p>
<p>Under the graph of a state that a routine improves, and under the routine’s own graph, “Is it working?” compares how the state moved in the weeks you kept the routine and in the weeks you did not. It appears once there are enough of both weeks to compare. It shows a pattern, not a proof.</p>`,
    action: { do: 'view-graphs', label: 'Open Graphs' },
  },
  {
    id: 'h-review',
    group: 'how',
    title: 'Review',
    body: `<p><strong>This week</strong> is the weekly review: what you did, the measurements with no value from the week, two lines to look back, what needs a decision, and next week’s one thing. Monday to Thursday it looks at last week, Friday to Sunday at the week under way; the arrows go to other weeks. <strong>Finish review</strong> keeps what you wrote.</p>
<p><strong>This month</strong> asks about your goals, one card each: keep going, change it, pause it or let it go. <strong>This year</strong> asks about your visions and what the next year is for.</p>
<p><strong>Done log</strong> lists what you finished, week by week, and <strong>Past reviews</strong> keeps every review you finished, to read again. A dot on Review means last week has no review yet.</p>`,
    action: { do: 'view-review', label: 'Open Review' },
    related: ['review', 'h-today'],
  },
  {
    id: 'h-today',
    group: 'how',
    title: 'Today',
    body: `<p><strong>Today</strong> lists what is due from all your plans: steps due today or overdue, and the routines today asks for. Tick them here without changing plan; tap a title to open it in its plan. At the top sits this week’s one thing: the step you chose as the one that matters most. Choose it from any step’s menu, or at the end of the weekly review. A new week starts with none.</p>`,
    action: { do: 'view-today', label: 'Open Today' },
    related: ['h-overview', 'review'],
  },
  {
    id: 'h-overview',
    group: 'how',
    title: 'Overview',
    body: `<p>The Overview is the page for most days: how far along your active goals are on average, the activities due by today or overdue (“Show all” adds the others in progress), the routines today still asks for, and your active goals. Tick things here without going anywhere else. The line “This week” counts what you finished since Monday: steps, routine days, values, and goals reached; tap it for the done log. A finished step or goal remembers the day; change it in its form under Done on or Achieved on, for example when you record on Monday what you did on Friday. The Overview shows one plan; Today shows the same for all of them.</p>`,
    action: { do: 'view-dashboard', label: 'Open the Overview' },
  },
  {
    id: 'h-plans',
    group: 'how',
    title: 'Plans, templates and files',
    body: `<p>A plan is one set of goals, states and activities. The sidebar lists your plans, the one you opened last on top; tap one to open it. Its dot is green when nothing is due, yellow when something is due today and red when something is overdue. Each plan has an emoji before its name: you choose it when you make or rename the plan, from the common ones, all of them by group, or by searching a word such as “run” or “book” (a plan from before shows 🙁 until you do). With the sidebar collapsed, the list keeps each plan’s dot and emoji. On a phone, tap the plan’s name above the title. Settings has the rest: new plan, rename, delete, and <strong>merge</strong> one plan into another.</p>
<ul>
<li><strong>Start from a template</strong> opens a ready-made plan as a new plan, with dates counted from today. Change everything to fit you.</li>
<li><strong>Load sample plan</strong> opens a filled example to look around in.</li>
<li><strong>Export plan</strong> saves a file: a <em>Full copy</em> with your progress, as a backup, or a <em>Template</em> without progress, to share with someone; <em>Measurements (CSV)</em> for a spreadsheet.</li>
<li><strong>Import plan</strong> adds a file as a new plan. It never overwrites one you have.</li>
</ul>
<p>The coloured dot by each plan shows green when nothing is due, yellow when something is due today, red when something is overdue.</p>`,
    action: { do: 'settings', label: 'Open Settings' },
    related: ['p-backup'],
  },
  {
    id: 'h-sync',
    group: 'how',
    title: 'Several devices, several people',
    body: `<p data-only="syncSetUp">Log in with Google in Settings › Account and sync and your plans are the same on every device where you log in. Google asks you to confirm about once an hour; when the cloud button says sync is paused, click it. Changes made offline wait on the device and sync later. If two devices change the same item, the later change wins, so keep their clocks set automatically.</p>
<p data-only="syncSetUp">Several people can use one device: each logs in with their own Google account and sees only their own plans.</p>
<p data-only="noSync">Sync is not set up for this copy of the app. Your plans stay on this device; use Export and Import to move them.</p>`,
    action: { do: 'settings-sync', label: 'Open Account and sync' },
    related: ['p-where', 'p-google'],
  },
  {
    id: 'h-install',
    group: 'how',
    title: 'Install the app, use it offline',
    body: `<p>Action Plan can be installed from the browser and then opens from your home screen in its own window, also without a connection. Use “Install app” in Settings. On an iPhone or iPad: open the page in Safari, tap Share, then Add to Home Screen.</p>`,
    action: { do: 'install', label: 'Install app' },
  },
  {
    id: 'h-shortcuts',
    group: 'how',
    title: 'Shortcuts and gestures',
    body: `<ul>
<li><strong>Long-press or right-click</strong> almost anything for a menu of what you can do with it.</li>
<li><strong>Ctrl + Enter</strong> saves the form you are in. <strong>Esc</strong> closes it; if you changed something, it asks before discarding it, as Cancel and × do.</li>
<li>In the Guide, <strong>Esc</strong> goes back to the view you came from.</li>
<li>On the Map and Timeline: <strong>Enter</strong> edits the selected item, <strong>Delete</strong> removes it, <strong>Esc</strong> deselects.</li>
<li>After deleting something, the message at the bottom offers <strong>Undo</strong> for a few seconds; <strong>Ctrl + Z</strong> (<strong>⌘ + Z</strong> on a Mac) does the same. Later, Settings › Data › Recently deleted still has it for 30 days.</li>
<li><strong>Pinch</strong> or <strong>Ctrl + scroll</strong> zooms the Map, the Timeline and graphs. With one finger: tap, then touch again and drag down or up.</li>
<li>The <strong>Add</strong> button always adds what fits the view you are in.</li>
<li><strong>Explanations on screen</strong> (on this page and in Settings) adds a short note to each view and ⓘ marks on the controls.</li>
</ul>`,
  },

  {
    id: 'feedback',
    group: 'how',
    title: 'Report a problem, suggest a feature',
    body: `<p>Both are in Settings, under Help, and at the end of this page. They open the app’s page on GitHub; you need a free GitHub account to write there. What you write is public, so leave out anything from your plans that is private.</p>
<p>The people who make Action Plan cannot see your plans, so describe what you did and what happened. With a problem, the app fills in its version, your browser and window size, the language, and whether sync is on; you see that line before anything opens, and “Copy details” copies it if you would rather send it another way.</p>`,
    action: { do: 'settings', label: 'Open Settings' },
    related: ['p-where'],
  },

  /* ---------- Your data and privacy ---------- */
  {
    id: 'p-where',
    group: 'data',
    title: 'Where my plans are kept',
    body: `<p>Your plans are kept in this browser, on this device. Action Plan has no server of its own: nothing you write is sent to the people who make the app, and they cannot see, read or restore your plans.</p>
<p>If you log in with Google, a copy is also kept in your own Google Drive, in a hidden app folder. See [[p-google]].</p>
<p>Your reflections and reviews are kept with your plans: on this device and, with sync on, in the same hidden Drive folder.</p>
<p>The app does not use advertising or tracking, and nothing about how you use it leaves your device. When you report a problem, the app fills in its version, your browser and window size, the language, and whether sync is on. Nothing from your plans.</p>
<p>When the app loads, its own files (the typeface among them) come from the site that hosts it. When you open Settings, it also loads Google’s sign-in script from Google, so that logging in works in one step. In both cases the company sees that your device asked for a file, as with any web page. It does not receive anything from your plans.</p>`,
    related: ['p-google', 'p-backup', 'p-device'],
  },
  {
    id: 'p-google',
    group: 'data',
    title: 'What logging in with Google does',
    body: `<p>Logging in gives Action Plan one permission: to keep its own data in a hidden folder of your Google Drive. The app cannot see your other files, your mail or your contacts, and other apps cannot see this folder. Your email address and name are read when you log in, to show who is logged in on this device.</p>
<p>The plans in that folder, what you deleted in the last 30 days (Recently deleted), and the dated copies kept for Earlier versions, are stored by Google under your account and under Google’s terms. They are not encrypted by Action Plan beyond what Google does for all Drive files.</p>
<p>To stop: log out in Settings › Account and sync. To remove the copy in Drive: open your Google Drive settings, “Manage apps”, find Action Plan and choose “Delete hidden app data”; that removes the dated copies too. You can withdraw the permission in your Google account under “Third-party apps and services”.</p>`,
    related: ['p-where', 'h-sync'],
  },
  {
    id: 'p-device',
    group: 'data',
    title: 'Who else can see my plans',
    body: `<p>Anyone who can open this browser on this device can open the plans in it. Action Plan has no password of its own.</p>
<p data-only="multiUser">When several people are logged in on one device, each has their own plans, kept apart. This keeps things tidy; it is not a lock. Do not rely on it for things that must stay private from someone who uses the same device. Use a separate browser profile or device account for that.</p>
<p>On a shared or public computer, use “Remove from this device” in Settings › Account and sync when you are done. What has synced stays in your Google Drive.</p>`,
    related: ['p-where'],
  },
  {
    id: 'p-backup',
    group: 'data',
    title: 'Can I lose my plans?',
    body: `<p data-only="localOnly"><strong>Your plans are in this browser only right now.</strong></p>
<p>Yes, if they exist in one place only. Plans kept only in the browser are gone when the browser’s site data is cleared, when the browser is removed, or when the device is lost. Some browsers clear data of sites not visited for a long time; installing the app makes that less likely. The app asks the browser to keep its data; if the browser asks you whether to allow that, allow it.</p>
<p>To be safe, do one of these:</p>
<ul>
<li><strong>Log in with Google</strong>, so that a copy is in your Drive and on your other devices.</li>
<li><strong>Export a full copy</strong> of each plan now and then, or use <strong>Back up everything</strong> in Settings › Data for all your plans and visions in one file, and keep the file somewhere else.</li>
</ul>
<p>A deleted item or plan stays in Settings › Data › Recently deleted for 30 days; with sync on, on your other devices too. After that it is gone. Deleting a plan with sync on deletes it on your other devices as well. The delete dialog offers to download a backup first.</p>
<p>With Google sync on, the app also keeps dated copies of all your plans in your Drive: one for each of the last 7 days it synced, then one a week for 8 weeks. Settings › Account and sync › Earlier versions brings back the plans you choose from one of them, as copies; nothing you have is changed. Restore from a backup… in Settings › Data can also merge a backup into your plans, as a sync with another device would.</p>`,
    action: { do: 'export', label: 'Export plan' },
    related: ['h-plans', 'h-sync'],
  },
  {
    id: 'p-delete',
    group: 'data',
    title: 'How do I delete everything?',
    body: `<ul>
<li><strong>One plan:</strong> Settings › Plan › Delete plan.</li>
<li><strong>Your plans on this device:</strong> when you are logged in, Settings › Account and sync › “Remove from this device”.</li>
<li><strong>What you deleted lately:</strong> Settings › Data › Recently deleted › Empty. “Remove from this device” also removes it here.</li>
<li><strong>Everything on this device,</strong> for every user: clear this site’s data in the browser’s settings.</li>
<li><strong>The copy in Google Drive:</strong> see [[p-google]].</li>
</ul>
<p>After that, nothing of yours remains anywhere that the app knows of. Files you exported are yours to delete.</p>`,
    related: ['p-google'],
  },

  /* ---------- What this app cannot do ---------- */
  {
    id: 'limits',
    group: 'limits',
    title: 'What Action Plan cannot do for you',
    body: `<p>It is fair to say this plainly.</p>
<ul>
<li><strong>It cannot want the goal for you.</strong> It can ask why a goal matters; it cannot supply the answer. A goal you do not want will sit here, late, however well it is written.</li>
<li><strong>It cannot remind you.</strong> The app only speaks when you open it. Make opening it part of your day: after breakfast, on the bus, before bed. Use your phone’s alarm or calendar for reminders.</li>
<li><strong>It does not know your field.</strong> It cannot tell whether three runs a week is the right training or whether a savings rate is wise. Ask people who know, and put their advice in as steps.</li>
<li><strong>It cannot see what you do.</strong> It knows what you tick and enter. It is only as honest as you are with it, and it is private so that you can be.</li>
<li><strong>It cannot give you time, money or health.</strong> A plan arranges what you have. When circumstances are the limit, a smaller goal is the right goal.</li>
<li><strong>It has no other people in it.</strong> Telling one person what you are working on, and how it went, helps many people more than any app. Export a plan as a template to share it, or simply show someone your Overview once a week.</li>
<li><strong>It is not treatment.</strong> Low mood, anxiety, burnout, trouble with attention, and trouble with eating or body image need people trained for them. If counting and measuring make you feel worse, stop measuring and talk to someone.</li>
</ul>`,
    related: ['pressure', 'method'],
  },
] as const satisfies readonly Article[];
