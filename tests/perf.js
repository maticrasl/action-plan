// Draw-time checks. The main run uses virtual time, where the clock stands still during a script, so
// these run in a second pass on real time: synchronously while the page loads, so the results are
// in the page before it is dumped. Each check reports its average over a few runs.
(() => {
  const out = [];
  const avg = (f, n = 5) => {
    f();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) f();
    return (performance.now() - t0) / n;
  };
  const check = (name, budget, f) => {
    try {
      const ms = avg(f);
      out.push(`${ms <= budget ? 'PASS' : 'FAIL'} ${name}: ${Math.round(ms)} ms (budget ${budget} ms)`);
    } catch (e) {
      out.push(`FAIL ${name}: ${e}`);
    }
  };
  try {
    // The sample plan: every view, and the map's layout.
    loadSample();
    for (const v of Object.keys(VIEWS)) check(`sample plan: ${v} view`, 150, () => setView(v));
    check('sample plan: map layout', 150, () =>
      layoutMap(
        { goal: db.goals, activity: db.activities, state: db.states },
        db.relations.filter(r => REL_TYPES[r.type]),
      ),
    );
    deletePlan(plans.current);
    // A big plan on the map: 30 goals, 240 activities in all statuses (chains of dependencies), 30 states.
    createPlan('Big map', emptyDb());
    const st = ['todo', 'doing', 'done'];
    for (let i = 0; i < 30; i++)
      db.goals.push({ id: 'g' + i, title: 'Goal ' + i, status: 'active', baseline: '0', target: '10' });
    for (let i = 0; i < 240; i++) {
      db.activities.push({
        id: 'a' + i,
        title: 'Activity ' + i,
        status: st[i % 3],
        dueDate: addDays(today(), (i % 40) - 10),
      });
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
    const entries = Array.from({ length: 1100 }, (_, i) => ({
      id: 'e' + i,
      date: addDays(today(), -i),
      amount: String(i % 7),
    }));
    db.states.push({
      id: 'k',
      title: 'Km',
      unit: 'km',
      cumulative: true,
      scale: 'day',
      entries,
      history: [],
      value: '',
      date: '',
    });
    for (const scale of SCALES)
      check(`1,100 amounts: graph by ${scale}`, 100, () => {
        db.states[0].scale = scale;
        setView('graphs');
      });
    check('1,100 amounts: graphs view', 100, () => setView('graphs'));
    check('1,100 amounts: state form', 150, () => {
      openForm('state', 'k');
      modal.close();
    });
    // The done log over the same history, with 240 steps finished across it (feature 13).
    for (let i = 0; i < 240; i++)
      db.activities.push({ id: 'a' + i, title: 'Activity ' + i, status: 'done', doneAt: addDays(today(), -i * 4) });
    reviewView.tab = 'log'; // the done log is a tab of its own since feature 14
    check('240 steps + 1,100 amounts: review view', 100, () => setView('review'));
    deletePlan(plans.current);
    // Today over 5 plans of 300 activities each (feature 09): steps due around today, and daily routines.
    const made = [];
    for (let p = 0; p < 5; p++) {
      const data = emptyDb();
      for (let i = 0; i < 300; i++)
        data.activities.push(
          i % 3
            ? { id: `t${p}-${i}`, title: 'Step ' + i, status: 'todo', dueDate: addDays(today(), (i % 20) - 10) }
            : {
                id: `t${p}-${i}`,
                title: 'Routine ' + i,
                status: 'doing',
                repeat: { every: 1, unit: 'day' },
                checkins: {},
              },
        );
      createPlan('Today ' + p, data);
      made.push(plans.current);
    }
    check('5 plans x 300 items: today view', 150, () => setView('today'));
    reviewView.tab = 'week';
    check('5 plans x 300 items: weekly review', 150, () => setView('review'));
    reviewView.tab = 'month';
    check('5 plans x 300 items: monthly review', 150, () => setView('review'));
    made.forEach(id => deletePlan(id));
    // The yearly review over 3 plans with two years of data: worked out once when the tab opens (feature 14 C).
    const years = [];
    for (let p = 0; p < 3; p++) {
      const data = emptyDb();
      const checkins = {};
      for (let i = 0; i < 730; i += 2) checkins[addDays(today(), -i)] = 1;
      data.activities.push({
        id: `yr${p}`,
        title: 'Routine',
        status: 'doing',
        repeat: { every: 1, unit: 'day' },
        startDate: addDays(today(), -730),
        checkins,
      });
      for (let i = 0; i < 300; i++)
        data.activities.push({
          id: `ys${p}-${i}`,
          title: 'Step ' + i,
          status: 'done',
          doneAt: addDays(today(), -i * 2),
        });
      data.states.push({
        id: `yv${p}`,
        title: 'Value',
        description: '',
        value: '1',
        history: Array.from({ length: 200 }, (_, i) => ({ date: addDays(today(), -i * 3), value: String(i) })),
      });
      for (let i = 0; i < 20; i++)
        data.goals.push({
          id: `yg${p}-${i}`,
          title: 'Goal ' + i,
          status: i % 4 ? 'active' : 'achieved',
          achievedAt: addDays(today(), -i * 30),
        });
      createPlan('Year ' + p, data);
      years.push(plans.current);
    }
    reviewView.tab = 'year';
    check('3 plans x 2 years: yearly review', 200, () => setView('review'));
    reviewView.tab = 'week';
    years.forEach(id => deletePlan(id));
    // Visions, last so their extra drawing doesn't weigh on the checks above: the 300-item map again,
    // with 20 visions in a tree that every goal serves (clouds, lines, the glow, a gold Purpose).
    createPlan('Visions map', emptyDb());
    for (let i = 0; i < 30; i++)
      db.goals.push({
        id: 'g' + i,
        title: 'Goal ' + i,
        status: 'active',
        baseline: '0',
        target: '10',
        visions: ['v' + (i % 20)],
      });
    for (let i = 0; i < 240; i++) {
      db.activities.push({
        id: 'a' + i,
        title: 'Activity ' + i,
        status: st[i % 3],
        dueDate: addDays(today(), (i % 40) - 10),
      });
      db.relations.push({ id: 'c' + i, from: 'a' + i, to: 'g' + (i % 30), type: 'contributes' });
      if (i % 8) db.relations.push({ id: 'd' + i, from: 'a' + i, to: 'a' + (i - 1), type: 'depends' });
    }
    for (let i = 0; i < 30; i++) {
      db.states.push({ id: 's' + i, title: 'State ' + i, value: String(i), date: today(), history: [] });
      db.relations.push({ id: 'm' + i, from: 's' + i, to: 'g' + i, type: 'measures' });
    }
    for (let i = 0; i < 20; i++)
      visions.list.push({ id: 'v' + i, title: 'Vision ' + i, parents: i ? ['v' + ((i - 1) >> 1)] : [] });
    // That is a Purpose: drawn gold, but without the popup.
    visions.purposeFound = today();
    save();
    saveVisions();
    check('300 items + 20 visions: map view', 300, () => setView('map'));
    check('20 visions: visions view', 100, () => setView('visions'));
    check('300 items + 20 visions: goals view with glow', 150, () => setView('goals'));
    visions = { list: [], deleted: {} };
    saveVisions();
    deletePlan(plans.current);
  } catch (e) {
    out.push(`FAIL perf setup: ${e}`);
  }
  const pre = document.createElement('pre');
  pre.id = 'PERF';
  pre.textContent = out.join('\n');
  document.body.append(pre);
})();
