# Phase 10 — Workflow for the work that follows

**Goal:** the project explains itself to a new session in under 100 lines, and routine steps
are tools, not prompt text.

## Steps

1. **`CLAUDE.md`.** Replace the file with `docs/restructure/target-CLAUDE.md`, corrected
   against what was actually built (commands, folder names, limits). Keep it under 90 lines.
   Every line must be something a session would otherwise get wrong; delete the rest.

2. **`docs/decisions.md`.** One short entry per decision that a future session might undo,
   with the reason: no UI framework; HTML strings with `esc()`; `src/core` without page APIs;
   storage keys and sync format are frozen and how to change them safely (new field with a
   default in `normalize`, never rename or repurpose a field, a fixture for the old shape);
   events only for upward calls; long layout functions left whole; speed budgets not gating.
   Take the entries from `README.md` in this folder and from `STATUS.md` notes.

3. **Project settings** (`.claude/settings.json`, committed). Use the `update-config` skill and
   check each hook and permission against the current Claude Code documentation; then prove
   each works by triggering it.
   - **Allow** without prompting: `npm run *`, `npm ci`, read-only `git` commands,
     `git add/commit/switch/branch`, `gh pr create/view/checks/merge`, `gh run watch/view`.
   - **Hook, after Edit/Write:** run Prettier on the edited file, silently. Nothing else: the
     type check and tests are run on purpose (`check:fast`), not on every keystroke.
   - No Stop hook. It would run on every reply, including answers to questions.

4. **`ship` skill** (`.claude/skills/ship/SKILL.md`), used when the owner says "ship it":
   1. `npm run check`; stop on failure
   2. commit what is uncommitted (subject ≤ 72 characters, what and why)
   3. push the branch; `gh pr create --fill`
   4. `gh pr merge --auto --squash --delete-branch`
   5. `gh pr checks --watch`, then watch the deploy run
   6. report: merged or not, deploy state, and the reminder to hard-reload
   7. switch back to `main` and pull

5. **Memory.** Apply `docs/restructure/memory-changes.md` with the owner: show each proposed
   change, apply on their yes.

6. **Feature checklist as a test, where possible.** The rule "every change updates EN and SL
   texts and the tour" is now partly enforced by types (key parity) and by the tour-target
   step. Check whether "every `data-help-tip` key has a text" and "every tour step has a
   target on its view" are both asserted; add the missing one.

7. **Measure.** Pick one small past feature from the history (for example the map's
   right-click "Add" menu, commit `f47d3bf`). In a fresh session on the new structure, ask
   for an equivalent small feature on a throwaway branch and note the token count the session
   reports. Put the number in `STATUS.md` next to an estimate of the old cost if the owner has
   one. Delete the branch.

8. **Retire this folder.** Set `STATUS.md` to done. Remove the interim block from `CLAUDE.md`.
   Keep `docs/restructure/` for one month, then delete it; `docs/decisions.md` carries what
   matters. Move `docs/superpowers/specs` to `docs/specs` and delete `docs/superpowers/plans`
   (finished plans are history that git already holds); ask the owner first.

## Done when

- A fresh session given only "add a 'paused' chip to the goals filter" finds the right two or
  three files without reading any file whole and without asking where things are.
- `npm run check` green; the hook formats an edited file; "ship it" runs end to end on a
  trivial change (for example a comment).

## Owner check

Read the new `CLAUDE.md` and `docs/decisions.md` (ten minutes). They are the instructions
every future session starts from; correct anything that is not how you want to work.
