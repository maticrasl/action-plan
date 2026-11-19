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
- [ ] Guidance 1: Guide page (`docs/guidance/01-guide-page.md`)
- [ ] Guidance 2: Walkthrough (`docs/guidance/02-walkthrough.md`)
- [ ] Guidance 3: Tips (`docs/guidance/03-tips.md`)

`feedback-link` below needs only the restructure. It may be built before the guidance work; its
Guide article is then added when the Guide exists.

## The features, in order

- [ ] `00-foundation`
- [ ] `13-done-log`
- [ ] `17-undo-trash-snapshots`, session A: undo and recently deleted
- [ ] `17-undo-trash-snapshots`, session B: earlier versions and full backup
  - built 2026-11-16 (`js/backup.js`): Back up everything; Restore from a backup as copies, all
    plans, missing visions. Still open: Merge into my plans, choosing which plans, Earlier versions
- [ ] `12-replan`
- [ ] `15-notes`
- [ ] `06-goal-form`
- [ ] `30-what-it-costs`, `25-planned-reward`, `21-future-to-avoid` (three small ones; one session if it fits, else one each)
- [ ] `09-today`
- [ ] `05-line-of-sight`
- [ ] `03-life-areas`
- [ ] `01-guided-discovery`
- [ ] `08-pace-and-forecast`
- [ ] `07-keep-goals`
- [ ] `16-is-it-working`
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
| 3 | Recently deleted on the device; restore adds copies | open |
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

- Plans written 2026-11-15 against commit `5b71e59`; the restructure (phases 1–10) has moved the
  code since: find files with `npm run map`, not by the paths in the plans.
- `06-goal-form` built 2026-11-18 (#25), ahead of the order at the owner's request; tick it once the
  owner has seen it work. Left out: part 5 (dropped by the owner). Its "Guidance" part: the Guide
  articles are done with Guidance 1; the `goal-unfinished` tip and the walkthrough text wait for
  Guidance 2 and 3.
- Guidance 1, the Guide page, built 2026-11-19 on branch `feat/guide-page`, not ticked until the
  owner has seen it. Articles in `src/i18n/guide.en.ts` / `guide.sl.ts`; view `src/views/guide.ts`.
  Owner: the Guide is not among the views; only the `?` beside Settings opens it.
  It treats guidance decisions 3 (`?` opens the Guide) and 4 (visions in the Guide, a Visions help
  banner) as taken. "Take the tour" stays in Settings until Guidance 2 removes the tour.
- Privacy texts were checked against the code; three sentences changed (p-where: Settings loads
  Google's sign-in script; p-google: name and email read at login; p-delete: what "Remove from
  this device" removes). `tips-all` waits for Guidance 3.
- Done 2026-11-18 outside the list: the typeface ships with the app, the page tests pass on any
  day, and two small bugs found on the way are fixed (`docs/restructure/found-bugs.md`).
