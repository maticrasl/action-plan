# What it costs, planned reward, future to avoid (WP-011)

Builds `docs/features/30-what-it-costs.md`, `25-planned-reward.md` and `21-future-to-avoid.md`
as written there (texts, rules, tests). This file adds only what those leave open.

## Data (all optional strings, trimmed, absent when empty; older copies keep unknown fields)

| Item | Field | Max | Read in |
|---|---|---|---|
| goal | `cost` | 500 | `core/normalize.ts` |
| activity | `reward` | 120 | `core/normalize.ts` |
| vision | `avoid` | 2,000 | `core/visions.ts` (`normalizeVisions`) |

A non-string is dropped (as `obstacle` is today); the form's `maxlength` holds the maximum. No sync file version change: they are fields on items, which merge whole.
Template export clears `cost` and `reward` (`resetProgress` gets `{ template: true }`, used only
by the template export); "start fresh" and a full copy keep them. `avoid` is on visions, which
plan files do not carry.

## Modules

- `core/model.ts` types; `core/normalize.ts`; `core/visions.ts`.
- `core/reward.ts` (new): `rewardToast(reward, base?)`, pure.
- Forms: `ui/forms/goal.ts` (cost field in R, the "n active goals" line for a new goal),
  `ui/forms/activity.ts` (reward field), `ui/forms/vision.ts` (avoid field).
- Tick toasts: where a step, a list's last item and a routine's today are ticked (found by Grep).
- Cards: the activity and routine cards ("Then: …"), the vision card (`<details>` fold), the
  vision context menu (**Add what to avoid**).
- Texts: `i18n/en.ts`, `sl.ts`; Guide articles named in the three files; sample plan: one
  routine with a reward.
- Fixture: a plan with `cost` and `reward`, a visions store with `avoid`, written by today's code.

## Left out (their features are not built yet)

- Review (14) lines "You said it would cost" and the future to avoid beside visions.
- Discovery (01) step, assistant (20) ticks. The line-of-sight toast (05) only if it exists.
Each feature file keeps these for when its feature is built.

## Order

Three commits on `feat/cost-reward-avoid`, `check:fast` after each: avoid (smallest), cost,
reward. Tests as listed in each feature file, plus the fixture.
