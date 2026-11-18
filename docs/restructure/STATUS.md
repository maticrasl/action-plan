# Restructure status

| Phase | State |
|---|---|
| 00 baseline | merged (PR #1); CI skip list in PR from `restructure/phase-00-ci`; known flake accepted |
| 01 modules and build | merged (PR #3) and deployed by `deploy.yml` 2026-11-17; tag `before-phase-01` |
| 02 core leaves | merged (PR #6) and deployed by `deploy.yml` 2026-11-17; tag `before-phase-02` |
| 03 core domain | merged (PR #8) and deployed by `deploy.yml` 2026-11-17; tag `before-phase-03` |
| 04 store and sync | merged (PR #10) and deployed by `deploy.yml` 2026-11-18; tag `before-phase-04` |
| 05 shared UI | merged (PR #12) and deployed by `deploy.yml` 2026-11-18; tag `before-phase-05` |
| 06 views and tutorial | merged (PR #14) and deployed by `deploy.yml` 2026-11-18; tag `before-phase-06` |
| 07 map, timeline, graphs | merged (PR #16) and deployed by `deploy.yml` 2026-11-18; tag `before-phase-07` |
| 08 close-out | not started |
| 09 tests | not started |
| 10 workflow | not started |

## Perf baseline (`npm run perf`, 2026-11-16, owner's Windows PC, Chrome headless, real time)

Compare against these after phases 7 and 8. Average ms per draw (budget in brackets). After phase 1: within
the baseline; the largest, 300 items + 20 visions map, 229 ms (was 198). After phase 3: the same (223 ms; state form 117).
Phase 7 map session: 300 items map 149 ms, + 20 visions 218, all else at or under the baseline; state form 121 (over, as before).
Phase 7 end: 300 items map 151, + 20 visions 222 (+12%), timeline 16, graphs 17, the rest at or under; state form 129 (over, as before).

| Check | ms | | Check | ms |
|---|---|---|---|---|
| sample: dashboard (150) | 4 | | 1,100 amounts: graph by day (100) | 59 |
| sample: goals (150) | 3 | | 1,100 amounts: graph by week (100) | 27 |
| sample: activities (150) | 4 | | 1,100 amounts: graph by month (100) | 22 |
| sample: states (150) | 1 | | 1,100 amounts: graph by year (100) | 22 |
| sample: visions (150) | 1 | | 1,100 amounts: graph by total (100) | 30 |
| sample: map (150) | 28 | | 1,100 amounts: states view (100) | 0 |
| sample: timeline (150) | 20 | | 1,100 amounts: state form (100) | **126 (over, as since 2026-11-08)** |
| sample: graphs (150) | 18 | | 300 items + 20 visions: map (300) | 198 |
| sample: map layout (150) | 2 | | 20 visions: visions view (100) | 3 |
| 300 items: map (250) | 156 | | 300 items + 20 visions: goals with glow (150) | 7 |

## CI skip list (`tests/ci-skip.txt`)

These steps fail on GitHub's Linux Chrome (the same 4 in all 3 runs of PR #1) and still gate locally.
Fixtures pass on Linux.

- `routine cards: a short schedule tag that fits, the full one as its tooltip`: text width. It fails while
  set to Slovenian and never switches back, so the next two fail as a result:
- `monthly routines: the form shows the right fields and saves each option`
- `monthly routines: check-ins, streaks and the week strip`
- `item menu: show in another view, selected there`: a map box side 6 px off (658 → 664)

Phase 9 (tests) can make the first step restore English in `finally` and take the two monthly steps off.

## `NO RESULT` flake in `test:browser`: cause found, fix in `tests/pre.js` (2026-11-17)

- Was: about 1 run in 15–20 locally, 5 of 11 on CI on 2026-11-17; Chrome dumped the page early, without `<pre id="OK">`.
- Cause: Chrome sets virtual time after `load` with `pauseIfNetworkFetchesPending` (`headless_command.js`), so it
  stands still only for network fetches. While `Blob.text()` reads a file (imports, restores, downloaded files),
  the page counts as idle and its timers run ahead; a slow read spends the rest of the 60 s budget. Reproduced
  by making every read slow (30 MB through the same call): `NO RESULT` 2 of 2 at ~15 s; one read took 25–39 s virtual.
- Fix: `tests/pre.js` reads blobs through `fetch(blob: URL)`, which holds virtual time. Same slow reads: 3 of 3
  passed, longest read ~100 ms virtual. A `NO RESULT` now counts as a real failure; if it comes back, look for
  another kind of real async work (FileReader, crypto, workers) that the suite awaits.

## Notes for the next phase

- `app.js` now holds only Boot (`bootUser`, `enterUser`). Timeline: `timeline/rows.ts` (rows, folds), `render.ts`, `drag.ts`.
  Graphs: `graphs/states.ts` (line graphs, axes, `grCharts`), `plot.ts` (shared plot), `sums.ts` (bar/step/routine cards),
  `points.ts` (crosshair, tooltip, resize). `openAddMenu` is in `map/menu.ts`. `layout.ts` 441 lines (note 1); all else ≤ 400.
- `main.ts` calls `listenGraphs()`, `listenMap()`, `listenTlDrag()`; no view listens while it loads now. Recorder of
  `addEventListener` calls (per target, event and phase): 84 groups, 130 listeners, the same as before phase 7 (script not kept).
- `move-decls --check` now accepts a leading `export` added or dropped; its import rewriting drops `type` modifiers and may merge
  a type into a value import (fix those lines by hand after a move between typed files).
- Moving as before: `line:<n>` numbers shift after each run; banners without code go in a commit of their own; `--check` per file.
- Layers and hooks unchanged (`ui/` ← `views/` ← `tutorial/`); `markVisions` asks the tour through `setTourRunning` (`main.ts`).
- Unchanged: fixtures never regenerated; tests assign only through `setX`; a name exported twice throws in the bridge. Legacy files
  are CRLF. PowerShell mangles UTF-8 and strips quotes passed to `node -e` (write a script file). Unit tests 122.
