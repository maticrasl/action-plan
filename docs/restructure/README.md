# Restructuring Action Plan

Written 2026-11-14 against commit `5b71e59`. Line numbers in the phase files refer to that commit.

Added 2026-11-16, before phase 0: the full backup (`js/backup.js`, a tenth script, loaded between
`drive.js` and `app.js`). `app.js` did not change, so its line numbers still hold. The phase files
were corrected for the tenth file and for the two shifted references (`index.html:287`,
`i18n.js:1818`); `tests/more.js` grew by one step (194) and 127 lines.

## Files in this folder

| File | For | What it is |
|---|---|---|
| `README.md` | both | This overview: findings, decisions, phase list |
| `OWNER.md` | Matic | What you install, click and check; how to run each phase; glossary |
| `RULES.md` | Opus | Rules that hold in every phase. Read at the start of every session |
| `STATUS.md` | both | Created in phase 0. Which phase is done, plus hand-over notes |
| `phase-00` … `phase-10` | Opus | One file per session. Only the current one is read |
| `target-CLAUDE.md` | both | The `CLAUDE.md` the project ends with (installed in phase 10) |
| `memory-changes.md` | both | What to do with each existing memory file |

## What was found

| Fact | Number | Why it costs tokens |
|---|---|---|
| `js/app.js` | 6,121 lines, ~90k tokens, 289 functions | Any change needs large reads to find what it touches |
| `tests/more.js` | 7,874 lines, ~135k tokens, 193 steps | Every new test is appended here and read around |
| Scope | 10 classic `<script>` files sharing one global scope | No tool can say what depends on what, so the model must search |
| Checks | Only the full browser suite: 32 s, 242 lines (~6k tokens) per run | Printed in full on every run, also when everything passes |
| Tooling | No Node.js, type checker, linter, formatter or CI | Every mistake is found by the slow suite or by reading |
| Speed budgets | `1,100 amounts: state form` fails (127 ms, budget 100 ms) | The suite exits with an error on unchanged code |
| Releases | Push to `main` is live for all users at once | No check stands between a mistake and real data |

What is good and stays: the code is commented and sectioned, the domain logic is mostly free of
page code, the tests are thorough (about 2,200 assertions), and the app ships with no third-party
code.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Language | TypeScript, strict | The compiler finds cross-file mistakes in seconds with a few lines of output. Types are removed at build time; browsers still get JavaScript |
| UI framework | None. Views keep building HTML strings | The hard parts (map layout, timeline, graphs) are custom drawing a framework does not help with. A framework means rewriting the screens and most of the 142 page-driven tests |
| Build | Vite | Bundles modules, serves the app locally, needs almost no configuration |
| Unit tests | Vitest | Runs pure logic in Node in 1–2 s, one file at a time |
| Page tests | The existing in-page suite, kept and later split by feature | It is fast and thorough. Rewriting it buys nothing |
| Browser automation | Playwright, for a handful of checks only | Phone viewport, offline start, upgrade from the old version, screenshots |
| Lint and format | ESLint with typescript-eslint, Prettier | Rules are enforced by tools, not by prompt text |
| Runtime dependencies | Still none | Nothing to audit or update in what users download |
| Hosting | GitHub Pages, deployed by GitHub Actions | Same address, so stored data and Google sign-in keep working |
| Releases | Branch → pull request → automatic checks → automatic merge → deploy | Claude does all of it on your word "ship it" |
| Method | Step by step, old suite passing after every step | No big-bang rewrite. You can stop between any two phases |
| Moving code | By script, verbatim, never retyped by the model | Cheaper, and nothing changes by accident |

### Your future plans and what they mean for the stack

- **A server of your own.** `src/core` (data model, rules, merge) is compiled without access to
  page APIs, so the compiler proves it can run on a server. When the server comes, write it in
  TypeScript too (the planned Cloudflare Worker already is JavaScript) and share `src/core`
  with it. Nothing is built for this now.
- **App stores.** An installable web app can be wrapped for Google Play and the App Store later
  without changing the stack. Check the current wrapping tools when you decide.
- **More languages.** Phase 2 gives each language its own file.

## Target layout

```
index.html
public/                 icons, manifest (copied as they are)
src/
  main.ts               boot: the only place that runs code at load time
  i18n/                 t(), tp(); en.ts, sl.ts, sample plan texts      (no page APIs)
  core/                 model types, dates, relations, progress, routines,
                        cumulative states, visions rules, merge, normalize,
                        templates                                        (no page APIs)
  store/                users, current plan and plan list, preferences, save/load
  sync/                 Google Drive client, sync scheduling
  ui/                   page helpers, toast, dialogs, calendar, forms, menus,
                        settings, plan switcher, import/export, theme, install
  views/                dashboard, goals, activities, states, visions,
                        map/, timeline/, graphs/
  tutorial/             tour, help mode
  styles/               one CSS file per area
  test-bridge.ts        test build only: lets the in-page suite reach modules
tests/
  browser/              in-page suite, one file per feature
  fixtures/             stored-data snapshots written by the old version
  e2e/                  Playwright checks
scripts/                suite runner, code-move tool, module map
```

A module may import only from layers above it in this list:
`i18n` → `core` → `store` → `sync` → `ui` → `views` → `tutorial` → `main`.
ESLint enforces it from phase 8.

## Phases

One Opus session each. Phases 3, 5 and 7 are the largest and may take two.

| # | File | Result | Risk |
|---|---|---|---|
| 0 | `phase-00-baseline.md` | Node, quiet test runner, stored-data fixtures, CI. No app change | low |
| 1 | `phase-01-modules-and-build.md` | Same 9 files as ES modules, Vite build, deploy by Actions | **high** |
| 2 | `phase-02-core-leaves.md` | Move tool, Vitest, first typed modules: i18n, dates, model types | medium |
| 3 | `phase-03-core-domain.md` | Relations, progress, routines, cumulative, visions, merge, templates | medium |
| 4 | `phase-04-store-and-sync.md` | Users, plan state, preferences, Drive client | medium |
| 5 | `phase-05-shared-ui.md` | Dialogs, forms, calendar, menus, settings, import/export | medium |
| 6 | `phase-06-views-and-tutorial.md` | Dashboard, goals, activities, states, visions, tour | medium |
| 7 | `phase-07-map-timeline-graphs.md` | The three drawing views and their gestures | medium |
| 8 | `phase-08-close-out.md` | Legacy folder gone, strict everywhere, layers enforced, CSS split | low |
| 9 | `phase-09-tests.md` | Suite split by feature, pure steps as unit tests, Playwright checks | medium |
| 10 | `phase-10-workflow.md` | Final `CLAUDE.md`, memory, hook, `ship` skill, short docs | low |

## What to expect afterwards

- A typical change reads 2–4 files of 100–400 lines, not parts of a 6,000-line file.
- `npm run check:fast` (types, lint, unit tests) answers in about 10 s and prints only failures.
- Page tests run per feature; the full suite runs before a release and on GitHub.
- Token use per task should fall severalfold. This is an estimate from the file sizes, not a
  measurement. Phase 10 records real numbers for one comparable task.
