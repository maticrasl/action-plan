# Restructure status

| Phase | State |
|---|---|
| 00 baseline | built on branch `restructure/phase-00`; stopped: `test:browser` is flaky (see below); CI not run yet |
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

Empty. CI has not run yet: nothing is pushed before "ship it". If Linux Chrome fails steps for
rendering reasons, list them there and here.

## Open: flaky `test:browser` (blocks "three green runs in a row")

- About 1 run in 15–20 prints `NO RESULT`: Chrome dumps the page before the suite writes `<pre id="OK">`.
  `tests/run.sh` used the same Chrome flags and budget, so this predates phase 0. Fixtures never flaked (34 runs).
- Caught once with the dump saved (the runner now saves it to `%TEMP%\actionplan-last-dom.html`): page loaded,
  Timeline view, toast "Plan imported", no `OK` block. That run finished ~8 s sooner than the others, so the
  dump came early, not late.
- The suite normally uses ~38 s of the 60 s virtual-time budget (36 s under full CPU load).
- Theory not confirmed: virtual time jumps to the 5-minute sync interval (`SYNC_EVERY`) while an import awaits a
  real file read. Making `Blob.text()` slow by several seconds did not reproduce it at 60 s (2 attempts).
  Stopped here (RULES §4). Next idea: run Chrome with `--enable-logging=stderr --v=0` in a loop and read the log of a failing run.

## Notes for the next phase

- Node 26.13.1 is in `C:\Program Files\nodejs`. A terminal opened before the install lacks it on PATH; open a new one.
- `gh` is not installed. Shipping needs it (OWNER.md, "Before phase 0", step 3).
- `tests/run.sh` is still there. Phase 1 deletes it. `npm run test:browser` replaces it.
- Fixtures were generated once from the code at tag `pre-restructure` (`node scripts/fixtures.mjs --generate`). Never regenerate them.
  Clock frozen at 2026-11-16T11:00Z, ids counted, network off (`tests/fixtures/fixture-pre.js`).
- Current behaviour the fixtures record: the legacy migration keeps the `actionplan.v1` key, and a restore re-stamps restored visions' `updatedAt`.
- Both tools take an app folder to test a changed copy: `node scripts/fixtures.mjs <dir>`, `node scripts/run-suite.mjs <dir>`.
- The main checkout has untracked copies of `CLAUDE.md` and `docs/restructure/`. After the merge, pulling there fails until they are moved away.
