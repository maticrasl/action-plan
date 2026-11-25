# Action Plan

Personal planning app: goals, activities, states, visions; map, timeline and graph views.
Browser only, no server. Data lives in `localStorage` and optionally syncs through the user's
Google Drive. English and Slovenian. Deployed to GitHub Pages; a few real users.

## Priorities

The owner's order when choices compete: small files, automated tests, low token use.
- **Small files**: an agent reads only what it needs. ~400 lines is a guide, not a limit.
  Existing larger files are sized on purpose (recent refactor); leave them unless a task
  makes one clearly hard to work in, then propose a split instead of doing it unasked.
- **Automated tests** over manual checks: a test proves a change once and keeps proving it.
- **Quiet output**: commands print failures and one summary line. A new script or check
  follows that. Use `--verbose` or a default reporter only on the one failing file.
- **Cheap lookups**: `map`, `outline`, Grep with a narrow pattern, `Read` with offset and limit.
  Never dump whole files, logs or full test output into the conversation.

## Stack

TypeScript (strict), no UI framework, no runtime dependencies. Vite build. Views build HTML
strings (always through `esc()` for user text) and replace the view's content.

## Commands (all quiet: failures and one summary line)

| Command | Use |
|---|---|
| `npm run check:fast` | types, lint, unit tests, ~20 s. After every round of edits |
| `npm run test:browser -- <feature>` | page tests of one feature (`tests/browser/<feature>.js` and `<feature>.*.js`) |
| `npm run check` | everything (also fixtures, all page tests, Playwright), ~2 min. Before reporting work as done |
| `npm run perf` | draw times against `tests/perf-baseline.json`; flags a change over 25%, never fails. After touching map, timeline, graphs or `render()` |
| `npm run map` | every module with its one-line purpose. Start here to find code |
| `npm run outline -- <file>` | declarations with line numbers |
| `npm run shot -- <view> [--phone] [--dark]` | screenshot (`shots/`) for a visual check |
| `npm run move -- …` | moves declarations between files verbatim (usage at the top of `scripts/move-decls.mjs`). Never retype code to move it |
| `npm run dev` / `build` / `preview` | local server / production build / serve the build |

## Layout

`src/` layers; a module imports only from its own layer and those before it (ESLint enforces):
`i18n` → `core` → `store` → `sync` → `ui` → `views` → `tutorial` → main (`main.ts`, `boot.ts`)

- `core/` and `i18n/` rules and calculations, compiled without page APIs (`tsconfig.core.json`).
- `store/` current state, storage, users. Storage goes through `userStorage`/`userSession`
  (`store/users.ts`, which adds the user's key prefix); ESLint forbids `localStorage` elsewhere.
- `views/` one module or folder per view. Views do not import each other: shared pieces sit
  directly in `src/views/`. The few links between map, timeline and graphs are listed in `eslint.config.js`.
- A lower layer reaches a higher one only through what `main.ts` connects: `store/events.ts`,
  `ui/render.ts`, `connectSync`, `onRendered`.
- Only `main.ts` runs code at load time (imports may be circular). Reassigned state is
  `export let` plus a setter in its owning module; others change it only through the setter.
- Texts: `i18n/en.ts`, `i18n/sl.ts` (SL must have every EN key; the compiler checks). Sample
  plan: `ui/sample.ts` with its texts in the i18n files. Getting started (walkthrough):
  `core/guidance/walk.ts` (tasks, checks), `tutorial/walkthrough.ts`; help tips: `tutorial/help.ts`.
- Tests: unit tests beside the module (`x.test.ts`, Node); a module that touches `document`
  while loading (most of `views/`, `ui/`) is tested by page tests in `tests/browser/`. See `tests/README.md`.

## Rules

- **Find, then read.** `npm run map`, Grep, then read the two or three files involved. Do not
  read whole data files (`i18n/en.ts`, `i18n/sl.ts`, `core/templates/*`); Grep the key.
- **Test first.** Write the failing test, see it fail, then make it pass. Rules and
  calculations: unit test. Screen behaviour: a step in the feature's page test file. Cover the
  main path, edge values and the error path.
- **Stored data is a contract.** Storage keys, the Drive sync file, export and backup files must
  stay readable by and from older versions. Add fields with a default in `core/normalize.ts`;
  never rename or reuse one. A change here needs a fixture in `tests/fixtures/` written by the
  old code. Never regenerate a fixture's expected output to make it pass. See `docs/decisions.md`.
- **Every user-facing change:** texts in `i18n/en.ts` and `i18n/sl.ts`; Getting started's tasks and
  help tips if a control was added, moved or renamed; the Guide's articles (`i18n/guide.en.ts`,
  `guide.sl.ts`) that describe it; the sample plan if it uses the feature; phone layout
  (`npm run shot -- <view> --phone`).
- User-facing guidance follows the voice rules in `docs/guidance/README.md`.
- **Design work** uses the `frontend-design` skill.
- New file at most ~400 lines (data files exempt), starting with a one-line `/** purpose */`.
  No new dependency without asking. No `any` without a comment.
- A hook formats each edited file in `src/` and `tests/` with Prettier. Do not run Prettier
  on other files (`.prettierignore`): they were never formatted.
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
- Push only through `/ship`, which the owner types ("ship it" in other words: ask them to type
  `/ship`). Claude never merges: GitHub does. `.github/workflows/auto-merge.yml` squash-merges
  the owner's pull request once `check` passes on it (not a draft), then starts `deploy`.
- During `/ship`, this project adds:
  - Before pushing: `npm run check` passes; never `--no-verify`. Never ship from `main`.
  - A check that fails on GitHub but passed locally: read `tests/ci-skip.txt` and
    `gh run view <id> --log-failed` before changing anything; report, do not retry blindly.
  - Once merged: the `deploy` workflow runs on the merge commit (started by auto-merge.yml). Find it with
    `gh run list --workflow deploy.yml --branch main --limit 3 --json databaseId,headSha,status`
    and `gh run watch <id> --exit-status`; report its result with: "The installed app can show
    the old version for a few minutes: hard-reload (Ctrl+Shift+R) before checking."
  - Then back to `main`: `git switch main` and `git pull --ff-only` (if `main` is checked out
    in another worktree: `git fetch origin` and `git switch --detach origin/main`).
- After a deploy the installed app can show the old version for a few minutes; ask for a hard
  reload before investigating.

## More

`docs/decisions.md`: why things are the way they are. `tests/README.md`: how the tests work.
