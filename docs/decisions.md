# Decisions

Each entry is a choice a later session might be tempted to undo, with the reason. Change one only
with the owner, and then change this file too.

## Code

**No UI framework.** Views build HTML strings and replace their part of the page. The hard parts
(map layout, timeline, graphs) are custom drawing that a framework does not help with, and a
framework would mean rewriting every screen and most of the page tests.

**HTML strings, user text always through `esc()`** (`ui/dom.ts`). Plan titles, notes and names
come from users and from shared plan files; one unescaped value is a script injection. Attribute
values too. Text set with `textContent` needs no escaping.

**TypeScript, strict; no runtime dependencies.** The compiler finds cross-file mistakes in
seconds. Users download only our own code: nothing to audit or update. Dev tools only (Vite,
Vitest, ESLint, Prettier, Playwright); a new one needs the owner's yes. No jsdom, so a module
that touches `document` while loading is tested by page tests, not unit tests.

**`src/core` and `src/i18n` without page APIs.** They compile without the DOM library
(`tsconfig.core.json`), so `document`, `window` or `localStorage` there is a compile error. This
keeps the rules testable in Node and reusable by a server later (the planned Cloudflare Worker
for Drive tokens is the first step); nothing is built for that now.

**Layers, and events only for upward calls.** `i18n → core → store → sync → ui → views →
tutorial → main`, enforced by ESLint (`scripts/lib/eslint-layers.mjs`). When a lower layer must
make a higher one act (storage or sync telling the screen to redraw), it emits through
`store/events.ts` or calls a hook that `main.ts` connects (`ui/render.ts`, `connectSync`,
`onRendered`). Events are not used between modules that may import each other directly: a direct
call is easier to follow.

**Views do not import each other; a few exceptions are listed.** The map, timeline and graphs
share the item menu, the gestures, line drawing and the timeline's drag state. Taking those apart
is a redesign, so the links are allowed one by one in `eslint.config.js`. Do not add to the list
for new code: move the shared piece down to `src/views/*.ts` or `ui/`.

**Only `main.ts` runs code at load time.** Modules import each other in circles, and the load
order of a circle is not ours to choose; a call at load time can hit a constant that does not
exist yet. Registering listeners at load is fine. Reassigned state is `export let` with a setter
in its owning module.

**Long layout functions are left whole.** `layoutMap` (`views/map/layout.ts`, ~340 lines) is one
placement pass whose steps share their working state. Split, it would need that state passed
around or made global, and the draw time is watched (`npm run perf`). Map line problems are fixed
in placement, not by post-processing the drawn lines. The same goes for `tests/browser/users.js`
(632 lines): one chain of logins on a fake Google.

**Files moved by script, not retyped.** `npm run move` and `npm run move-steps` copy code byte for
byte. Retyping moved code from memory changes it by accident.

## Stored data

**Storage keys, the sync file and exported files are frozen.** Real users have plans in them, on
devices that may run an older version for a while, and sync carries one version's data to the
other. Frozen: `localStorage` keys `actionplan.v1`, `actionplan.v1.<preference>`,
`actionplan.plans`, `actionplan.plan.<id>`, `actionplan.visions`, `actionplan.users`,
`actionplan.lang` and the same under `actionplan.u.<userId>.`; `sessionStorage`
`actionplan.syncToken`; the Drive app-folder file `actionplan-sync.json` (format
`actionplan-sync`); exported plan files (full copy and template); full backups (the sync format
with `kind: 'backup'` and `exportedAt`).

How to change them safely:

1. Add a field; give it a default in `core/normalize.ts`, so data without it still loads.
2. Never rename a field, never give an old field a new meaning, never change a value's type.
3. An older version must survive the new data. `normalize` keeps each item as it is, so a new
   field on an item passes through an older version; a new top-level collection does not (only
   the known ones are kept), so prefer fields on existing items. A new field must not make the old
   fields mean something else.
4. Before the change, add a fixture of the old shape in `tests/fixtures/` written by the old
   code (`scripts/fixtures.mjs`; `--generate` only before anything changes); then make the
   change; `npm run test:fixtures` must pass. Never regenerate an expected output to make it pass.
5. Any change here is a big task: a short design in `docs/specs/` first.

## Tests and speed

**Page tests stay in-page.** The old suite was fast and thorough; it was split by feature
(`tests/browser/`), not rewritten. Playwright covers only what a page cannot test about itself:
phone viewport and touch, offline start, upgrading from the old app. The suite's day is pinned
(Wednesday 2026-11-18) so date-dependent steps do not change from day to day.

**Speed budgets do not gate.** `npm run perf` runs on real time and varies between machines and
runs; a failing budget blocked the suite on unchanged code. It compares against
`tests/perf-baseline.json` and flags a change over 25%; look into a flag, but it never fails the
checks. `npm run perf -- --save` stores a new baseline after an accepted change.

**CI skip list.** A few steps fail on GitHub's Linux fonts only (`tests/ci-skip.txt`). They run
there without counting and still gate locally.

## Releases

**Branch, pull request, checks, auto-merge, deploy.** A push to `main` reaches every user at
once, so nothing reaches `main` without `npm run check` passing on GitHub. Claude does the whole
release when the owner says "ship it" (the `ship` skill). Hosting stays on GitHub Pages at the
same address, so stored data and Google sign-in keep working.

## The owner's design preferences

- Map boxes are lit crystal glass slabs (light from the left, broad), with fine ink lines; no pill
  buttons (`views/map/glass.ts`).
- Map lines stay simple; fix them in placement, and watch the draw time.
- Phone landscape: no bottom tab bar, a slim icon rail instead.
- Visions have no tour steps and no sample-plan entries. The Purpose is gold.
