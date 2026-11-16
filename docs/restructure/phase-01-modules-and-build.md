# Phase 1 — ES modules and a build

**Goal:** the same ten source files, now ES modules with explicit imports, bundled by Vite and
deployed by GitHub Actions. No file is split yet. This is the riskiest phase: it changes how
the app is loaded and delivered. Take it slowly; split it into two sessions at step 6 if needed.

## The situation

- Ten classic scripts share one global scope, loaded in this order (`index.html:287`):
  `i18n, config, templates, tutorial, sync, users, visions, drive, backup, app`.
  `backup.js` runs nothing at load time except registering two listeners on `document`.
- The suite's scripts are classic too and use about every app global by bare name. A few are
  assigned from tests: `db`, `plans`, `visions`, `theme`, `lang`, `offerTour`.
- Reassigned state in the app: `db` (8 places in `app.js`, 1 in `drive.js`), `plans` (4 + 1),
  `visions` (3, in `visions.js`), `lang`, `users`, `otherPlansCache`, `plansVersion`,
  `visionsVersion`, `theme`. Find all with the compiler in step 4.
- `app.js` ends with boot statements (`applyStaticI18n()` … `initSync()`, from line 6114) and
  registers about 116 listeners at load time.

## Steps

1. **Install** `vite`, `typescript`, `eslint`, `typescript-eslint`, `prettier` as development
   dependencies. `tsconfig.json`: `strict`, `allowJs: true`, `checkJs: false`, `noEmit`,
   `moduleResolution: "bundler"`, target ES2022. Prettier config only; do **not** format
   existing files in this phase.

2. **Move files with `git mv`** (history is kept):
   `js/*.js` → `src/legacy/`, `css/styles.css` → `src/styles/styles.css`,
   `icons/`, `manifest.webmanifest` → `public/`. `index.html` stays at the root.
   `sw.js` → `src/sw.js` (see step 7).

3. **Codemod: `scripts/to-modules.mjs`** (one-off; delete it at the end of the phase). Using the
   TypeScript compiler API to parse each file:
   - put `export` in front of every top-level `function`, `const`, `let`, `class`;
   - build a map *name → defining file*;
   - for each file, list identifiers that are used but not declared in it and are in the map,
     and write the `import { … } from './x.js'` lines.
   Run ESLint with `no-undef` over `src/legacy` afterwards: every report is either a browser
   global missing from the ESLint environment or a name the codemod missed. It must end at zero.

4. **Reassigned state.** `tsc` reports every assignment to an imported binding (error TS2632).
   For each such variable add a setter beside its declaration (`export function setDb(v) { db = v; }`)
   and replace the cross-file assignments. Assignments inside the owning file stay as they are.

5. **Boot moves to `src/main.ts`.** Cut the boot statements from the end of `app.js` into
   `main.ts`, which first imports the ten modules **in the old script order**. Then apply
   RULES §8: search every legacy file for top-level statements that *call* something from
   another file while loading, and move those calls into an `init…()` function called from
   `main.ts` in the old order.
   - Why: modules that import each other in a circle (most of these do) load in an order set by
     the import graph. A load-time call into a module that has not finished loading fails with
     `Cannot access 'X' before initialization`. No tool reports this in advance; the suite and
     a plain page load do. If you see that error, this is the cause.

6. **`index.html`:** replace the ten script tags with
   `<script type="module" src="/src/main.ts"></script>`; point the stylesheet link at
   `/src/styles/styles.css`. Keep the inline theme script in `<head>` exactly as it is.
   `vite.config.ts`: `base: './'` (the site is served under `/action-plan/`), source maps on.
   `npm run dev`, `npm run build`, `npm run preview`.

7. **Service worker.** Keep its logic (network first for own files, cache first for fonts).
   Two things must be generated at build time by a small Vite plugin in `vite.config.ts`:
   the `SHELL` list (built file names now contain a hash) and the `CACHE` name (derive it from
   the build so old caches are dropped on activate). The worker file itself must be served as
   `sw.js` at the site root, unhashed. Check where the app registers it and keep that path.

8. **Test bridge: `src/test-bridge.ts`**, included only in the test build.
   - Imports every legacy module as a namespace and defines, for each export, a property on
     `window`: a getter that returns the live value, `configurable: true`. For the reassigned
     state it also defines a setter that calls the module's setter. For any other name the
     setter throws `test assigns <name>: add a setter`, so nothing fails silently.
   - `offerTour` is replaced by a test: give it a setter the same way.
   - After the app has booted, the bridge appends the classic test scripts in order
     (`more.js`, then `test.js`), so they run after the modules and see the globals.
   - `tests/pre.js` must still run before any app code: keep it a classic script in `<head>`
     of the test page.
   - Test page: `test.html` and `perf.html` as extra Vite entries, built by
     `vite build --mode test` into `dist-test/`, unminified.
   - `scripts/run-suite.mjs` now builds the test bundle, serves `dist-test/` on a local port
     (Node's `http` module is enough), and points Chrome at `http://localhost:<port>/test.html`
     with the same `--virtual-time-budget` and `--dump-dom` flags.
   - If Chrome's virtual time does not wait for the module or the appended scripts over HTTP
     (symptom: `NO RESULT`), fall back to building the test bundle as one classic IIFE file
     and loading it from `file://` as before. Decide by trying; note the outcome in `STATUS.md`.
   - Edits allowed in the suite this phase: none in `more.js`/`test.js`. If a step needs one,
     the bridge is incomplete.

9. **`npm run check`** = `tsc --noEmit` + `eslint` + `test:fixtures` + `test:browser`.
   ESLint: recommended rules only, `no-undef` on, style rules off. Fix nothing cosmetic.

10. **Deploy workflow: `.github/workflows/deploy.yml`.** On push to `main`: run the `check`
    job, then build and publish `dist/` with the official Pages actions (check their current
    versions and required permissions in GitHub's documentation). **Ask the owner now** to
    switch Pages to "GitHub Actions" (`OWNER.md`); the switch and this merge belong together.

11. **Upgrade test** (by hand this phase; automated in phase 9). Serve the `pre-restructure`
    tag's files on a local port, open the app in Chrome, load the sample plan, let the old
    service worker install. Stop the server, serve `dist/` on the **same port**, reload twice.
    The app must start, show the same plan, and the old cache must be gone
    (DevTools → Application → Cache storage). Then go offline and reload: it must still start.

12. Delete `tests/run.sh` and `scripts/to-modules.mjs`. Update the interim `CLAUDE.md` block
    (paths, `npm run dev|build|preview`).

## Done when

- `npm run check` green locally and on GitHub; `npm run perf` within about 20% of the phase 0 baseline.
- No `<script src="js/…">` remains; `src/legacy/` holds the ten files; `dist/` works under a
  sub-path (open `dist/index.html` through `npm run preview`).
- Upgrade test passed.

## Owner check

The standard check from `OWNER.md`, plus after "ship it": on your **phone**, open the installed
app twice (the second start picks up the update), confirm your plans are there, then switch to
flight mode and open it again.
