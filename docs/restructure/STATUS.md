# Restructure status

| Phase | State |
|---|---|
| 00 baseline | merged (PR #1); CI skip list in PR from `restructure/phase-00-ci`; known flake accepted |
| 01 modules and build | shipped (owner said "ship it" 2026-11-17); PR from `restructure/phase-01` |
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

- Node (`C:\Program Files\nodejs`) and `gh` (`C:\Program Files\GitHub CLI`) may be missing from an old shell's PATH.
- Fixtures come from tag `pre-restructure`; never regenerate them. Clock 2026-11-16T11:00Z, ids counted, network off.
- Runners build `vite build --mode test` into `dist-test/` and serve it on 127.0.0.1 (`scripts/lib/chrome.mjs`).
  Virtual time waits for the module and the appended scripts over HTTP: the IIFE fallback was not needed.
  Test pages (`test.html`, `perf.html`, `fx.html`) are emitted by `vite.config.ts` from the built `index.html`.
- Test build has no `public/` (a manifest makes Chrome fire `beforeinstallprompt`) and no `sw.js`, as under file://.
  It copies `styles.css` to `css/styles.css`: more.js renders iframes that link that path.
- `test-bridge.ts` finds setters by name: export `x` is assignable from tests iff its module exports `setX`.
  Tests assign `today`, `offerTour` (functions: setter reassigns the declaration) and `lastNodeClick` too.
- Owner approved `@types/node` (used only by `tsconfig.node.json` for `vite.config.ts`; `src/` stays without Node types).
  Owner approved `@eslint/js` and `globals` (ESLint's recommended set and browser globals).
- Pages source is set to GitHub Actions (owner, 2026-11-17).
- ESLint options set for legacy code: unused caught errors and rest siblings allowed, NBSP allowed in regexes.
- `check.yml` no longer runs on pushes to `main`; `deploy.yml` calls it, then builds and publishes `dist/`.
- Upgrade test (step 11) passed, scripted over CDP: old cache dropped on the 2nd reload, offline start works.
- Perf after phase 1: within the baseline; the largest, 300 items + 20 visions map, 229 ms (was 198).
- The main checkout may still hold untracked copies of `CLAUDE.md` and `docs/restructure/`; pulling there fails until moved.
