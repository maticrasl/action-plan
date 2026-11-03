# Cumulative states, simplified – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A state either adds up or not; its graph switches between Day · Week · Month · Year · Total sums, and a goal measured by it picks its own period.

**Architecture:** All in the existing single-file app (`js/app.js`), wording in `js/i18n.js`, sample data in `js/templates.js`. The period moves off the state: helpers take the period as a parameter, the state keeps only a remembered graph `scale`, goals get `period`. Old data is migrated in `normalize()`, which every load, import and Drive download already passes through.

**Tech Stack:** Plain JS, no build; tests in `tests/more.js` run in headless Chrome.

**Spec:** `docs/superpowers/specs/2026-11-03-cumulative-simplification-design.md`

## Global Constraints

- Run the full suite after every task: `bash tests/run.sh` — passes when the output ends with `errors: none` and has no `FAIL`.
- Do **not** commit or push unless the user asks (user rule). "Checkpoint" steps below mean: suite green, `git status` reviewed.
- Every new or changed text in EN **and** SL (`js/i18n.js`, both halves); tour steps and help tips updated with the change.
- Values: periods `'day' | 'week' | 'month' | 'year'`; scale adds `'total'`; goal `period` adds `'total'`. Defaults: `scale` → `'total'`, `period` → `'total'`.
- No quarters. Routines unchanged.
- Match the surrounding code: short comments above functions, arrow helpers, template-string HTML, `t()` for every text.

## Review Focus

1. **A state with a string `cumulative` arriving after migration** (an older device syncs, an old export is imported) — must be read as cumulative with the right scale, and its goals keep their period. Test in Task 1 (normalize of an old export and of a merge result).
2. **A goal whose `period` differs from the state's `scale`** (weekly goal, monthly graph) — goal progress and the toast must ignore the scale. Test in Task 1.
3. **A goal measured by a state that is later switched to plain** — `period` stays on the goal but is ignored; the Counts select is hidden; progress uses the latest value. Test in Task 4.
4. **Switching the scale on a state with no entries in the current period** — the card shows "0 km this week", not blank. Test in Task 2.
5. **A goal measured by several states, the newest cumulative** — Counts select still shown and used. Test in Task 4.

---

### Task 1: Model – period off the state, migration, goals

**Files:**
- Modify: `js/app.js` — cumulative block (~888–1017), `normalize` (~191), `goalMeasure`/`goalReached` (~437–472)
- Test: `tests/more.js` — the "States that add up" section (~4173–4500)

**Interfaces:**
- Produces (all in `js/app.js`):
  - `PERIODS = ['day', 'week', 'month', 'year']`, `SCALES = [...PERIODS, 'total']` (replace `ADDS_UP`; drop `byPeriod`)
  - `stateScale(s) → 'day'|'week'|'month'|'year'|'total'` — `s.scale` if in `SCALES`, else `'total'`
  - `goalPeriod(g) → 'day'|…|'total'` — `g.period` if in `PERIODS`, else `'total'`
  - `stateTotal(s, period = 'total', iso = today()) → number`
  - `lastPeriodTotal(s, period, iso = today()) → number` (period ≠ 'total')
  - `periodTotals(s, period) → [{ from, to, total, entries }]` ([] for 'total' or no entries)
  - `stateValue(s)` — cumulative: `stateTotal(s)` ('' with no entries)
  - `goalMeasure(s, period) → number` — period: max(this, last); total: sum; plain: `Number(stateValue(s))`
  - `convertState(s, addsUp: boolean)` — sets `cumulative = true` (keeps `scale`) or deletes it
  - `migrateCumulative(d)` — called at the end of `normalize`
  - `isCumulative(s)` unchanged (`!!s?.cumulative`), so strings and `true` both count.

- [ ] **Step 1: Rewrite the existing cumulative tests to the new form and add new ones**

In every existing `cumulative:` test fixture, `{ cumulative: 'week' }` → `{ cumulative: true, scale: 'week' }` and pass the period explicitly: `stateTotal(wk, 'week', '2026-10-28')`, `periodTotals(s, 'week')`, `lastPeriodTotal(s, 'week')`. `'none'` → `cumulative: true` and `stateTotal(s, 'total', iso)`. Goals that relied on the state's period get `period: 'week'` / `'month'`.
New steps:

