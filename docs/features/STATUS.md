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

- 2026-11-23, branches `feat/keep-goals` (07) and `feat/reviews` (14 A, B, C, stacked on it): built, full
  `npm run check` passes, not yet seen by the owner (lines not ticked). Specs `docs/specs/2026-11-23-keep-goals.md`
  and `docs/specs/2026-11-23-reviews.md` record what the build decided. Shipping `feat/reviews` ships both.
- 07: `goal.keep { min?, max? }`, rules in `core/keep.ts`, form parts `ui/forms/keep-form.ts`, band `views/graphs/band.ts`.
- 14: rules in `core/reviews*.ts`, pages `views/review-*.ts`; the Guide checklist is gone; tips `week`, `month`,
  `new-year` open their review. Two `shortcut:` limits (flexible routines in Forgot to tick; biggest changes).
- 01, 03, 05 and 09 are shipped (#60–#63) but still wait for the owner to look before their lines are ticked.
- Next open lines after the owner looks: `18-progress-report` (needs 13 and 14), then `20-mcp-server`.
- Plans were written 2026-11-15 against `5b71e59`; find code with `npm run map`, not the plans' paths.
- Still waiting: decision 10 (feedback channel, Q-010).
