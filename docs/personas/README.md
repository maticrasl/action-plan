# User profiles

Eleven invented people who would use Action Plan. They are for testing and for simulating use:
give one file to a tester (a person or an agent) and let them use the app as that person would.

All of them want the same thing: to reach goals, or at least to get their life in order. In
everything else they differ on purpose: age, language, device, how much they trust technology,
how often they open the app, how they write, and what goes wrong for them.

Nobody here is a real person. Names, places and numbers are made up.

## The profiles

| File | Who | Language | Devices | Account | Pattern in one line |
|---|---|---|---|---|---|
| `01-maja.md` | Maja Kovač, 34, shift nurse, two small children | SL | Android phone, installed | guest, later Google | One-minute sessions, weeks that never repeat |
| `02-daniel.md` | Daniel Okafor, 27, backend developer | EN | desktop, wide screen | Google | Plans everything, does little |
| `03-joze.md` | Jože Zupančič, 68, retired, after a heart attack | SL | iPad | guest, daughter logs him in later | Careful, slow, afraid of breaking things |
| `04-priya.md` | Priya Raman, 21, student with ADHD | EN | iPhone, library computers | Google | Bursts at 1 a.m., then three weeks away |
| `05-tomaz.md` | Tomaž Hribar, 45, carpenter with a loan | SL | workshop laptop, phone | Google, two devices | Sunday evenings only, money in euros |
| `06-elena.md` | Elena Marchetti, 39, newly divorced, new country | EN, tries SL | phone, laptop | Google | Goals without numbers, sensitive to pressure |
| `07-marcus.md` | Marcus Bell, 52, laid off, looking for work | EN (US habits) | Windows laptop | Google | Runs it like a project, mood follows the inbox |
| `08-nika.md` | Nika Petrič, 16, swimmer, shared family computer | SL, slang | phone, family PC | Google, three users on one PC | Totals per week, privacy from family |
| `09-sam.md` | Sam Whitaker, 36, chef, stopping drinking | EN | phone only | guest, never logs in | After-midnight ticks, privacy above all |
| `10-ingrid.md` | Ingrid Solheim, 58, head teacher before retirement | EN | four devices | Google | Eighteen months of history, often offline |
| `11-zan.md` | Žan Kralj, 24, warehouse worker | SL, no diacritics | small cheap Android | guest | One goal, reads nothing, types as little as possible |

## What each profile contains

- **At a glance** – the facts a simulation needs first.
- **Story** – the situation and why this person opened the app.
- **What they want** – in their own words.
- **Their plan** – plans, visions, goals, current states and activities, in the language and
  style they would type. Enough to build the plan by hand or to write an import file from.
- **How they use the app** – rhythm, session length, habits, how they type.
- **Where it goes wrong** – mistakes they make and things in the app that do not fit them.
- **How they react** – to late marks, to progress, to losing something.
- **Over time** – how their use changes over weeks or months.
- **Voice** – a few sentences as they would say them.
- **Good for testing** – the parts of the app and the edge cases this person exercises.

## Rules for simulating a person

1. **Dates are relative.** “Six weeks ago”, “in four months” are counted from the day of the
   simulation. Never copy a fixed date from a profile into a test.
2. **Type as they type.** Language, spelling, length, capital letters, emoji, decimal comma or
   dot. A Slovenian profile uses the Slovenian interface and Slovenian item names.
3. **Do not be tidier than the person.** If the profile says they skip the tour, skip it. If
   they forget to measure, forget. The mistakes are the point.
4. **Stay in their knowledge.** They have not read the code or the docs. They know only what
   the screen has shown them, and some of them did not read that either.
5. **Report in two voices.** First what the person did and felt, in their words. Then, apart
   from that, what the tester saw: bugs, unclear texts, dead ends.
6. **The plan in the profile is a starting point.** The person would add, change and abandon
   things. Let them.

Statements under “Where it goes wrong” about how the app answers (for example what happens to
`38.000`) are **expectations to check**, not facts about the code.

## Coverage

| Area | Profiles that lean on it |
|---|---|
| First visit, tour, empty app | Žan, Jože, Maja, Elena |
| Templates and sample plan | Priya, Jože |
| Goal form and SMART | Žan, Elena, Priya, Daniel |
| Measured goals, states that replace | Jože, Marcus, Nika, Tomaž |
| States that add up, per-period goals | Nika, Tomaž, Sam, Marcus |
| “Activities done”, lists, dependencies | Marcus, Tomaž, Ingrid |
| “Routines kept”, self-rated states | Elena, Sam, Maja |
| Routines: times per week, make-up days | Maja, Sam, Priya |
| Routines: set days, custom repeats, end dates | Tomaž, Ingrid, Jože, Nika |
| Routine lists | Jože, Maja, Sam |
| Visions and Purpose | Daniel, Elena, Ingrid |
| Map | Daniel, Ingrid |
| Timeline | Marcus, Ingrid, Priya |
| Graphs with long history | Ingrid, Jože, Nika |
| Several plans, merge, export, import | Daniel, Tomaž, Ingrid, Marcus |
| Sync, several devices, offline | Ingrid, Tomaž, Maja |
| Several users on one device | Nika, Priya |
| Guest only, data loss, backup | Sam, Žan, Jože |
| Phone portrait, small screen | Žan, Maja, Sam |
| Phone landscape | Nika |
| Tablet, large text, zoom | Jože |
| Wide desktop, keyboard | Daniel, Marcus |
| Slovenian texts, č š ž, decimal comma | Maja, Jože, Tomaž, Nika, Žan |
| Language switch | Elena |
| Emoji, accents, very long and very short texts | Nika, Elena, Daniel, Žan |
| Coming back after a long break | Priya, Žan, Elena |
| Day boundary (use after midnight) | Sam, Priya |
| Sensitive use: health, mood, addiction | Sam, Elena, Jože, Priya |
