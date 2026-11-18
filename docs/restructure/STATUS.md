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
| 08 close-out | merged (PR #18) and deployed by `deploy.yml` 2026-11-18; tag `before-phase-08` |
| 09 tests | done on branch `restructure/phase-09` (not pushed); awaits "ship it" |
| 10 workflow | not started |

## Perf baseline

Since phase 9, `npm run perf` compares with `tests/perf-baseline.json` (2026-11-18, this PC) and flags a change
over 25%; `npm run perf -- --save` stores a new one. The history below is from before.

### `npm run perf`, 2026-11-16, owner's Windows PC, Chrome headless, real time

Compare against these after phases 7 and 8. Average ms per draw (budget in brackets). After phase 1: within
the baseline; the largest, 300 items + 20 visions map, 229 ms (was 198). After phase 3: the same (223 ms; state form 117).
Phase 7 map session: 300 items map 149 ms, + 20 visions 218, all else at or under the baseline; state form 121 (over, as before).
Phase 7 end: 300 items map 151, + 20 visions 222 (+12%), timeline 16, graphs 17, the rest at or under; state form 129 (over, as before).
Phase 8 end: 300 items map 150, + 20 visions 232 (budget 300), the rest at or under. The state form's budget is 150 (owner, 2026-11-18;
it was 100 and measured 117–129 since 2026-11-08); all checks pass.

| Check | ms | | Check | ms |
|---|---|---|---|---|
| sample: dashboard (150) | 4 | | 1,100 amounts: graph by day (100) | 59 |
| sample: goals (150) | 3 | | 1,100 amounts: graph by week (100) | 27 |
| sample: activities (150) | 4 | | 1,100 amounts: graph by month (100) | 22 |
| sample: states (150) | 1 | | 1,100 amounts: graph by year (100) | 22 |
| sample: visions (150) | 1 | | 1,100 amounts: graph by total (100) | 30 |
| sample: map (150) | 28 | | 1,100 amounts: states view (100) | 0 |
| sample: timeline (150) | 20 | | 1,100 amounts: state form (100, now 150) | 126 (was over since 2026-11-08) |
| sample: graphs (150) | 18 | | 300 items + 20 visions: map (300) | 198 |
| sample: map layout (150) | 2 | | 20 visions: visions view (100) | 3 |
| 300 items: map (250) | 156 | | 300 items + 20 visions: goals with glow (150) | 7 |

## CI skip list (`tests/ci-skip.txt`)

These steps fail on GitHub's Linux Chrome (the same 4 in all 3 runs of PR #1) and still gate locally.
Fixtures pass on Linux.

- `routine cards: a short schedule tag that fits, the full one as its tooltip`: text width (Slovenian)
- `item menu: show in another view, selected there`: a map box side 6 px off (658 → 664)

Phase 9: `routines.monthly.js` switches back to English after the first, so the two monthly steps after it
are off the list. Not yet confirmed on GitHub (the branch is not pushed).

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

- Tests: `tests/README.md`. Page tests are 34 files in `tests/browser` (187 steps, each file alone in a fresh page, 4 at
  a time, ~45 s); unit tests 143 in 19 files; Playwright 3 (`tests/e2e`, on `dist/`). more.js and test.js are gone.
- The suite's day is pinned (pre.js shifts Date to Wed 2026-11-18 noon). Run on Sunday 2026-06-14, two steps failed:
  see `found-bugs.md`.
- Unit tests load only modules that do not touch `document` while loading: views/* and most of ui/* stay page tests
  (no jsdom: not an allowed dependency). sync.ts types clash with Node's setTimeout, so applyStore stays a page test.
- `tsconfig.node.json` has the DOM lib (store and sync modules name Response); it also checks tests/e2e.
- Assertions (assert/eq/expect): 2714 before, 2545 after. ~212 of the 279 page assertions removed duplicated unit
  tests ported in phases 3–7; the other ~67 became 85 new expects. Nothing was dropped without a replacement.
- `users.js` is 632 lines: one chain of logins on a fake Google; splitting it means replaying the logins.
- `npm audit`: 11 high in the vite/vitest/typescript-eslint chain (picomatch), there before this phase.
- CI (`check.yml`) installs Playwright's Chromium shell and fetches the `pre-restructure` tag; not yet run on GitHub.
- Unchanged: no app code changed; fixtures never regenerated; `stateChange`'s unused `s` stays.
