# Phase 0 — Baseline and safety net

**Goal:** tools and safety checks exist; the app's files are untouched; `npm run check` is green.

**Ask the owner first:** Node and `gh` installed? Repository public? Worktree removed?
(`OWNER.md`, "Before phase 0".)

## Steps

1. **Branch and tag.** Tag `main` as `pre-restructure`. Branch `restructure/phase-00`.

2. **`package.json`** (`"private": true`, `"type": "module"`), no dependencies yet. `.nvmrc`
   with the installed Node major version. `.gitignore`: `node_modules/`, `dist/`, `dist-test/`,
   `.claude/worktrees/`, `.claude/settings.local.json`, `tests/fixtures/private/`.
   Commit `CLAUDE.md` as it is.

3. **Quiet suite runner: `scripts/run-suite.mjs`**, replacing `tests/run.sh` and its Python
   part. Plain Node, no packages. Same behaviour as `run.sh`: copy the app and tests to a temp
   folder, inject the test scripts, run headless Chrome with the same flags, read `<pre id="OK">`.
   - Chrome path: `CHROME` environment variable, else the Windows default path, else
     `google-chrome` (Linux, for CI).
   - Output by default: every `FAIL` line and the errors block, then one line:
     `suite: 219 steps, 0 failed, errors: none`. `--verbose` prints everything.
   - Exit code 0 only if nothing failed.
   - `npm run test:browser`. Keep `tests/run.sh` until phase 1, then delete it.

4. **Speed budgets leave the gate.** `tests/perf.js` runs by `npm run perf` only, prints the
   same lines, and never fails `check`. Reason: budgets are real-time and fail on unchanged
   code (`1,100 amounts: state form` has failed since 2026-11-08; see the testing memory).
   Record today's numbers in `STATUS.md` as the baseline to compare against after phases 7 and 8.

5. **Outline tool: `scripts/outline.mjs`.** Prints the top-level declarations and section
   comments (`/* ---------- … */`) of a file with line numbers. Regex is enough for now
   (declarations start at column 0). `npm run outline -- js/app.js`. Use it from now on
   in place of reading large files.

6. **Stored-data fixtures.** These must be written by the **current** code, before anything moves.
   - A generator page-script (run through the suite runner with a flag) that builds each
     situation with the app's own functions and dumps all of `localStorage` as JSON into
     `tests/fixtures/<name>.storage.json`:
     1. `sample-en`: fresh device, sample plan loaded, English
     2. `sample-sl`: same in Slovenian
     3. `legacy-single`: only the old single-plan key `actionplan.v1` set (find the format in
        `load()`, `js/app.js:83`), so the migration path is covered
     4. `two-users`: a first user and a second user with an account record, each with plans,
        visions and preferences (see `js/users.js` for the key prefix rule)
     5. `rich`: one plan using every feature: sub-goals, dependencies, routines of each repeat
        kind with check-ins and list items, make-up days, cumulative states with entries,
        measurement history, visions with parents, tombstones in `deleted`
   - Also store what the app produces from `rich`: the Drive sync payload (the object
     `js/drive.js` uploads) as `rich.sync.json`, both export kinds as `rich.export-full.json`
     and `rich.export-template.json`, and the full backup (`backupFile()` in `js/backup.js`) as
     `rich.backup.json`.
   - **The test** (`npm run test:fixtures`, part of `check`): for each storage fixture, load it
     into storage, boot the app, open every view, call `save()`, dump storage again. The dump
     must equal the fixture. For `legacy-single`, generate the expected migrated dump now and
     store it as `legacy-single.expected.json`. Sync payload, exports and the backup are compared the same
     way; restoring `rich.backup.json` into an empty device must give back its plans and visions. Where timestamps or ids are generated at run time, pin them in the fixture script
     (stub `Date` and the id source); do not blank them out in the comparison.
   - If the owner provides a real export, put it in `tests/fixtures/private/` (ignored by git);
     the test picks up any file there and checks import → export round-trips unchanged.

7. **`npm run check`** = `test:fixtures` + `test:browser`. Later phases add steps in front.

8. **CI: `.github/workflows/check.yml`.** On every push and pull request: check out, set up
   Node from `.nvmrc`, `npm ci`, `npm run check`. Job name `check` (the owner's merge rule
   refers to it). Set `TZ: Europe/Ljubljana`.
   - The suite has only ever run on this Windows PC. If steps fail on GitHub's Linux Chrome
     for rendering reasons (font metrics, sizes), do not chase them now: add a skip list for CI
     in the runner, list the skipped steps in `STATUS.md`, and keep them gating locally.

9. **Interim `CLAUDE.md` block** at the top of the existing file:

   ```markdown
   ## Restructuring in progress — feature freeze
   Follow `docs/restructure/RULES.md`. No features until `docs/restructure/STATUS.md` says done.
   Commands: `npm run check` (all checks, quiet), `npm run outline -- <file>`, `npm run perf`.
   Never read `js/app.js` or `tests/more.js` whole.
   ```

10. **`STATUS.md`**: phase table, perf baseline, CI skip list, notes.

## Done when

- `npm run check` exits 0 locally, three times in a row (no flaky step).
- The same run is green on GitHub.
- `git diff pre-restructure -- index.html css js sw.js manifest.webmanifest` is empty.

## Owner check

Nothing to click: the app's files did not change. After the first green run on GitHub, set the
two GitHub options from `OWNER.md` (auto-merge, ruleset). From phase 1 on, merges go through them.
