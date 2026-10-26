// Runs after app.js: exercises the main flows and writes results into <pre id="OK">.
(async () => {
  const out = [];
  const log = s => out.push(s);
  const hash = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(16); };
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
  const fp = () => { const html = $('#view').innerHTML.replace(UUID, 'ID'); return `${hash(html)}/${html.length}`; };
  const step = async (name, fn) => {
    try { const r = await fn(); log(`PASS ${name}${r === undefined ? '' : ': ' + r}`); }
    catch (e) { log(`FAIL ${name}: ${e && e.stack || e}`); }
  };
  const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
  const views = ['dashboard', 'goals', 'states', 'graphs', 'activities', 'timeline', 'map'];
  const tick = () => new Promise(r => setTimeout(r, 0));

  await step('boot: one empty starter plan', () => { assert(plans.list.length === 1); assert(itemCountSafe() === 0); return plans.list[0].name; });
  function itemCountSafe() { return db.goals.length + db.states.length + db.activities.length; }

  await step('empty views render', () => views.map(v => { setView(v); return `${v}=${fp()}`; }).join(' '));

  await step('i18n en/sl key parity', () => {
    const en = Object.keys(I18N.en.strings).sort(), sl = Object.keys(I18N.sl.strings).sort();
    const miss = en.filter(k => !sl.includes(k)).concat(sl.filter(k => !en.includes(k)).map(k => 'sl-only:' + k));
    assert(!miss.length, miss.join(','));
    assert(I18N.en.sample.goals.length === I18N.sl.sample.goals.length && I18N.en.sample.activities.length === I18N.sl.sample.activities.length);
    return `${en.length} keys each`;
  });

  await step('load sample plan', () => { loadSample(); assert(db.goals.length === 10 && db.activities.length === 23 && db.states.length === 6); return `${db.relations.length} relations`; });

  for (const code of ['en', 'sl']) {
    await step(`views render with sample (${code})`, () => {
      changeLanguage(code);
      return views.map(v => { setView(v); assert($('#view').children.length, v + ' empty'); return `${v}=${fp()}`; }).join(' ');
    });
  }
  changeLanguage('en');

  await step('help mode decorates views', () => {
    setHelp(true);
    const seen = new Set();
    const per = views.map(v => { setView(v); $('#view').querySelectorAll('[data-help-tip]').forEach(d => seen.add(d.dataset.helpTip)); return `${v}:${$('#view').querySelectorAll('[data-help-tip]').length}`; });
    const missing = HELP_TIPS.map(h => h.key).filter(k => !seen.has(k));
    assert(!missing.length, 'tips never shown: ' + missing);
    const dot = $('[data-help-tip]'); dot.click(); assert($('#helpTip'), 'tip opens'); dot.click(); assert(!$('#helpTip'), 'tip closes');
    setHelp(false);
    return per.join(' ');
  });

  await step('goal form: invalid then valid save', () => {
    setView('goals');
    openForm('goal');
    $('#f-title').value = 'Hi';
    submitForm();
    const invalid = [...modal.querySelectorAll('.field.invalid')].map(f => f.dataset.field).join(',');
    Object.entries({ title: 'Test goal one', specific: 'A specific outcome that is long enough', metric: 'Pages', unit: 'p', baseline: '1,5', target: '10.5', achievable: 'Yes it is doable', relevant: 'Matters a lot to me', deadline: '2099-01-01' })
      .forEach(([k, v]) => { $('#f-' + k).value = v; });
    $('#modalForm').dispatchEvent(new Event('input'));
    const live = $('#smartLiveText').textContent;
    submitForm();
    const g = db.goals.find(x => x.title === 'Test goal one');
    assert(g && g.baseline === '1.5' && g.target === '10.5', 'goal saved with parsed numbers');
    assert(!modal.open, 'modal closed');
    return `invalid=[${invalid}] live="${live}"`;
  });

  await step('bad number is rejected', () => {
    openForm('state');
    $('#f-title').value = 'Bad number state';
    $('#f-value').value = '12abc';
    submitForm();
    const err = modal.querySelector('[data-field="value"] .err').textContent;
    assert(err, 'error shown'); modal.close();
    return err;
  });

  await step('state form with history', () => {
    openForm('state');
    $('#f-title').value = 'Pages read';
    $('#f-value').value = '3,25';
    submitForm();
    const s = db.states.find(x => x.title === 'Pages read');
    assert(s && s.value === '3.25' && s.history.length === 1);
    openForm('state', s.id);
    $('#f-value').value = '4';
    $('#f-date').value = '2099-01-02';
    [...modal.querySelectorAll('[data-name="goals"] .pick-opt')].find(o => o.textContent.includes('Test goal one')).click();
    submitForm();
    assert(s.history.length === 2 && relsFrom(s.id, 'measures').length === 1);
    return `history=${s.history.length}`;
  });

  await step('activity form + parent + validation', () => {
    openForm('activity');
    $('#f-title').value = 'Child act';
    $('#f-startDate').value = '2099-02-01';
    $('#f-dueDate').value = '2099-01-01';
    submitForm();
    const err = modal.querySelector('[data-field="dueDate"] .err').textContent;
    $('#f-dueDate').value = '2099-03-01';
    const parent = db.activities[0];
    $('#f-parent').value = parent.id;
    submitForm();
    const a = db.activities.find(x => x.title === 'Child act');
    assert(a && relsFrom(a.id, 'subactivity')[0].to === parent.id);
    return err;
  });

  await step('relation form: add, invalid, edit, delete', () => {
    const g = db.goals.find(x => x.title === 'Test goal one');
    const a = db.activities.find(x => x.title === 'Child act');
    const pick = (f, id) => { $(f).value = id; $(f).dispatchEvent(new Event('change', { bubbles: true })); };
    const types = () => [...$('#f-type').options].map(o => o.value);
    openForm('relation', null, { from: a.id });
    pick('#f-to', g.id);
    assert(types().includes('contributes') && !types().includes('subgoal') && !types().includes('measures'), 'only fitting types: ' + types());
    $('#f-type').value = 'contributes';
    submitForm();
    const r = db.relations.find(x => x.from === a.id && x.to === g.id && x.type === 'contributes');
    assert(r, 'relation added');
    openForm('relation');
    pick('#f-from', g.id); pick('#f-to', g.id);
    assert(types().join() === '', 'nothing links an item to itself');
    submitForm();
    const err = modal.querySelector('[data-field="type"] .err').textContent;
    assert(modal.open && err === t('err.self'), 'self link refused');
    // A type that only fits the other way round swaps the two items.
    const g2 = db.goals.find(x => !canRelate(a.id, x.id, 'contributes'));
    pick('#f-from', g2.id); pick('#f-to', a.id);
    assert(types().includes('rev:contributes') && !types().includes('contributes'), 'reverse group: ' + types());
    modal.close();
    openForm('relation', r.id);
    $('#f-type').value = 'related';
    submitForm();
    assert(r.type === 'related', 'edited');
    openForm('relation', r.id);
    $('#deleteBtn').click();
    assert(!db.relations.includes(r), 'deleted');
    return err;
  });

  await step('canRelate rules', () => {
    const [g1, g2] = db.goals, [a1] = db.activities, [s1] = db.states;
    return [canRelate(g1.id, g1.id, 'related'), canRelate(s1.id, g1.id, 'contributes'), canRelate(a1.id, s1.id, 'depends'), canRelate(a1.id, g1.id, 'nope'), canRelate(g2.id, g1.id, 'related')].map(x => x || 'ok').join(' | ');
  });

  await step('cycle status + drag-free status changes', () => {
    setView('activities');
    const a = db.activities.find(x => x.title === 'Child act');
    const seq = [];
    for (let i = 0; i < 3; i++) { $(`[data-cycle="${a.id}"]`).click(); seq.push(a.status); }
    return seq.join('>');
  });

  await step('view toolbar toggles and filters', () => {
    setView('timeline');
    const deps0 = ui.tlDeps; $('[data-tl-deps]').click(); assert(ui.tlDeps === !deps0 && prefs.get('tlDeps') === !deps0);
    $('[data-tl-deps]').click();
    $('[data-hide-done]').click(); const hd = ui.hideDone; $('[data-hide-done]').click();
    $('[data-tl-zoom="week"]').click(); assert(ui.tlPx === TL.ZOOM.week);
    const sel = $('[data-goal-select]'); sel.value = db.goals[0].id; sel.dispatchEvent(new Event('change', { bubbles: true }));
    assert(ui.timelineGoal === db.goals[0].id);
    const tl = fp();
    sel.value = ''; $('[data-goal-select]').value = ''; $('[data-goal-select]').dispatchEvent(new Event('change', { bubbles: true }));
    setView('goals');
    $('[data-goal-filter="all"]').click(); assert(ui.goalFilter === 'all');
    $('[data-category="Health"]').click(); assert(ui.category === 'Health'); const n = $('#view').querySelectorAll('.card.goal').length;
    $('[data-category=""]').click();
    setView('map');
    $('[data-rel-toggle="related"]').click(); assert(ui.mapHidden.has('related')); $('[data-rel-toggle="related"]').click();
    $('[data-map-zoom="in"]').click(); const z = ui.mapScale; $('[data-map-zoom="reset"]').click();
    const node = $('[data-map-node]'); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); assert(ui.mapSelected, 'selected');
    const mapSel = fp();
    $('[data-map-clear]').click(); assert(!ui.mapSelected);
    return `hideDone=${hd} health=${n} zoom=${z} tl=${tl} mapSel=${mapSel}`;
  });

  await step('search box', () => {
    setView('goals');
    const box = $('[data-search]'); box.value = 'marathon'; box.dispatchEvent(new Event('input', { bubbles: true }));
    const n = $('#view').querySelectorAll('.card.goal').length;
    setView('goals');
    return `matches=${n}`;
  });

  await step('context menu actions', () => {
    setView('map');
    const g = db.goals.find(x => x.title === 'Test goal one');
    openCtxMenu(g.id, 50, 50);
    const items = [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx).join(',');
    runCtxAction('status:achieved', g.id); assert(g.status === 'achieved');
    runCtxAction('focus', g.id); assert(ui.mapGoal === g.id);
    runCtxAction('highlight', g.id); assert(ui.mapSelected === g.id);
    runCtxAction('add:goal:subgoal', g.id); assert(modal.open); modal.close();
    runCtxAction('delete', g.id);
    assert(!findEntity(g.id) && ui.mapGoal === '' && ui.mapSelected === null, 'delete clears filters and selection');
    const a = db.activities[1];
    openCtxMenu(a.id, 10, 10);
    const aItems = [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx).join(',');
    closeCtxMenu();
    return `${items} || ${aItems}`;
  });

  await step('delete via form clears selection', () => {
    const s = db.states.find(x => x.title === 'Pages read');
    ui.mapSelected = s.id;
    openForm('state', s.id);
    $('#deleteBtn').click();
    assert(!findEntity(s.id) && ui.mapSelected === null);
  });

  await step('graphs pointer + keyboard', () => {
    setView('graphs');
    const plot = $('.gr-plot');
    const r = plot.getBoundingClientRect();
    plot.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + 20 }));
    const tip = plot.querySelector('.gr-tip').textContent;
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    const i = plot.dataset.i;
    return `tip="${tip}" i=${i}`;
  });

  await step('settings switches', () => {
    $('#settingsBtn').click();
    assert(settings.open);
    const box = settings.querySelector('[data-setting="hideDone"]');
    box.checked = !box.checked; box.dispatchEvent(new Event('change', { bubbles: true }));
    assert(ui.hideDone === box.checked);
    box.checked = !box.checked; box.dispatchEvent(new Event('change', { bubbles: true }));
    settings.querySelector('[data-setting="navCollapsed"]').click(); const col = $('.app').classList.contains('nav-collapsed');
    settings.querySelector('[data-setting="navCollapsed"]').click();
    settings.querySelector('[data-theme-set="dark"]').click(); const th = document.documentElement.dataset.theme;
    settings.querySelector('[data-theme-set="system"]').click();
    const sync = $('#syncSection .sync-body').textContent.trim().slice(0, 40);
    settings.close();
    return `collapsed=${col} theme=${th} sync="${sync}"`;
  });

  await step('plans: new, rename, switch, delete', () => {
    const n0 = plans.list.length;
    $('[data-plan="new"]').click(); assert(plans.list.length === n0 + 1 && currentPlan().name === 'Prompted plan');
    window.prompt = () => 'Renamed plan';
    $('[data-plan="rename"]').click(); assert(currentPlan().name === 'Renamed plan');
    const sel = $('[data-plan-select]'); sel.value = plans.list[0].id; sel.dispatchEvent(new Event('change', { bubbles: true }));
    assert(plans.current === plans.list[0].id);
    sel.value = plans.list[n0].id; $('[data-plan-select]').value = plans.list[n0].id; $('[data-plan-select]').dispatchEvent(new Event('change', { bubbles: true }));
    $('[data-plan="delete"]').click();
    $('#planDeleteName').value = currentPlan().name;
    $('#planDeleteName').dispatchEvent(new Event('input', { bubbles: true }));
    $('#planDeleteBtn').click(); assert(plans.list.length === n0 && !$('#planDelete').open);
    return plans.list.map(p => p.name).join(',');
  });

  await step('export / import JSON', async () => {
    let blob;
    const orig = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return 'blob:x'; };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
    exportJson();
    URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = click;
    const text = await blob.text();
    const n0 = plans.list.length;
    importJson(new File([text], 'backup.json'));
    await new Promise(r => setTimeout(r, 50));
    assert(plans.list.length === n0 + 1 && db.goals.length === JSON.parse(text).goals.length);
    importJson(new File(['not json'], 'bad.json'));
    await new Promise(r => setTimeout(r, 50));
    return `${currentPlan().name} toast="${$('#toast').textContent}"`;
  });

  await step('change tracking + merge', () => {
    const base = normalize(sampleData());
    const a = JSON.parse(JSON.stringify(base)), b = JSON.parse(JSON.stringify(base));
    a.goals[0].title = 'Edited on A'; a.goals[0].updatedAt = '2099-01-01T00:00:00.000Z';
    b.deleted[b.goals[1].id] = '2099-01-01T00:00:00.000Z'; b.goals.splice(1, 1);
    b.states[0].history.push({ date: '2099-05-05', value: '99' }); b.states[0].updatedAt = '2098-01-01T00:00:00.000Z';
    a.relations.push({ id: 'dup', from: a.relations[0].from, to: a.relations[0].to, type: a.relations[0].type, updatedAt: '2099-01-01T00:00:00.000Z' });
    const m = mergePlans(a, b);
    assert(m.goals[0].title === 'Edited on A');
    assert(m.goals.length === a.goals.length - 1);
    assert(m.states[0].value === '99');
    const sA = { plans: { list: [{ id: 'p1', name: 'One', updatedAt: '2099-01-01' }], deleted: { p2: '2099-01-01' } }, data: { p1: a } };
    const sB = { plans: { list: [{ id: 'p1', name: 'Uno' }, { id: 'p2', name: 'Two' }], deleted: {} }, data: { p1: b, p2: emptyDb() } };
    const ms = mergeStores(sA, sB);
    return `goals=${m.goals.length} rels=${m.relations.length} deleted=${Object.keys(m.deleted).length} plans=${ms.plans.list.map(p => p.name)} plansDeleted=${Object.keys(ms.plans.deleted)}`;
  });

  await step('sync with a fake Drive', async () => {
    let written = null;
    const remotePlan = emptyDb();
    remotePlan.goals.push({ id: 'remote-goal', title: 'From another device', updatedAt: '2099-01-01T00:00:00.000Z' });
    const remote = { plans: { list: [{ id: 'remote-plan', name: 'Remote plan' }], deleted: {} }, data: { 'remote-plan': remotePlan } };
    drive.getToken = async () => 'tok';
    drive.read = async () => ({ id: 'file1', content: parseStore(JSON.stringify(toFile(remote))), extra: [] });
    drive.write = async (tok, id, content) => { written = content; return id; };
    drive.revoke = () => {};
    prefs.set('syncConnected', true);
    prefs.set('syncedOnce', true);
    await syncNow(true);
    assert(written && written.format === 'actionplan-sync', 'written');
    assert(plans.list.some(p => p.id === 'remote-plan'), 'remote plan merged in');
    const status = syncState.status, btn = !$('#syncBtn').hidden;
    disconnectSync();
    return `status=${status} btnShown=${btn} plans=${written.plans.list.length} after=${syncState.status}`;
  });

  await step('tour: every step target resolves', async () => {
    setView('dashboard');
    const planCount = plans.list.length;
    startTour();
    const res = [];
    for (let i = 0; i < tour.steps.length; i++) {
      showStep(i);
      const s = tour.steps[i];
      const ok = !s.target || !!firstVisible(s.target);
      res.push(`${s.key}${s.target ? '=' + s.target.join('|') : ''}${ok ? '' : '!MISSING'}`);
      assert(ok, 'target missing for ' + s.key);
      assert($('.tour-card h2').textContent && !$('.tour-card h2').textContent.startsWith('tour.'), 'title for ' + s.key);
    }
    $('[data-tour="finish"]').click();
    assert(tour.step === -1 && plans.list.length === planCount, 'tour plan removed');
    const skipped = TOUR_STEPS.filter(s => !tour.steps.includes(s)).map(s => s.key);
    return `steps[${res.join(', ')}] optional-skipped[${skipped}]`;
  });

  if (window.moreTests) await moreTests({ step, assert });
  await tick();
  log('errors: ' + (__errors.length ? __errors.join(' || ') : 'none'));
  const pre = document.createElement('pre');
  pre.id = 'OK';
  pre.textContent = out.join('\n');
  document.body.append(pre);
})().catch(e => { const pre = document.createElement('pre'); pre.id = 'OK'; pre.textContent = 'HARNESS CRASH ' + e.stack; document.body.append(pre); });
