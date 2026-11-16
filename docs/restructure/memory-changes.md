# Memory files: what to change

Folder: `C:\Users\nezar\.claude\projects\C--Matic-Programiranje-ActionPlan\memory\`

Only the index `MEMORY.md` is loaded into every session (one line per entry). The entries
themselves are read on demand. So the aim is: a short, correct index, and no entry that
contradicts the repository.

Principle: what is a **rule of the project** belongs in the repository (`CLAUDE.md`,
`docs/decisions.md`, `tests/README.md`), where it is versioned and seen by every tool. Memory
keeps what is about **you** and about **parked ideas**.

Apply these in phase 10, except the first, which applies now.

| Entry | Action | Why |
|---|---|---|
| *(new)* `restructure-in-progress` | **Added 2026-11-14.** Delete when phase 10 is done | Tells any session about the freeze and where the plan is |
| `testing-setup` (6 KB) | **Replace** with three lines: commands are in `CLAUDE.md`; harness notes in `tests/README.md`; this PC had no Node before 2026-11 | Almost all of it describes the old runner (`run.sh`, file://, clock-shift copies, screenshot workarounds). What still holds moves to `tests/README.md` in phase 9 |
| `commit-workflow` | **Rewrite**: "Commit on a branch as steps complete. Push and merge only when the owner says 'ship it' (the `ship` skill). Owner wants thorough tests: main, edge and error paths, plus touched areas" | The old text says commit to `main` and push on request. The owner's control point stays; the mechanism changed |
| `sync-i18n-and-tutorial` | **Delete** | Now a rule in `CLAUDE.md`, partly enforced by the compiler and tests |
| `pages-cache-stale` | **Delete** | One line in `CLAUDE.md` (Git section) |
| `users-login` | **Shorten** to the decision (one user per Google account, guest after logout). Drop file names | Code locations are now found with `npm run map`; `users.js` no longer exists |
| `visions-hierarchy-plan` | **Shorten** to the two owner decisions: no tutorial or sample for visions; gold Purpose | "Built" status and test hints are in the code |
| `strict-set-days-next`, `list-routines-later`, `cumulative-states-idea`, `routine-late-rule-open` | **Merge into one** entry `routine-and-state-decisions`: only the decided rules and why | All four are "built"; their names (`-next`, `-later`, `-idea`, `-open`) now mislead. Field names in them should be checked against `core/model.ts` |
| `map-glass-look`, `map-lines-keep-simple`, `landscape-layout` | **Keep** | Design preferences that are yours and not derivable from code. Also summarised in `docs/decisions.md` |
| `measurement-notes-idea` | **Keep** (parked idea) | |
| `sync-plan` | **Keep**, drop the parts that are built | The Cloudflare Worker to-do is still open and is the first step towards a server |

After the changes `MEMORY.md` should have about nine lines.

## Other instruction sources to look at

- **`~/.claude/settings.json` plugins.** Five are enabled for every project. Each adds its
  skill list to every session, and `superpowers` adds a long start-of-session instruction.
  See `OWNER.md`, "Plugins".
- **`docs/superpowers/`** (5 specs, 2 plans, about 55 KB). Not loaded automatically, but
  searches hit them and they describe code that has since moved. Phase 10 step 8 moves the
  specs to `docs/specs/` and removes the finished plans.