```js
await step('cumulative: old states migrate to adds up + scale; their goals keep the period', () => {
  const old = { states: [
      { id: 'w', cumulative: 'week', entries: [] }, { id: 'n', cumulative: 'none', entries: [] },
      { id: 'p', value: '3' }],
    goals: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3', period: 'month' }],
    relations: [{ id: 'r1', from: 'w', to: 'g1', type: 'measures' }, { id: 'r2', from: 'n', to: 'g2', type: 'measures' },
      { id: 'r3', from: 'w', to: 'g3', type: 'measures' }] };
  const d = normalize(old);
  eq(d.states.map(s => [s.cumulative, s.scale]), [[true, 'week'], [true, 'total'], [undefined, undefined]], 'states');
  eq(d.goals.map(g => g.period), ['week', 'total', 'month'], 'goals get the old period; one set already is kept');
  eq(normalize(d), d, 'running it again changes nothing');
});
await step('cumulative: a goal counts by its own period, whatever the graph shows', () => {
  const now = today(), lastWeek = addDays(calPeriod('week', now).from, -1);
  const s = mk('state', { cumulative: true, scale: 'month', entries: [entry(lastWeek, 30), entry(now, 5)] });
  const g = mk('goal', { baseline: '0', target: '30', period: 'week' });
  rel(s.id, 'measures', g.id);
  assert(goalCurrent(g) === 30 && goalReached(g), 'last full week counts, not the month');
  g.period = 'total';
  assert(goalCurrent(g) === 35, 'in total: everything');
  assert(stateValue(s) === 35, 'the state value is the total');
});
```
(`mk`/`rel` are the existing test helpers in this section; use whatever the neighbouring steps use.)
Sync step: add a case where `x` has `cumulative: 'week'` and `y` has `cumulative: true, scale: 'week'`; after `normalize({ states: [mergeState(x, y)] })` the state is `cumulative: true, scale: 'week'`.

- [ ] **Step 2: Run the suite — expect FAIL** (`stateScale`/`goalPeriod`/new signatures missing, migration not done).

- [ ] **Step 3: Implement** the Interfaces above. Notes:
  - `migrateCumulative(d)`: for each state with `typeof cumulative === 'string'`: old = value; `cumulative = true`; `scale = old === 'none' ? 'total' : old` (if not in `SCALES`, `'total'`). For each `measures` relation from it, the goal without `period` gets `period = scale`. Do not touch `updatedAt`.
  - `goalCurrent` → `goalMeasure(st, goalPeriod(g))`; `goalReached`: `st && isCumulative(st) && goalPeriod(g) !== 'total'` → `metricProgress(g, lastPeriodTotal(st, goalPeriod(g)))`.
  - Leave callers of `totalText` / graphs / form compiling: temporarily `totalText(s)` = in-total text (Task 2 finishes it); `periodGraphCard`/`totalGraphCard` choose on `stateScale(s)` and pass it into `periodTotals`/`periodLabel`/i18n keys; goal card line (~1224) uses `goalPeriod(g)`.
  - Update the block comment above the cumulative section to describe `cumulative: true` + `scale`.

- [ ] **Step 4: Run the suite — expect PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 2: State form and card

**Files:**
- Modify: `js/app.js` — `stateForm`, `updateStateFields`, state save (~2994–3010), state card (~1265–1272), `totalText`
- Modify: `js/i18n.js` (EN + SL)
- Test: `tests/more.js`

**Interfaces:**
- Consumes: `stateScale`, `stateTotal`, `convertState(s, boolean)` from Task 1.
- Produces: `totalText(s) → '2,450 km in total'` (key `cu.inTotal`); `scaleText(s, period, iso = today()) → '18 km this week'` (keys `cu.now.day|week|month|year`, renamed from `cu.total.*`).

- [ ] **Step 1: Tests**
  - Rewrite step "the form switches between adding up and single values": the `addsUp` select now has exactly two options `''` and `'yes'`; choosing `'yes'` on a plain state converts (asks first), saved state is `cumulative: true` and its `scale` is untouched; the old "period change keeps the entries" assertion is removed.
  - New step: card of `{ cumulative: true, scale: 'week', unit: 'km' }` with one entry of 12 last month shows `totalText` "12 km in total" and `scaleText(s,'week')` "0 km this week"; with `scale: 'total'` only the total.

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**
  - Form: `select('addsUp', { '': t('cu.opt.no'), yes: t('cu.opt.yes') }, isCumulative(s) ? 'yes' : '')`. (A yes/no select keeps the form's existing value handling; the spec's "checkbox" means this yes/no choice.)
  - Save: `convertState(s, !!v.addsUp)`; confirm only when plain ↔ cumulative (as now).
  - `updateStateFields`: value hint uses `totalText(s)`.
  - Card: the tag shows `totalText(s)`; when `stateScale(s) !== 'total'`, a second `<span class="tag state cu-now">` with `scaleText(s, stateScale(s))` before the + button.
  - i18n: add `cu.opt.yes` — EN "Yes – amounts add up", SL "Da – količine se seštevajo"; `cu.inTotal` — EN "{value} in total", SL "{value} skupaj"; rename `cu.total.day|week|month|year` → `cu.now.*`; remove `cu.opt.day|week|month|year|none` and `cu.total.none` only once Task 4 has new keys (move them now to `cu.count.*`, see Task 4).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 3: Graph scale switch

