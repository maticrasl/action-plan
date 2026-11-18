---
name: ship
description: Release the current branch when the owner says "ship it" (or "ship"); check, commit, push, pull request, auto-merge, watch the checks and the deploy, report. Only on the owner's word, never on your own.
---

# Ship

Run these in order. Stop at the first failure and report it; do not work around a failing check.

1. **Check.** `npm run check`. On failure: stop, report the failing lines. Never `--no-verify`.
2. **Commit** what is uncommitted and belongs to the task (`git status --short` first; ask about
   files that are not yours, such as other untracked folders). Subject at most 72 characters,
   saying what changed and why. Never ship from `main`: if on `main`, stop and ask for a branch name.
3. **Push and open the pull request.** `git push -u origin HEAD`, then `gh pr create --fill`
   (if a pull request for the branch exists, `gh pr view` it instead).
4. **Auto-merge.** `gh pr merge --auto --squash --delete-branch`.
5. **Watch.** `gh pr checks --watch` until done. Then the deploy: the `deploy` workflow runs on the
   merge commit on `main`. `gh pr view --json state,mergeCommit` until `MERGED`, then find its run:
   `gh run list --workflow deploy.yml --branch main --limit 3 --json databaseId,headSha,status`
   (the one whose `headSha` is the merge commit) and `gh run watch <id> --exit-status`.
6. **Report** in a few lines: the pull request link; merged or not; the deploy's result; and the
   reminder: "The installed app can show the old version for a few minutes: hard-reload
   (Ctrl+Shift+R) before checking."
7. **Back to `main`.** `git switch main` and `git pull --ff-only`. If `main` is checked out in
   another worktree, `git fetch origin` and `git switch --detach origin/main` instead.

If a check fails on GitHub but passed locally, look at `tests/ci-skip.txt` and the run's log
(`gh run view <id> --log-failed`) before changing anything; report, do not retry blindly.
