# Tests

| Command | Runs | Time | When |
|---|---|---|---|
| `npm run check:fast` | types, lint, unit tests | ~20 s | after every edit round |
| `npm run test:browser -- <feature>` | one feature's page tests | seconds | when that feature changed |
| `npm run check` | everything (also fixtures and `test:e2e`) | ~1–2 min | before "ship it"; on GitHub |
| `npm run perf` | draw times against `tests/perf-baseline.json` | ~20 s | after touching map, timeline, graphs, render |

Also: `npm run test:e2e` (Playwright alone), `npm run shot -- <view> [--phone] [--dark]` (a full-page PNG
in `shots/`), `npm run perf -- --save` (a new baseline for this machine), `npm run test:browser -- --verbose`.

## Where tests live

- **Unit tests** (`src/**/*.test.ts`, Vitest, Node): pure logic beside its module, with explicit dates and
  Vitest's fake timers. Store tests put `src/store/memory-storage.ts` where the page has `localStorage`.
  Modules that touch `document` while loading (most of `views/`, `ui/`) cannot be loaded here.
- **Page tests** (`tests/browser/<feature>.js`): in the test build, in headless Chrome, one fresh page and
  profile per file. `npm run test:browser -- map` runs `map.js` and `map.*.js`. Each file passes alone.
- **Playwright** (`tests/e2e`): what a page cannot test about itself: a phone (390×844, touch), offline,
  upgrading from the `pre-restructure` app. On the production build in `dist/`.
- **Fixtures** (`npm run test:fixtures`): stored data, files and sync formats stay readable. Never
  regenerate an expected output to make it pass.

## The page harness

`browser.html?f=<file>` is the built app with `tests/pre.js` before it and `tests/browser/harness.js` after
it. `pre.js` clears storage, sets English and no tour, stubs `requestAnimationFrame`, `confirm` and
`prompt`, and pins the calendar: the clock is shifted to start at Wednesday 18 November 2026, noon. The
test bridge (`src/test-bridge.ts`, test build only) puts every module export on `window`; assigning one
needs a `setX` export in its module.

A file is `suite(async () => { await step('name', () => { … }); … })`. A step passes unless it throws; what
it returns is shown with `--verbose`. Helpers (global): `assert(cond, msg)`, `eq(got, want, msg)`,
`fresh(name)` (a new empty plan), `mk(kind, fields)` (a new item), `rel(a, b, type)`, `d(n)` (a date n
days from today), `tick()`, `fp()`, `fontsLoaded(doc)`, and shared fixtures (`progressPlan`, `addPlan`,
`capture`, `mkV`, …). The runner loads the app's typeface before the first step; a step that measures text
in an iframe (`css/styles.css`) awaits `fontsLoaded(frame.contentDocument)` after its `load`.

To add a step: put it in its feature's file; build what it needs (`fresh`, `mk`, `loadSample()`) instead
of relying on an earlier step, and leave no dialog open. To prove it catches the bug, break the code, see
it fail, restore. `npm run move-steps` moves steps between files byte for byte.

## Headless Chrome facts that still apply

- Virtual time (`--virtual-time-budget`) stands still while a script runs: a loop measures 0 ms. Draw
  times belong in `tests/perf.js`, which runs on real time.
- Poll for async results (file reads, imports) instead of waiting a fixed time.
- Don't dispatch pointer events on `document` itself: handlers call `e.target.closest`.
- `focus()` does nothing while a modal dialog is open elsewhere; a step that leaves one open breaks the
  focus checks after it.
- Phone layouts at 390 px: use Playwright (`tests/e2e`, `npm run shot -- <view> --phone`); the page
  tests run at 1280 px.
- On CI (Linux fonts) the steps in `tests/ci-skip.txt` run but do not count.
