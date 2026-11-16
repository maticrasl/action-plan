# Phase 8 — Close out the code

**Goal:** no legacy folder, the rules are enforced by tools, styles are split.

## Steps

1. **Boot.** What is left of `src/legacy/app.js` (`bootUser`, `enterUser`, the boot
   statements) goes to `src/main.ts`, or `src/boot.ts` imported by it if it is over about 150
   lines. Delete `src/legacy/`. Remove `allowJs` from `tsconfig.json`.

2. **Strictness.** `strict` is already on. Add `noUncheckedIndexedAccess` only if it produces
   fewer than about 50 errors; otherwise record it as a later option. ESLint:
   `@typescript-eslint/no-explicit-any` as an error; each remaining `any` either gets a type or
   a one-line comment saying why not.

3. **Layer rule.** Add an import-boundary rule to ESLint for the order in `README.md`
   (`i18n` → `core` → `store` → `sync` → `ui` → `views` → `tutorial` → `main`), plus: views do
   not import each other; `src/test-bridge.ts` is imported by nothing. Fix violations by
   moving the shared piece down a layer, not by adding exceptions. Report any exception you
   had to keep.

4. **Circular imports.** List them (the boundary plugin or `madge`-style output from a tiny
   script over the compiler API; no new dependency without asking). Within one layer a cycle
   between two files usually means they are one module, or a third file is missing. Fix the
   cheap ones; list the rest in `STATUS.md`. Do not start a redesign.

5. **Dead code.** Run the compiler with `noUnusedLocals`/`noUnusedParameters` and ESLint's
   unused-exports check once. Exports used only by the test bridge are not dead. Remove what
   is truly unused, in its own commit, listing each removed name. If unsure about one, leave
   it and list it.

6. **Styles.** `src/styles/styles.css` (1,403 lines) is already divided by
   `/* ---------- … ---------- */` headers (Shell, Controls, Cards, Overview, Board, Routines,
   Map, Visions, …). Split it along those headers into files, with `src/styles/index.css`
   importing them **in the same order**. Order is behaviour in CSS: later rules win. Do not
   reorder, merge or rename anything. Verify: the built CSS before and after the split is
   identical apart from whitespace (compare the two `dist/assets/*.css` after normalising).

7. **Format everything once.** Run Prettier over `src/` and `tests/` in one commit that
   contains nothing else, and add that commit's hash to `.git-blame-ignore-revs`.

8. **`npm run map`** output: check that every module has its one-line description and that
   each says what the module is *for*.

## Done when

- `npm run check` green; `npm run perf` within the phase 0 limit.
- `src/legacy` does not exist. No file under `src/` except data files exceeds about 400 lines,
  apart from the exceptions listed in `STATUS.md`.
- ESLint reports zero boundary violations.

## Owner check

Standard check. Styles were split, so look at every view once in light and in dark theme, and
at phone width.