**Files:**
- Modify: `js/app.js` — `graphsView` card picker (~2235), `periodGraphCard`, `totalGraphCard`, `stateTargets`, `grCardHtml`, the click handler (~3307)
- Modify: `js/i18n.js`, `css/styles.css` (only if the chips need spacing in `.gr-card`)
- Test: `tests/more.js` — the "cumulative graphs" step

**Interfaces:**
- Consumes: `stateScale`, `goalPeriod`, `periodTotals(s, period)`, `scaleText`, `totalText`.
- Produces: `stateTargets(s, scale)` — only goals with `goalPeriod(g) === scale`; a button `data-gr-scale="<scale>" data-state="<id>"`.

- [ ] **Step 1: Tests** (in the cumulative graphs step)
  - A cumulative state shows five buttons in `.gr-card[data-gr=id] .gr-scale button`, the one for `stateScale(s)` `aria-pressed="true"`.
  - Click `[data-gr-scale="month"]`: `s.scale === 'month'`, `s.updatedAt` changed after `save()`, the card now has month bars (`periodLabel('month', …)` in the table), the state card in States shows "… this month".
  - Click `total`: step line (`.gr-line`), no bars.
  - A goal with `period: 'week'` draws its target line (`.gr-target`) on week, not on month or total; a goal with `period: 'total'` only on total.
  - Plain states have no `.gr-scale`.

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**
  - `card = s => !isCumulative(s) ? graphCard(s, width) : stateScale(s) === 'total' ? totalGraphCard(s, width) : periodGraphCard(s, width)`.
  - Switch markup, put between stats and legend: `<div class="chips gr-scale" role="group" aria-label="${esc(t('cu.scaleLabel'))}">` with `<button class="chip" data-gr-scale="${k}" data-state="${s.id}" aria-pressed="${k === scale}">${t('cu.scale.' + k)}</button>` for each `SCALES` entry. Pass it to `grCardHtml` as an optional extra argument.
  - Click handler: add `[data-gr-scale]` to the selector; set `s.scale`, `save()`, `render()`, then focus the same button again.
  - `periodGraphCard` stats: `scaleText(s, scale)` instead of `totalText`; i18n lookups use `scale`.
  - i18n: `cu.scaleLabel` — EN "Show sums per", SL "Prikaži vsote po"; `cu.scale.day|week|month|year|total` — EN "Day", "Week", "Month", "Year", "Total"; SL "Dan", "Teden", "Mesec", "Leto", "Skupaj". Rename `cu.legend.none` → `cu.legend.total`.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 4: Goal form – Counts

**Files:**
- Modify: `js/app.js` — `goalForm`, goal save (~2976), goal card line (~1224)
- Modify: `js/i18n.js`
- Test: `tests/more.js`

**Interfaces:**
- Consumes: `goalPeriod`, `measuringState`, `stateTotal`, `lastPeriodTotal`.
- Produces: goal field `period` saved from `#f-period`.

