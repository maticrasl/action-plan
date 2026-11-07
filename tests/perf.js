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
    // A big plan on the map: 30 goals, 240 activities in all statuses (chains of dependencies), 30 states.
    createPlan('Big map', emptyDb());
    const st = ['todo', 'doing', 'done'];
    for (let i = 0; i < 30; i++) db.goals.push({ id: 'g' + i, title: 'Goal ' + i, status: 'active', baseline: '0', target: '10' });
    for (let i = 0; i < 240; i++) {
      db.activities.push({ id: 'a' + i, title: 'Activity ' + i, status: st[i % 3], dueDate: addDays(today(), i % 40 - 10) });
      db.relations.push({ id: 'c' + i, from: 'a' + i, to: 'g' + (i % 30), type: 'contributes' });
      if (i % 8) db.relations.push({ id: 'd' + i, from: 'a' + i, to: 'a' + (i - 1), type: 'depends' });
    }
    for (let i = 0; i < 30; i++) {
      db.states.push({ id: 's' + i, title: 'State ' + i, value: String(i), date: today(), history: [] });
      db.relations.push({ id: 'm' + i, from: 's' + i, to: 'g' + i, type: 'measures' });
    }
    check('300 items: map view', 250, () => setView('map'));
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
