// Runs after the app in the stored-data fixture pages (scripts/fixtures.mjs). __FX.mode picks the job:
//   build:<name>  build a fixture with the app's own functions (fixtures:generate)
//   roundtrip     the stored data as it is: open every view for every user, save, dump storage
//   restore       restore __FX.backup into this (empty) device and check its plans and visions came back
//   import        import __FX.file as a plan, export it again (owner's private files)
// The result goes into <pre id="FX"> as JSON.
(async () => {
  const out = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const dump = () =>
    Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map(k => [k, localStorage.getItem(k)]),
    );
  const day = n => addDays(today(), n); // a date n days from the frozen today

  // Every view drawn once, then the remembered view back, then saved: for each user on the device,
  // ending with the one who was open.
  const settle = () => {
    const visit = () => {
      const was = ui.view;
      Object.keys(VIEWS).forEach(setView);
      setView(was);
      save();
    };
    if (users.list.length < 2) return visit();
    const open = users.current;
    users.list
      .map(u => u.id)
      .filter(id => id !== open)
      .concat(open)
      .forEach(id => {
        enterUser(id);
        visit();
      });
  };
  const outputs = () => ({
    sync: toFile(localStore()),
    exportFull: planFile('full'),
    exportTemplate: planFile('template'),
    backup: backupFile(),
  });

  const BUILD = {
    'sample-en'() {
      loadSample();
    },
    'sample-sl'() {
      loadSample();
    },

    // The data as the single-plan version stored it: one plan, no change stamps, no tombstones,
    // and an "is related to" link (dropped by later versions).
    'legacy-single'() {
      const d = sampleData();
      for (const c of SYNC_COLLS) d[c].forEach(x => delete x.updatedAt);
      delete d.deleted;
      d.relations.push({ id: 'legacy-related', from: d.goals[0].id, to: d.goals[1].id, type: 'related' });
      out.legacy = d;
    },

    // A first user (the plain keys) and a second one (actionplan.u.<id>.…), both signed in, each with
    // plans, visions and preferences of their own.
    'two-users'() {
      loadSample();
      visions.list.push({ id: uid(), title: 'Healthy and strong', parents: [] });
      saveVisions();
      prefs.set('hideDone', true);
      prefs.set('theme', 'dark');
      Object.assign(currentUser(), { name: 'Ana', account: { id: 'acct-ana', email: 'ana@example.com' } });
      saveUsers();
      const bor = addUser();
      Object.assign(bor, { name: 'Bor', account: { id: 'acct-bor', email: 'bor@example.com' } });
      saveUsers();
      enterUser(bor.id);
      createPlan('Garden');
      db.goals.push({
        id: uid(),
        title: 'Grow tomatoes',
        status: 'active',
        deadline: day(120),
        baseline: '0',
        target: '20',
        current: '3',
      });
      save();
      visions.list.push({ id: uid(), title: 'A green home', parents: [] });
      saveVisions();
      prefs.set('mapScale', 1.5);
      setView('map');
    },

    // One plan using every feature, built over three days so change stamps and tombstones differ:
    // the sample plan plus routines of each repeat kind, lists, amounts, measurements, visions with
    // parents, goals serving them, and deleted items, a deleted vision and a deleted plan.
    rich() {
      const start = __clock.now;
      __clock.set('2026-09-01T07:30:00.000Z');
      const starter = plans.current;
      createPlan('Everything', sampleData());
      deletePlan(starter);
      const act = o => {
        const a = { id: uid(), title: o.title, description: '', status: 'todo', startDate: day(-30), ...o };
        db.activities.push(a);
        return a;
      };
      const rel = (from, to, type) => db.relations.push({ id: uid(), from: from.id, to: to.id, type });
      const routines = [
        act({ title: 'Stretch every other day', repeat: { every: 2, unit: 'day' } }),
        act({ title: 'Swim on Monday and Thursday', repeat: { every: 1, unit: 'week', days: [0, 3], makeUp: true } }),
        act({ title: 'Long walk every two weeks', repeat: { every: 2, unit: 'week', times: 1 } }),
        act({ title: 'Pay the rent', repeat: { every: 1, unit: 'month', on: 'day', day: 31 } }),
        act({ title: 'Review the budget', repeat: { every: 1, unit: 'month', on: 'lastDay' } }),
        act({ title: 'Book club', repeat: { every: 1, unit: 'month', on: 'nth', nth: -1, weekday: 3 } }),
        act({ title: 'Hike twice a month', repeat: { every: 1, unit: 'month', times: 2 } }),
        act({ title: 'Yearly check-up', repeat: { every: 1, unit: 'year' }, startDate: day(-200) }),
        act({
          title: 'Ten guitar lessons',
          repeat: { every: 1, unit: 'week', days: [2], count: 10 },
          dueDate: day(33),
        }),
        act({ title: 'Old weekly habit', repeat: { times: 2, per: 'week' } }),
        act({ title: 'Old set days', repeat: { days: [1, 4] } }),
        act({ title: 'Old monthly on a weekday', repeat: { every: 1, unit: 'month', on: 'weekday' } }),
      ];
      routines.forEach((a, i) =>
        [-1, -2, -3, -5, -8].forEach((n, k) => setCheckin(a, day(n - (i % 3)), (k + i) % 4 !== 3)),
      );
      const morning = act({
        title: 'Morning list',
        repeat: { every: 1, unit: 'day' },
        list: [
          { id: uid(), text: 'Water' },
          { id: uid(), text: 'Stretch' },
          { id: uid(), text: 'Plan the day' },
        ],
      });
      const [i1, i2, i3] = morning.list.map(i => i.id);
      setDayItems(morning, day(-2), { [i1]: 1, [i2]: 1, [i3]: 1 });
      setCheckin(morning, day(-2), true);
      setDayItems(morning, day(-1), { [i1]: 1, [i2]: 0 });
      const pack = act({
        title: 'Pack for the trip',
        status: 'doing',
        dueDate: day(10),
        list: [
          { id: uid(), text: 'Tent', done: true, at: new Date().toISOString() },
          { id: uid(), text: 'Stove', done: false },
        ],
      });
      pack.droppedItems = { [uid()]: 1 };
      act({ title: 'Starts on its own', startDate: day(1), dueDate: day(5) });
      const water = {
        id: uid(),
        title: 'Water drunk',
        description: 'Litres a day',
        unit: 'l',
        value: '',
        date: '',
        history: [],
        cumulative: true,
        scale: 'day',
        entries: [],
      };
      const weight = { id: uid(), title: 'Weight', description: '', unit: 'kg', value: '', date: '', history: [] };
      db.states.push(water, weight);
      rel(routines[0], water, 'improves');
      rel(water, db.goals[0], 'measures');
      db.goals[0].period = 'week';
      addEntry(water, day(-3), 1.5);
      addEntry(water, day(-2), '2', routines[0]);
      const spilt = addEntry(water, day(-2), 0.25);
      [
        [-20, '82.4'],
        [-10, '81.9'],
        [-4, '81.2'],
      ].forEach(([n, v]) => recordMeasurement(weight, day(n), v));
      rel(weight, db.goals[1], 'measures');
      rel(db.goals[2], db.goals[3], 'depends');
      Object.assign(db.goals[4], { status: 'achieved' });
      Object.assign(db.goals[5], { status: 'paused' });
      save();

      __clock.set('2026-10-20T16:45:00.000Z');
      const life = { id: uid(), title: 'A good life', description: 'What it is all for', parents: [] };
      const body = { id: uid(), title: 'A healthy body', parents: [life.id] };
      const mind = { id: uid(), title: 'A calm mind', parents: [life.id] };
      const both = { id: uid(), title: 'Energy for the family', parents: [body.id, mind.id] };
      const dream = { id: uid(), title: 'An old dream', parents: [] };
      visions.list.push(life, body, mind, both, dream);
      saveVisions();
      db.goals[0].visions = [body.id];
      db.goals[1].visions = [mind.id, both.id];
      dropEntry(water, spilt.id);
      deleteMeasurement(weight, day(-10));
      const gone = db.activities.find(
        a => !isRoutine(a) && !a.list && relsTo(a.id).length === 0 && relsFrom(a.id).length > 0,
      );
      db.relations = db.relations.filter(r => r.from !== gone.id && r.to !== gone.id);
      db.activities = db.activities.filter(a => a !== gone);
      save();

      __clock.set(start);
      visions.list = visions.list.filter(v => v !== dream);
      saveVisions();
      db.goals[6].offeredAt = day(-1);
      recordMeasurement(weight, today(), '80.8');
      prefs.set('hideDone', true);
      prefs.set('mapHidden', ['improves']);
      setView('timeline');
      save();
    },

    // Feature 6 (goal form): a goal saved with a title alone, one with the obstacle and the plan for
    // it, one with the old answer to "Why is this realistic?"; a Purpose found, its glow not golden.
    'goal-form'() {
      const life = { id: uid(), title: 'A good life', parents: [] };
      visions.list.push(life);
      saveVisions();
      db.goals.push(
        { id: uid(), title: 'Learn to cook', status: 'active', startDate: day(-3), visions: [life.id] },
        {
          id: uid(),
          title: 'Run a half marathon',
          status: 'active',
          specific: 'Run 21 km without stopping by spring',
          metric: 'Longest run',
          unit: 'km',
          baseline: '5',
          current: '8',
          target: '21',
          obstacle: 'Tired after work and skip the run',
          ifThen: 'If I am tired, I walk for ten minutes',
          relevant: 'I want to feel strong',
          startDate: day(-30),
          deadline: day(150),
          visions: [life.id],
        },
        {
          id: uid(),
          title: 'Read twelve books',
          status: 'active',
          specific: 'Read twelve books before the year ends',
          metric: 'Books',
          baseline: '0',
          target: '12',
          achievable: 'One a month fits my evenings',
          relevant: 'Reading keeps me curious',
          startDate: day(-40),
          deadline: day(40),
          visions: [life.id],
        },
      );
      save();
    },
  };

  try {
    await sleep(300); // whatever the boot does later (tour offer, first render) is done
    const mode = __FX.mode;
    if (mode.startsWith('build:')) {
      BUILD[mode.slice(6)]();
      if (mode !== 'build:legacy-single') {
        settle();
        await sleep(300);
        if (mode === 'build:rich') Object.assign(out, outputs());
        out.storage = dump();
      }
    } else if (mode === 'roundtrip') {
      settle();
      await sleep(300);
      if (__FX.outputs) Object.assign(out, outputs());
      out.storage = dump();
    } else if (mode === 'restore') {
      const text = JSON.stringify(__FX.backup);
      restoreText(text);
      await sleep(300);
      out.problems = restoreProblems(parseStore(text));
    } else if (mode === 'import') {
      const { name, text } = __FX.file;
      const plan = parsePlanFile(text, name);
      addImported(plan.name, plan.data); // keeps its progress, as "Keep progress" does
      const raw = JSON.parse(text),
        got = planFile('full');
      out.want = Object.fromEntries(SYNC_COLLS.map(c => [c, raw[c] || []]));
      out.got = Object.fromEntries(SYNC_COLLS.map(c => [c, got[c]]));
    }
  } catch (e) {
    out.crash = String((e && e.stack) || e);
  }

  // Each plan of the backup is here under a new id with the same content (and no tombstones), and
  // every vision of the backup is in the list as it was, stamped as changed now (so sync carries it).
  function restoreProblems(backup) {
    const problems = [];
    for (const p of backup.plans.list) {
      const here = plans.list.find(q => q.name.startsWith(p.name + ' (') && q.id !== p.id);
      if (!here) {
        problems.push(`plan "${p.name}" missing`);
        continue;
      }
      const stored = JSON.parse(localStorage.getItem(planKey(here.id)));
      const want = { ...backup.data[p.id], deleted: {} };
      if (JSON.stringify(stored) !== JSON.stringify(want)) problems.push(`plan "${p.name}" differs`);
    }
    for (const v of backup.visions.list) {
      const here = visions.list.find(x => x.id === v.id);
      const want = { ...v, updatedAt: new Date().toISOString() };
      if (!here || JSON.stringify(here) !== JSON.stringify(want))
        problems.push(`vision "${v.title}" ${here ? 'differs' : 'missing'}`);
    }
    return problems;
  }

  out.errors = __errors;
  const pre = document.createElement('pre');
  pre.id = 'FX';
  pre.textContent = JSON.stringify(out);
  document.body.append(pre);
})();
