# Restructure status

| Phase | State |
|---|---|
| 00 baseline | merged (PR #1); CI skip list in PR from `restructure/phase-00-ci`; known flake accepted |
| 01 modules and build | not started |
| 02 core leaves | not started |
| 03 core domain | not started |
| 04 store and sync | not started |
| 05 shared UI | not started |
| 06 views and tutorial | not started |
| 07 map, timeline, graphs | not started |
| 08 close-out | not started |
| 09 tests | not started |
| 10 workflow | not started |

## Perf baseline (`npm run perf`, 2026-11-16, owner's Windows PC, Chrome headless, real time)

Compare against these after phases 7 and 8. Average ms per draw (budget in brackets).

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

## Known flake in `test:browser` (owner, 2026-11-16: do not investigate)

A `NO RESULT` run is this flake, not a broken change: run `npm run check` again. Any other failure counts.

- About 1 run in 15–20 prints `NO RESULT`: Chrome dumps the page before the suite writes `<pre id="OK">`.
  `tests/run.sh` used the same Chrome flags and budget, so this predates phase 0. Fixtures never flaked (34 runs).
- Caught once with the dump saved (the runner now saves it to `%TEMP%\actionplan-last-dom.html`): page loaded,
  Timeline view, toast "Plan imported", no `OK` block. That run finished ~8 s sooner than the others, so the
  dump came early, not late.
- The suite normally uses ~38 s of the 60 s virtual-time budget (36 s under full CPU load).
- Theory not confirmed: virtual time jumps to the 5-minute sync interval (`SYNC_EVERY`) while an import awaits a
  real file read. Making `Blob.text()` slow by several seconds did not reproduce it at 60 s (2 attempts).
  Not pursued further, by the owner's decision.

## Notes for the next phase

- Node 26.13.1 is in `C:\Program Files\nodejs`. A terminal opened before the install lacks it on PATH; open a new one.
- `gh` 2.104.0 is installed and logged in (`C:\Program Files\GitHub CLI\gh.exe`). Old shells lack it on PATH.
- `tests/run.sh` is still there. Phase 1 deletes it. `npm run test:browser` replaces it.
- Fixtures were generated once from the code at tag `pre-restructure` (`node scripts/fixtures.mjs --generate`). Never regenerate them.
  Clock frozen at 2026-11-16T11:00Z, ids counted, network off (`tests/fixtures/fixture-pre.js`).
- Current behaviour the fixtures record: the legacy migration keeps the `actionplan.v1` key, and a restore re-stamps restored visions' `updatedAt`.
- Both tools take an app folder to test a changed copy: `node scripts/fixtures.mjs <dir>`, `node scripts/run-suite.mjs <dir>`.
- The main checkout has untracked copies of `CLAUDE.md` and `docs/restructure/`. After the merge, pulling there fails until they are moved away.
