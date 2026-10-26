// Extra coverage, run by test.js after its own steps: rules, progress, change tracking,
// merge edge cases, persistence, sync states, drag & drop, keyboard, zoom, i18n plurals.
window.moreTests = async ({ step, assert }) => {
  const tick = () => new Promise(r => setTimeout(r, 0));
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoDate(x); };
  const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m || 'expected'} ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  const fresh = name => { createPlan(name); assert(itemCount() === 0); };
  const mk = (kind, p = {}) => {
    const base = { goal: { status: 'active' }, activity: { status: 'todo' }, state: { history: [] } }[kind];
    const x = { id: uid(), title: `${kind} ${Math.random().toString(36).slice(2, 6)}`, ...base, ...p };
    collection(kind).push(x);
    return x;
  };
  const rel = (a, b, type) => { const e = addRelation(a.id, b.id, type); assert(!e, `${type}: ${e}`); };
  const plansBefore = plans.list.map(p => p.id);

  await step('sample plan: every relation follows the rules; house renovation category', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      loadSample();
      const all = [...db.relations];
      all.forEach(r => {
        db.relations = all.filter(x => x !== r);
        const err = canRelate(r.from, r.to, r.type);
        assert(!err, `${code} ${r.type} ${findEntity(r.from)?.item.title} → ${findEntity(r.to)?.item.title}: ${err}`);
      });
      db.relations = all;
      assert(repairRelations(db).length === all.length, 'merge repair keeps every sample relation');
      const cat = { en: 'House renovation', sl: 'Prenova hiše' }[code];
      setView('goals');
      $(`[data-category="${cat}"]`).click();
      const cards = viewEl.querySelectorAll('.card.goal').length;
      $(`[data-category="${cat}"]`).click();
      assert(cards === 2, `${cat}: ${cards} goals`);
    }
    changeLanguage('en');
    const reno = db.goals.filter(g => ['House renovation', 'Prenova hiše'].includes(g.category));
    return reno.map(g => `${g.title}=${Math.round(goalProgress(g))}% ${goalState(g)}`).join(', ');
  });

  await step('date fields: dd/mm/yyyy typing, picker and validation', () => {
    const ok = [['7/3/2026', '2026-03-07'], ['07/03/2026', '2026-03-07'], ['7.3.2026', '2026-03-07'], ['7. 3. 2026', '2026-03-07'], ['29/02/2028', '2028-02-29'], ['2026-03-07', '2026-03-07']];
    ok.forEach(([s, iso]) => assert(parseDateInput(s) === iso, `${s} → ${parseDateInput(s)}`));
    ['31/02/2026', '29/02/2027', '13/13/2026', '7/3/26', 'tomorrow', '', '2026-3-7'].forEach(s => assert(parseDateInput(s) === null, `${s} should be rejected`));
    assert(dateInput('2026-03-07') === '07/03/2026' && dateInput('') === '', 'shown as dd/mm/yyyy');

    fresh('Dates');
    changeLanguage('sl');
    openForm('activity');
    const due = $('#f-dueDate');
    assert(due.type === 'text' && due.placeholder === 'dd/mm/llll' && $('[data-field="dueDate"] .date-pick').title === 'Izberi datum', 'Slovenian dd/mm/llll field');
    const type = ch => { due.value += ch; due.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch })); };
    due.value = ''; due.focus();
    '24102026'.split('').forEach(type);
    const typed = due.value;
    assert(typed === '24/10/2026', 'slashes added while typing: ' + typed);
    due.value = ''; '7/3/2026'.split('').forEach(type);
    assert(due.value === '7/3/2026', 'typed slashes kept: ' + due.value);
    // The calendar: Monday first, opens on the field's date, picks into the field.
    const calBtn = f => $(`[data-field="${f}"] [data-cal-open]`);
    const key = k => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    $('#f-startDate').value = '15/02/2026';
    calBtn('startDate').click();
    const cal1 = $('[data-field="startDate"] .cal');
    const head = cal1.querySelector('.cal-head strong').textContent;
    const weekdays = [...cal1.querySelectorAll('.cal-wd')].map(w => w.textContent);
    const blanks = cal1.querySelectorAll('.cal-grid > span:not(.cal-wd)').length;
    assert(calBtn('startDate').getAttribute('aria-expanded') === 'true' && document.activeElement.dataset.calDay === '2026-02-15', 'opens on the field date, day focused');
    assert(/^pon/i.test(weekdays[0]) && /^ned/i.test(weekdays[6]) && blanks === 6, `Monday first: ${weekdays} blanks=${blanks}`); // 1 Feb 2026 is a Sunday
    assert(cal1.querySelector('[data-cal-day="2026-02-15"]').getAttribute('aria-pressed') === 'true', 'chosen day marked');
    key('ArrowRight'); key('ArrowDown'); key('PageDown');
    const kb = document.activeElement.dataset.calDay;
    assert(kb === '2026-03-23', 'arrow and page keys: ' + kb);
    key('ArrowLeft');
    $('[data-field="startDate"] [data-cal-move="-1"]').click(); const back = $('[data-field="startDate"] .cal-head strong').textContent;
    $('[data-field="startDate"] [data-cal-move="1"]').click();
    assert(document.activeElement.dataset.calMove === "1" && /feb/i.test(back), "month buttons: " + back);
    const moved = $('[data-field="startDate"] .cal-head strong').textContent;
    $('[data-field="startDate"] [data-cal-day="2026-03-01"]').click();
    assert($('#f-startDate').value === '01/03/2026' && !$('.cal') && document.activeElement === $('#f-startDate'), 'picked day fills the field and closes');
    // An empty end date opens on the start date's month (also after the start was set by the calendar).
    due.value = '';
    calBtn('dueDate').click();
    const dueHead = $('[data-field="dueDate"] .cal-head strong').textContent;
    assert(document.activeElement.dataset.calDay === '2026-03-01', 'due calendar opens at the start date');
    key('Escape');
    assert(!$('.cal') && modal.open && document.activeElement === calBtn('dueDate'), 'Escape closes only the calendar');
    calBtn('dueDate').click();
    modal.dispatchEvent(new Event('cancel', { cancelable: true }));
    assert(!$('.cal') && modal.open, 'dialog cancel closes only the calendar');
    calBtn('dueDate').click(); calBtn('startDate').click();
    assert(document.querySelectorAll('.cal').length === 1 && $('[data-field="startDate"] .cal'), 'one calendar at a time');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    assert(!$('.cal'), 'click outside closes');
    calBtn('dueDate').click();
    $('[data-field="dueDate"] [data-cal-pick=""]').click();
    assert(due.value === '' && !$('.cal'), 'clear empties the field');
    calBtn('dueDate').click();
    $('[data-field="dueDate"] .cal-foot [data-cal-pick]').click();
    assert(due.value === dateInput(today()), 'today button');
    $('#f-title').value = 'Dated activity';
    due.value = '31/02/2026';
    submitForm();
    const err = modal.querySelector('[data-field="dueDate"] .err').textContent;
    assert(modal.open && err === t('err.date'), 'impossible date rejected: ' + err);
    due.value = '7/3/2026';
    submitForm();
    const a = db.activities.find(x => x.title === 'Dated activity');
    assert(a && a.startDate === '2026-03-01' && a.dueDate === '2026-03-07', 'stored as yyyy-mm-dd');
    openForm('activity', a.id);
    const shown = [$('#f-startDate').value, $('#f-dueDate').value];
    modal.close();
    changeLanguage('en');
    openForm('goal');
    const enPh = $('#f-deadline').placeholder, start = $('#f-startDate').value;
    modal.close();
    assert(enPh === 'dd/mm/yyyy' && start === dateInput(today()), 'English field and today as default start');
    return `typed ${typed} | calendar ${head} → ${moved}, due opens ${dueHead}, ${weekdays.join(" ")} | edit shows ${shown.join(", ")} | sl error "${err}"`;
  });

  await step('parseNum: separators, signs and junk', () => {
    const ok = [['78.5', 78.5], ['78,5', 78.5], ['1 234,5', 1234.5], ['1,234.5', 1234.5], ['1.234,5', 1234.5], ['−3', -3], ['+2', 2], ['.5', 0.5], [' 7 ', 7], ["1'000", 1000], ['0', 0]];
    ok.forEach(([s, v]) => assert(parseNum(s) === v, `${s} → ${parseNum(s)}`));
    ['12abc', '', '1.2.3', '-', 'abc', null, undefined, '1,2,3'].forEach(s => assert(Number.isNaN(parseNum(s)), `${s} should be NaN`));
    changeLanguage('sl'); const sl = numInput('78.5');
    changeLanguage('en'); const en = numInput('78.5');
    assert(sl === '78,5' && en === '78.5' && numInput('') === '' && numInput(null) === '');
    return `${ok.length} valid, 8 rejected, sl input=${sl}`;
  });

  await step('relation rules: cycles, one parent, duplicates, directions', () => {
    fresh('Rules');
    const [g1, g2, g3] = [mk('goal'), mk('goal'), mk('goal')];
    const [a1, a2, a3] = [mk('activity'), mk('activity'), mk('activity')];
    const s1 = mk('state');
    rel(a1, a2, 'depends'); rel(a2, a3, 'depends');
    assert(canRelate(a3.id, a1.id, 'depends') === t('err.cycle'), 'long depends cycle');
    assert(canRelate(a1.id, a2.id, 'depends') === t('err.relExists'), 'duplicate');
    assert(canRelate(g1.id, a1.id, 'depends') === t('err.relTo', { rel: relLabel('depends'), kind: kindList(['goal']) }), 'depends must stay within a kind');
    rel(a2, a1, 'subactivity');
    assert(canRelate(a2.id, a3.id, 'subactivity') === t('err.oneParent'), 'one parent');
    assert(canRelate(a1.id, a2.id, 'subactivity') === t('err.cycle'), 'parent cycle');
    rel(g2, g1, 'subgoal'); rel(g3, g2, 'subgoal');
    assert(canRelate(g1.id, g3.id, 'subgoal') === t('err.cycle'), 'subgoal cycle');
    eq(ancestors(g3.id, 'subgoal'), [g2.id, g1.id], 'ancestors');
    eq(descendants(g1.id, 'subgoal'), [g2.id, g3.id], 'descendants');
    rel(a1, s1, 'improves'); rel(s1, g1, 'measures'); rel(s1, a3, 'related');
    assert(canRelate(s1.id, a1.id, 'improves') === t('err.relFrom', { rel: relLabel('improves'), kind: kindList(['activity']) }), 'improves direction');
    assert(canRelate(g1.id, s1.id, 'measures'), 'measures direction');
    // A cycle through other types is fine: depends a3 → a1 is blocked, but related is not acyclic.
    assert(canRelate(a3.id, a1.id, 'related') === null, 'related may loop');
    return `${db.relations.length} relations, all rule errors as expected`;
  });

  await step('blockers, inherited waits and item states', () => {
    fresh('States');
    const parent = mk('activity'), child = mk('activity'), q = mk('activity', { title: 'Prerequisite' });
    rel(child, parent, 'subactivity'); rel(parent, q, 'depends');
    eq(blockers(child).map(x => x.id), [q.id], 'child inherits the parent dependency');
    const seq = [activityState(child)];
    q.status = 'done'; seq.push(activityState(child));
    child.dueDate = d(-1); seq.push(activityState(child));
    child.dueDate = d(5); child.status = 'doing'; seq.push(activityState(child));
    child.status = 'done'; seq.push(activityState(child));
    eq(seq, ['blocked', 'todo', 'late', 'doing', 'done'], 'activity states');
    q.status = 'todo'; child.status = 'doing';
    cycleStatus(child.id);
    assert(child.status === 'done' && $('#toast').textContent === t('acts.notDone', { name: 'Prerequisite' }), 'warns when finishing a blocked activity');

    const g = mk('goal', { target: '10', baseline: '0' }), h = mk('goal');
    rel(g, h, 'depends');
    const gs = [goalState(g)];
    h.status = 'achieved'; gs.push(goalState(g));
    g.deadline = d(-2); gs.push(goalState(g));
    g.deadline = d(30); g.status = 'paused'; gs.push(goalState(g));
    g.status = 'active'; g.startDate = d(-3); gs.push(goalState(g));
    g.startDate = d(3); g.current = '4'; gs.push(goalState(g));
    g.status = 'achieved'; gs.push(goalState(g));
    eq(gs, ['blocked', 'todo', 'late', 'todo', 'doing', 'doing', 'done'], 'goal states');
    return `activity ${seq.join('>')} | goal ${gs.join('>')}`;
  });

  await step('goal progress: measuring states, clamping, falling targets', () => {
    fresh('Progress');
    const g = mk('goal', { baseline: '10', target: '20', current: '15' });
    const out = [goalProgress(g)];
    const s1 = mk('state', { value: '12', date: '2099-01-01' }), s2 = mk('state', { value: '18', date: '2099-02-01' }), junk = mk('state', { value: 'n/a', date: '2099-03-01' });
    [s1, s2, junk].forEach(s => rel(s, g, 'measures'));
    out.push(goalProgress(g)); // latest numeric state wins
    s2.value = '25'; out.push(goalProgress(g));
    s2.value = '5'; out.push(goalProgress(g));
    const falling = mk('goal', { baseline: '80', target: '70', current: '75' });
    const flat = mk('goal', { baseline: '5', target: '5' });
    const noBase = mk('goal', { target: '4', current: '1' });
    out.push(goalProgress(falling), goalProgress(flat), goalProgress(noBase));
    g.status = 'achieved'; out.push(goalProgress(g));
    eq(out, [50, 80, 100, 0, 50, 0, 25, 100], 'progress values');

    const a = mk('activity'), sub = mk('activity'), other = mk('activity');
    rel(a, g, 'contributes'); rel(sub, a, 'subactivity');
    eq(goalActivities(g).map(x => x.id).sort(), [a.id, sub.id].sort(), 'contributors and their sub-activities');
    const sg = mk('goal'), pre = mk('goal'), st = mk('state');
    rel(sg, g, 'subgoal'); rel(g, pre, 'depends'); rel(sub, st, 'improves');
    const sc = goalScope(g.id);
    assert([g, sg, pre].every(x => sc.goal.has(x.id)) && !sc.goal.has(falling.id), 'scope goals');
    assert(sc.activity.has(a.id) && sc.activity.has(sub.id) && !sc.activity.has(other.id), 'scope activities');
    assert(sc.state.has(st.id) && sc.state.has(s1.id), 'scope states');
    // A sub-activity turned into a dependency stays in its goal's views (it waits for the goal's work).
    const kid = mk('activity'), grandkid = mk('activity'), elsewhere = mk('activity');
    rel(kid, a, 'subactivity'); rel(grandkid, kid, 'subactivity'); rel(elsewhere, other, 'subactivity');
    const link = db.relations.find(r => r.from === kid.id && r.type === 'subactivity');
    ui.mapGoal = g.id; setView('map');
    openForm('relation', link.id); $('#f-type').value = 'depends'; submitForm();
    assert(link.type === 'depends' && !modal.open, 'relation edited');
    assert($(`[data-map-node="${kid.id}"]`) && $(`[data-map-node="${grandkid.id}"]`), 'still on the goal-focused map');
    const sc2 = goalScope(g.id);
    assert(sc2.activity.has(kid.id) && sc2.activity.has(grandkid.id) && !sc2.activity.has(elsewhere.id) && !sc2.activity.has(other.id), 'waiting activity and its sub-activities in scope only');
    ui.mapGoal = '';
    return out.map(Math.round).join(',');
  });

  await step('goals measured by their activities', () => {
    fresh('ByActivities');
    const g = mk('goal', { title: 'Counted goal', specific: 'Finish all the work for this goal', achievable: 'Small steps each week', relevant: 'It matters to me', deadline: '2099-01-01', progress: 'activities', target: '10', metric: 'Old metric' });
    const sub = mk('goal'), elsewhere = mk('goal');
    const parent = mk('activity'), k1 = mk('activity'), k2 = mk('activity'), viaSub = mk('activity'), other = mk('activity');
    rel(sub, g, 'subgoal'); rel(parent, g, 'contributes'); rel(k1, parent, 'subactivity'); rel(k2, parent, 'subactivity');
    rel(viaSub, sub, 'contributes'); rel(other, elsewhere, 'contributes');
    eq(countedActivities(g).map(a => a.id).sort(), [k1.id, k2.id, viaSub.id].sort(), 'only the actual work, sub-goals included');
    const pcts = [goalProgress(g)];
    k1.status = 'done'; pcts.push(goalProgress(g));
    parent.status = 'done'; pcts.push(goalProgress(g)); // a parent with parts does not count itself
    k2.status = viaSub.status = 'done'; pcts.push(goalProgress(g));
    eq(pcts.map(Math.round), [0, 33, 33, 100], 'progress');
    k2.status = viaSub.status = 'todo';
    assert(goalProgress({ ...emptyDb(), id: 'none', progress: 'activities' }) === 0, 'no activities: 0 %');
    const c = smartCheck({ ...g, metric: '', target: '' });
    assert(c.M && !c.errs.metric && !c.errs.target, 'M met without a metric');
    save();

    setView('goals');
    const card = viewEl.querySelector(`.card.goal[data-open="${g.id}"]`).textContent;
    assert(card.includes('1 / 3') && card.includes('3 activities') && !card.includes('Old metric'), 'card shows the activity count: ' + card.replace(/\s+/g, ' '));

    openForm('goal', g.id);
    assert($('#f-progress').value === 'activities' && $('#measureFields').hidden && !$('#actsHint').hidden, 'form opens in activity mode');
    const live = () => $('#smartLive').querySelector('b:nth-child(2)').classList.contains('on');
    const m0 = live();
    $('#f-progress').value = 'measure'; $('#f-progress').dispatchEvent(new Event('change', { bubbles: true }));
    assert(!$('#measureFields').hidden && $('#actsHint').hidden, 'switching shows the metric fields');
    $('#f-metric').value = ''; $('#modalForm').dispatchEvent(new Event('input'));
    const m1 = live();
    $('#f-progress').value = 'activities'; $('#f-progress').dispatchEvent(new Event('change', { bubbles: true }));
    $('#f-baseline').value = 'junk'; // hidden fields are not validated
    submitForm();
    assert(!modal.open && g.progress === 'activities' && g.target === '10', 'saved in activity mode, metric fields kept');
    assert(m0 && !m1, 'live SMART badge follows the mode');

    openForm('goal', g.id);
    $('#f-progress').value = 'measure'; $('#f-progress').dispatchEvent(new Event('change', { bubbles: true }));
    $('#f-metric').value = 'Pages'; $('#f-baseline').value = '0'; $('#f-target').value = '10';
    submitForm();
    assert(!modal.open && !('progress' in g) && g.metric === 'Pages', 'switched back to a measurement');
    openForm('goal');
    assert($('#f-progress').value === 'measure', 'new goals start with a measurement');
    modal.close();
  });

  await step('SMART check edge cases', () => {
    const good = { title: 'Read books', specific: 'Read twelve books this year', metric: 'Books', baseline: '0', target: '12', achievable: 'One a month', relevant: 'I want to learn', deadline: '2099-12-31' };
    const c = smartCheck(good);
    assert(c.S && c.M && c.A && c.R && c.T && !Object.keys(c.errs).length, 'valid goal passes');
    assert(smartCheck({ ...good, target: '0' }).errs.target === t('err.targetSame'), 'target equals start');
    assert(smartCheck({ ...good, startDate: '2099-12-31' }).errs.deadline === t('err.deadlineOrder'), 'deadline equal to start');
    assert(smartCheck({ ...good, target: 'many' }).errs.target === t('err.target'), 'non-numeric target');
    const blank = smartCheck({ title: '   x   ' });
    return Object.keys(blank.errs).join(',');
  });

  await step('change tracking: stamps, tombstones, undo and expiry', () => {
    const data = emptyDb();
    data.goals.push({ id: 'x', title: 'X' }, { id: 'y', title: 'Y' });
    takeSnapshot(data);
    stampChanges(data);
    assert(!data.goals.some(g => g.updatedAt), 'nothing changed, nothing stamped');
    data.goals[0].title = 'X2';
    stampChanges(data);
    assert(data.goals[0].updatedAt && !data.goals[1].updatedAt, 'only the edited item is stamped');
    const y = data.goals.pop();
    stampChanges(data);
    assert(data.deleted.y, 'deletion leaves a tombstone');
    data.goals.push(y);
    stampChanges(data);
    assert(!data.deleted.y, 'undo removes the tombstone');
    data.deleted.old = '2000-01-01T00:00:00.000Z';
    stampChanges(data);
    assert(!data.deleted.old, 'old tombstones expire');

    const idx = { list: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }] };
    takePlanSnapshot(idx);
    idx.list[0].name = 'Uno'; idx.list.pop();
    stampPlanChanges(idx);
    assert(idx.list[0].updatedAt && idx.deleted.p2, 'plan rename stamped and plan deletion recorded');
    takeSnapshot(db); takePlanSnapshot(plans);

    // Through the app: editing one goal stamps only that goal.
    fresh('Tracking');
    const [g1, g2] = [mk('goal'), mk('goal')];
    save();
    const t2 = g2.updatedAt;
    g1.title = 'Changed title';
    save();
    assert(g1.updatedAt >= t2 && g2.updatedAt === t2, 'save stamps only changed items');
  });

  await step('repairRelations: dangling, duplicate, two parents, loops', () => {
    const ids = n => Array.from({ length: n }, (_, i) => ({ id: 'n' + i }));
    const data = { goals: ids(4), states: [], activities: [{ id: 'a1' }, { id: 'a2' }] };
    const r = (id, from, type, to, at) => ({ id, from, type, to, updatedAt: at });
    data.relations = [
      r('dupOld', 'a1', 'contributes', 'n0', '2099-01-01'),
      r('dupNew', 'a1', 'contributes', 'n0', '2099-02-01'),
      r('ghost', 'a1', 'contributes', 'missing', '2099-09-01'),
      r('parentOld', 'n3', 'subgoal', 'n1', '2099-01-01'),
      r('parentNew', 'n3', 'subgoal', 'n2', '2099-03-01'),
      r('loopOld', 'a1', 'depends', 'a2', '2099-01-01'),
      r('loopNew', 'a2', 'depends', 'a1', '2099-05-01'),
      r('relatedLoop', 'a2', 'related', 'a1', '2099-01-01'),
    ];
    const kept = repairRelations(data).map(x => x.id);
    eq(kept, ['dupNew', 'parentNew', 'loopNew', 'relatedLoop'], 'kept relations');
    return kept.join(',');
  });

  await step('merge: state histories, deletions vs edits, symmetry', () => {
    const x = { id: 's', value: '3', date: '2099-01-03', updatedAt: '2099-01-01', history: [{ date: '2099-01-01', value: '1' }, { date: '2099-01-03', value: '3' }] };
    const y = { id: 's', value: '30', date: '2099-01-03', updatedAt: '2099-02-01', history: [{ date: '2099-01-03', value: '30' }, { date: '2099-01-02', value: '2' }] };
    const m = mergeState(x, y);
    eq(m.history.map(h => `${h.date.slice(-2)}=${h.value}`), ['01=1', '02=2', '03=30'], 'history');
    assert(m.value === '30' && m.date === '2099-01-03', 'value follows the latest measurement');
    eq(mergeState(y, x), m, 'mergeState is symmetric');

    const plan = (goals, deleted = {}) => ({ ...emptyDb(), goals, deleted });
    const z = at => ({ id: 'z', title: 'Z', updatedAt: at });
    assert(mergePlans(plan([z('2099-06-01')]), plan([], { z: '2099-05-01' })).goals.length === 1, 'edit after delete survives');
    const gone = mergePlans(plan([z('2099-06-01')]), plan([], { z: '2099-07-01' }));
    assert(!gone.goals.length && gone.deleted.z, 'delete after edit wins');

    const base = normalize(sampleData());
    const a = JSON.parse(JSON.stringify(base)), b = JSON.parse(JSON.stringify(base));
    a.goals[0].title = 'Same time A'; b.goals[0].title = 'Same time B';
    a.goals[0].updatedAt = b.goals[0].updatedAt = '2099-01-01T00:00:00.000Z';
    b.activities[2].status = 'done'; b.activities[2].updatedAt = '2099-01-02T00:00:00.000Z';
    const sorted = p => JSON.stringify(SYNC_COLLS.map(c => [...p[c]].sort((u, v) => u.id.localeCompare(v.id))));
    const ab = mergePlans(a, b), ba = mergePlans(b, a);
    assert(sorted(ab) === sorted(ba), 'both devices end up with the same plan');
    assert(ab.activities[2].status === 'done', 'newer activity edit kept');

    const store = (planGoalsAt, deletedAt) => ({ plans: { list: [{ id: 'p', name: 'P' }], deleted: deletedAt ? { p: deletedAt } : {} }, data: { p: plan(planGoalsAt ? [z(planGoalsAt)] : []) } });
    const del = { plans: { list: [], deleted: { p: '2099-01-01' } }, data: {} };
    const kept = mergeStores(del, store('2099-02-01'));
    const dropped = mergeStores(del, store('2098-01-01'));
    assert(kept.plans.list.length === 1 && !kept.plans.deleted.p, 'plan edited after deletion is kept');
    assert(!dropped.plans.list.length && dropped.plans.deleted.p, 'plan deleted after its last edit stays deleted');
    return `history=${m.history.length} value=${m.value}`;
  });

  await step('sync file: parsing and starter plans', () => {
    const codes = ['nope', JSON.stringify({ format: 'other', plans: { list: [] } }), JSON.stringify({ format: SYNC_FORMAT, plans: {} })].map(s => {
      try { parseStore(s); return 'parsed'; } catch (e) { return e instanceof SyncError ? e.code : 'other:' + e; }
    });
    eq(codes, ['error', 'error', 'error'], 'bad files rejected');
    const st = parseStore(JSON.stringify({ format: SYNC_FORMAT, plans: { list: [{ id: 'a', name: 'A' }, { id: 5 }, null, { id: 'b' }], deleted: 'x' }, data: { a: { goals: 'bad' } } }));
    eq(st.plans.list.map(p => p.id), ['a'], 'invalid plan entries dropped');
    eq(st.data.a, emptyDb(), 'plan data normalized');
    eq(st.plans.deleted, {}, 'deleted normalized');

    const withGoal = { ...emptyDb(), goals: [{ id: 'g' }] }, withTomb = { ...emptyDb(), deleted: { q: '2099-01-01' } };
    const local = {
      plans: { list: [{ id: '1', name: I18N.en.strings['plan.defaultName'] }, { id: '2', name: I18N.sl.strings['plan.defaultName'] }, { id: '3', name: I18N.en.strings['plan.defaultName'] }, { id: '4', name: 'Other' }, { id: '5', name: I18N.en.strings['plan.defaultName'] }] },
      data: { 1: emptyDb(), 2: emptyDb(), 3: withGoal, 4: emptyDb(), 5: withTomb },
    };
    eq(dropStarterPlans(local).plans.list.map(p => p.id), ['3', '4', '5'], 'only empty starter plans dropped');
  });

  await step('persistence: reload, corrupt data, legacy migration', () => {
    fresh('Persist');
    const g = mk('goal', { title: 'Saved goal' }); mk('activity'); rel(db.activities[0], g, 'contributes');
    save();
    const before = JSON.stringify(db), cur = plans.current, names = plans.list.map(p => p.name).join();
    db = emptyDb(); plans = { current: null, list: [] };
    load();
    assert(plans.current === cur && plans.list.map(p => p.name).join() === names, 'plan list restored');
    assert(JSON.stringify(db) === before, 'plan data restored');

    localStorage.setItem(planKey('bad'), '{oops');
    eq(readPlan('bad'), emptyDb(), 'corrupt plan reads as empty');
    localStorage.setItem(planKey('bad'), JSON.stringify({ goals: 'x', states: [{ id: 's' }], deleted: [] }));
    const part = readPlan('bad');
    assert(Array.isArray(part.goals) && !part.goals.length && part.states.length === 1 && !Array.isArray(part.deleted), 'partially valid plan normalized');
    localStorage.removeItem(planKey('bad'));
    eq(readPlan('never-saved'), emptyDb(), 'missing plan reads as empty');

    const index = localStorage.getItem(PLANS_KEY);
    localStorage.removeItem(PLANS_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ goals: [{ id: 'legacy', title: 'Legacy goal' }] }));
    plans = { current: null, list: [] };
    load();
    const migrated = plans.list.length === 1 && plans.list[0].name === t('plan.defaultName') && db.goals[0]?.title === 'Legacy goal';
    localStorage.removeItem(planKey(plans.current));
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(PLANS_KEY, index);
    plans = { current: null, list: [] };
    load(); renderPlanSwitch(); render();
    assert(migrated, 'single-plan data migrated into a first plan');
    assert(plans.current === cur, 'back to the saved plans');

    // A full localStorage shows a toast instead of throwing.
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    try { save(); } finally { Storage.prototype.setItem = setItem; }
    assert($('#toast').textContent === t('err.storage'), 'storage error toast');
  });

  await step('activities board: drag and drop between columns', () => {
    fresh('Board');
    const a = mk('activity', { title: 'Drag me' });
    setView('activities');
    const dt = new DataTransfer();
    $(`[data-drag="${a.id}"]`).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const col = $('.col[data-status="doing"]');
    col.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const hl = col.classList.contains('drop');
    col.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    assert(a.status === 'doing', 'moved to doing');
    assert($('.col[data-status="doing"]').querySelector(`[data-drag="${a.id}"]`), 'card rendered in its new column');
    const dt2 = new DataTransfer();
    $(`[data-drag="${a.id}"]`).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt2 }));
    $('.col[data-status="done"]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt2 }));
    assert(a.status === 'done' && JSON.parse(localStorage.getItem(planKey(plans.current))).activities[0].status === 'done', 'saved');
    return `highlight=${hl}`;
  });

  await step('keyboard: map nodes, context menu, tour', async () => {
    fresh('Keys');
    const [g1, g2] = [mk('goal', { title: 'Key goal' }), mk('goal')];
    rel(g2, g1, 'subgoal');
    save();
    setView('map');
    const node = () => $(`[data-map-node="${g1.id}"]`);
    node().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert(ui.mapSelected === g1.id, 'Enter selects');
    node().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    assert(ui.mapSelected === null, 'Space toggles off');
    node().dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    assert(!ctxMenu.hidden && ctxMenu.dataset.id === g1.id, 'menu key opens the context menu');
    const btns = [...ctxMenu.querySelectorAll('button')];
    const key = k => ctxMenu.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const focus = [btns.indexOf(document.activeElement)];
    key('ArrowDown'); focus.push(btns.indexOf(document.activeElement));
    key('ArrowUp'); key('ArrowUp'); focus.push(btns.indexOf(document.activeElement));
    key('Home'); focus.push(btns.indexOf(document.activeElement));
    key('End'); focus.push(btns.indexOf(document.activeElement));
    eq(focus, [0, 1, btns.length - 1, 0, btns.length - 1], 'menu focus moves');
    key('Escape');
    assert(ctxMenu.hidden && document.activeElement === node(), 'Escape closes and returns focus');
    node().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    assert(!ctxMenu.hidden, 'Shift+F10 opens the menu'); closeCtxMenu();
    node().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    assert(modal.open && $('#f-title').value === 'Key goal', 'double-click opens the form'); modal.close();

    const count = plans.list.length, cur = plans.current;
    startTour();
    const press = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const steps = [tour.step];
    press('ArrowRight'); press('ArrowRight'); steps.push(tour.step);
    press('ArrowLeft'); steps.push(tour.step);
    press('ArrowLeft'); press('ArrowLeft'); steps.push(tour.step);
    press('Escape'); steps.push(tour.step);
    eq(steps, [0, 2, 1, 0, -1], 'tour steps');
    assert(plans.list.length === count && plans.current === cur, 'tour plan removed, previous plan reopened');
    return `menu=${btns.length} items, tour ${steps.join('>')}`;
  });

  await step('zoom: limits, ctrl+wheel and timeline presets', async () => {
    fresh('Zoom');
    const g = mk('goal', { deadline: d(60), startDate: d(-10) }), a = mk('activity', { startDate: d(1), dueDate: d(20) });
    rel(a, g, 'contributes'); save();
    setView('map');
    const wrap = $('.map-wrap'), r = wrap.getBoundingClientRect();
    zoomMap(100, r.left + 10, r.top + 10); const max = ui.mapScale;
    zoomMap(0.001, r.left + 10, r.top + 10); const min = ui.mapScale;
    assert(max === MAP.MAX_SCALE && min === MAP.MIN_SCALE && prefs.get('mapScale') === MAP.MIN_SCALE, 'map scale clamped and saved');
    assert($('.zoom-pct').textContent === `${Math.round(MAP.MIN_SCALE * 100)} %`, 'zoom label');
    zoomMap(1, r.left, r.top);
    $('.map-wrap').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100, clientX: r.left + 50, clientY: r.top + 50 }));
    $('.map-wrap').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100, clientX: r.left + 50, clientY: r.top + 50 }));
    await tick(); await tick();
    const wheel = ui.mapScale;
    assert(Math.abs(wheel - Math.exp(0.5)) < 1e-9, 'two wheel steps coalesced into one zoom: ' + wheel);
    $('.map-wrap').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    await tick(); await tick();
    assert(ui.mapScale === wheel, 'wheel without ctrl does not zoom');
    zoomMap(1, r.left, r.top);

    setView('timeline');
    const tx = $('.tl-scroll').getBoundingClientRect().right - 20;
    ui.tlPx = 8; zoomTimeline(1000, tx); const tmax = ui.tlPx;
    zoomTimeline(1e-6, tx); const tmin = ui.tlPx;
    assert(tmax === TL.MAX && tmin === TL.MIN, 'timeline zoom clamped');
    $('[data-tl-zoom="quarter"]').click(); assert(ui.tlPx === TL.ZOOM.quarter);
    $('[data-tl-zoom="month"]').click(); assert(ui.tlPx === TL.ZOOM.month && prefs.get('tlPx') === TL.ZOOM.month);
    return `map ${min}–${max}, wheel=${wheel.toFixed(3)}, timeline ${tmin}–${tmax}`;
  });

  await step('timeline rows: tree order, hidden done, unlinked group', () => {
    fresh('Rows');
    const g1 = mk('goal', { title: 'G1', startDate: d(1) }), g2 = mk('goal', { title: 'G2', startDate: d(2) });
    const a = mk('activity', { title: 'A', startDate: d(3) }), b = mk('activity', { title: 'B', startDate: d(4) }), b0 = mk('activity', { title: 'B0', startDate: d(2) });
    const u = mk('activity', { title: 'U' });
    rel(g2, g1, 'subgoal'); rel(a, g1, 'contributes'); rel(b, a, 'subactivity'); rel(b0, a, 'subactivity');
    const show = rows => rows.map(r => r.kind === 'group' ? `[${r.label}]` : `${r.item.title}:${r.depth}${r.rel ? ':' + r.rel : ''}`).join(' ');
    const all = show(timelineRows(null));
    eq(all, `G1:0 A:1:contributes B0:2:subactivity B:2:subactivity G2:1:subgoal [${t('tl.unlinked')}] U:1`, 'rows');
    a.status = 'done'; ui.hideDone = true;
    const hidden = show(timelineRows(null));
    ui.hideDone = false;
    eq(hidden, `G1:0 B0:1:contributes B:1:contributes G2:1:subgoal [${t('tl.unlinked')}] U:1`, 'children take a hidden parent\'s place');
    const scoped = show(timelineRows(scopeFor(g2.id)));
    return `${all} || scoped(G2): ${scoped}`;
  });

  await step('graph helpers: ticks, change and signs', () => {
    eq(niceTicks(0, 10), [0, 5, 10], 'ticks 0–10');
    eq(niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100], 'ticks 0–100');
    [[3, 3], [0, 0], [-7, 13], [0.01, 0.07], [1e6, 1.3e6]].forEach(([lo, hi]) => {
      const tk = niceTicks(lo, hi);
      const step = tk[1] - tk[0];
      assert(tk[0] <= lo && tk[tk.length - 1] >= hi, `ticks cover ${lo}–${hi}: ${tk}`);
      assert(tk.every((v, i) => !i || Math.abs(v - tk[i - 1] - step) < step * 1e-6), `even steps ${tk}`);
      const m = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
      assert([1, 2, 5].some(x => Math.abs(m - x) < 1e-6), `nice step ${step}`);
    });
    const p = (v, day) => ({ value: v, day, date: '2099-01-0' + day });
    const up = stateChange({}, [p(10, 1), p(15, 2)], [{ value: 20 }]);
    assert(up.delta === 5 && up.pct === 50 && up.good === true, 'towards target is good');
    assert(stateChange({}, [p(10, 1), p(15, 2)], [{ value: 5 }]).good === false, 'away from target is bad');
    assert(stateChange({}, [p(10, 1), p(15, 2)], []).good === null, 'no target: neutral');
    assert(stateChange({}, [p(0, 1), p(3, 2)], []).pct === null, 'no percentage from zero');
    assert(stateChange({}, [p(10, 1)], []) === null, 'one point: no change');
    eq([signed(0), signed(2.5), signed(-2.5)], ['±0', '+2.5', '−2.5'], 'signed');
  });

  await step('i18n: plurals, fallbacks and language detection', () => {
    const forms = code => { changeLanguage(code); return [1, 2, 3, 5, 101, 102, 104].map(n => tp('states.measurements', n)).join(', '); };
    const sl = forms('sl'), en = forms('en');
    eq(sl, '1 meritev, 2 meritvi, 3 meritve, 5 meritev, 101 meritev, 102 meritvi, 104 meritve', 'Slovenian plurals');
    assert(en.startsWith('1 measurement, 2 measurements'), 'English plurals');
    assert(t('no.such.key') === 'no.such.key', 'missing key falls back to the key');
    assert(fill('{a} and {b}', { a: 1 }) === '1 and {b}', 'unknown placeholder kept');
    I18N.sl.strings['__only.en'] = undefined; I18N.en.strings['__only.en'] = 'English text';
    changeLanguage('sl'); const fb = t('__only.en'); changeLanguage('en');
    delete I18N.sl.strings['__only.en']; delete I18N.en.strings['__only.en'];
    assert(fb === 'English text', 'missing translation falls back to English');
    localStorage.setItem(LANG_KEY, 'sl'); const saved = detectLang();
    localStorage.setItem(LANG_KEY, 'xx'); const bad = detectLang();
    localStorage.setItem(LANG_KEY, 'en');
    assert(saved === 'sl' && I18N[bad], 'detectLang');
    return sl;
  });

  await step('sync states: offline, paused, error, retry, unchanged file', async () => {
    const reset = () => { prefs.set('syncConnected', true); syncState.busy = false; syncState.again = false; };
    const out = {};
    prefs.set('syncConnected', null); setSyncStatus('idle');
    let called = false; drive.getToken = async () => { called = true; return 'tok'; };
    await syncNow(true);
    assert(!called && syncState.status === 'idle', 'not connected: nothing happens');

    reset();
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    await syncNow(true); out.offline = syncState.status;
    delete navigator.onLine;

    drive.getToken = async () => { throw new SyncError('auth'); };
    await syncNow(false); out.auth = syncState.status;
    const err = console.error; console.error = () => {};
    drive.getToken = async () => { throw new Error('boom'); };
    await syncNow(false); out.crash = syncState.status;
    console.error = err;
    eq(out, { offline: 'offline', auth: 'paused', crash: 'error' }, 'statuses');
    assert($('#syncBtn').dataset.status === 'error' && $('#syncBtn').title === t('sync.status.error'), 'button shows the status');

    // A sync asked for while one is running is queued, not run in parallel.
    let release, runs = 0;
    drive.getToken = () => { runs++; return new Promise(r => { release = r; }); };
    drive.read = async () => { throw new SyncError('offline'); };
    const first = syncNow(false);
    await tick();
    await syncNow(false);
    assert(runs === 1 && syncState.again, 'second sync queued');
    release('tok'); await first;
    assert(!syncState.again && syncState.timer, 'queued sync rescheduled');
    clearTimeout(syncState.timer);

    // Second sync with nothing new: the Drive file is not rewritten; stray duplicate files are removed.
    let file = null, writes = 0; const removed = [];
    drive.getToken = async () => 'tok';
    drive.read = async () => ({ id: 'f', content: file && parseStore(JSON.stringify(file)), extra: file ? ['dup1'] : [] });
    drive.write = async (tok, id, content) => { writes++; file = content; return 'f'; };
    drive.remove = async (tok, id) => removed.push(id);
    await syncNow(true);
    drive.read = async () => ({ id: 'f', content: parseStore(JSON.stringify(file)), extra: [] });
    await syncNow(true);
    assert(writes === 1 && syncState.status === 'synced', 'unchanged: no write');
    drive.read = async () => ({ id: 'f', content: parseStore(JSON.stringify(file)), extra: ['dup1'] });
    await syncNow(true);
    eq(removed, ['dup1'], 'duplicates removed');
    disconnectSync();
    assert(!prefs.get('syncConnected', false) && $('#syncBtn').hidden, 'disconnected');
    return `${Object.values(out).join(',')} writes=${writes}`;
  });

  await step('sync: an empty merged store still leaves one plan', () => {
    applyStore({ plans: { list: [], deleted: {} }, data: {} });
    assert(plans.list.length === 1 && plans.list[0].name === t('plan.defaultName') && itemCount() === 0, 'one empty plan');
    const leftover = plansBefore.filter(id => localStorage.getItem(planKey(id)));
    assert(!leftover.length, 'old plans removed from storage');
  });

  await step('plans: the plan name above the title switches plans (phones)', () => {
    const first = plans.current;
    createPlan('Second plan');
    const pick = $('#planName');
    assert(pick.matches('select[data-plan-select]') && pick.closest('label').textContent.includes(t('plan.label')), 'labelled select');
    assert(pick.options.length === plans.list.length && pick.value === plans.current, 'lists every plan, current selected');
    assert(pick.selectedOptions[0].textContent === 'Second plan', 'shows the current plan name');
    pick.value = first; pick.dispatchEvent(new Event('change', { bubbles: true }));
    assert(plans.current === first && $('#planName').value === first, 'switches the plan');
    assert([...document.querySelectorAll('[data-plan-select]')].every(s => s.value === first), 'all switchers agree');
    const second = plans.list.find(p => p.name === 'Second plan');
    deletePlan(second.id);
    assert(![...$('#planName').options].some(o => o.value === second.id), 'deleted plan gone');
    openPlan(first);
  });

  await step('phone tab bar: graphs, timeline and map under More', () => {
    setView('goals');
    // The tests run at desktop width; show the menu as a phone would.
    const phone = document.head.appendChild(document.createElement('style'));
    phone.textContent = '.nav-more { display: flex } .nav-sheet:not([hidden]) { display: flex }';
    const more = $('#navMore'), sheet = $('#navSheet');
    assert(sheet.hidden && more.getAttribute('aria-expanded') === 'false' && !more.classList.contains('active'), 'closed at first');
    more.click();
    const items = [...sheet.querySelectorAll('[data-sheet-view]')].map(b => b.dataset.sheetView);
    assert(!sheet.hidden && more.getAttribute('aria-expanded') === 'true', 'opens');
    assert(items.join() === 'graphs,timeline,map', 'lists the extra views');
    assert(sheet.querySelector('[data-sheet-view="timeline"]').textContent.trim() === t('nav.timeline'), 'with labels');
    assert(document.activeElement === sheet.querySelector('button'), 'first item focused');
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    assert(document.activeElement.dataset.sheetView === 'map', 'arrows wrap');
    sheet.querySelector('[data-sheet-view="timeline"]').click();
    assert(ui.view === 'timeline' && sheet.hidden && more.classList.contains('active'), 'picks a view, closes, More marked');
    more.click();
    assert(document.activeElement.dataset.sheetView === 'timeline', 'current view focused');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(sheet.hidden && document.activeElement === more, 'Escape closes and refocuses More');
    more.click();
    $('#view').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    assert(sheet.hidden, 'click outside closes');
    more.click(); more.click();
    assert(sheet.hidden, 'More toggles');
    setView('goals');
    assert(!more.classList.contains('active'), 'More unmarked on a main tab');
    phone.remove();
    return items.join();
  });

  await step('install: offered in Settings when the browser allows it', async () => {
    changeLanguage('en');
    assert($('#installSection').hidden, 'hidden until the browser offers it');
    let prompted = 0;
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    offer.prompt = () => prompted++;
    offer.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(offer);
    assert(offer.defaultPrevented, 'browser banner held back');
    assert(!$('#installSection').hidden && !$('#installBtn').hidden && $('#installHint').textContent === t('install.hint'), 'section and button shown');
    changeLanguage('sl');
    assert($('#installHint').textContent === I18N.sl.strings['install.hint'] && $('#installBtn').textContent === 'Namesti aplikacijo', 'translated');
    changeLanguage('en');
    $('#installBtn').click();
    await new Promise(r => setTimeout(r, 0));
    assert(prompted === 1 && $('#installBtn').hidden && $('#installSection').hidden, 'prompt shown once, then hidden');
    $('#installBtn').click();
    assert(prompted === 1, 'no second prompt');
    window.dispatchEvent(new Event('appinstalled'));
    assert($('#toast').textContent === t('install.done'), 'installed toast');
  });

  await step('overview: a few next actions first, expandable', () => {
    const before = plans.current;
    loadSample(); changeLanguage('en'); setView('dashboard');
    const titles = [...$('#view').querySelectorAll('.section-title')].map(h => h.firstChild.textContent.trim());
    assert(titles.join('|') === `${t('dash.next')}|${t('dash.goalsInProgress')}`, 'next actions above the goals');
    const todo = db.activities.filter(a => a.status !== 'done').sort(byDueDate);
    const shown = () => [...$('#view').querySelectorAll('.list > .row')].map(r => r.dataset.open);
    const more = () => $('[data-next-more]');
    assert(shown().join() === todo.slice(0, NEXT_FEW).map(a => a.id).join(), 'the first few by due date');
    assert(more().textContent === t('dash.showAll', { n: todo.length }) && more().getAttribute('aria-expanded') === 'false', 'show all with the count');
    more().click();
    assert(shown().join() === todo.map(a => a.id).join(), 'expanded to all');
    assert(more().textContent === t('dash.showFewer') && more().getAttribute('aria-expanded') === 'true' && document.activeElement === more(), 'show fewer, focus kept');
    assert(prefs.get('nextAll') === true, 'remembered');
    more().click();
    assert(shown().length === NEXT_FEW && prefs.get('nextAll') === false, 'collapsed again');
    // No button when everything fits.
    todo.slice(NEXT_FEW - 1).forEach(a => (a.status = 'done')); render();
    assert(shown().length === NEXT_FEW - 1 && !more(), 'no button for a short list');
    deletePlan(plans.current); openPlan(before);
    return `${todo.length} to do`;
  });

  await step('first visit: language picker before the tour', () => {
    changeLanguage('en');
    let done = 0;
    chooseLanguage(() => done++);
    const card = $('.lang-pick');
    assert(card && $('.lang-pick-block') && document.activeElement === $('[data-lang-done]'), 'picker open, Continue focused');
    const options = [...card.querySelectorAll('[data-lang-pick]')].map(b => `${b.dataset.langPick}=${b.textContent}`).join(' ');
    assert(card.querySelector('[data-lang-pick="en"]').getAttribute('aria-pressed') === 'true', 'current language marked');
    card.querySelector('[data-lang-pick="sl"]').click();
    assert(lang === 'sl' && localStorage.getItem(LANG_KEY) === 'sl', 'language switched and saved');
    assert($('#langPickTitle').textContent === 'Izberite jezik' && card.querySelector('[data-lang-pick="sl"]').getAttribute('aria-pressed') === 'true', 'card redrawn in Slovenian');
    assert(currentPlan().name === I18N.sl.strings['plan.defaultName'], 'empty starter plan renamed');
    const tabs = [];
    for (let i = 0; i < card.querySelectorAll('button').length + 1; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      tabs.push(document.activeElement.closest('.lang-pick') ? 'in' : 'out');
    }
    assert(!tabs.includes('out'), 'Tab stays in the card');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!$('.lang-pick') && !$('.lang-pick-block') && done === 1, 'Escape closes and continues');

    // A plan with content keeps its name; Continue starts the tour in the chosen language.
    mk('goal', { title: 'Keep my name' }); save();
    chooseLanguage(startTour);
    $('[data-lang-pick="en"]').click();
    assert(currentPlan().name === I18N.sl.strings['plan.defaultName'], 'plan with items not renamed');
    $('[data-lang-done]').click();
    assert(!$('.lang-pick') && tour.step === 0 && $('#tourTitle').textContent === t('tour.welcome.title'), 'tour starts in English');
    endTour(false);
    return options;
  });
};
