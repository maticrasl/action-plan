# Your part

## Glossary, in embedded terms

| Web term | Closest thing you know |
|---|---|
| **Node.js** | A JavaScript runtime for the PC. Here it only runs tools. Nothing of it reaches users |
| **npm** | Package manager that comes with Node. Fetches the project's tools into `node_modules/` |
| `package.json` | Tool list plus named commands. Think Makefile targets: `npm run check` |
| `package-lock.json` | Exact pinned versions of every tool. Committed, so every machine gets the same |
| `node_modules/` | The downloaded tools (a few hundred MB). Never committed. `npm ci` recreates it |
| **ES module** | A source file with explicit `import`/`export`, like a `.c` file with a header. Today the app is ten files sharing one global namespace |
| **TypeScript** | JavaScript with static types. `tsc` checks them; the output is plain JavaScript |
| **Vite** | Linker plus development server. Bundles the modules into a few files in `dist/` |
| **ESLint** | Static analysis, like clang-tidy or a MISRA checker |
| **Prettier** | Code formatter, like clang-format |
| **Vitest** | Host-side unit tests: runs logic without a browser, in seconds |
| **Playwright** | Test rig that drives a real browser from outside, like hardware-in-the-loop |
| **CI / GitHub Actions** | Build server. Runs the checks on GitHub's machines on every push, free for public repositories |
| **Pull request (PR)** | A branch proposed for merging, with the CI result attached |
| **Service worker** (`sw.js`) | Script the browser keeps to serve the app offline. A caching boot stage |
| **Source map** | Debug symbols: maps bundled code back to source lines |

## Before phase 0 (about 30 minutes)

1. **Back up.** In the live app: Settings → Export plan → Full copy, for each plan. Ask your
   users to do the same.
2. **Install Node.js.** From nodejs.org take the **LTS** Windows installer. Keep the defaults;
   leave "Automatically install the necessary tools" (native build tools) unticked. Open a
   **new** terminal and check: `node -v` and `npm -v` each print a version.
3. **Install the GitHub command-line tool**, so Claude can open and merge pull requests:
   `winget install GitHub.cli`, new terminal, `gh auth login` (GitHub.com → HTTPS → browser).
4. **Clean up the repository.** These need your decision, so they are not in a phase:
   - `CLAUDE.md` and `.claude/` are not committed yet. Phase 0 commits `CLAUDE.md` and adds
     ignore rules for the rest.
   - A leftover worktree exists at `.claude/worktrees/map-no-date-order`, on the same commit as
     `main`. If you have nothing unfinished there:
     `git worktree remove .claude/worktrees/map-no-date-order` then
     `git branch -d worktree-map-no-date-order`.
5. **Confirm the repository is public** (GitHub → repository → Settings → General, at the
   bottom). Free CI and the merge rules below assume it. If it is private, tell Opus in phase 0.

## Running a phase

1. Start a fresh session: `/clear` (or a new terminal). One phase per session.
2. `/model` → Opus 5.5.
3. Paste:
   > Read `docs/restructure/RULES.md` and `docs/restructure/STATUS.md`, then carry out
   > `docs/restructure/phase-NN-….md`. Follow the rules file exactly.
4. When Opus reports, do the phase's **owner check** (below and in the phase file).
5. Say **"ship it"**. Opus pushes, opens the pull request, GitHub checks and merges, the site
   deploys. Then open the live app, hard-reload (Ctrl+Shift+R), and look at your own plans.
6. If the live app is wrong: tell Opus "revert the last merge". The previous version is back
   in a few minutes. Your data is not touched by a revert.

If a session runs out of context mid-phase, start a new one with the same prompt. `STATUS.md`
says where it stopped.

### The standard owner check (from phase 1 on)

```
npm run build
npm run preview
```

Open the address it prints (`http://localhost:4173`). This copy has **its own storage**,
separate from the live app, so nothing you do there touches real data. Import one of your
exported plans, then:

- open every view; on the map: zoom, drag a link between two boxes, right-click a box
- add and edit one goal, one activity, one state; tick a routine; enter an amount
- switch language and theme; open Settings
- narrow the window to phone width and look at the tab bar and one form

Ten minutes. The automatic tests cover far more, but they cannot tell you that something
*looks* wrong.

## GitHub settings you change once

| When | Where | What |
|---|---|---|
| After phase 0's first CI run | Settings → General → Pull Requests | Tick **Allow auto-merge** |
| Same time | Settings → Rules → Rulesets → New branch ruleset for `main` | Require a pull request (0 approvals); require status check `check` |
| During phase 1, when Opus asks | Settings → Pages → Build and deployment → Source | Change from "Deploy from a branch" to **GitHub Actions** |

After the ruleset, nothing reaches `main` without passing the checks, including Claude's work.

Optional, for testing Google sync on your PC: in the Google Cloud console, open the OAuth
client and add `http://localhost:5173` and `http://localhost:4173` to *Authorized JavaScript
origins*. Without it, sync works only on the live address. Everything else works locally.

## Things I promised differently, corrected

I said you could "open the branch build in a browser before merging". GitHub Pages cannot host
a second copy per branch, and a copy under the same address would share storage with the live
app, which is dangerous. The preview is therefore local (`npm run preview`). If you later want
a preview on your phone, a second free host (for example Cloudflare Pages) does it; ask then.

## Working with Claude Code after the restructuring

**Model.** Sonnet 5.5 for changes inside one or two modules, text and style changes, and
adding tests. Opus 5.5 for features that cross modules, hard bugs, and anything touching merge
or storage. Leave effort at medium. Switch with `/model` at the start of a task, not during it.

**Context.** This is where most tokens go.

- One task per session, then `/clear`. A long session re-sends its whole history on every turn.
- Name the place: "in `src/views/timeline/`", "the weekly routine rule in `src/core/routines.ts`".
  Searching for the place is often half the cost of a small task.
- Do not paste logs or screenshots unless asked. Say what you saw.
- Do not ask for a summary of the code "to get started". `npm run map` prints the module list.

**Size of task.** "Add a 'paused' filter chip to the goals view" is a task. "Improve goals" is
not. For a feature that touches several modules or changes stored data, ask for a short design
first (the new `CLAUDE.md` says when), read it, then let it build.

**Plugins.** Every enabled plugin adds text to every session. You have five. `superpowers`
demands a brainstorm, spec and plan before any work; the new `CLAUDE.md` limits that to big
features, and project instructions take precedence over the plugin. If it still pushes
ceremony onto small tasks, disable it for this project with `/plugin`. `ponytail`,
`code-simplifier` and `claude-md-management` overlap with what the tools and `CLAUDE.md` now
do; consider keeping only `frontend-design` and whichever of the others you actually call.

**Releases.** You say "ship it"; Claude runs the checks, pushes the branch, opens the pull
request and sets it to merge by itself once GitHub's checks pass. You do not merge by hand.

**Housekeeping.** Every five or so features, one session: "run `npm run map`, list files over
400 lines and any duplicated code, propose splits". Tests make that safe.
