# Restructure status

| Phase | State |
|---|---|
| 00 baseline | merged (PR #1); CI skip list in PR from `restructure/phase-00-ci`; known flake accepted |
| 01 modules and build | merged (PR #3) and deployed by `deploy.yml` 2026-11-17; tag `before-phase-01` |
| 02 core leaves | merged (PR #6) and deployed by `deploy.yml` 2026-11-17; tag `before-phase-02` |
| 03 core domain | merged (PR #8) and deployed by `deploy.yml` 2026-11-17; tag `before-phase-03` |
| 04 store and sync | merged (PR #10) and deployed by `deploy.yml` 2026-11-18; tag `before-phase-04` |
| 05 shared UI | merged (PR #12) and deployed by `deploy.yml` 2026-11-18; tag `before-phase-05` |
| 06 views and tutorial | not started |
| 07 map, timeline, graphs | not started |
| 08 close-out | not started |
| 09 tests | not started |
| 10 workflow | not started |

## Perf baseline (`npm run perf`, 2026-11-16, owner's Windows PC, Chrome headless, real time)

Compare against these after phases 7 and 8. Average ms per draw (budget in brackets). After phase 1: within
the baseline; the largest, 300 items + 20 visions map, 229 ms (was 198). After phase 3: the same (223 ms; state form 117).

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

- Moving: `npm run move -- <from> <to> <names|Obj.prop|Arr[Title]:NAME|comment:<n>|line:<n>> [--section …] --fix-imports`, the
  `/** … */` line, `--check`, `check`, commit; then `git mv` to .ts, types, Prettier, commit. `line:<n>` takes a listener; look lines
  up again before each run. `--section` runs past `/* === */` banners. Into a .ts file: `--check`, then type, one commit.
- Layers: `core` ← `store` ← `sync` ← `ui`; ESLint forbids `ui/` to import `legacy/` or `views/`. Upward calls from `ui/`:
  `requestRender()` (`ui/render.ts`; `main.ts` sets `render`), `connectSync({ enterUser, offerTour })` (through wrappers: the suite
  swaps `offerTour` by `setOfferTour`), and the `store/events.ts` emits. A prep commit rewires calls before the verbatim move.
- Listeners: the form dialog's stay in today's order in `ui/forms/events.ts` (Ctrl+Enter stops the rest); the others moved with
  their feature. `main.ts` imports the listen-only `ui/dialog.ts` and `ui/forms/events.ts` before the legacy code. The test build
  loads every module by glob and hides a missing import: after `npm run build`, look for a moved listener's code in `dist/`.
- Left in `app.js` (3,016 lines, not the ~2,500 hoped): views, their gestures, the `#view` click/input/change dispatchers (only
  view branches: for phase 6), the map context menu's options and actions (`ui/menu.ts` has the menu itself), boot.
- Typed `$<E>(sel)` returns E (non-null). `(e.target as HTMLElement)` in listeners. Form data: `Links`, `New<T>`, `FormVals` in
  `ui/forms/form.ts`. Shared texts in `ui/text.ts`, categories in `core/categories.ts`, `removeEntity` in `store/plans.ts`.
- Unchanged: fixtures never regenerated; tests assign `x` only through `setX`; a name exported twice throws in the bridge. Legacy
  files are CRLF: scripted edits keep line ends. PowerShell mangles UTF-8 (Edit or Node); Node may be off PATH. Unit tests 118.
