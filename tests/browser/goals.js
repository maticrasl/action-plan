/** Page tests: view filters and search, blockers and waits, goal progress, order by deadline, target reached. */
suite(async () => {
  loadSample(); // the toolbar and search steps filter the sample plan's goals
  await step('view toolbar toggles and filters', () => {
    setView('timeline');
    assert(!$('[data-tl-deps]') && !$('[data-tl-zoom]') && !$('.tl-legend'), 'no dependency, zoom or legend controls');
    assert($('.tl-corner [data-tl-fold-all]'), 'Collapse all sits in the corner');
    $('[data-hide-done]').click();
    const hd = ui.hideDone;
    $('[data-hide-done]').click();
    const sel = $('[data-goal-select]');
    sel.value = db.goals[0].id;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    assert(ui.timelineGoal === db.goals[0].id);
    const tl = fp();
    sel.value = '';
    $('[data-goal-select]').value = '';
    $('[data-goal-select]').dispatchEvent(new Event('change', { bubbles: true }));
    setView('goals');
    $('[data-goal-filter="all"]').click();
    assert(ui.goalFilter === 'all');
    const cat = $('.toolbar [data-category-select]');
    assert(cat && !$('.cat-chips'), 'categories are a dropdown in the toolbar');
    cat.value = 'Health';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    assert(ui.category === 'Health' && prefs.get('category') === 'Health');
    eq($('[data-category-select]').value, 'Health', 'shown picked after the redraw');
    const n = $('#view').querySelectorAll('.card.goal').length;
    $('[data-category-select]').value = '';
    $('[data-category-select]').dispatchEvent(new Event('change', { bubbles: true }));
    assert(ui.category === '');
    for (const v of ['activities', 'map', 'timeline', 'graphs'])
      setView(v), assert($('.toolbar [data-category-select] + [data-goal-select]'), v + ': category beside the goal picker');
    setView('goals');
    setView('map');
    $('[data-rel-toggle="depends"]').click();
    assert(ui.mapHidden.has('depends'));
    $('[data-rel-toggle="depends"]').click();
    $('[data-map-zoom="in"]').click();
    const z = ui.mapScale;
    $('[data-map-zoom="reset"]').click();
    const node = $('[data-map-node]');
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(ui.mapSelected, 'selected');
    const mapSel = fp();
    $('[data-map-clear]').click();
    assert(!ui.mapSelected);
    return `hideDone=${hd} health=${n} zoom=${z} tl=${tl} mapSel=${mapSel}`;
  });
  await step('search box', () => {
    setView('goals');
    const box = $('[data-search]');
    box.value = 'marathon';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    const n = $('#view').querySelectorAll('.card.goal').length;
    setView('goals');
    return `matches=${n}`;
  });

  await step('blockers, inherited waits and item states', () => {
    fresh('States');
    const parent = mk('activity'),
      child = mk('activity'),
      q = mk('activity', { title: 'Prerequisite' });
    rel(child, parent, 'subactivity');
    rel(parent, q, 'depends');
    eq(
      blockers(child).map(x => x.id),
      [q.id],
      'child inherits the parent dependency',
    );
    const seq = [activityState(child)];
    q.status = 'done';
    seq.push(activityState(child));
    child.dueDate = d(-1);
    seq.push(activityState(child));
    child.dueDate = d(5);
    child.status = 'doing';
    seq.push(activityState(child));
    child.status = 'done';
    seq.push(activityState(child));
    eq(seq, ['blocked', 'todo', 'late', 'doing', 'done'], 'activity states');
    q.status = 'todo';
    child.status = 'doing';
    cycleStatus(child.id);
    assert(
      child.status === 'done' && $('#toast').textContent === t('acts.notDone', { name: 'Prerequisite' }),
      'warns when finishing a blocked activity',
    );

    const g = mk('goal', { target: '10', baseline: '0' }),
      h = mk('goal');
    rel(g, h, 'depends');
    const gs = [goalState(g)];
    h.status = 'achieved';
    gs.push(goalState(g));
    g.deadline = d(-2);
    gs.push(goalState(g));
    g.deadline = d(30);
    g.status = 'paused';
    gs.push(goalState(g));
    g.status = 'active';
    g.startDate = d(-3);
    gs.push(goalState(g));
    g.startDate = d(3);
    g.current = '4';
    gs.push(goalState(g));
    g.status = 'achieved';
    gs.push(goalState(g));
    eq(gs, ['blocked', 'todo', 'late', 'todo', 'doing', 'doing', 'done'], 'goal states');
    return `activity ${seq.join('>')} | goal ${gs.join('>')}`;
  });
  await step('goal progress: measuring states, clamping, falling targets', () => {
    fresh('Progress');
    const g = mk('goal', { baseline: '10', target: '20', current: '15' });
    const out = [goalProgress(g)];
    const s1 = mk('state', { value: '12', date: '2099-01-01' }),
      s2 = mk('state', { value: '18', date: '2099-02-01' }),
      junk = mk('state', { value: 'n/a', date: '2099-03-01' });
    [s1, s2, junk].forEach(s => rel(s, g, 'measures'));
    out.push(goalProgress(g)); // latest numeric state wins
    s2.value = '25';
    out.push(goalProgress(g));
    s2.value = '5';
    out.push(goalProgress(g));
    const falling = mk('goal', { baseline: '80', target: '70', current: '75' });
    const flat = mk('goal', { baseline: '5', target: '5' });
    const noBase = mk('goal', { target: '4', current: '1' });
    out.push(goalProgress(falling), goalProgress(flat), goalProgress(noBase));
    g.status = 'achieved';
    out.push(goalProgress(g));
    eq(out, [50, 80, 100, 0, 50, 0, 25, 100], 'progress values');

    const a = mk('activity'),
      sub = mk('activity'),
      other = mk('activity');
    rel(a, g, 'contributes');
    rel(sub, a, 'subactivity');
    eq(
      goalActivities(g)
        .map(x => x.id)
        .sort(),
      [a.id, sub.id].sort(),
      'contributors and their sub-activities',
    );
    const sg = mk('goal'),
      pre = mk('goal'),
      st = mk('state');
    rel(sg, g, 'subgoal');
    rel(g, pre, 'depends');
    rel(sub, st, 'improves');
    const sc = goalScope(g.id);
    assert([g, sg, pre].every(x => sc.goal.has(x.id)) && !sc.goal.has(falling.id), 'scope goals');
    assert(sc.activity.has(a.id) && sc.activity.has(sub.id) && !sc.activity.has(other.id), 'scope activities');
    assert(sc.state.has(st.id) && sc.state.has(s1.id), 'scope states');
    // A sub-activity turned into a dependency stays in its goal's views (it waits for the goal's work).
    const kid = mk('activity'),
      grandkid = mk('activity'),
      elsewhere = mk('activity');
    rel(kid, a, 'subactivity');
    rel(grandkid, kid, 'subactivity');
    rel(elsewhere, other, 'subactivity');
    const link = db.relations.find(r => r.from === kid.id && r.type === 'subactivity');
    ui.mapGoal = g.id;
    setView('map');
    openForm('relation', link.id);
    $('#f-type').value = 'depends';
    submitForm();
    assert(link.type === 'depends' && !modal.open, 'relation edited');
    assert($(`[data-map-node="${kid.id}"]`) && $(`[data-map-node="${grandkid.id}"]`), 'still on the goal-focused map');
    const sc2 = goalScope(g.id);
    assert(
      sc2.activity.has(kid.id) &&
        sc2.activity.has(grandkid.id) &&
        !sc2.activity.has(elsewhere.id) &&
        !sc2.activity.has(other.id),
      'waiting activity and its sub-activities in scope only',
    );
    ui.mapGoal = '';
    return out.map(Math.round).join(',');
  });
  await step('goals measured by their activities', () => {
    fresh('ByActivities');
    const g = mk('goal', {
      title: 'Counted goal',
      specific: 'Finish all the work for this goal',
      achievable: 'Small steps each week',
      relevant: 'It matters to me',
      deadline: '2099-01-01',
      progress: 'activities',
      target: '10',
      metric: 'Old metric',
    });
    const sub = mk('goal'),
      elsewhere = mk('goal');
    const parent = mk('activity'),
      k1 = mk('activity'),
      k2 = mk('activity'),
      viaSub = mk('activity'),
      other = mk('activity');
    rel(sub, g, 'subgoal');
    rel(parent, g, 'contributes');
    rel(k1, parent, 'subactivity');
    rel(k2, parent, 'subactivity');
    rel(viaSub, sub, 'contributes');
    rel(other, elsewhere, 'contributes');
    eq(
      countedActivities(g)
        .map(a => a.id)
        .sort(),
      [k1.id, k2.id, viaSub.id].sort(),
      'only the actual work, sub-goals included',
    );
    const pcts = [goalProgress(g)];
    k1.status = 'done';
    pcts.push(goalProgress(g));
    parent.status = 'done';
    pcts.push(goalProgress(g)); // a parent with parts does not count itself
    k2.status = viaSub.status = 'done';
    pcts.push(goalProgress(g));
    eq(pcts.map(Math.round), [0, 33, 33, 100], 'progress');
    k2.status = viaSub.status = 'todo';
    assert(goalProgress({ ...emptyDb(), id: 'none', progress: 'activities' }) === 0, 'no activities: 0 %');
    const c = smartCheck({ ...g, metric: '', target: '' });
    assert(c.M && !c.errs.metric && !c.errs.target, 'M met without a metric');
    save();

    setView('goals');
    const card = viewEl.querySelector(`.card.goal[data-open="${g.id}"]`).textContent;
    assert(
      card.includes('1 / 3') && card.includes('3 activities') && !card.includes('Old metric'),
      'card shows the activity count: ' + card.replace(/\s+/g, ' '),
    );

    openForm('goal', g.id);
    assert(
      $('#f-progress').value === 'activities' && $('#measureFields').hidden && !$('#actsHint').hidden,
      'form opens in activity mode',
    );
    const live = () => $('#smartLive').querySelector('b:nth-child(2)').classList.contains('on');
    const m0 = live();
    $('#f-progress').value = 'measure';
    $('#f-progress').dispatchEvent(new Event('change', { bubbles: true }));
    assert(!$('#measureFields').hidden && $('#actsHint').hidden, 'switching shows the metric fields');
    $('#f-metric').value = '';
    $('#modalForm').dispatchEvent(new Event('input'));
    const m1 = live();
    $('#f-progress').value = 'activities';
    $('#f-progress').dispatchEvent(new Event('change', { bubbles: true }));
    $('#f-baseline').value = 'junk'; // hidden fields are not validated
    submitForm();
    assert(
      !modal.open && g.progress === 'activities' && g.target === '10',
      'saved in activity mode, metric fields kept',
    );
    assert(m0 && !m1, 'live SMART badge follows the mode');

    openForm('goal', g.id);
    $('#f-progress').value = 'measure';
    $('#f-progress').dispatchEvent(new Event('change', { bubbles: true }));
    $('#f-metric').value = 'Pages';
    $('#f-baseline').value = '0';
    $('#f-target').value = '10';
    submitForm();
    assert(!modal.open && !('progress' in g) && g.metric === 'Pages', 'switched back to a measurement');
    openForm('goal');
    assert($('#f-progress').value === 'measure', 'new goals start with a measurement');
    modal.close();
  });
  await step('goals by deadline: Goals, Overview and Timeline top to bottom; the map ignores dates', () => {
    fresh('By deadline');
    const now = today();
    const none = mk('goal', { title: 'No deadline', status: 'active' });
    const late = mk('goal', {
      title: 'Late',
      deadline: addDays(now, 90),
      startDate: addDays(now, -30),
      status: 'active',
    });
    const soon = mk('goal', {
      title: 'Soon',
      deadline: addDays(now, 10),
      startDate: addDays(now, 5),
      status: 'active',
    });
    const mid = mk('goal', {
      title: 'Mid',
      deadline: addDays(now, 40),
      startDate: addDays(now, -60),
      status: 'active',
    });
    // A group: an activity for Mid and a state measuring it.
    const a = mk('activity', { title: 'For mid', startDate: now, dueDate: addDays(now, 20) });
    const s = mk('state', { title: 'Mid state', history: [] });
    rel(a, mid, 'contributes');
    rel(s, mid, 'measures');
    save();
    const want = ['Soon', 'Mid', 'Late', 'No deadline'];
    setView('goals');
    eq(
      [...document.querySelectorAll('.card.goal h3')].map(h => h.textContent),
      want,
      'Goals view, no deadline last',
    );
    setView('dashboard');
    eq(
      [...document.querySelectorAll('.card.goal h3')].map(h => h.textContent),
      want,
      'Overview',
    );
    setView('timeline');
    eq(
      [...document.querySelectorAll('.tl-row.goal .tl-title')].map(x => x.textContent),
      want,
      'Timeline: by deadline, not start',
    );
    setView('map');
    const x = it => $(`[data-map-node="${it.id}"]`).getBoundingClientRect().left;
    const nearest = (b, gs) => gs.reduce((m, g) => (Math.abs(x(g) - x(b)) < Math.abs(x(m) - x(b)) ? g : m));
    const goals4 = [soon, mid, late, none];
    assert(nearest(a, goals4) === mid && nearest(s, goals4) === mid, 'a goal’s activities and states stay with it');
    // Dates play no part in the map: other deadlines leave every box where it was.
    const places = () => goals4.map(x).map(Math.round);
    const wasPlaces = places();
    soon.deadline = addDays(now, 300);
    none.deadline = addDays(now, 1);
    save();
    render();
    eq(places(), wasPlaces, 'map: changing deadlines moves nothing');
    delete none.deadline;
    soon.deadline = addDays(now, 10);
    save();
    render();
    eq(
      [...$('[data-goal-select]').options].slice(1).map(o => o.textContent),
      want,
      'goal filter list',
    );
    deletePlan(plans.current);
    // Goals linked to each other stay together, wherever their dates fall; sharing an activity does not link them.
    fresh('Goal trees');
    const top = mk('goal', { title: 'Top', deadline: addDays(now, 100) }),
      sub = mk('goal', { title: 'Sub', deadline: addDays(now, 5) });
    const early = mk('goal', { title: 'Early', deadline: addDays(now, 30) }),
      later = mk('goal', { title: 'Later', deadline: addDays(now, 60) });
    const shared = mk('activity', { title: 'Shared', startDate: now, dueDate: addDays(now, 9) });
    rel(sub, top, 'subgoal');
    rel(shared, early, 'contributes');
    rel(shared, later, 'contributes');
    save();
    setView('map');
    assert(
      !(Math.min(x(early), x(later)) < x(sub) && x(sub) < Math.max(x(early), x(later))),
      'Sub is not between Early and Later, which share an activity',
    );
    deletePlan(plans.current);
    // Soon and Late serve one vision, Mid another, so Mid between them would cross a line.
    fresh('Dates and visions');
    const keptVisions = visions;
    visions = { list: [], deleted: {} };
    const v1 = { id: uid(), title: 'Wide vision', parents: [] },
      v2 = { id: uid(), title: 'Other vision', parents: [] };
    visions.list.push(v1, v2);
    const gs = mk('goal', { title: 'Soon', deadline: addDays(now, 10), visions: [v1.id] });
    const gm = mk('goal', { title: 'Mid', deadline: addDays(now, 40), visions: [v2.id] });
    const gl = mk('goal', { title: 'Late', deadline: addDays(now, 90), visions: [v1.id] });
    const gn = mk('goal', { title: 'Free', deadline: addDays(now, 50) });
    save();
    saveVisions();
    setView('map');
    const seg = g => [x(g), x(findVision(g.visions[0]))];
    const cross = (a, b) => (seg(a)[0] - seg(b)[0]) * (seg(a)[1] - seg(b)[1]) < 0;
    assert(
      !cross(gs, gm) && !cross(gm, gl) && !cross(gs, gl),
      `no lines cross: ${[gs, gm, gl].map(g => g.title + ' ' + seg(g).map(Math.round)).join(', ')}`,
    );
    assert(!(Math.min(x(gs), x(gl)) < x(gm) && x(gm) < Math.max(x(gs), x(gl))), 'Mid moved out from between them');
    deletePlan(plans.current);
    // When a crossing cannot be avoided, it falls on the activities' lines, not on those to the visions.
    fresh('Visions first');
    const g1 = mk('goal', { title: 'One', visions: [v1.id] }),
      g2 = mk('goal', { title: 'Two', visions: [v2.id] }),
      g3 = mk('goal', { title: 'Three', visions: [v1.id] });
    const a12 = mk('activity', { title: 'A', startDate: now, dueDate: addDays(now, 9) }),
      a23 = mk('activity', { title: 'B', startDate: now, dueDate: addDays(now, 9) });
    rel(a12, g1, 'contributes');
    rel(a12, g2, 'contributes');
    rel(a23, g2, 'contributes');
    rel(a23, g3, 'contributes');
    save();
    setView('map');
    assert(
      !(Math.min(x(g1), x(g3)) < x(g2) && x(g2) < Math.max(x(g1), x(g3))),
      'the goal of the other vision is not between them',
    );
    deletePlan(plans.current);
    visions = keptVisions;
    saveVisions();
    return want.join(' < ');
  });
  await step('target reached: a toast offers to mark the goal achieved, once, not for an existing plan', async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // An existing plan with a goal already at its target: no toast on opening it.
    const done = {
      ...emptyDb(),
      goals: [
        { id: 'g0', title: 'Already there', status: 'active', baseline: '0', target: '5', current: '5', metric: 'm' },
      ],
    };
    createPlan('Reached already', done);
    await wait(10);
    assert(!$('#toast').classList.contains('has-action') && db.goals[0].offeredAt, 'quietly noted');
    deletePlan(plans.current);
    await wait(300);
    fresh('Reached');
    const s = mk('state', { title: 'Items', history: [] });
    const g = mk('goal', { title: 'Sell 3', baseline: '0', target: '3', metric: 'Sold' });
    rel(s, g, 'measures');
    recordMeasurement(s, today(), '2');
    save();
    await wait(10);
    assert(!$('#toast').classList.contains('has-action'), 'below the target: nothing');
    recordMeasurement(s, today(), '3');
    save();
    await wait(10);
    const box = $('#toast');
    assert(
      box.classList.contains('has-action') && box.textContent.startsWith(t('reached.text', { name: 'Sell 3' })),
      box.textContent,
    );
    // It stays longer than a plain toast.
    await wait(2500);
    assert(box.classList.contains('show'), 'still there after 2.5 s');
    save();
    await wait(10);
    assert(
      box.textContent.startsWith(t('reached.text', { name: 'Sell 3' })) && reachedQueue.length === 0,
      'offered once',
    );
    box.querySelector('.toast-action').click();
    assert(
      g.status === 'achieved' && box.textContent === t('ctx.statusSet', { s: t('goal.achieved') }),
      'marked achieved',
    );
    // Reactivated and dropped below, then reached again: offered again.
    g.status = 'active';
    recordMeasurement(s, today(), '1');
    save();
    assert(!g.offeredAt, 'below again: re-armed');
    recordMeasurement(s, today(), '4');
    save();
    await wait(10);
    assert($('#toast').classList.contains('has-action'), 'offered again');
    hideToast();
    // Two goals at once: one toast at a time.
    const g2 = mk('goal', { title: 'Sell 2', baseline: '0', target: '2', metric: 'Sold' }),
      g3 = mk('goal', { title: 'Sell 1', baseline: '0', target: '1', metric: 'Sold' });
    rel(s, g2, 'measures');
    rel(s, g3, 'measures');
    save();
    await wait(10);
    const firstText = $('#toast').textContent;
    hideToast();
    await wait(300);
    assert(
      $('#toast').textContent !== firstText && $('#toast').classList.contains('has-action'),
      'the next one follows',
    );
    hideToast();
    // A goal measured by routines has no target to reach.
    assert(!goalReached({ status: 'active', progress: 'routines' }), 'routines: never');
    deletePlan(plans.current);
    await wait(300);
    return firstText;
  });
});
