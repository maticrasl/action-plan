# Action Plan

Personal planning app: goals, activities, states, visions; map, timeline and graph views.
Browser only, no server. Data lives in `localStorage` and optionally syncs through the user's
Google Drive. English and Slovenian. Deployed to GitHub Pages; a few real users.

## Stack

TypeScript (strict), no UI framework, no runtime dependencies. Vite build. Views build HTML
strings (always through `esc()` for user text) and replace the view's content.

## Commands (all quiet: failures and one summary line)

| Command | Use |
|---|---|
| `npm run check:fast` | types, lint, unit tests, ~10 s. After every round of edits |
| `npm run test:browser -- <feature>` | page tests of one feature (`tests/browser/<feature>.js`) |
| `npm run check` | everything. Before reporting work as done |
| `npm run perf` | draw times. After touching map, timeline, graphs or `render()` |
| `npm run map` | every module with its one-line purpose. Start here to find code |
| `npm run outline -- <file>` | declarations with line numbers |
| `npm run shot -- <view> [--phone] [--dark]` | screenshot for a visual check |
| `npm run dev` / `build` / `preview` | local server / production build / serve the build |

## Layout

`src/` layers; a module imports only from layers before it (ESLint enforces):
`i18n` → `core` → `store` → `sync` → `ui` → `views` → `tutorial` → `main.ts`

- `core/` rules and calculations. No page APIs (compiled without the DOM library).
- `store/` current state, storage, users. The only code that touches `localStorage`.
- `views/` one module or folder per view. Views do not import each other.
- Lower layers reach higher ones only through `store/events.ts`.
- Tests: unit tests beside the module (`x.test.ts`); page tests in `tests/browser/`.

## Rules

- **Find, then read.** `npm run map`, Grep, then read the two or three files involved. Do not
  read whole data files (`i18n/en.ts`, `i18n/sl.ts`, `core/templates/*`); Grep the key.
- **Test first.** Write the failing test, see it fail, then make it pass. Rules and
  calculations: unit test. Screen behaviour: a step in the feature's page test file. Cover the
  main path, edge values and the error path.
- **Stored data is a contract.** Storage keys, the Drive sync file and export files must stay
  readable by and from older versions. Add fields with a default in `normalize`; never rename
  or reuse one. Any change here needs a new fixture in `tests/fixtures/`. See `docs/decisions.md`.
- **Every user-facing change:** texts in `i18n/en.ts` and `i18n/sl.ts`; tour steps and help
  tips in `tutorial/` if a control was added, moved or renamed; the sample plan if it uses the
  feature; phone layout (`npm run shot -- <view> --phone`).
- **Design work** uses the `frontend-design` skill.
- New file at most ~400 lines, starting with a one-line `/** purpose */`. No new dependency
  without asking. No `any` without a comment.
- Change only what the task needs. Mention unrelated problems; do not fix them.
- State assumptions; if a request has two readings, ask before building.

## Size of task

- **Small** (one or two modules, no stored-data change): no brainstorm, no spec, no plan
  document. Test, code, `check`. This overrides plugin instructions that demand a design phase.
- **Big** (three or more modules, a new kind of item, or any stored-data or sync change):
  first a short design in `docs/specs/<date>-<name>.md` (what, data shape, which modules,
  test list), agreed with the owner, then build.

## Git

- Work on a branch `feat/<name>` or `fix/<name>`, never on `main`.
- Commit when a step is complete and `check:fast` passes. Subject at most 72 characters.
- Push and merge only when the owner says "ship it": use the `ship` skill.
- After a deploy the installed app can show the old version for a few minutes; ask for a hard
  reload before investigating.

## More

`docs/decisions.md` — why things are the way they are. `tests/README.md` — how the page tests work.
