# Phase 3 — Core domain logic

**Goal:** all rules and calculations live in `src/core/`, typed, with no page access. Likely
two sessions; a good cut is after step 4.

## What moves (source lines at `5b71e59`; use `npm run outline` for today's)

| To | From | Notes |
|---|---|---|
| `core/relations.ts` | `app.js` "Relations", 307–434 | `canRelate`, `addRelation`, cycle checks, `repairRelations` |
| `core/progress.ts` | "SMART & progress", 435–614 | goal progress and state, activity state |
| `core/routines/` | "Routines", 615–1106 (492 lines, 34 functions) | Split in two or three files along its own sub-comments, e.g. schedule (which days are due), check-ins and lists, late and make-up rules |
| `core/cumulative.ts` | "Cumulative states", 1107–1265 | amounts, periods |
| `core/visions.ts` | pure part of `visions.js` | parents, loops, Purpose detection, `normalizeVisions` |
| `core/merge.ts` | `sync.js` | change stamps, tombstones, `mergePlans`, `mergeStores` |
| `core/normalize.ts` | `normalize` and import validation from "Import / export", 4534– | only the data part; dialogs stay |
| `core/templates/` | `templates.js` | data per area in its own file, plus the function that turns a template into a plan |

## How

1. For each row: `move-decls` → fix imports → `npm run check` → move commit. Then types and
   Prettier → `check` → type commit. Order top to bottom; each row depends only on rows above
   it and on phase 2.

2. **These sections also contain rendering.** "Routines" and "Cumulative states" each mix
   rules with functions that build HTML (week strips, amount rows). Move only functions that
   neither touch the page nor build HTML. Leave the rest in `app.js` for phases 6 and 7. The
   no-DOM `tsconfig` from phase 2 tells you when you moved too much.

3. **Upward calls.** Core code today calls things that belong to higher layers. Handle each
   kind the same way everywhere:
   - `t(...)` for messages: allowed, `i18n` is below `core`.
   - `db`, `plans`, `visions` (current state): the function takes the data as a parameter if
     that is a small change at few call sites. If the function is called from many places,
     leave the signature alone and let it import the state from where it lives now; phase 4
     settles state. Do not redesign signatures wholesale in this phase.
   - `save()`, `render()`, `toast()`: a core function must not call these. Split the function:
     the calculation moves, the caller in legacy keeps the side effect. Each such split is a
     real edit, not a move: keep it small, and list them in the commit message.

4. **Caches keyed by version counters** (`visionsVersion`, `plansVersion`, `otherPlansCache`
   in `visions.js`): keep the mechanism exactly. Changing cache invalidation is a behaviour
   change even if results look the same.

5. **Unit tests** for the modules moved. Port, do not invent: for each module, find its
   DOM-free steps in `tests/more.js` (Grep for the function names; the section list is in the
   file's `/* ---------- … */` headers) and write the same assertions in `<module>.test.ts`
   with explicit dates. Leave the legacy steps in place. Priority, because mistakes here lose
   user data or mislead users daily:
   1. `merge.ts` — every merge and tombstone case
   2. `routines/` — every repeat kind, week and month ends, make-up days, the late rule
   3. `relations.ts` — allowed pairs, loop prevention, repair

6. **Typing.** No `any` in `src/core`. Where stored data can be malformed (it comes from
   storage, Drive and import files), the boundary is `normalize`: it takes `unknown` and
   returns `Db`. Everything behind it trusts the types.

## Done when

- `npm run check` green; `src/legacy/sync.js` and `templates.js` are gone.
- `src/core` compiles without the DOM library.
- `npm run perf` unchanged within noise.

## Owner check

Standard check, plus: tick and untick routines of several kinds, enter amounts, and compare
progress numbers of a few goals with the live app using the same imported plan.
