# Phase 2 — Move tool, unit tests, first typed modules

**Goal:** the tools every later phase uses, proven on the easiest code: translations, date and
small helpers, and the data model's types.

## Steps

1. **Move tool: `scripts/move-decls.mjs`.** This is what keeps the remaining phases cheap and safe.
   `node scripts/move-decls.mjs <from> <to> <name> [<name> …]`
   - Parses `<from>` with the TypeScript compiler API. For each named top-level declaration,
     cuts it with its leading comments, byte for byte, and appends it to `<to>` (creating it).
   - Accepts `--section "<header text>"` to move everything under one `/* ---------- … */`
     header up to the next header.
   - Prints: imports `<to>` now needs, imports `<from>` now needs from `<to>`, and other files
     whose imports must change. With `--fix-imports` it rewrites those import lines itself.
   - `--check`: verifies the move was verbatim, by comparing the moved text in `<to>` with the
     same text in `git show HEAD:<from>`.
   - Add the new module to `src/test-bridge.ts` (the bridge imports every module; consider
     generating that list from the `src/` folder so it cannot be forgotten).

2. **Upgrade `scripts/outline.mjs`** to the compiler API (same output), and add
   `scripts/map.mjs` (`npm run map`): prints each file under `src/` with its line count and its
   first-line `/** … */` description.

3. **Vitest.** `npm run test:unit` (quiet reporter). `npm run check:fast` = `tsc` + `eslint` +
   `test:unit`. `check` = `check:fast` + `test:fixtures` + `test:browser`.

4. **`src/core` cannot use page APIs.** Give `src/core` and `src/i18n` their own
   `tsconfig` (project reference or a second `tsc -p` in `check:fast`) with
   `"lib": ["ES2022"]` and no `"DOM"`. From now on the compiler rejects `document`, `window` or
   `localStorage` in these folders. This is what lets a future server reuse them.

5. **i18n → `src/i18n/`.**
   - `en.ts`, `sl.ts`: one language each (strings and sample plan). The `I18N` object in
     `index.ts` is assembled from them, same shape as today (tests read `I18N.en.strings`,
     `I18N.en.sample`).
   - `index.ts`: `lang`, `setLanguage`, `locale`, `t`, `tp`, `lookup`, `fill`.
   - `detectLang` reads `localStorage` and `navigator`, and `applyStaticI18n` walks the page:
     both go to `src/ui/i18n-dom.ts`, with `lang` initialised from `main.ts`. Check what runs at
     load time today (`let lang = detectLang()` at `i18n.js:1818`) and keep the order.
   - Type the string table so that `t('no.such.key')` is a compile error: derive the key type
     from `en.ts`, and type `sl.ts` as the same key set. The suite's parity step keeps passing;
     the compiler now enforces the same thing earlier.

6. **`src/core/model.ts`.** Types for `Goal`, `State`, `Activity`, `Relation`, `Db`, `Plan`,
   `PlanList`, `Vision`, `Repeat`, status unions, and the constants from `app.js:12-34`
   (`KINDS`, `REL_TYPES`, `ACYCLIC`, `VISION_RELS`, `PARENT_REL`, the status lists), plus
   `emptyDb`. Derive field lists from `normalize()` and the form code, not from guesses:
   every optional field that exists in stored data must be in the type. The `rich` fixture is
   the reference; add a unit test that type-checks it (`satisfies Db`).
   - `REL_TYPES` holds CSS colour strings. They are plain data; leave them.

7. **`src/core/dates.ts` and `src/core/util.ts`** from the "Utilities" section
   (`app.js:222-306`): only what is pure (dates, `uid`, `clamp`, number parsing, `esc` stays
   for `ui`). Page helpers (`$`, `viewEl`) stay in legacy until phase 5.
   - `today()` reads the clock. Keep that, and write unit tests with Vitest's fake timers.

8. **First unit tests**, new files beside the modules (`dates.test.ts`, `i18n/index.test.ts`):
   plural rules in both languages, date arithmetic over month ends, year ends and the two
   clock-change days. These are new tests; legacy steps are not removed yet (phase 9).

## Done when

- `npm run check` green. `src/legacy/i18n.js` is gone; `app.js` is shorter by the moved parts.
- `npm run check:fast` runs in about 10 s or less and prints one summary line when green.
- Every move commit passes `move-decls --check`.

## Owner check

Standard check. Look especially at both languages and plural texts ("1 goal", "2 goals";
Slovenian dual and plural forms).
