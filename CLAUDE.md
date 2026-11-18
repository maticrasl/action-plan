# CLAUDE.md

## Restructuring in progress — feature freeze
Follow `docs/restructure/RULES.md`. No features until `docs/restructure/STATUS.md` says done.
Commands: `npm run check` (all checks, quiet), `npm run check:fast` (tsc, eslint, unit tests),
`npm run test:browser -- <feature>` (one feature's page tests), `npm run test:e2e` (Playwright),
`npm run shot -- <view> [--phone] [--dark]` (a PNG to look at), `npm run perf` (against the baseline),
`npm run outline -- <file>`, `npm run map` (each file's purpose), `npm run move -- …` (moves
declarations verbatim; usage at the top of `scripts/move-decls.mjs`), `npm run move-steps -- …` (moves
page-test steps), `npm run dev` (dev server), `npm run build` (into `dist/`), `npm run preview` (serves `dist/`).
Tests: `tests/README.md`. `src/test-bridge.ts` exposes the modules to the page tests.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Prepare test cases for main paths and edge cases before starting implementation.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Pretty frontend

** Follow best practices on frontend design. **

Whenever you do any frontend design, use the frontend-design skill.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.