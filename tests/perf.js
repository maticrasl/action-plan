// Draw-time checks. The main run uses virtual time, where the clock stands still during a script, so
// these run in a second pass on real time: synchronously while the page loads, so the results are
// in the page before it is dumped. Each check reports its average over a few runs.
(() => {
  const out = [];
  const avg = (f, n = 5) => { f(); const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t0) / n; };
  const check = (name, budget, f) => {
    try {
      const ms = avg(f);
      out.push(`${ms <= budget ? 'PASS' : 'FAIL'} ${name}: ${Math.round(ms)} ms (budget ${budget} ms)`);
    } catch (e) { out.push(`FAIL ${name}: ${e}`); }
  };
  try {
    // The sample plan: every view, and the map's layout.
    loadSample();
    for (const v of Object.keys(VIEWS)) check(`sample plan: ${v} view`, 150, () => setView(v));
    check('sample plan: map layout', 150, () => layoutMap({ goal: db.goals, activity: db.activities, state: db.states }, db.relations.filter(r => REL_TYPES[r.type])));
    deletePlan(plans.current);
    // Three years of daily amounts on one state that adds up.
    createPlan('Long history', emptyDb());
    const entries = Array.from({ length: 1100 }, (_, i) => ({ id: 'e' + i, date: addDays(today(), -i), amount: String(i % 7) }));
    db.states.push({ id: 'k', title: 'Km', unit: 'km', cumulative: true, scale: 'day', entries, history: [], value: '', date: '' });
    for (const scale of SCALES) check(`1,100 amounts: graph by ${scale}`, 100, () => { db.states[0].scale = scale; setView('graphs'); });
    check('1,100 amounts: states view', 100, () => setView('states'));
    check('1,100 amounts: state form', 100, () => { openForm('state', 'k'); modal.close(); });
    deletePlan(plans.current);
  } catch (e) { out.push(`FAIL perf setup: ${e}`); }
  const pre = document.createElement('pre');
  pre.id = 'PERF';
  pre.textContent = out.join('\n');
  document.body.append(pre);
})();
