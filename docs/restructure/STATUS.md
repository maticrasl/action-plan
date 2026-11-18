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
| 09 tests | merged (PR #20) and deployed by `deploy.yml` 2026-11-18; tag `before-phase-09` |
| 10 workflow | merged (PR #22) and deployed by `deploy.yml` 2026-11-18; tag `before-phase-10`. **Restructure done: features allowed** |
| after | plan docs merged (PR #23) and deployed 2026-11-18; fonts and date-proof tests on `fix/fonts-and-sunday-tests`, ships on the owner's "ship it" |

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

Empty since 2026-11-18 (`fix/fonts-and-sunday-tests`). It held two steps that failed on GitHub's Linux
Chrome only, both measuring text:

- `routine cards: a short schedule tag that fits, the full one as its tooltip`: text width (Slovenian)
- `item menu: show in another view, selected there`: a map box side 6 px off (658 → 664)

Cause: the text was measured in whatever font the machine had: in the test frames always the
fallback (Segoe UI on Windows, Liberation or DejaVu on Linux; `css/styles.css` had no Overpass), on the
page Overpass from Google Fonts only once it had arrived. Now Overpass ships with the app
(`src/styles/fonts/`, also in the test frames' `css/fonts/`) and the harness loads it before any
step (`fontsLoaded`). Both pass locally; **the first CI run of that branch confirms them on Linux**. If one
still fails there, put it back on the list with its message.

## `NO RESULT` flake in `test:browser`: cause found, fix in `tests/pre.js` (2026-11-17)

- Was: about 1 run in 15–20 locally, 5 of 11 on CI on 2026-11-17; Chrome dumped the page early, without `<pre id="OK">`.
- Cause: Chrome sets virtual time after `load` with `pauseIfNetworkFetchesPending` (`headless_command.js`), so it
  stands still only for network fetches. While `Blob.text()` reads a file (imports, restores, downloaded files),
  the page counts as idle and its timers run ahead; a slow read spends the rest of the 60 s budget. Reproduced
  by making every read slow (30 MB through the same call): `NO RESULT` 2 of 2 at ~15 s; one read took 25–39 s virtual.
- Fix: `tests/pre.js` reads blobs through `fetch(blob: URL)`, which holds virtual time. Same slow reads: 3 of 3
  passed, longest read ~100 ms virtual. A `NO RESULT` now counts as a real failure; if it comes back, look for
  another kind of real async work (FileReader, crypto, workers) that the suite awaits.

## Notes (phase 10)

- Built: `CLAUDE.md` (86 lines, from target-CLAUDE.md corrected), `docs/decisions.md`, `.claude/settings.json`
  (allow list + Prettier hook via `scripts/format-edited.mjs`, limited by `.prettierignore` to src/ and tests/),
  `.claude/skills/ship`, help-tip keys typed (`TipKey`), specs moved to `docs/specs`, finished plans deleted.
- Proved in fresh headless sessions: the hook formats an edited file; allowed Bash and PowerShell commands run,
  `git push` is refused. This session itself could not see the new settings (no settings file when it started).
- Done-when: a fresh session given "add a 'paused' chip to the goals filter" found `views/goals.ts` and
  `core/model.ts:47` by Grep in 8 turns ($0.32), saw the chip already exists, asked only which filter was meant.
- Measure (step 7), 2026-11-18, Opus 5.5, fresh session: "right-click empty timeline space opens the Add menu"
  (like `f47d3bf`): 32 turns, 45k context written, 1.05M cache reads, 10.4k output, $0.78; 7 reads, all ranged;
  test first. Old cost unknown (owner); the README estimated severalfold. Throwaway branch deleted, never pushed.
- Memory (step 5) applied with the owner's yes, 2026-11-18: 14 entries; old folder kept as `memory-backup-2026-11-18`
  beside it. Delete `docs/restructure/` after 2026-12-18; `docs/decisions.md` carries what matters.
- Node is at `C:\Program Files\nodejs`; a Claude process started before the install has no `node` on PATH.
  `gh` is at `C:\Program Files\GitHub CLI\gh.exe`, likewise not always on PATH.

## Notes (after phase 10, 2026-11-18)

- The suite passes on any day, not only the pinned Wednesday: checked by pinning `tests/pre.js` to 15
  Sundays of 2026 and to 1 Mar, 31 Mar, 1 Jan, 29 Feb (map, menu, routines, visions; the whole suite on
  22 Nov and 14 Jun). One step still depends on the day: see `found-bugs.md` (a fifth weekday).
- The font files add ~124 KB to the first load and the offline cache; the Google request is gone.
