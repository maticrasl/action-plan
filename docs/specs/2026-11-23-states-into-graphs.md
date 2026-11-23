# States view folds into Graphs

## What

Remove the States view. Graphs becomes the one place to see and manage current states.
Everything a States card showed moves onto the state's graph card.

What a States card showed, and where it goes on the Graphs card:

| States card | Graphs card |
|---|---|
| title, opens the form on click | title + Edit (already there) |
| value (measured) or total + period amount and the + button (adds up) | value (already there); adds-up cards get the + button in the head |
| description | under the head |
| "as of <date>" / "last entry <date>" / "no entries" | meta line under the stats |
| "n activities improve it" | meta line |
| "n measurements" / "n entries" | meta line |
| goal tags it measures | links row, as on States |
| sorted by latest date | Graphs keeps its order (states, then routines) |

States with no measurements or amounts yet: today Graphs lists them only as tags under
"No data yet". They become small cards (head, description, meta, goal tags, Edit; the +
button for adds-up) without a plot, after the graphs.

## Data shape

No change to plan data. The stored last view `states` opens Graphs (`boot.ts`). `seen.views.states`
stays as it is (read only by the try-graphs tip, removed below).

## Modules

- `views/states.ts` removed; its card parts move to a new `views/graphs/state-info.ts`
  (head extras, meta line, goal tags, no-data card), used by `graphs/states.ts`, `graphs/sums.ts`, `graphs/plot.ts`.
- `views/index.ts`, `store/state.ts` (ViewName), `index.html` (nav button), `boot.ts` (old `states` → `graphs`).
- `views/map/menu.ts` SHOW_IN, `views/guide.ts` (`view-states` → Graphs).
- Tips: `core/guidance/tips-b.ts`, `tips-cd.ts`, `tip-facts.ts`: view `states` → `graphs`; the
  try-graphs tip goes (it pointed from States to Graphs).
- Getting started: `tutorial/walkthrough.ts` measure task shows Graphs.
- Texts: `nav.states`, `view.states` and other States-only keys removed from `en.ts`, `sl.ts`;
  Guide articles `h-states`, `h-graphs` and the views list in `guide.en.ts`, `guide.sl.ts`.

## Tests

- graphs page test: a measured card shows description, as-of date, improvers, count, goal tags;
  an adds-up card's + button opens the amount box; a state without data is a card with Edit.
- boot: stored view `states` opens Graphs.
- States page tests (`states.js`, `cumulative*.js`, `menu*.js`, `i18n.js`, `guide.js`) move to Graphs.
- walkthrough: measure task's "Show me" lands on Graphs.
- phone shot of Graphs.

## Agreed with the owner (2026-11-23)

Built as above, with these changes after comparing three layouts (facts on top, graph first,
side column). The owner chose facts on top, and:
- + on every state card (a new value, or an amount when it adds up), larger than other icon buttons.
- No Edit button on any graph card: Edit is in the card's menu (right-click or long-press).
- No legend on any graph: the room goes to the graph. Its help tip now sits on the plot.
- "Show in Graphs" is offered for every state, since each has a card there.
