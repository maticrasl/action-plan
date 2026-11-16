# Phase 7 — Map, timeline, graphs

**Goal:** the three drawing views and their pointer gestures are modules. About 3,300 lines,
the most intricate code in the app. Two sessions: map first, then timeline and graphs.

## What moves

| To | From (`5b71e59`) |
|---|---|
| `views/map/layout.ts` | "Map layout (Sugiyama)" 1706–2117: 412 lines in 4 functions |
| `views/map/render.ts` | map drawing, glass tint (`glassLight`, 1738), fit (`fitCtx`, 2101) |
| `views/map/visions.ts` | "Visions on the map" 2118–2413 |
| `views/map/menu.ts` | "Map context menu" 4971–5224 |
| `views/map/zoom.ts` | "Zoom" 5225–5412: wheel, pinch, double-tap, pan |
| `views/map/link.ts` | "Linking two map boxes" 5413–5497 |
| `views/timeline/render.ts` | "Timeline" 2414–2648: 235 lines in 3 functions |
| `views/timeline/drag.ts` | "Moving dates in the timeline" 5498–5764 |
| `views/graphs/states.ts` | "Graphs" 2649–2912 |
| `views/graphs/sums.ts` | "Graphs of amounts that add up, and of routines" 2913–3192 |

## Notes

1. **Do not split the long functions.** `layoutMap` and the timeline renderer are 100+ lines
   each. They were tuned against specific cases (see the memory notes "Map lines keep simple"
   and "Map glass look": lines are fixed in placement, not in post-processing; draw time
   matters). Move them whole. If one file exceeds 400 lines because of one function, that is
   accepted here; note it in `STATUS.md`.

2. **`layout.ts` is pure geometry**: items and links in, positions out. It must not import
   from `ui/` or touch the page. Check its imports after the move. If it measures text through
   the page, leave that measurement in `render.ts` and pass the result in, only if that is
   already how the code is shaped; otherwise leave it and record it.

3. **Gesture state travels with its handlers.** Each gesture has module-level variables
   (`pinch`, `pan`, `zoomQueue`, `lastTap`, `tapZoom`, `touchDown`, `press`, `linkDrag`,
   `tlDrag`, `tlDragClick`, `gesture`). Each goes into the same file as the listeners that
   read and write it, unexported where possible. If two files need the same variable, they
   are one module.

4. **Listener order between gestures matters** (a pinch must cancel a pan; a drag's final
   click must not toggle selection). All map listeners are registered from one function in
   `views/map/index.ts`, in today's source order. Same for the timeline.

5. **Speed.** Run `npm run perf` before the phase and after each of the two sessions. Budgets
   that were passing must still pass, and no number may be more than about 20% worse than the
   phase 0 baseline in `STATUS.md`. Module boundaries do not cost time in a bundled build; a
   slowdown means something changed.

6. **Unit tests for `layout.ts`**, ported from the DOM-free map steps in `tests/more.js`
   (the commit history names them: lines to visions cross least, linked boxes start side by
   side, an unavoidable crossing falls on the activities' lines, changing a deadline moves
   nothing). These pin the layout's results as numbers and run in milliseconds.

## Done when

- `npm run check` green; `src/legacy/app.js` contains only boot code and `enterUser`/`bootUser`.
- `npm run perf` within the limit above.

## Owner check

Do this one on the PC **and** on the phone (after "ship it", on the live site):
- map: wheel zoom, pinch, double-tap, pan, select a box and a line, Delete, drag a link
  between two boxes (allowed and refused pairs), right-click and long-press menus, right-click
  on empty space, the filter for relation types, visions shown and hidden
- timeline: zoom, collapse a goal, drag a bar's start, end and whole bar, dependencies on/off
- graphs: zoom, scroll position kept after a change, cumulative and routine graphs
