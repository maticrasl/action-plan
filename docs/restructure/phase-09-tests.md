# Phase 9 — Reorganise the tests

**Goal:** a change to one feature runs that feature's tests in seconds; pure logic is tested in
Node; the suite no longer depends on the day it runs.

Today: `tests/more.js` (7,874 lines, 193 steps) and `tests/test.js` (26 steps) run as one
sequence in one page and share state. About 142 steps touch the page; about 51 do not.

This is the one phase where test files are edited. Rule: **a step is removed from the old
files only in the same commit that adds its replacement, and the replacement has been seen to
fail** when the code under test is broken on purpose (break it, see red, restore).

## Steps

1. **Pure steps become unit tests.** For each step that does not touch the page: move its
   assertions to the `*.test.ts` beside the module it tests (many were already ported in
   phases 3, 4 and 7; delete the old step where the port is complete). Use explicit dates and
   Vitest's fake timers; no dependence on today's weekday.

2. **Split the page steps by feature** into `tests/browser/<feature>.js`:
   `plans`, `goals`, `activities`, `routines`, `states`, `cumulative`, `visions`, `map`,
   `map-gestures`, `timeline`, `graphs`, `forms`, `import-export`, `merge`, `sync`, `users`,
   `i18n`, `tutorial`, `settings`. The section headers in `more.js` and the function names tell
   you where each step belongs.
   - The helpers at the top of `more.js` (`mk`, `rel`, `fresh`, `eq`, `d`, `tick`,
     `untickCook`) and of `test.js` (`step`, `assert`, `fp`) go to `tests/browser/harness.js`.
   - **Each file must pass alone.** Steps currently rely on what earlier steps left behind
     (the testing memory: "Steps share state: leave one empty plan behind"). Each file starts
     from cleared storage and builds what it needs with the helpers. This is the real work of
     the phase. Do it file by file: split one out, run it alone, run the whole suite, commit.
   - The runner takes names: `npm run test:browser -- map routines`. Without names it runs all
     files, each in a fresh page, and prints one summary line per failing file plus a total.

3. **Pin the calendar day** in the browser suite. `tests/pre.js` shifts `Date` by a constant
   offset so that the suite always runs on the same date (choose a Wednesday mid-month,
   away from clock changes). Shift, do not freeze: code that measures elapsed time must
   still see the clock advance. The memory note on testing has the stub. Steps that test
   specific weekdays already build their own dates.

4. **Test bridge.** The page tests still reach modules through `window`. Keep the bridge; it
   exists only in the test build. Do not rewrite 140 steps to imports.

5. **Playwright**, for what the in-page suite cannot do. `tests/e2e/`, run by `npm run test:e2e`,
   part of `check` but not of `check:fast`. Keep it to these:
   - **phone**: 390×844 viewport, touch enabled: tab bar, "More" sheet, floating add button, a
     form. This replaces the 390 px iframe workaround described in the testing memory.
   - **offline**: load once, go offline, reload: the app starts.
   - **upgrade**: serve the `pre-restructure` files, create data, swap to the new build on the
     same origin, reload: data intact, old cache gone (automates phase 1, step 11).
   - **screenshots** on demand: `npm run shot -- <view> [--phone] [--dark]` writes a PNG for
     the model or the owner to look at. Full-page capture works here, so the scrolling
     workarounds in the testing memory are no longer needed.
   CI installs only Chromium for Playwright.

6. **Speed budgets.** `npm run perf` stays out of `check`. Make it print a comparison with the
   stored baseline (`tests/perf-baseline.json`, with the machine name) and flag a change over
   25%. Absolute millisecond budgets on one PC proved unreliable.

7. **Command summary**, final:

   | Command | Runs | Time | When |
   |---|---|---|---|
   | `npm run check:fast` | types, lint, unit tests | ~10 s | after every edit round |
   | `npm run test:browser -- <feature>` | one feature's page tests | seconds | when that feature changed |
   | `npm run check` | everything | ~1–2 min | before "ship it"; on GitHub |
   | `npm run perf` | draw times against baseline | ~20 s | after touching map, timeline, graphs, render |

8. `tests/README.md` (short): how the harness works, the helpers, how to add a step, and the
   headless-Chrome facts from the testing memory that still apply (virtual time stands still
   during a script; poll for async results; do not dispatch pointer events on `document`).

## Done when

- `tests/more.js` and `tests/test.js` are gone. No test file exceeds about 600 lines.
- Every `tests/browser/*.js` passes alone and in the full run, three times in a row.
- The number of assertions has not gone down: count `assert(`/`eq(`/`expect(` before and after
  and put both numbers in the report.
- `npm run check` green locally and on GitHub.

## Owner check

None in the app (no app code changed). Read the report's before/after assertion counts.
