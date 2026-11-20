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
- [ ] Guidance 3: Tips (`docs/guidance/03-tips.md`)

`feedback-link` below needs only the restructure. It may be built before the guidance work; its
Guide article is then added when the Guide exists.

## The features, in order

- [ ] `00-foundation`
  - parts 2 (sync-file guard, `SYNC_VERSION = 2`) and 3 (`withPlan`, `editPlan`) built 2026-11-20 on
    `feat/undo-trash`; part 1 (journal) still open
- [ ] `13-done-log`
- [ ] `17-undo-trash-snapshots`, session A: undo and recently deleted
  - built 2026-11-20 on `feat/undo-trash` (`docs/specs/2026-11-20-undo-trash.md`); tick once the owner has seen it
- [ ] `17-undo-trash-snapshots`, session B: earlier versions and full backup
  - built 2026-11-16 (`js/backup.js`): Back up everything; Restore from a backup as copies, all
    plans, missing visions. Still open: Merge into my plans, choosing which plans, Earlier versions
- [ ] `12-replan`
  - built 2026-11-20 on `feat/replan`; tick once the owner has seen it
- [ ] `15-notes`
- [ ] `06-goal-form`
- [ ] `30-what-it-costs`, `25-planned-reward`, `21-future-to-avoid` (three small ones; one session if it fits, else one each)
- [ ] `09-today`
- [ ] `05-line-of-sight`
- [ ] `03-life-areas`
- [ ] `01-guided-discovery`
- [ ] `08-pace-and-forecast`
  - built 2026-11-20 on `feat/pace-forecast`; tick once the owner has seen it
- [ ] `07-keep-goals`
- [ ] `16-is-it-working`
  - built 2026-11-20 on `feat/is-it-working`; tick once the owner has seen it
- [ ] `14-reviews`, session A: weekly
- [ ] `14-reviews`, session B: monthly
- [ ] `14-reviews`, session C: yearly
- [ ] `19-csv`
- [ ] `18-progress-report`
- [ ] `feedback-link` (any time after the restructure)
- [ ] `20-mcp-server`, step 0: the trial with the owner
- [ ] `20-mcp-server`, session A: the app's side
- [ ] `20-mcp-server`, before session B: the owner chooses MCP server or command and skill
- [ ] `20-mcp-server`, session B: the program and its packaging

The order follows what each feature needs (the README's "Order" table gives the reasons). The
owner may move a line; a line may not come before one it needs.

## Decisions (README table)

| # | About | Confirmed by the owner |
|---|---|---|
| 1 | Journal store | open |
| 2 | Notes kept on the item | open |
| 3 | Recently deleted on the device; restore adds copies | changed 2026-11-20: Recently deleted **syncs**, until deleted for good, emptied or 30 days old; restore into a plan that is not open happens in the background |
| 4 | Today is a new view; phone tab bar | open |
| 5 | Reviews cover all plans; no quarters | open |
| 6 | Dot on the Review item | open |
| 7 | Life areas as text on a vision | open |
| 8 | Guidance texts for visions | open |
| 9 | MCP server talks to the open app | open |
| 10 | GitHub Issues for feedback | open |
| 11 | Sample plan gets dates, a note, a reward | open |
| 12 | Templates stay without personal fields | open |
| 13 | Only the glow loses its gold | changed 2026-11-18: the glow **and the blaze at the top left** lose their gold; the Purpose card and tag are always gold |
| 14 | Letters light by today's rules | yes, 2026-11-18 |

Write "yes" and the date, or the changed decision, when the owner answers.

## Notes for the next session

- Plans were written 2026-11-15 against `5b71e59`; find code with `npm run map`, not the plans' paths.
- Built and shipped but not ticked until the owner confirms: `06-goal-form` (#25), Guidance 3 tips
  (#29, #30), `feedback-link` (#32; check the `idea` label and both forms after the deploy).
- 2026-11-20, branch `feat/undo-trash`: sync-file guard, Undo, synced Recently deleted
  (`core/trash.ts`, `store/trash.ts`, `ui/undo.ts`, `ui/trash-dialog.ts`). Items are deleted without
  asking; plans keep their dialog. Backups stay `version: 1` and hold no trash, so older copies
  restore them. `scripts/fixtures.mjs` accepts only the version change 1 → 2 in `rich.sync.json`.
- Next `SYNC_VERSION` bump: the journal (00 part 1). 17 B open; 17 A lacks "Show" after a plan restore.
- Chain `feat/replan` → `feat/pace-forecast` → `feat/is-it-working`: `core/replan.ts`, `core/pace.ts`,
  `core/working.ts`; their 07, 09, 14, 15 parts (16: review line, keep goals) wait for those.
