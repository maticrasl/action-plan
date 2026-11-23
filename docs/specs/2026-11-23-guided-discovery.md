# Guided discovery (feature 01)

What: **Find your visions**, three writing exercises (A good ordinary day, What for?, Where things
stand) that end in visions, and their Reflections. The plan is `docs/features/01-guided-discovery.md`;
this file records only what the build settles or changes.

## Data shape

A run is a journal session (`core/journal.ts`, already synced and in the full backup). No new
storage key, no new sync version.

```
{ id, exercise, date, done, made: [visionId…], updatedAt,
  answers: { step: number,                       // the step to continue at
             s1…s4: string, s5: [{ text, area }] // good-day
             goal: { plan, id, title }, ladder: [string…]                        // what-for
             ratings: { [area]: 1–10 }, better: { [area]: string }, pick: string,
             extra: [string…] }                  // areas: areas added for this run
```

- Texts are cut to 4,000 characters. A run whose answers are all empty is not stored (and an
  emptied one is removed).
- Saved at most once a second while typing, and at once on Next, Back and close.
- An unknown `exercise` is listed as "Reflection" and opens read-only.
- Preference `seen.discovery = true` once the chooser is opened.

## Rules settled here

- The `areas` exercise's step 2 is skipped when no area is rated 5 or lower; step 3 offers rated
  areas only, so with nothing rated Next ends the run.
- Editing an old reflection never changes visions made from it; `made` stops a second Add.
- Add as visions and Link are one `undoable` action; a goal in another plan makes it a
  whole-store undo, as renaming an area does.
- The Areas view shows the latest rating of each area with its date ("Rated 4 · 2 Nov").
- The yearly review (14) does not exist yet; its ending button comes with it.
- Delete is a visible × on each reflection (as on the Areas side), not a `⋯` menu, and asks
  first: the journal is not part of Undo.
- Keys: Enter in a line and Ctrl+Enter in a text box do the main button; Esc is Save and close.
- "What for?" needs a chosen goal to go on (the first one is preselected); text answers may stay
  empty.
- The Rated line shows on the blocks of the Areas side, so only for areas a vision or goal uses.
- The dialog is solid, not glass, and fills a phone's screen while an exercise runs.
- The Guide's `what-goal` article gets a second button through an optional `more` action.

## Modules

`core/discovery.ts` (catalogue, next step, empty run, what to make), `ui/discovery.ts` (dialog:
chooser, Reflections, run), `ui/discovery-steps.ts` (each step's and ending's HTML), `index.html`
(dialog), `styles/discovery.css`, `views/visions.ts` (button, empty state), `views/areas.ts`
(Rated), Guide, walkthrough, tip `no-vision`, i18n.

## Tests

Unit (`core/discovery.test.ts`): next step of each exercise (good-day 1–5, what-for ladder stops
at That's it and at five, areas step 2 lowest three ≤ 5 and skipped, step 3 rated only); empty
answers; cut to 4,000; visions to make (one with description and avoid, several without,
existing title links); `normalizeJournal` keeps an unknown exercise. Page
(`tests/browser/discovery.js`): each exercise end to end, goal in another plan, close and
continue, edit an old answer, delete, undo, Areas shows the rating, no goals greys What for?,
deleted goal keeps its title, markup shown as typed, demo plan goals not offered, keyboard.
