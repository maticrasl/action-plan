# Walkthrough ("Getting started"): design

Builds `docs/guidance/02-walkthrough.md` (what the user sees, tasks, texts, rules, tests). This
file only records what differs from that plan, the data shape, the modules and the order of
work. Status: **awaiting the owner's agreement.**

## Changes to the plan

1. **`goal` task text**, for the goal form as it is since #25 (a goal saves with a title; the
   obstacle replaced "Why is this realistic?"):
   > Pick one thing you would like to be different a few months from now. One goal is enough to
   > begin. Only the title is needed to save it; the other questions make it clearer, and the
   > letters light up as you answer them. If no number fits, set "Progress from" to "Activities
   > done" or "Routines kept". A rough first version is fine; you can improve it later.
2. **Guidance decision 6** ("no change to the goal form") is out of date; nothing to do here.
3. **Two sessions**, each shippable:
   - **A. The card.** Pure rules, the `walk` state, the card on the Overview, toasts, the
     Guide's "Getting started" line, Show me with the spotlight. Offered only from the Guide's
     *Start*; the tour stays as it is for first visits.
   - **B. The welcome.** Welcome card, demo marker and banner, the tour removed, first visit
     turns the walkthrough on, the upgrade rule.

## Data shape

- Preference `walk` (per user, per device, not synced):
  `{ state: 'on'|'off'|'finished', started, done: {taskId: date}, skipped: taskId[], folded }`.
  Missing or broken reads as "not set" (the offer rule decides). Saves merge with what is
  stored (union of `done` and `skipped`), so a second tab never loses ticks.
- Preference `seen` gains `views: {map?, timeline?, graphs?, visions?: true}` and
  `days: ISODate[]` (last 30). Unknown facts are kept as today.
- Plan list entry gains `demo?: true` (session B). The list entry merges whole (`newerOf`), so
  it survives sync. Fixtures: a plan list written by the current code reads unchanged; a list
  with `demo` reads in the current code without loss (checked against `pre-restructure` in
  `tests/e2e` as well).
- `tourSeen` is read once for the upgrade rule and never written again.

## Modules

| Module | What |
|---|---|
| `core/guidance/walk.ts` (new) | task list, one check per task, latching, next task, counts, offer rule |
| `store/walk.ts` (new) | read and save `walk` with the merge above; `seen` days and views |
| `tutorial/walkthrough.ts` (new) | the card, Show me, toasts; registers through `onRendered` |
| `tutorial/spotlight.ts` (new) | `placeTour`/`bringIntoView` moved out of `tour.ts` with `npm run move` |
| `views/guide.ts` | the "Getting started" line and the list in the page |
| `tutorial/welcome.ts` (new, B) | welcome card, demo banner |
| `tutorial/tour.ts` (B) | keeps the language picker only; the tour goes |
| `ui/sample.ts`, `store/plans.ts` (B) | sample marked as a demo |
| `main.ts`, `boot.ts`, `ui/sync-ui.ts`, `sync/sync.ts` (B) | tour wiring and the sync pause removed; offer rule wired |
| `i18n/en.ts`, `sl.ts`, `guide.*.ts` | `walk.*`, `welcome.*`, `demo.*`; Guide articles that name the tour |
| styles | `walk.css` (new); `tour.css` reduced to the spotlight |

## Tests

The plan's list, unchanged, split as: unit tests in `core/guidance/walk.test.ts` and
`store/walk.test.ts` (written first); page steps in `tests/browser/walkthrough.js` (A) and
`walkthrough.welcome.js` (B); `tests/browser/tutorial.js` replaced in B; phone and landscape
shots of the card.

## Asks for the owner

- Guidance decisions 1 (a checklist card, not a real plan), 2 (the tour is removed), 5 (state
  per device) and 4 (one optional vision task): confirm or change.
- The `goal` text above.
- Two sessions (A then B), or one.
