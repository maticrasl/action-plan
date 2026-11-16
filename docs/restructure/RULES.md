# Rules for every restructuring phase

Read this and `STATUS.md` first, then only your phase file. Do not read other phase files.

## 1. Behaviour is frozen

- No feature, wording, layout or styling change. The app must look and act the same after each phase.
- A bug you find goes into `docs/restructure/found-bugs.md` (one line: where, what). Do not fix it,
  unless it blocks the phase; then fix it in its own commit and say so in the report.

## 2. Stored data is frozen

Other people's plans are in these places. Names and formats must not change:

- `localStorage`: `actionplan.v1`, `actionplan.v1.<preference>`, `actionplan.plans`,
  `actionplan.plan.<id>`, `actionplan.visions`, `actionplan.users`, `actionplan.lang`, and the
  same keys under `actionplan.u.<userId>.` for later users
- `sessionStorage`: `actionplan.syncToken`
- Google Drive app folder: `actionplan-sync.json`, format `actionplan-sync`
- Exported plan files (full copy and template)
- Full backup files (`js/backup.js`): the sync file's format with `kind: 'backup'` and `exportedAt`

The fixture test from phase 0 (`npm run test:fixtures`) proves this. It must pass at every commit.
Never regenerate a fixture's expected output to make it pass.

## 3. Moving and typing are separate commits

- **Move commit:** code goes to its new file by `scripts/move-decls.mjs` (from phase 2), verbatim.
  Only `import`/`export` lines and setter calls change by hand. Suite passes. Commit.
- **Type commit:** add types, run Prettier on the new file, fix what the compiler finds. Suite
  passes. Commit.
- Never retype moved code from memory or from a read. If the tool cannot move something, extend
  the tool.

## 4. Tests are the referee

- `npm run check` passes before every commit. A commit that needs `--no-verify` is not made.
- In phases 1–8 the in-page suite (`tests/more.js`, `tests/test.js`) is not edited, apart from
  what the phase file names. If a step fails, the app code is wrong, not the step.
- Two failed attempts at the same failure without understanding it: stop, write what you know
  into `STATUS.md`, report to the owner.

## 5. Read little

- Never read `app.js`, `more.js`, `i18n.js` or `templates.js` whole. Use
  `npm run outline -- <file>` (declarations with line numbers, from phase 0), Grep, and
  `Read` with `offset`/`limit`.
- Run commands in their quiet form. They print failures and one summary line. Use `--verbose`
  only to study one failure.
- Do not paste file contents or long command output into your reports.

## 6. Dependencies

- The shipped app has no runtime dependencies. Keep it so.
- Development dependencies allowed without asking: `typescript`, `vite`, `vitest`, `eslint`,
  `typescript-eslint`, `prettier`, `@playwright/test`, and one import-boundary plugin for ESLint.
  Ask before adding any other.
- Install the current stable versions and commit `package-lock.json`. Where this plan names a
  tool option or a GitHub Action, check its current documentation; do not rely on memory.

## 7. Git and releases

- One branch per phase: `restructure/phase-NN`. Small commits with a subject line of at most
  72 characters and, if needed, a few bullet lines.
- Do not push, open a pull request or merge until the owner says so ("ship it"). Then: push,
  `gh pr create`, `gh pr merge --auto --squash --delete-branch`, wait for the checks and the
  deploy, report the result.
- Tag `main` before each phase merges: `before-phase-NN`.

## 8. Module rules (from phase 1)

- No module runs code that calls into another module while it loads. Only `src/main.ts` boots.
  (Modules that import each other in a circle are loaded in an order you do not control; a call
  at load time then hits a constant that does not exist yet.)
- Listener registration at load time is fine: the callback runs later.
- State that is reassigned (`db`, `plans`, `visions`, `lang`, …) is exported with `export let`
  from its owning module together with a setter. Other modules read it through the import and
  change it only through the setter.
- A new file is at most about 400 lines. Data files (translations, templates) are exempt.
- Every module starts with a one-line `/** … */` saying what it is for. `npm run map` prints
  these lines as the project's table of contents.

## 9. End of every session

1. `npm run check` output (summary line) in the report.
2. Update `STATUS.md`: phase state, what was left open, anything the next phase must know
   (at most 15 lines; replace the previous notes, do not append a diary).
3. Give the owner the click-through list from the phase file and wait.