- [ ] **Step 1: Tests**
  - Goal measured by a cumulative state: `#f-period` exists with options `total, day, week, month, year`, default `total`; choose `week`, save → `g.period === 'week'`, goal card shows `cu.goalLine.week`.
  - The baseline hint (`cu.baselineHint`) shows only while `goalPeriod(g) === 'total'`.
  - Goal measured by a plain state (or none): no `#f-period`; a stored `period` stays on the goal but `goalCurrent` uses the latest value (Review Focus 3).
  - Goal measured by a plain state (older) and a cumulative state (newer, wins): `#f-period` shown and used (Review Focus 5).

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**
  - In `#measureFields`, after the metric/unit row, when `st && isCumulative(st)`: `field('period', t('cu.counts'), select('period', countOpts, goalPeriod(g)), esc(t('cu.countsHint', { name: st.title })))`, `countOpts = { total: t('cu.count.total'), day: t('cu.count.day'), … }`.
  - Save: `if (v.period !== undefined) g.period = v.period;` (absent field leaves it as is).
  - i18n: `cu.counts` — EN "Counts", SL "Šteje"; `cu.countsHint` — EN "How the amounts of “{name}” count for this goal.", SL "Kako se količine stanja »{name}« štejejo za ta cilj."; `cu.count.total|day|week|month|year` — EN "In total", "Per day", "Per week", "Per month", "Per year"; SL "Skupno", "Na dan", "Na teden", "Na mesec", "Na leto". Now remove `cu.opt.day|week|month|year|none` and `cu.total.none`.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 5: Sample data, wording, tour, help

**Files:**
- Modify: `js/app.js` — tour sample (~3851), template builder (~3951)
- Modify: `js/templates.js:219`
- Modify: `js/i18n.js` — tour and help texts, EN + SL
- Test: `tests/more.js` — "wording in both languages" step and the template/tour steps

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Tests**
  - Marathon template's Weekly distance: `cumulative === true && scale === 'week'`.
  - Tour sample: the `distance` state is `cumulative: true, scale: 'week'`; goal `weeklyKm` has `period: 'week'`.
  - Wording step: every new key (`cu.opt.yes`, `cu.inTotal`, `cu.now.*`, `cu.scale.*`, `cu.scaleLabel`, `cu.counts`, `cu.countsHint`, `cu.count.*`, `cu.legend.total`) exists in EN and SL and differs between them where the words differ; removed keys are gone from both.
  - No text in either language still says a state adds up "per day, week, month or year" as a state setting (search `help.view.states`, `help.tip.addAmount`).

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**
  - Tour sample: `{ id: distance, unit: 'km', cumulative: true, scale: 'week', entries: [], … }`; goal `weeklyKm` gets `period: 'week'`.
  - `templates.js`: `{ k: 'weekly', unit: 'km', cumulative: true, scale: 'week', … }`; builder copies `cumulative` and `scale`, and a goal template's `period` if given (add `period: 'week'` to any template goal the weekly state measures).
  - Texts (replace the relevant sentence, rest unchanged):
    - `help.view.states` EN: "A state can instead add up its amounts – kilometres run, money saved: add one by tapping its card (or +), or by ticking a routine that improves it." SL: "Stanje lahko količine tudi sešteva – pretečene kilometre, privarčevani denar: količino dodate s tapom na kartico (ali na +) ali s kljukico pri rutini, ki ga izboljšuje."
    - `help.view.graphs` EN: "A state that adds up shows its sums per day, week, month or year, or its running total – switch above the graph." SL: "Stanje, ki se sešteva, pokaže vsote po dnevih, tednih, mesecih ali letih ali skupno vsoto – preklopite nad grafom."
    - `help.tip.addAmount` EN: "This state adds up: the tag shows the total (and this period's sum, as chosen on its graph). Tap + to add an amount – a run, a deposit – with its date; several a day are fine." SL: "To stanje se sešteva: oznaka kaže skupno vsoto (in vsoto tega obdobja, kot je izbrano na grafu). Tapnite +, da dodate količino – tek, polog – z datumom; lahko jih je več na dan."
    - `tour.graphs.text`: replace "States that add up show a bar for each week or month" / "Stanja, ki se seštevajo, imajo stolpec za vsak teden ali mesec" with "States that add up show their sums per day, week, month or year, or in total" / "Stanja, ki se seštevajo, pokažejo vsote po dnevih, tednih, mesecih ali letih ali skupno".
    - `tour.goals.text`: append EN " A goal measured by a state that adds up picks how it counts: in total or per day, week, month or year." SL " Cilj, ki ga meri stanje, ki se sešteva, izbere, kako šteje: skupno ali na dan, teden, mesec ali leto."
    - Sample state descriptions (`js/i18n.js:737`, `:1504`) and `templates.js` weekly description: "Kilometres run, added after each run." / "Kilometri, dodani po vsakem teku." (the period now lives on the graph).

- [ ] **Step 4: Run — expect PASS.** Also run the tour on the sample plan at phone width (existing tour/phone-width steps in the suite cover it).
- [ ] **Step 5: Checkpoint; report to the user, ask whether to commit.**
