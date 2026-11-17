# Restructure status

| Phase | State |
|---|---|
| 00 baseline | merged (PR #1); CI skip list in PR from `restructure/phase-00-ci`; known flake accepted |
| 01 modules and build | merged (PR #3) and deployed by `deploy.yml` 2026-11-17; tag `before-phase-01` |
| 02 core leaves | merged (PR #6) and deployed by `deploy.yml` 2026-11-17; tag `before-phase-02` |
| 03 core domain | not started |
| 04 store and sync | not started |
| 05 shared UI | not started |
| 06 views and tutorial | not started |
| 07 map, timeline, graphs | not started |
| 08 close-out | not started |
| 09 tests | not started |
| 10 workflow | not started |

## Perf baseline (`npm run perf`, 2026-11-16, owner's Windows PC, Chrome headless, real time)

Compare against these after phases 7 and 8. Average ms per draw (budget in brackets). After phase 1: within
the baseline; the largest, 300 items + 20 visions map, 229 ms (was 198).

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

- Moving: `npm run move -- <from> <to> <names|Obj.prop|comment:<line>> [--section …] --fix-imports`, add the `/** … */` line,
  `npm run move -- --check <from> <to>`, `npm run check`, commit; then `git mv` to .ts, types, Prettier, commit. A committed
  move: `--check <from> <to> --commit <rev>`. New files start as .js; imports outside `src/legacy` have no extension.
- `main.ts` sets `lang` (`setLang(detectLang())`) and `db` (`setDb(emptyDb())`) first: no module calls another while loading.
- Deviation from phase 2's file: `setLanguage` writes `localStorage`, so it is in `src/ui/i18n-dom.ts`; `src/i18n` has `setLang`.
- tsc projects: `tsconfig.json` (app, DOM, no tests), `tsconfig.core.json` (`src/core`, `src/i18n`; ES2022, no DOM),
  `tsconfig.node.json` (configs and unit tests, Node types). `check:fast` takes about 10 s; three tsc runs dominate.
- Unit tests sit beside their module (`*.test.ts`, Europe/Ljubljana time). `model.test.ts` type-checks every stored plan,
  plan list and vision list in the fixtures: a new stored field goes into `src/core/model.ts`.
- `src/test-modules.ts` globs every module for the test bridge, after `main.ts` (load order kept); a name exported twice
  throws. Tests may assign `x` only if its module exports `setX` (they assign `today`, `offerTour`, `lastNodeClick`).
- Fixtures come from tag `pre-restructure`; never regenerate them. Clock 2026-11-16T11:00Z, ids counted, network off.
- Windows PowerShell's `Get-Content -Raw` mangles UTF-8 without BOM: edit with the Edit tool or Node. Node and `gh` may be
  missing from an old shell's PATH (`C:\Program Files\nodejs`, `C:\Program Files\GitHub CLI`). Approved extra dev deps:
  `@types/node`, `@eslint/js`, `globals`. Pages deploys from Actions (`deploy.yml` calls `check.yml`).
