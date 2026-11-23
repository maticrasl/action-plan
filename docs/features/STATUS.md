# Status: what is built, what is next

The one place that says where the work stands. **The next thing to build is the first line
below that is not ticked.** One line is one session, unless it says otherwise.

## How to use it

Owner: start a fresh session, choose Opus, and paste:

> Read `docs/features/STATUS.md` and `docs/features/README.md`, then build the next open line.
> Follow the README and the line's own file.

Opus, at the end of every session:

1. Tick the line you finished (`[x]`) and put the date after it. Tick it only when `npm run
   check` passes and the owner has seen it work.
2. Replace the "Notes for the next session" at the bottom (at most 10 lines; do not append a
   diary).
3. Do not start the next line in the same session.

Before building a line, check the README's table "Decisions I made that the owner should
confirm". If the line depends on a decision that is still marked open below, ask the owner
first.

## Before these features

- [x] Restructure finished (phase 10 done; see `docs/restructure/STATUS.md`) 2026-11-18
- [x] Guidance 1: Guide page (`docs/guidance/01-guide-page.md`) 2026-11-19
- [x] Guidance 2: Walkthrough (`docs/guidance/02-walkthrough.md`) 2026-11-19
- [x] Guidance 3: Tips (`docs/guidance/03-tips.md`) 2026-11-21

`feedback-link` below needs only the restructure. It may be built before the guidance work; its
Guide article is then added when the Guide exists.

## The features, in order

- [x] `00-foundation` 2026-11-21
  - parts 2 (sync-file guard, `SYNC_VERSION = 2`) and 3 (`withPlan`, `editPlan`) built 2026-11-20 on
    `feat/undo-trash`; part 1 (journal store, `SYNC_VERSION = 3`) built and shipped 2026-11-21 (#49),
    no screen yet
- [x] `13-done-log` 2026-11-21
  - part A (completion dates, Done on / Achieved on, This week line, dated sample) shipped
    2026-11-21 (#49); part B (Review view with the done log) built 2026-11-21 on `feat/done-log`
- [x] `17-undo-trash-snapshots`, session A: undo and recently deleted 2026-11-21
  - shipped (`docs/specs/2026-11-20-undo-trash.md`). Restoring into a plan that is not open offers "Show" (page test in
    `tests/browser/trash.js`)
- [x] `17-undo-trash-snapshots`, session B: earlier versions and full backup 2026-11-23
  - built 2026-11-16 (`js/backup.js`): Back up everything; Restore from a backup as copies, all
    plans, missing visions. Still open: Merge into my plans, choosing which plans, Earlier versions
- [x] `12-replan` 2026-11-21
  - shipped in #44
- [x] `15-notes` 2026-11-23
- [x] `06-goal-form` 2026-11-21
- [x] `30-what-it-costs`, `25-planned-reward`, `21-future-to-avoid` (three small ones; one session if it fits, else one each) 2026-11-23
- [ ] `09-today`
- [ ] `05-line-of-sight`
- [ ] `03-life-areas`
- [ ] `01-guided-discovery`
- [x] `08-pace-and-forecast` 2026-11-21
  - shipped in #44; weighted trend #45
- [ ] `07-keep-goals`
- [x] `16-is-it-working` 2026-11-21
  - shipped in #44
- [ ] `14-reviews`, session A: weekly
- [ ] `14-reviews`, session B: monthly
- [ ] `14-reviews`, session C: yearly
- [x] `19-csv` 2026-11-21
  - shipped in #44
- [ ] `18-progress-report`
- [x] `feedback-link` (any time after the restructure) 2026-11-20
- [ ] `20-mcp-server`, step 0: the trial with the owner
- [ ] `20-mcp-server`, session A: the app's side
- [ ] `20-mcp-server`, before session B: the owner chooses MCP server or command and skill
- [ ] `20-mcp-server`, session B: the program and its packaging

The order follows what each feature needs (the README's "Order" table gives the reasons). The
owner may move a line; a line may not come before one it needs.

## Decisions (README table)

| # | About | Confirmed by the owner |
|---|---|---|
| 1 | Journal store | yes, 2026-11-21 |
| 2 | Notes kept on the item | yes, 2026-11-21 |
| 3 | Recently deleted on the device; restore adds copies | changed 2026-11-20: Recently deleted **syncs**, until deleted for good, emptied or 30 days old; restore into a plan that is not open happens in the background |
| 4 | Today is a new view; phone tab bar | yes, 2026-11-21 |
| 5 | Reviews cover all plans; no quarters | yes, 2026-11-21 |
| 6 | Dot on the Review item | yes, 2026-11-21 |
| 7 | Life areas as text on a vision | yes, 2026-11-21 |
| 8 | Guidance texts for visions | yes, 2026-11-21 |
| 9 | MCP server talks to the open app | yes, 2026-11-21 |
| 10 | GitHub Issues for feedback | open |
| 11 | Sample plan gets dates, a note, a reward | yes, 2026-11-21 |
| 12 | Templates stay without personal fields | yes, 2026-11-21 |
| 13 | Only the glow loses its gold | changed 2026-11-18: the glow **and the blaze at the top left** lose their gold; the Purpose card and tag are always gold |
| 14 | Letters light by today's rules | yes, 2026-11-18 |

Write "yes" and the date, or the changed decision, when the owner answers.

## Notes for the next session

- 2026-11-23, branch `feat/life-areas`: 03 built, not yet seen by the owner (line not ticked). Spec
  `docs/specs/2026-11-23-life-areas.md` (counting rule, buttons instead of a context menu). Rules in
  `core/areas.ts`, screen in `views/areas.ts`, page test `tests/browser/visions.areas.js`. "Rated" waits for 01.
- 2026-11-23, branch `feat/line-of-sight`: 05 built, not yet seen by the owner (line not ticked).
  Rules in `core/line-of-sight.ts`, tag and toast in `ui/line-of-sight.ts`, page test
  `tests/browser/today.sight.js`. The toast names the vision only when the tick has no other
  message (a met week keeps its own). Perf: goals view 9 → 20 ms (Serves line on each card).
- 2026-11-23, branch `feat/today`: 09 built, not yet seen by the owner (line not ticked). Today sits
  before Review (on phones under More), not first as the plan said: the owner's choice for now.
  Other plans are ticked through `actInPlan` (`store/plans.ts`) and `inPlan` (`ui/render.ts`); a
  cleared focus is stored as an empty focus with its time. Left out: Move late steps per plan on
  Today, week strips on Today's routine rows. Perf: 5 plans x 300 items ~120-180 ms (budget 150).
- Plans were written 2026-11-15 against `5b71e59`; find code with `npm run map`, not the plans' paths.
- Confirmed 2026-11-21: decisions 1, 2, 4 to 9, 11, 12; ticked 06, Guidance 3, 17 A. Still waiting:
  decision 10 (feedback channel) and the owner's check of `feedback-link` (#32).
- 2026-11-20, branch `feat/undo-trash`: sync-file guard, Undo, synced Recently deleted
  (`core/trash.ts`, `store/trash.ts`, `ui/undo.ts`, `ui/trash-dialog.ts`). Items are deleted without
  asking; plans keep their dialog. Backups stay `version: 1` and hold no trash, so older copies
  restore them. `scripts/fixtures.mjs` accepts only the version change 1 → 2 in `rich.sync.json`.
- Journal store shipped (#49): sync file version 3; reviews (14), Today (09) and discovery (01)
  write into it. 17 B open.
- Review view exists (`views/review.ts`, `core/done-log.ts`) with only the done log; weekly
  reviews (14) add their part there.
