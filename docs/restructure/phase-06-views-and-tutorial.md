# Phase 6 — List views and the tutorial

**Goal:** the five card-based views and the tour are modules.

## What moves

| To | From (`5b71e59`) |
|---|---|
| `views/index.ts` | `VIEWS`, `render()`, `setView` (1342–1493, 4070) |
| `views/dashboard.ts` | dashboard part of "Views" 1338–1560 |
| `views/goals.ts` | `renderGoals` 1494–, goal cards |
| `views/filters.ts` | "Goal categories & shared filters" 1561–1636 |
| `views/activities.ts` | board, `bindDragDrop` |
| `views/routines.ts` | the HTML-building half of "Routines" left behind in phase 3 (week strips, list ticks) |
| `views/states.ts` | state cards, the HTML half of "Cumulative states" |
| `views/visions.ts` | "Visions" 1637–1703 |
| `tutorial/tour.ts`, `tutorial/help.ts` | `tutorial.js` |

## Notes

1. **`render()` is the hub** (`app.js:1353`). It saves scroll positions, replaces
   `viewEl.innerHTML`, rebinds drag and drop, restores scroll, and ends with `decorateHelp()`.
   Move it whole. The `VIEWS` table becomes the registry: each view module exports its render
   function and `views/index.ts` lists them. View-specific steps inside `render()`
   (`if (ui.view === 'activities') bindDragDrop()`, graph scroll restore) stay where they are
   for now; do not invent an "after render" hook system unless three views need it.

2. **`tutorial` is above `views`.** `render()` calls `decorateHelp()`, and `enterUser` checks
   `tour.step`. Both are upward calls: `views/index.ts` exposes `onRendered(fn)`, and the
   tutorial registers `decorateHelp` from `main.ts`. For `tour.step`, export a small
   `isTourRunning()`/`endTour()` used by `main.ts`, where `enterUser` lives.

3. **Tour steps name CSS selectors** of the views (`TOUR_STEPS` in `tutorial.js`). They are not
   changed in this phase, and class names do not change. The suite's per-step target check
   proves it.

4. **Shared card helpers.** If two views build the same fragment through a shared function,
   that function goes to `ui/` (below `views`), not into one view imported by the other. Views
   do not import each other.

5. Moves and typing as before. Type the `ui` state object (`freshUi`) fully now: every view
   reads it, and its fields are the views' real interface.

## Done when

- `npm run check` green; `src/legacy/tutorial.js` is gone; `app.js` holds only map, timeline,
  graphs, their gestures and boot.

## Owner check

Standard check, plus: drag an activity between board columns, the category chips on goals,
"Show all" on the overview, routine week strips (previous/next week), help mode on every view,
and the full tour from Settings → Take the tour in both languages.
