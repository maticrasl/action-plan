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

  /* ---------- Templates (templates.js) ---------- */

  await step('templates: data is complete in both languages and every link names an item of the right kind', () => {
    const TEXT = ['name', 'about', 'title', 'specific', 'metric', 'unit', 'achievable', 'relevant', 'description'];
    const pairOk = (v, where) => assert(typeof v === 'string' ? v.trim() : Array.isArray(v) && v.length === TPL_LANGS.length && v.every(x => typeof x === 'string' && x.trim()), `text ${where}: ${JSON.stringify(v)}`);
    const seen = new Set();
    for (const tpl of TEMPLATES) {
      assert(!seen.has(tpl.id) && TPL_AREAS.includes(tpl.area) && ['starter', 'ambitious'].includes(tpl.level), `${tpl.id}: id, area, level`);
      seen.add(tpl.id);
      assert(Array.isArray(tpl.name) && Array.isArray(tpl.about), `${tpl.id}: name and about in every language`);
      const kinds = {};
      for (const [coll, kind] of [['goals', 'goal'], ['states', 'state'], ['activities', 'activity']]) {
        for (const x of tpl[coll]) {
          assert(x.k && !kinds[x.k], `${tpl.id}: key ${x.k} unique`);
          kinds[x.k] = kind;
          assert(x.title, `${tpl.id}.${x.k}: title`);
          TEXT.forEach(f => x[f] !== undefined && pairOk(x[f], `${tpl.id}.${x.k}.${f}`));
        }
      }
      pairOk(tpl.name, tpl.id + '.name'); pairOk(tpl.about, tpl.id + '.about');
      const links = { sub: 'goal', deps: null, measures: 'goal', goals: 'goal', improves: 'state', parent: 'activity' };
      for (const x of [...tpl.goals, ...tpl.states, ...tpl.activities]) {
        for (const [f, kind] of Object.entries(links)) {
          [].concat(x[f] || []).forEach(k => assert(kinds[k] === (kind || kinds[x.k]), `${tpl.id}.${x.k}.${f} → ${k}`));
        }
      }
      for (const g of tpl.goals) assert(g.progress || (isNum(g.baseline) && isNum(g.target) && g.baseline !== g.target), `${tpl.id}.${g.k}: baseline and target`);
    }
    const starters = TEMPLATES.filter(x => x.level === 'starter').length;
    return `${TEMPLATES.length} templates (${starters} starter, ${TEMPLATES.length - starters} ambitious)`;
  });

  await step('templates: every template becomes a sound plan, in both languages, and every view draws it', () => {
    const views = ['dashboard', 'goals', 'states', 'graphs', 'activities', 'timeline', 'map'];
    const made = [];
    let items = 0;
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const tpl of TEMPLATES) {
        const where = `${code} ${tpl.id}`;
        useTemplate(tpl);
        made.push(plans.current);
        assert(currentPlan().name.startsWith(tplText(tpl.name)), `${where}: plan name`);
        eq([db.goals.length, db.states.length, db.activities.length], [tpl.goals.length, tpl.states.length, tpl.activities.length], `${where}: counts`);
        items += itemCount();
        assert([...db.goals, ...db.states, ...db.activities].every(x => typeof x.title === 'string' && x.title), `${where}: titles`);
        assert(db.goals.every(g => g.category === t('tpl.area.' + tpl.area)), `${where}: category`);
        // Every link follows the rules, as if added by hand, and survives a merge.
        const all = [...db.relations];
        all.forEach(r => {
          db.relations = all.filter(x => x !== r);
          const err = canRelate(r.from, r.to, r.type);
          assert(!err, `${where}: ${r.type} ${findEntity(r.from)?.item.title} → ${findEntity(r.to)?.item.title}: ${err}`);
        });
        db.relations = all;
        assert(repairRelations(db).length === all.length, `${where}: merge repair keeps every relation`);
        // Dates make sense: nothing ends before it starts, nothing is late on the first day,
        // sub-activities sit inside their parent, and work starts once what it waits for is due.
        const title = id => findEntity(id).item.title;
        db.goals.forEach(g => assert(g.startDate <= g.deadline && goalState(g) !== 'late', `${where}: goal dates ${g.title}`));
        db.activities.forEach(a => {
          assert(!a.dueDate || a.startDate <= a.dueDate, `${where}: dates ${a.title}`);
          assert(activityState(a) !== 'late', `${where}: late on day one ${a.title}`);
          relsFrom(a.id, 'subactivity').forEach(r => {
            const p = findEntity(r.to).item;
            assert(a.startDate >= p.startDate && a.dueDate <= p.dueDate, `${where}: ${a.title} inside ${p.title}`);
          });
          effectiveDeps(a.id, 'activity').forEach(id => {
            const dep = findEntity(id).item;
            assert(a.startDate >= dep.dueDate, `${where}: ${a.title} starts before ${dep.title} is due`);
          });
          relsFrom(a.id, 'contributes').forEach(r => assert(a.dueDate <= findEntity(r.to).item.deadline, `${where}: ${a.title} due after ${title(r.to)}`));
          // Every activity works toward a goal, directly or through its parent.
          assert([a.id, ...ancestors(a.id, 'subactivity')].some(id => relsFrom(id, 'contributes').length), `${where}: ${a.title} serves no goal`);
          if (isRoutine(a)) assert(scheduleText(a) && periodProgress(a).target >= 0, `${where}: routine ${a.title}`);
        });
        db.states.forEach(s => assert(relsFrom(s.id, 'measures').length || relsTo(s.id, 'improves').length, `${where}: state ${s.title} unlinked`));
        db.goals.filter(byActivities).forEach(g => assert(countedActivities(g).length, `${where}: ${g.title} has activities to count`));
        db.goals.filter(byRoutines).forEach(g => assert(goalRoutines(g).length, `${where}: ${g.title} has routines`));
        assert(!hasProgress(db), `${where}: starts without progress`);
        views.forEach(v => { setView(v); assert(viewEl.children.length, `${where}: ${v} empty`); });
      }
    }
    changeLanguage('en');
    made.forEach(deletePlan);
    setView('dashboard');
    return `${made.length} plans, ${items} items`;
  });

  await step('templates: picker from the empty plan and settings, filtered by area, opens a template as a new plan', () => {
    fresh('Template picker');
    setView('goals');
    const offer = viewEl.querySelector('.empty [data-templates]');
    assert(offer, 'an empty plan offers templates');
    offer.click();
    assert(tplDialog.open, 'picker open');
    const cards = () => [...tplDialog.querySelectorAll('.tpl-card')];
    eq(cards().length, TEMPLATES.length, 'all templates listed');
    eq(tplDialog.querySelectorAll('[data-tpl-area]').length, TPL_AREAS.length + 1, 'a chip for each area and all');
    tplDialog.querySelector('[data-tpl-area="money"]').click();
    eq(cards().length, TEMPLATES.filter(x => x.area === 'money').length, 'only money templates');
    eq(cards().map(c => c.querySelector('.tpl-level').classList.contains('starter')), [true, true, true, false], 'starter ones first');
    assert(tplDialog.querySelector('[data-tpl-area="money"]').getAttribute('aria-pressed') === 'true', 'chip pressed');
    tplDialog.querySelector('[data-tpl-area=""]').click();
    eq(cards().length, TEMPLATES.length, 'all again');
    const run = tplDialog.querySelector('[data-template="run-5k"]').closest('.tpl-card');
    eq([...run.querySelectorAll('.tpl-meta span')].map(x => x.textContent), ['10 weeks', '1 goal', '1 state', '6 activities', '2 routines'], 'summary line');
    const inside = run.querySelector('.tpl-inside').textContent;
    assert(inside.includes('Buy running shoes') && inside.includes('Run 3 times a week') && !inside.includes('Weeks 1–3'), 'inside: main steps and routines, not sub-steps');
    const before = plans.list.length, from = plans.current;
    run.querySelector('[data-template]').click();
    assert(!tplDialog.open && plans.list.length === before + 1 && plans.current !== from, 'a new plan, the empty one kept');
    eq(currentPlan().name, 'Run 5 km', 'named after the template');
    eq(db.activities.length, 8, 'activities');
    assert($('#toast').textContent.includes('Run 5 km'), 'toast');
    const made = plans.current;
    useTemplate(TEMPLATES.find(x => x.id === 'run-5k'));
    eq(currentPlan().name, 'Run 5 km 2', 'a second copy is numbered');
    deletePlan(plans.current);
    // From settings; Esc and the close button both close it.
    $('#settingsBtn').click();
    $('#templatesBtn').click();
    assert(!settings.open && tplDialog.open, 'settings hand over to the picker');
    tplDialog.querySelector('[data-templates-close]').click();
    assert(!tplDialog.open, 'closed');
    changeLanguage('sl');
    openTemplates();
    const sl = tplDialog.textContent;
    assert(sl.includes('Za začetek') && sl.includes('Ambiciozno') && sl.includes('10 tednov1 cilj1 stanje6 aktivnosti2 rutini') && sl.includes('Preteči 5 km'), 'Slovene wording');
    assert(sl.includes('2 leti') && sl.includes('3 leta'), 'years in Slovene');
    tplDialog.close();
    changeLanguage('en');
    deletePlan(made);
    return 'ok';
  });

  await step('link lists: chosen items on top, search opens the list, goals grouped by category', () => {
    fresh('Pickers');
    const g1 = mk('goal', { title: 'Run a marathon', category: 'Health' });
    const g2 = mk('goal', { title: 'Save money', category: 'Finance' });
    const g3 = mk('goal', { title: 'Življenje brez skrbi' });
    mk('goal', { title: 'Sleep well', category: 'Health' });
    const a = mk('activity', { title: 'Train' });
    rel(a, g1, 'contributes');
    openForm('activity', a.id);
    const pk = modal.querySelector('.picker[data-picker="goal"]');
    const list = pk.querySelector('.pick-list'), search = pk.querySelector('.picker-search');
    assert(!modal.querySelector('input[type="checkbox"]'), 'no checkboxes');
    assert(list.hidden && search.getAttribute('aria-expanded') === 'false', 'list closed at first');
    const chosen = () => [...pk.querySelectorAll('[data-unpick]')].map(b => b.dataset.unpick);
    eq(chosen(), [g1.id], 'linked goal shown as chosen');
    search.focus();
    assert(!list.hidden && search.getAttribute('aria-expanded') === 'true', 'focusing the search opens the list');
    const shown = () => [...pk.querySelectorAll('.pick-opt:not([hidden])')].map(o => o.dataset.pick);
    eq([...pk.querySelectorAll('.pick-group:not([hidden]) .pick-head')].map(h => h.textContent), ['Finance', 'Health', 'No category'], 'category groups');
    assert(!shown().includes(g1.id) && shown().length === 3, 'chosen goal not offered again');
    pk.querySelector(`.pick-opt[data-pick="${g2.id}"]`).click();
    eq(chosen(), [g1.id, g2.id], 'clicking adds it');
    assert(!list.hidden && document.activeElement === search, 'list stays open, typing goes on');
    search.value = 'zivlj';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    eq(shown(), [g3.id], 'search ignores case and accents');
    assert(pk.querySelectorAll('.pick-group:not([hidden])').length === 1, 'empty groups hidden');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(modal.open && chosen().includes(g3.id), 'Enter adds the first match, form stays open');
    search.value = 'nothing like this';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    assert(!pk.querySelector('.pick-empty').hidden && pk.querySelector('.pick-empty').textContent === 'No matches', 'no matches message');
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert(document.activeElement.matches('.pick-opt'), 'arrow down moves into the list');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(list.hidden && modal.open && document.activeElement === search, 'Escape closes the list, not the form');
    modal.querySelector('#f-title').focus();
    assert(list.hidden, 'leaving the search closes the list');
    pk.querySelector(`[data-unpick="${g1.id}"]`).click();
    assert(!chosen().includes(g1.id), '× removes it');
    search.focus();
    assert(shown().includes(g1.id), 'removed goal offered again');
    submitForm();
    eq(relsFrom(a.id, 'contributes').map(r => r.to).sort(), [g2.id, g3.id].sort(), 'saved links');
    openForm('goal', g2.id);
    const acts = modal.querySelector('.picker[data-picker="activity"]');
    assert(!acts.querySelector('.pick-head') && acts.querySelector('[data-unpick]').closest('.tag').textContent.includes('Train'), 'activities flat, contributing one chosen');
    modal.close();
    changeLanguage('sl');
    openForm('activity');
    assert(modal.querySelector('.pick-none').textContent === I18N.sl.strings['pick.none'], 'Slovenian empty text');
    modal.close();
    changeLanguage('en');
  });

  await step('map: drag from one box to another to link them; touch picks by tapping', async () => {
    fresh('Linking');
    const g = mk('goal', { title: 'Big goal' }), g2 = mk('goal', { title: 'Other goal' });
    const a = mk('activity', { title: 'Do it' }), s = mk('state', { title: 'Now' });
    rel(a, g, 'related'); rel(s, g, 'measures'); rel(g2, g, 'related');
    save();
    setView('map');
    const node = id => $(`[data-map-node="${id}"]`);
    const mid = id => { const r = node(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const ev = (type, el, p) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0, clientX: p.x, clientY: p.y }));
    const drag = (fromId, end, hover) => {
      const p0 = mid(fromId);
      ev('pointerdown', node(fromId), p0);
      ev('pointermove', document, { x: p0.x + 20, y: p0.y + 20 });
      if (hover) ev('pointermove', document, hover);
      ev('pointerup', document, end);
    };
    node(a.id).scrollIntoView({ block: 'center' });
    // Drag activity → goal: the form offers only what fits (contributes; related already exists).
    const p0 = mid(a.id), pg = mid(g.id);
    ev('pointerdown', node(a.id), p0);
    ev('pointermove', document, { x: p0.x + 30, y: p0.y - 30 });
    assert($('.link-line') && node(a.id).classList.contains('link-source') && $('.map-wrap').classList.contains('linking'), 'line drawn while dragging');
    assert(!$('.map-wrap').classList.contains('panning'), 'dragging a box does not pan');
    ev('pointermove', document, pg);
    assert(node(g.id).classList.contains('link-target'), 'target box marked');
    ev('pointerup', document, pg);
    assert(!$('.link-line') && !$('.link-source, .link-target'), 'line removed');
    await tick();
    assert(modal.open && $('#f-from').value === a.id && $('#f-to').value === g.id, 'relationship form opened for the two items');
    eq([...$('#f-type').options].map(o => o.value), ['contributes'], 'only fitting types');
    submitForm();
    assert(relsFrom(a.id, 'contributes').some(r => r.to === g.id), 'link saved');

    // Goal dragged onto an activity: offered in the other direction, saved the right way round.
    const before = db.relations.length;
    drag(g2.id, mid(a.id));
    await tick();
    eq([...$('#f-type').options].map(o => o.value), ['related', 'rev:contributes'], 'both directions listed');
    $('#f-type').value = 'rev:contributes';
    submitForm();
    assert(db.relations.length === before + 1 && relsFrom(a.id, 'contributes').some(r => r.to === g2.id), 'reverse type saved activity → goal');

    // Released outside a box, on itself, or on the background: nothing happens.
    const n = db.relations.length;
    const wrap = $('.map-wrap').getBoundingClientRect();
    drag(a.id, { x: wrap.left + 3, y: wrap.top + 3 });
    await tick();
    drag(a.id, mid(a.id));
    await tick();
    assert(!modal.open && db.relations.length === n && !$('.link-line'), 'dropped outside: no link');
    // A click on a box without dragging still highlights it.
    ev('pointerdown', node(s.id), mid(s.id)); ev('pointerup', document, mid(s.id));
    await tick();
    node(s.id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(ui.mapSelected === s.id && !modal.open, 'plain click highlights');
    ui.mapSelected = null; render();
    // Escape drops a link in progress.
    const ps = mid(s.id);
    ev('pointerdown', node(s.id), ps);
    ev('pointermove', document, { x: ps.x + 40, y: ps.y });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!$('.link-line'), 'Escape removes the line');
    ev('pointerup', document, mid(g.id));
    await tick();
    assert(!modal.open, 'released after Escape: no form');
    // Nothing fits (state → goal "measures" exists, "related" too): a message instead of the form.
    rel(s, g, 'related');
    render();
    drag(s.id, mid(g.id));
    await tick();
    assert(!modal.open && $('#toast').textContent.includes('can’t be linked'), 'no possible link: message');

    // Touch: "Link to…" from the long-press menu, then tap the other box.
    openCtxMenu(g2.id, 10, 10);
    ctxMenu.querySelector('[data-ctx="link"]').click();
    assert(ui.mapLinkFrom === g2.id && $('.link-bar') && node(g2.id).classList.contains('link-source'), 'pick mode with a banner');
    node(g.id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(!ui.mapLinkFrom && modal.open && $('#f-from').value === g2.id && $('#f-to').value === g.id, 'tap on the other box opens the form');
    eq([...$('#f-type').options].map(o => o.value), ['subgoal', 'depends', 'rev:subgoal', 'rev:depends'], 'goal ↔ goal types (related exists)');
    modal.close();
    startMapLink(g2.id);
    $('.map-legend').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(!ui.mapLinkFrom && !$('.link-bar') && !modal.open, 'tapping elsewhere cancels');
    startMapLink(g2.id);
    $('[data-map-link-cancel]').click();
    assert(!ui.mapLinkFrom && !modal.open, 'Cancel button');
    startMapLink(g2.id);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!ui.mapLinkFrom, 'Escape cancels');
    // The timeline's "Link to…" still opens the form.
    setView('timeline');
    runCtxAction('link', a.id);
    assert(modal.open && $('#f-from').value === a.id && !ui.mapLinkFrom, 'timeline opens the form');
    modal.close();
    const i = TOUR_STEPS.findIndex(x => x.key === 'mapLink');
    assert(TOUR_STEPS[i - 1].key === 'map' && TOUR_STEPS[i].view === 'map', 'tour step after the map');
    assert(t('tour.mapLink.text').includes('drag') && I18N.sl.strings['tour.mapLink.text'].includes('povlecite'), 'tour text in both languages');
  });

  await step('deleting a plan: consequences spelled out, name must be typed', () => {
    fresh('Old plan');
    const g = mk('goal'), s = mk('state', { history: [{ date: d(-1), value: '1' }, { date: d(0), value: '2' }] });
    mk('activity'); rel(s, g, 'measures');
    save();
    const id = plans.current, count = plans.list.length;
    $('[data-plan="delete"]').click();
    const dlg = $('#planDelete'), btn = $('#planDeleteBtn'), box = $('#planDeleteName');
    assert(dlg.open && document.activeElement === box, 'dialog open, name field focused');
    const text = $('#planDeleteBody').textContent;
    ['Old plan', '1 goal', '1 current state', '2 recorded measurements', '1 activity', '1 relationship', 'can’t be undone', 'only in this browser', 'other plans are not affected']
      .forEach(x => assert(text.includes(x), 'mentions ' + x));
    assert(btn.disabled, 'delete disabled at first');
    const type = v => { box.value = v; box.dispatchEvent(new Event('input', { bubbles: true })); };
    type('old plan');
    assert(btn.disabled, 'wrong case not accepted');
    type('Old pla');
    $('#planDeleteForm').dispatchEvent(new Event('submit', { cancelable: true }));
    assert(dlg.open && plans.list.length === count, 'submit with a wrong name does nothing');
    dlg.querySelector('.btn.ghost[data-plan-delete-close]').click();
    assert(!dlg.open && plans.current === id && plans.list.length === count, 'Cancel keeps the plan');
    $('[data-plan="delete"]').click();
    const box2 = $('#planDeleteName');
    assert(box2.value === '' && btn.disabled, 'field empty again');
    box2.value = '  Old plan ';
    box2.dispatchEvent(new Event('input', { bubbles: true }));
    assert(!btn.disabled, 'exact name (spaces around ignored) enables delete');
    btn.click();
    assert(!dlg.open && plans.list.length === count - 1 && !plans.list.some(p => p.id === id), 'plan deleted');
    // The only plan: says an empty one replaces it; Slovenian plurals.
    plans.list.slice(1).forEach(p => deletePlan(p.id));
    changeLanguage('sl');
    openPlanDelete(currentPlan());
    const sl = $('#planDeleteBody').textContent;
    assert(sl.includes(I18N.sl.strings['planDel.last']), 'only plan: replaced by an empty one (Slovenian)');
    $('#planDelete').close();
    changeLanguage('en');
    eq(tp('planDel.goals', 2), '2 goals');
    eq(I18N.sl.strings['planDel.goals'].few.replace('{n}', 3), '3 cilji');
  });

  await step('plan names: samples numbered, map and timeline full width', () => {
    const base = t('plan.sampleName');
    plans.list.filter(p => p.name.startsWith(base)).forEach(p => deletePlan(p.id));
    loadSample(); loadSample(); loadSample();
    const names = plans.list.map(p => p.name).filter(n => n.startsWith(base));
    eq(names, [base, base + ' 2', base + ' 3'], 'sample plans numbered');
    eq(uniqueName('Nothing like it'), 'Nothing like it', 'free name kept');
    eq(uniqueName(base.toUpperCase()), base.toUpperCase() + ' 4', 'case is ignored');
    // The map and timeline are not limited to the page width the other views use.
    // (The test window is narrower than that limit, so the limit itself is checked.)
    const limit = v => { setView(v); return getComputedStyle(viewEl).maxWidth; };
    eq(['map', 'timeline', 'goals', 'dashboard'].map(limit), ['none', 'none', '1240px', '1240px'], 'width limits');
    setView('dashboard');
  });

  await step('routines: periods, streaks, consistency and states', () => {
    const now = today(), monday = addDays(now, -weekday(now));
    const r = (repeat, p = {}) => ({ id: uid(), title: 'r', status: 'todo', repeat, checkins: {}, ...p });
    eq(periodOf(r({ times: 2, per: 'month' }), '2028-02-10'), { from: '2028-02-01', to: '2028-02-29' }, 'month period');
    eq(periodOf(r({ times: 2, per: 'week' }), '2026-10-29'), { from: '2026-10-26', to: '2026-11-01' }, 'week starts on Monday');
    assert(weekday('2026-10-26') === 0 && weekday('2026-11-01') === 6, 'weekday: Monday 0');

    // 3× a week since three weeks before this Monday: met, missed, met; nothing yet this week.
    const tick = (a, ...isos) => isos.forEach(d => (a.checkins[d] = 1));
    const w = n => addDays(monday, -7 * n);
    const run = r({ times: 3, per: 'week' }, { startDate: w(3) });
    tick(run, w(3), addDays(w(3), 2), addDays(w(3), 4), w(2), addDays(w(2), 1), w(1), addDays(w(1), 3), addDays(w(1), 6));
    eq(periodProgress(run), { from: monday, to: addDays(monday, 6), done: 0, target: 3, met: false }, 'this week');
    eq(routineStreak(run), { n: 1, unit: 'week' }, 'streak: last week only');
    eq(consistency(run), 2 / 3, 'two of three finished weeks');
    eq(consistency(run, w(1)), 1, 'from last week');
    run.checkins[now] = 1;
    assert(periodProgress(run).done === 1 && routineState(run) === 'doing', 'ticked today: in progress');
    // Once this week is met it counts, and the streak goes on.
    const extra = [1, 2].map(n => addDays(now, -n)).filter(d => d >= monday);
    const fill = [...extra, addDays(now, 1), addDays(now, 2)].slice(0, 2);
    tick(run, ...fill);
    if (periodProgress(run).met) {
      eq(routineStreak(run), { n: 2, unit: 'week' }, 'streak with this week');
      eq(consistency(run), 3 / 4, 'this week counted once met');
      assert(routineState(run) === 'done', 'met: done');
    }
    // 7× a week with nothing ticked can no longer be met after Monday.
    const daily7 = r({ times: 7, per: 'week' }, { startDate: w(1) });
    eq(routineState(daily7), weekday(now) > 0 ? 'late' : 'todo', 'count mode late');

    // Every day for ten days, one day missed three days ago.
    const daily = r({ days: [0, 1, 2, 3, 4, 5, 6] }, { startDate: addDays(now, -10) });
    for (let n = 1; n <= 10; n++) if (n !== 3) daily.checkins[addDays(now, -n)] = 1;
    eq(routineStreak(daily), { n: 2, unit: 'day' }, 'days streak: today not ticked yet does not break it');
    eq(consistency(daily), 9 / 10, 'days consistency');
    if (weekday(now) >= 3) eq(routineState(daily), 'late', 'missed a due day this week');
    daily.checkins[now] = 1;
    eq(routineStreak(daily).n, 3, 'today ticked');
    // Only the due days count in days mode.
    const monThu = r({ days: [0, 3] }, { startDate: w(2) });
    tick(monThu, addDays(w(1), 1), addDays(w(1), 2));
    eq(consistency(monThu, '', ), 0, 'ticks on other days do not count');

    // Not started, ended, and what waits for it.
    assert(routineState(r({ times: 1, per: 'week' }, { startDate: addDays(now, 3) })) === 'todo', 'not started');
    fresh('Routine deps');
    const ended = mk('activity', { repeat: { times: 1, per: 'week' }, checkins: {}, startDate: addDays(now, -30), dueDate: addDays(now, -1) });
    const going = mk('activity', { repeat: { times: 1, per: 'week' }, checkins: {}, startDate: addDays(now, -30) });
    const after = mk('activity');
    rel(after, ended, 'depends'); rel(after, going, 'depends');
    assert(routineState(ended) === 'done' && isComplete('activity', ended) && !isComplete('activity', going), 'ended routine is complete');
    eq(blockers(after).map(x => x.id), [going.id], 'waits only for the running routine');
    return `streak ${routineStreak(run).n}, consistency ${Math.round(consistency(run) * 100)} %`;
  });

  await step('routines: form, board, overview, goal progress, menu, map and sync', async () => {
    fresh('Routines UI');
    const now = today();
    const g = mk('goal', { title: 'Move more', progress: 'routines', startDate: addDays(now, -14), deadline: addDays(now, 90), category: 'Health' });
    const oneOff = mk('activity', { title: 'Buy shoes', status: 'todo' });
    const change = (id, value) => { $(id).value = value; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
    const shown = sel => !modal.querySelector(sel).closest('[hidden]');
    // Create a routine in the form: specific days.
    openForm('activity');
    $('#f-title').value = 'Strength';
    assert(shown('[data-field="status"]') && !shown('#repeatCustom') && !shown('#repeatEnds') && !shown('#repDays') && !shown('#repTimes'), 'one-off by default');
    eq([...$('#f-repeat').options].map(o => o.value), ['none', 'week', 'month', 'days', 'custom'], 'kinds of repeat');
    change('#f-repeat', 'days');
    assert(!shown('[data-field="status"]') && !shown('[data-field="dueDate"]') && !shown('#repeatCustom') && shown('#repDays') && !shown('#repTimes') && shown('#repeatEnds'), 'days shown, status and due date hidden');
    modal.querySelector('.day-toggle[aria-pressed="true"]').click(); // the start's weekday is chosen by default
    submitForm();
    assert(modal.open && modal.querySelector('[data-field="days"] .err').textContent === t('err.days'), 'needs a day');
    modal.querySelectorAll('.day-toggle')[0].click(); modal.querySelectorAll('.day-toggle')[3].click();
    [...modal.querySelectorAll('[data-name="goals"] .pick-opt')].find(o => o.textContent === 'Move more').click();
    submitForm();
    const st = db.activities.find(a => a.title === 'Strength');
    assert(!modal.open && st && JSON.stringify(st.repeat) === '{"every":1,"unit":"week","days":[0,3]}' && st.startDate === now && !st.dueDate, 'saved as a routine from today');
    openForm('activity', st.id);
    assert($('#f-repeat').value === 'days' && modal.querySelector('[name="ends"]:checked').value === 'never', 'form shows the saved repeat');
    change('#f-repeat', 'custom');
    assert($('#f-unit').value === 'week' && $('#f-on').value === 'days' && shown('#repDays'), 'custom starts from specific days');
    modal.close();
    // A number of times per week, with validation.
    openForm('activity');
    $('#f-title').value = 'Run';
    change('#f-repeat', 'week');
    assert(shown('#repTimes') && !shown('#repDays') && !shown('#repeatCustom'), 'times shown');
    $('#f-times').value = '9';
    submitForm();
    assert(modal.querySelector('[data-field="times"] .err').textContent === t('err.times', { max: 7 }), 'at most 7 a week');
    $('#f-times').value = '3';
    $('#f-startDate').value = dateInput(addDays(now, -14));
    [...modal.querySelectorAll('[data-name="goals"] .pick-opt')].find(o => o.textContent === 'Move more').click();
    submitForm();
    const run = db.activities.find(a => a.title === 'Run');
    assert(JSON.stringify(run.repeat) === '{"every":1,"unit":"week","times":3}', 'count routine saved');

    // Presets, custom months and when it ends.
    openForm('activity');
    $('#f-title').value = 'Check-up';
    $('#f-startDate').value = dateInput('2099-01-28'); // the fourth and last Wednesday of January 2099
    $('#f-startDate').dispatchEvent(new Event('input', { bubbles: true }));
    change('#f-repeat', 'month');
    change('#f-repeat', 'custom');
    assert($('#f-unit').value === 'month' && $('#f-on').value === 'times' && shown('#repTimes') && !shown('#repDays'), 'custom starts from times per month');
    eq([...$('#f-on').options].map(o => o.value), ['day', 'lastDay', 'nth', 'times'], 'month options');
    $('#f-every').value = '2';
    $('#f-every').dispatchEvent(new Event('input', { bubbles: true }));
    assert($('#f-unit [value="month"]').textContent === tp('f.unit.month', 2), 'unit follows the interval');
    change('#f-on', 'nth');
    eq([$('#f-nth').value, $('#f-weekday').value], ['4', '2'], 'defaults to the start: the fourth Wednesday');
    change('#f-nth', '-1');
    modal.querySelector('[name="ends"][value="after"]').checked = true;
    $('#f-count').value = '3';
    submitForm();
    const check = db.activities.find(a => a.title === 'Check-up');
    assert(JSON.stringify(check.repeat) === '{"every":2,"unit":"month","on":"nth","nth":-1,"weekday":2,"count":3}', 'custom month saved: ' + JSON.stringify(check.repeat));
    assert(check.dueDate === '2099-05-27', 'ends on the third occurrence: ' + check.dueDate);
    eq(daysBetween('2099-01-01', '2099-12-31').filter(d => runsOn(check, d) && isDueDay(check, d)), ['2099-01-28', '2099-03-25', '2099-05-27'], 'last Wednesday every 2 months');
    assert(scheduleText(check) === 'every 2 months on the last Wednesday', scheduleText(check));
    openForm('activity', check.id);
    assert(modal.querySelector('[name="ends"]:checked').value === 'after' && $('#f-count').value === '3', 'ends after shown');
    modal.querySelector('[name="ends"][value="on"]').checked = true;
    $('#f-endDate').value = dateInput('2098-01-01');
    submitForm();
    assert(modal.querySelector('[data-field="endDate"] .err').textContent === t('err.startAfterDue'), 'cannot end before it starts');
    $('#f-endDate').value = dateInput('2099-12-31');
    submitForm();
    assert(check.dueDate === '2099-12-31' && !check.repeat.count, 'ends on a date');
    openForm('activity', check.id);
    change('#f-unit', 'year');
    $('#f-every').value = '1';
    submitForm();
    assert(JSON.stringify(check.repeat) === '{"every":1,"unit":"year"}' && scheduleText(check) === 'every year on 28 January', scheduleText(check));
    removeEntity('activity', check.id);

    // Board: routines above the columns, ticking days on the week strip.
    setView('activities');
    assert($('.routines') && $('.routines').querySelectorAll('.card.routine').length === 2, 'routines strip');
    assert(!$('.board').querySelector(`[data-open="${run.id}"]`) && $('.board').querySelector(`[data-open="${oneOff.id}"]`), 'columns hold one-offs only');
    const day = d => $(`.card.routine[data-open="${run.id}"] [data-checkin][data-date="${d}"]`);
    assert(day(now) && !day(now).disabled, 'today can be ticked');
    const future = addDays(now, 1);
    if (weekday(now) < 6) assert(day(future).getAttribute('aria-disabled') === 'true', 'future days cannot');
    day(now).click();
    assert(checkedOn(run, now) && day(now).getAttribute('aria-pressed') === 'true' && !modal.open, 'ticked without opening the form');
    day(now).click();
    assert(!checkedOn(run, now) && run.checkins[now] === 0, 'unticked (kept as 0 for sync)');
    // Meeting the week says so.
    const monday = addDays(now, -weekday(now));
    const past = daysBetween(monday, addDays(now, -1)).slice(-2);
    past.forEach(d => (run.checkins[d] = 1));
    render();
    if (past.length === 2) {
      day(now).click();
      assert($('#toast').textContent === t('rt.metWeek'), 'week met message');
      run.checkins[now] = 0; render();
    }

    // Overview: its own list; counts and next actions leave routines out.
    setView('dashboard');
    const rows = [...$('.routine-list').querySelectorAll('.routine-row')].map(r => r.dataset.open);
    assert(rows.includes(run.id) && rows.includes(st.id), 'routines on the overview');
    assert(![...$('#view').querySelectorAll('.list:not(.routine-list) > .row')].some(r => r.dataset.open === run.id), 'not in next actions');
    assert($('.facts').textContent.includes(t('dash.factDone', { done: 0, total: 1 })), 'one-off counts only');
    $(`.routine-row[data-open="${run.id}"] [data-checkin]`).click();
    assert(checkedOn(run, now) && !modal.open, 'done today from the overview');

    // Goal measured by routines: the average of their consistency since the goal started.
    const vals = [run, st].map(a => consistency(a, g.startDate)).filter(v => v !== null);
    const expected = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length * 100 : 0;
    assert(Math.abs(goalProgress(g) - expected) < 1e-9, `goal progress ${goalProgress(g)} = ${expected}`);
    assert(smartCheck(g).M, 'measurable without a metric');
    openForm('goal', g.id);
    assert($('#f-progress').value === 'routines' && $('#measureFields').hidden && !$('#routinesHint').hidden, 'goal form: by routines');
    $('#f-progress').value = 'activities'; $('#f-progress').dispatchEvent(new Event('change', { bubbles: true }));
    assert($('#routinesHint').hidden && !$('#actsHint').hidden, 'hints follow the choice');
    modal.close();
    assert(!countedActivities(g).some(isRoutine), 'activity counts leave routines out');

    // Context menu: done today; map box shows this week.
    openCtxMenu(st.id, 10, 10);
    const item = ctxMenu.querySelector('[data-ctx="checkin"]');
    assert(item && !ctxMenu.querySelector('[data-ctx^="status:"]'), 'menu: done today, no statuses');
    item.click();
    assert(checkedOn(st, now), 'ticked from the menu');
    setView('map');
    assert($(`[data-map-node="${run.id}"] .sub`).textContent.includes(t('rt.week', { done: periodProgress(run).done, target: 3 })), 'map shows this week');
    // Switching repeat off keeps the check-ins.
    openForm('activity', run.id);
    $('#f-repeat').value = 'none'; $('#f-repeat').dispatchEvent(new Event('change', { bubbles: true }));
    submitForm();
    assert(!isRoutine(run) && run.checkins[now] === 1, 'one-off again, check-ins kept');

    // Sync: check-ins from both devices are kept; the newer version wins on the same day.
    const base = { id: 'x', title: 'X', status: 'todo', repeat: { times: 3, per: 'week' } };
    const older = { ...base, updatedAt: '2099-01-01', checkins: { '2099-01-01': 1, '2099-01-02': 1 } };
    const newer = { ...base, updatedAt: '2099-01-03', checkins: { '2099-01-02': 0, '2099-01-03': 1 } };
    const m = mergePlans({ ...emptyDb(), activities: [older] }, { ...emptyDb(), activities: [newer] }).activities[0];
    eq(m.checkins, { '2099-01-01': 1, '2099-01-02': 0, '2099-01-03': 1 }, 'merged check-ins');
    eq(mergePlans({ ...emptyDb(), activities: [newer] }, { ...emptyDb(), activities: [older] }).activities[0].checkins, m.checkins, 'symmetric');
  });

  await step('routines: sample plan, tour and wording', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      loadSample();
      const exercise = db.goals.find(g => byRoutines(g));
      const routines = db.activities.filter(isRoutine);
      assert(exercise && goalRoutines(exercise).length === 2 && routines.length === 3, `${code}: goal by routines, three routines`);
      assert(goalProgress(exercise) > 50 && goalProgress(exercise) < 100, `${code}: consistency ${goalProgress(exercise)}`);
      assert(routines.every(a => routineStreak(a).n >= 0 && consistency(a) !== null), `${code}: routines have history`);
      setView('activities');
      assert($('.routines .card.routine') && !$('.routines').textContent.includes('rt.'), `${code}: strip rendered`);
      setView('dashboard');
      assert($('.routine-list') && !$('.routine-list').textContent.includes('rt.'), `${code}: overview list`);
    }
    const sl = I18N.sl.strings;
    eq([1, 2, 3, 5].map(n => tp('rt.perWeek', n)), ['enkrat na teden', 'dvakrat na teden', '3-krat na teden', '5-krat na teden'], 'Slovenian schedule');
    eq(tp('rt.streak.week', 2), '2 tedna zapored', 'Slovenian streak');
    changeLanguage('en');
    eq([1, 3].map(n => tp('rt.perWeek', n)), ['once a week', '3× a week']);
    assert(scheduleText({ repeat: { days: [0, 3] } }) === 'every Mon, Thu' && scheduleText({ repeat: { days: [0, 1, 2, 3, 4, 5, 6] } }) === 'every day', 'day schedules');
    const at = (repeat, startDate = '2099-01-07') => ({ repeat, startDate }); // a Wednesday
    eq([
      at({ every: 1, unit: 'day' }), at({ every: 3, unit: 'day' }), at({ every: 1, unit: 'week' }), at({ every: 2, unit: 'week', days: [0, 4] }),
      at({ every: 1, unit: 'month' }), at({ every: 1, unit: 'month', on: 'weekday' }), at({ every: 2, unit: 'week', times: 3 }), at({ every: 1, unit: 'month', times: 1 }),
    ].map(scheduleText), ['every day', 'every 3 days', 'every Wed', 'every 2 weeks on Mon, Fri', 'every month on day 7', 'every month on the first Wednesday', '3× every 2 weeks', 'once a month']);
    changeLanguage('sl');
    eq([at({ every: 2, unit: 'week', days: [0] }), at({ every: 1, unit: 'month', on: 'weekday' }), at({ every: 5, unit: 'year' })].map(scheduleText),
      ['vsaka 2 tedna: pon.', 'vsak mesec: prva sreda v mesecu', 'vsakih 5 let: 7. januar'].map(x => x), 'Slovenian summaries');
    changeLanguage('en');
    // Every 3 days; every 2 weeks (Mon, Fri); flexible every 2 weeks; a yearly one.
    const due = a => daysBetween('2099-01-07', '2099-01-31').filter(d => isDueDay(a, d)).map(d => d.slice(8));
    eq(due(at({ every: 3, unit: 'day' })), ['07', '10', '13', '16', '19', '22', '25', '28', '31'], 'every 3 days');
    eq(due(at({ every: 2, unit: 'week', days: [0, 4] })), ['09', '19', '23'], 'every 2 weeks on Mon, Fri');
    eq(periodOf(at({ every: 2, unit: 'week', times: 3 }), '2099-01-14'), { from: '2099-01-05', to: '2099-01-18' }, 'a two-week period');
    eq(periodOf(at({ every: 1, unit: 'year' }), '2099-06-01'), { from: '2099-01-01', to: '2099-12-31' }, 'a year');
    eq(lastOccurrence(at({ every: 2, unit: 'week', times: 3 }), 7), '2099-02-15', 'seven times at 3 per two weeks needs three periods');
    // Nothing due this period: the next due day instead of 0 / 0.
    const now = today(), lastWeek = addDays(now, -weekday(now) - 7);
    const next = iso => t('rt.next', { date: fmtDay(iso, { weekday: 'short', day: 'numeric', month: 'short' }) });
    const offWeek = at({ every: 2, unit: 'week', days: [weekday(now)] }, lastWeek);
    eq(periodText(offWeek), next(addDays(now, 7)), 'off week shows the next due day');
    eq(periodText(at({ every: 2, unit: 'week', days: [weekday(now)] }, addDays(lastWeek, 7))), t('rt.week', { done: 0, target: 1 }), 'on week shows progress');
    eq(periodText(at({ every: 1, unit: 'month' }, addDays(now, 40))), next(addDays(now, 40)), 'not started yet');
    eq(periodText({ ...offWeek, dueDate: addDays(now, 3) }), t('rt.ended'), 'not due again before it ends');
    const i = TOUR_STEPS.findIndex(x => x.key === 'routines');
    assert(TOUR_STEPS[i - 1].key === 'activities' && TOUR_STEPS[i].target[0] === '.routines', 'tour step after activities');
    assert(t('tour.routines.text').includes('streak') && sl['tour.routines.text'].includes('niz'), 'tour text');
    return db.activities.filter(isRoutine).map(a => `${a.title}: ${periodText(a)}, ${streakText(routineStreak(a))}`).join(' | ');
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
    rel(a1, a3, 'subactivity');
    assert(canRelate(a1.id, a2.id, 'subactivity') === t('err.oneParent'), 'one parent');
    assert(canRelate(a3.id, a1.id, 'subactivity') === t('err.cycle'), 'parent cycle');
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

  await step('relation rules: no dependency up or down a parent line, and no item waits for itself', () => {
    fresh('SelfBlock');
    const [p, c, gc, x, y] = [mk('activity'), mk('activity'), mk('activity'), mk('activity'), mk('activity')];
    rel(c, p, 'subactivity'); rel(gc, c, 'subactivity');
    const sb = t('err.selfBlock'), line = t('err.lineDep');
    assert(canRelate(p.id, c.id, 'depends') === line, 'parent on its sub-activity');
    assert(canRelate(p.id, gc.id, 'depends') === line, 'grandparent on a grandchild');
    assert(canRelate(c.id, p.id, 'depends') === line, 'sub-activity on its parent');
    assert(canRelate(gc.id, p.id, 'depends') === line, 'grandchild on a grandparent');
    const sib = mk('activity'); rel(sib, p, 'subactivity');
    assert(canRelate(c.id, sib.id, 'depends') === null && canRelate(gc.id, sib.id, 'depends') === null, 'siblings and cousins may wait for each other');
    assert(canRelate(c.id, x.id, 'depends') === null, 'ordinary waits stay allowed');
    // Joining a line where a dependency already links the two ends, either way round.
    const [u, v, w] = [mk('activity'), mk('activity'), mk('activity')];
    rel(w, v, 'subactivity'); rel(w, u, 'depends');
    assert(canRelate(v.id, u.id, 'subactivity') === line, 'new parent line over an existing child → ancestor wait');
    const z = mk('activity'); rel(v, z, 'depends');
    assert(canRelate(z.id, w.id, 'subactivity') === line, 'new parent line under an existing ancestor → child wait');
    assert(!possibleTypes(p.id, c.id).includes('depends') && !possibleTypes(c.id, p.id).includes('depends'), 'not offered as a choice');
    // Through a chain: p waits for x, x waits for gc → gc inherits p's wait and waits for itself.
    rel(x, gc, 'depends');
    assert(canRelate(p.id, x.id, 'depends') === sb, 'indirect self-wait');
    // Making x a sub-activity of y, which waits (via q) for x, would have x wait for itself.
    const q = mk('activity'); rel(y, q, 'depends'); rel(q, x, 'depends');
    assert(canRelate(x.id, y.id, 'subactivity') === sb, 'sub-activity of an item that waits for it');
    const g1 = mk('goal'), g2 = mk('goal');
    rel(g2, g1, 'subgoal');
    assert(canRelate(g1.id, g2.id, 'depends') === line && canRelate(g2.id, g1.id, 'depends') === line, 'goals follow the same rule');
    return `${db.relations.length} relations, all refused as expected`;
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
    const deletedDay = { ...y, updatedAt: '2099-03-01', history: [{ date: '2099-01-03', value: '30' }], dropped: { '2099-01-02': 1 } };
    const md = mergeState(x, deletedDay);
    eq(md.history.map(h => h.date.slice(-2)), ['01', '03'], 'a deleted measurement stays deleted');
    eq(md.dropped, { '2099-01-02': 1 }, 'deletion remembered');
    eq(mergeState({ ...x, updatedAt: '2099-04-01', history: [...x.history, { date: '2099-01-02', value: '9' }] }, deletedDay).dropped, undefined, 're-recorded later wins');

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

  await step('install: hidden without a way to install, hint for Firefox', () => {
    const shown = el => getComputedStyle(el).display !== 'none';
    renderInstall();
    assert(!shown($('#installSection')) && !shown($('#installBtn')), 'Chrome without a prompt shows nothing');
    const ua = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
    try {
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', configurable: true });
      renderInstall();
      assert(shown($('#installSection')) && !shown($('#installBtn')) && $('#installHint').textContent === t('install.firefoxHint'), 'Firefox: a hint, no button');
    } finally {
      delete navigator.userAgent;
      if (navigator.userAgent !== ua.get.call(navigator)) throw new Error('user agent not restored');
      renderInstall();
    }
    return $('#installHint').textContent || 'hidden';
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
    assert(!modal.open, 'Enter on an unselected item only selects it');
    node().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    assert(modal.open && formCtx.kind === 'goal' && formCtx.id === g1.id && ui.mapSelected === g1.id, 'Space on the selected item opens it');
    modal.close();
    ui.mapSelected = null; render();
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
    assert(pick.selectedOptions[0].textContent === `${HEALTH_BADGE.ok} Second plan`, 'shows the current plan name, after its status badge');
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
    assert(titles.join('|') === `${t('dash.next')}|${t('rt.title')}|${t('dash.goalsInProgress')}`, 'next actions, routines, then the goals');
    const todo = db.activities.filter(a => a.status !== 'done' && !isRoutine(a)).sort(byDueDate);
    const shown = () => [...$('#view').querySelectorAll('.list:not(.routine-list) > .row')].map(r => r.dataset.open);
    const more = () => $('[data-next-more]');
    assert(shown().join() === todo.slice(0, NEXT_FEW).map(a => a.id).join(), 'the first few by due date');
    assert(more().textContent === t('dash.showAll', { n: todo.length }) && more().getAttribute('aria-expanded') === 'false', 'show all with the count');
    window.scrollTo(0, 0);
    more().click();
    assert(shown().join() === todo.map(a => a.id).join(), 'expanded to all');
    assert(window.scrollY === 0 && document.documentElement.scrollHeight > innerHeight, 'page stays where it was');
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
    assert(!$('.lang-pick') && tour.step === 0 && $('#tourTitle').textContent === t('tour.about.title'), 'tour starts in English');
    assert($('[data-tour="next"]').textContent === t('tour.next') && !$('[data-tour="back"]'), 'about slide first, Next');
    assert(t('tour.about.text').includes('SMART'), 'describes the app');
    $('[data-tour="next"]').click();
    assert($('#tourTitle').textContent === t('tour.welcome.title') && $('[data-tour="next"]').textContent === t('tour.start'), 'then the tour intro with Start');
    endTour(false);
    return options;
  });

  /* ---------- Sharing plans: export as a full copy or a template, import with a progress check ---------- */

  // A plan with progress of every kind: achieved and measured goals, measurements, done and started
  // activities, routine check-ins (ticked and unticked), sync bookkeeping and a relation.
  const progressPlan = () => {
    const g1 = { id: uid(), title: 'Run 10 km', unit: 'km', baseline: '5', current: '7', target: '10', startDate: d(-30), deadline: d(40), status: 'active', category: 'Health', createdAt: d(-31), updatedAt: '2026-01-01T00:00:00.000Z' };
    const g2 = { id: uid(), title: 'Read a book', baseline: '0', current: '1', target: '1', startDate: d(-20), deadline: d(-2), status: 'achieved', updatedAt: '2026-01-01T00:00:00.000Z' };
    const g3 = { id: uid(), title: 'On hold', progress: 'activities', startDate: d(-10), status: 'paused' };
    const s1 = { id: uid(), title: 'Longest run', unit: 'km', value: '7', date: d(-1), history: [{ date: d(-30), value: '5' }, { date: d(-1), value: '7' }], updatedAt: '2026-01-01T00:00:00.000Z' };
    const s2 = { id: uid(), title: 'Weight', unit: 'kg', history: [] };
    const a1 = { id: uid(), title: 'Buy shoes', status: 'done', startDate: d(-28), dueDate: d(-25) };
    const a2 = { id: uid(), title: 'Training plan', status: 'doing', startDate: d(-21), dueDate: d(50), notes: 'Three runs a week' };
    const a3 = { id: uid(), title: 'Someday', status: 'todo' };
    const r1 = { id: uid(), title: 'Run', status: 'todo', startDate: d(-14), repeat: { every: 1, unit: 'week', days: [0, 3] }, checkins: { [d(-7)]: 1, [d(-4)]: 1, [d(-3)]: 0 } };
    const rel1 = { id: uid(), from: a2.id, to: g1.id, type: 'contributes' };
    return { name: 'Running', data: { goals: [g1, g2, g3], states: [s1, s2], activities: [a1, a2, a3, r1], relations: [rel1], deleted: { gone: '2026-01-01T00:00:00.000Z' } } };
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  const datesOf = data => [...data.goals, ...data.activities].flatMap(x => [x.startDate, x.deadline, x.dueDate]).filter(Boolean);
  const addPlan = ({ name, data }) => { createPlan(uniqueName(name), normalize(clone(data))); return currentPlan(); };
  // Captures what a download or share would hand over instead of saving it.
  const capture = async run => {
    const got = [];
    const orig = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = b => { got.push({ blob: b }); return 'blob:x' + got.length; };
    HTMLAnchorElement.prototype.click = function () { got[got.length - 1].name = this.download; };
    try { await run(); } finally { URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = click; }
    for (const g of got) g.json = JSON.parse(await g.blob.text());
    return got;
  };
  const fileOf = (obj, name = 'plan.json') => new File([typeof obj === 'string' ? obj : JSON.stringify(obj)], name, { type: 'application/json' });
  const imp = $('#planImport'), exp = $('#planExport');

  await step('plan files: resetting progress strips progress and keeps the structure', () => {
    const { data } = progressPlan();
    const before = clone(data);
    const r = resetProgress(data);
    eq(data, before, 'the original is left alone');
    const [g1, g2, g3] = r.goals, [s1, s2] = r.states, [a1, a2, a3, r1] = r.activities;
    assert(g1.current === '' && g2.current === '', 'goal current values cleared');
    assert(g1.status === 'active' && g2.status === 'active', 'achieved goal active again');
    assert(g3.status === 'paused', 'paused goal stays paused');
    eq([g1.baseline, g1.target, g1.unit, g1.category, g1.title], ['5', '10', 'km', 'Health', 'Run 10 km'], 'goal metric and wording kept');
    eq([g3.progress, g2.target], ['activities', '1'], 'progress mode and target kept');
    assert(s1.value === '' && s1.date === '' && s1.history.length === 0, 'measurements cleared');
    eq([s1.title, s1.unit, s2.unit], ['Longest run', 'km', 'kg'], 'states and units kept');
    eq(r.activities.map(a => a.status), ['todo', 'todo', 'todo', 'todo'], 'activities to do again');
    assert(!('checkins' in r1), 'check-ins removed');
    eq(r1.repeat, before.activities[3].repeat, 'recurrence kept');
    assert(a2.notes === 'Three runs a week', 'notes kept');
    eq(r.relations, before.relations, 'relations kept');
    eq([...r.goals, ...r.states, ...r.activities].map(x => x.id), [...before.goals, ...before.states, ...before.activities].map(x => x.id), 'ids kept, so relations still connect');
    assert(![...r.goals, ...r.states, ...r.activities, ...r.relations].some(x => 'updatedAt' in x), 'sync stamps dropped');
    eq(r.deleted, {}, 'deletion records dropped');
    eq([g1.startDate, g1.deadline, a1.dueDate, r1.startDate], [before.goals[0].startDate, before.goals[0].deadline, before.activities[0].dueDate, before.activities[3].startDate], 'dates unchanged without shift');
    assert(g1.createdAt === before.goals[0].createdAt, 'created date kept without shift');
    assert(a3.startDate === undefined && a3.dueDate === undefined, 'undated activity stays undated');
    eq(progressCounts(r), { checkins: 0, measurements: 0, done: 0, started: 0 }, 'no progress left');
    return `${r.goals.length} goals, ${r.activities.length} activities`;
  });

  await step('plan files: a template moves its dates by whole weeks to start this week', () => {
    for (const offset of [-30, -400, 0, 3, 20, 365]) {
      const { data } = progressPlan();
      const move = x => { for (const k of ['startDate', 'deadline', 'dueDate', 'createdAt']) if (x[k]) x[k] = addDays(x[k], offset); };
      [...data.goals, ...data.activities].forEach(move);
      const r = resetProgress(data, { shift: true });
      const was = datesOf(data), now = datesOf(r);
      const first = now.slice().sort()[0];
      assert(first >= today() && first <= addDays(today(), 6), `offset ${offset}: earliest ${first} lands this week`);
      const by = dayNum(now[0]) - dayNum(was[0]);
      assert(by % 7 === 0, `offset ${offset}: moved by whole weeks (${by})`);
      assert(now.every((x, i) => dayNum(x) - dayNum(was[i]) === by), `offset ${offset}: every date moved the same`);
      assert(now.every((x, i) => weekday(x) === weekday(was[i])), `offset ${offset}: weekdays kept, so weekly routines still fall on their days`);
      assert(r.goals[0].createdAt === addDays(data.goals[0].createdAt, by), `offset ${offset}: created date moved too`);
      assert(r.activities[2].startDate === undefined && r.activities[2].dueDate === undefined, 'undated stays undated');
    }
    const none = resetProgress({ goals: [{ id: 'g', title: 'No dates', status: 'active' }], states: [], activities: [], relations: [] }, { shift: true });
    assert(none.goals[0].startDate === undefined && none.goals[0].deadline === undefined, 'a plan without dates is not given any');
    const only = resetProgress({ goals: [], states: [], activities: [{ id: 'a', title: 'Due', status: 'todo', dueDate: d(-50) }], relations: [] }, { shift: true });
    assert(only.activities[0].dueDate >= today() && only.activities[0].dueDate <= addDays(today(), 6), 'a due date alone counts as the earliest');
    return 'six offsets checked';
  });

  await step('plan files: progress is counted for the import question', () => {
    const { data } = progressPlan();
    // 2 ticked check-ins (the unticked one does not count), 2 history entries + 2 goal current values,
    // 1 done activity + 1 achieved goal, 1 activity in progress.
    eq(progressCounts(data), { checkins: 2, measurements: 4, done: 2, started: 1 }, 'counts');
    eq(progressCounts(emptyDb()), { checkins: 0, measurements: 0, done: 0, started: 0 }, 'empty plan');
    eq(progressCounts({ goals: [], states: [{ id: 's', title: 'x', value: '3', date: d(-1) }], activities: [], relations: [] }).measurements, 1, 'a value without history counts once');
    eq(progressCounts({ goals: [], states: [{ id: 's', title: 'x', value: '', history: [] }], activities: [], relations: [] }).measurements, 0, 'an empty state does not');
    eq(progressCounts(normalize(sampleData())).checkins > 0, true, 'the sample plan has check-ins');
    return JSON.stringify(progressCounts(data));
  });

  await step('plan files: header, full copy and template', () => {
    const plan = addPlan(progressPlan());
    const full = planFile('full'), tpl = planFile('template');
    eq([full.format, full.version, full.kind, full.name], ['actionplan-plan', 1, 'full', plan.name], 'full header');
    eq([tpl.format, tpl.version, tpl.kind, tpl.name], ['actionplan-plan', 1, 'template', plan.name], 'template header');
    assert(!isNaN(Date.parse(full.exportedAt)), 'export time recorded');
    eq(full.goals, db.goals, 'full copy keeps everything');
    eq(full.activities, db.activities, 'full copy keeps check-ins');
    eq(progressCounts(tpl), { checkins: 0, measurements: 0, done: 0, started: 0 }, 'template has no progress');
    assert(datesOf(tpl).sort()[0] >= today(), 'template dates moved to now');
    assert(db.goals[1].status === 'achieved' && db.activities[3].checkins, 'exporting a template leaves the plan alone');
    deletePlan(plan.id);
    return `${full.goals.length} goals`;
  });

  await step('plan files: reading checks the format', () => {
    const { name, data } = progressPlan();
    const ok = parsePlanFile(JSON.stringify({ format: 'actionplan-plan', version: 1, kind: 'template', name, ...data }), 'x.json');
    eq([ok.name, ok.kind, ok.data.goals.length, ok.data.relations.length], [name, 'template', 3, 1], 'new format');
    const old = parsePlanFile(JSON.stringify({ name: 'Old export', ...data }), 'old.json');
    eq([old.name, old.kind, old.data.activities.length], ['Old export', 'full', 4], 'files exported before the header still import as full copies');
    eq(parsePlanFile(JSON.stringify({ goals: [] }), 'My backup.JSON').name, 'My backup', 'name from the file when missing');
    eq(parsePlanFile(JSON.stringify({ name: '   ', goals: [] }), 'blank.json').name, 'blank', 'blank name falls back to the file name');
    eq(parsePlanFile(JSON.stringify({ format: 'actionplan-plan', version: 1, kind: 'weird', name: 'k', goals: [] }), 'k.json').kind, 'full', 'unknown kind read as full');
    const reason = (text, msg) => { try { parsePlanFile(text, 'f.json'); } catch (e) { return e.code; } assert(false, `${msg}: accepted`); };
    eq(reason('not json', 'text'), 'invalid', 'not JSON');
    eq(reason('[1,2]', 'array'), 'invalid', 'an array');
    eq(reason('null', 'null'), 'invalid', 'null');
    eq(reason('{}', 'empty'), 'invalid', 'an empty object');
    eq(reason('{"foo":1,"name":"x"}', 'other'), 'invalid', 'unrelated JSON');
    eq(reason('{"goals":"many"}', 'wrong type'), 'invalid', 'collections that are not lists');
    eq(reason(JSON.stringify({ format: 'something-else', goals: [] }), 'format'), 'invalid', 'another format');
    eq(reason(JSON.stringify({ format: 'actionplan-sync', version: 1, plans: { list: [] }, data: {} }), 'sync'), 'invalid', 'the Drive sync file');
    eq(reason(JSON.stringify({ format: 'actionplan-plan', version: 2, name: 'n', goals: [] }), 'newer'), 'version', 'a file from a newer version');
    const junk = parsePlanFile(JSON.stringify({ name: 'J', goals: [{ id: 'g', title: 'ok', status: 'active' }], extra: 'x', states: 7 }), 'j.json');
    assert(!('extra' in junk.data) && Array.isArray(junk.data.states) && junk.data.states.length === 0, 'unknown fields dropped, bad collections emptied');
    return 'ok';
  });

  await step('export dialog: full copy or template, download or share', async () => {
    const plan = addPlan(progressPlan());
    const nav = { canShare: navigator.canShare, share: navigator.share };
    navigator.canShare = undefined;
    assert(document.querySelectorAll('[data-plan="export"]').length >= 1 && document.querySelectorAll('[data-plan="import"]').length >= 1, 'export and import beside the plan actions');
    $('[data-plan="export"]').click();
    assert(exp.open, 'export dialog opens');
    assert(exp.querySelector('input[name="exportKind"][value="full"]').checked, 'full copy chosen at first');
    assert(exp.textContent.includes(plan.name), 'names the plan');
    assert($('#exportShareBtn').hidden, 'no Share where the browser cannot share files');
    let got = await capture(() => $('#exportDownloadBtn').click());
    await tick();
    assert(!exp.open, 'closes after downloading');
    eq([got.length, got[0].json.kind], [1, 'full'], 'one full file');
    eq(got[0].json.activities, db.activities, 'full file has the progress');
    assert(got[0].name === `${plan.name}-${today()}.json`, `file name ${got[0].name}`);
    assert(got[0].blob.type === 'application/json', 'JSON type');

    $('[data-plan="export"]').click();
    exp.querySelector('input[name="exportKind"][value="template"]').click();
    got = await capture(() => $('#exportDownloadBtn').click());
    eq(got[0].json.kind, 'template', 'template file');
    eq(progressCounts(got[0].json), { checkins: 0, measurements: 0, done: 0, started: 0 }, 'template file has no progress');
    assert(got[0].name === `${plan.name}-${t('export.templateFile')}-${today()}.json`, `template file name ${got[0].name}`);
    $('[data-plan="export"]').click();
    assert(exp.querySelector('input[name="exportKind"][value="full"]').checked, 'full copy chosen again next time');
    exp.querySelector('[data-plan-export-close]').click();
    assert(!exp.open, 'Cancel closes');

    // Where files can be shared (phones), Share hands the file to the system share sheet.
    const shared = [];
    let fail = null;
    navigator.canShare = o => !!o?.files?.length;
    navigator.share = async o => { shared.push(o); if (fail) throw fail; };
    try {
      $('[data-plan="export"]').click();
      assert(!$('#exportShareBtn').hidden, 'Share offered');
      exp.querySelector('input[name="exportKind"][value="template"]').click();
      got = await capture(async () => { $('#exportShareBtn').click(); await tick(); await tick(); });
      eq(shared.length, 1, 'shared once');
      const f = shared[0].files[0];
      assert(f instanceof File && f.name === `${plan.name}-${t('export.templateFile')}-${today()}.json` && f.type === 'application/json', `shared file ${f.name}`);
      eq(JSON.parse(await f.text()).kind, 'template', 'shared the template');
      assert(shared[0].title === plan.name, 'share title is the plan name');
      eq(got.length, 0, 'nothing downloaded');
      assert(!exp.open, 'closes after sharing');

      fail = new DOMException('cancelled', 'AbortError');
      $('[data-plan="export"]').click();
      got = await capture(async () => { $('#exportShareBtn').click(); await tick(); await tick(); });
      eq(got.length, 0, 'cancelling the share sheet downloads nothing');

      fail = new Error('share broke');
      $('[data-plan="export"]').click();
      got = await capture(async () => { $('#exportShareBtn').click(); await tick(); await tick(); });
      eq([got.length, got[0]?.json.kind], [1, 'full'], 'a failed share falls back to a download');

      navigator.canShare = () => false;
      $('[data-plan="export"]').click();
      assert($('#exportShareBtn').hidden, 'no Share when files cannot be shared');
      exp.close();
    } finally {
      navigator.canShare = nav.canShare; navigator.share = nav.share;
    }

    // The Settings button opens the same dialog; the delete dialog's backup still downloads a full copy at once.
    $('#exportBtn').click();
    assert(exp.open, 'Settings → Export opens the dialog');
    exp.close();
    settings.close();
    openPlanDelete(plan);
    got = await capture(() => $('[data-plan-backup]').click());
    eq([got.length, got[0].json.kind, exp.open], [1, 'full', false], 'backup before deleting is a full copy, no dialog');
    planDel.close();
    deletePlan(plan.id);
    return 'download, template, share, fallback';
  });

  await step('import: templates and plans without progress come straight in', async () => {
    const n0 = plans.list.length;
    const { name, data } = progressPlan();
    await importJson(fileOf({ format: 'actionplan-plan', version: 1, kind: 'template', name, ...resetProgress(data, { shift: true }) }));
    assert(!imp.open && plans.list.length === n0 + 1 && currentPlan().name === name, 'template imported as a new plan');
    assert(db.goals.length === 3 && db.relations.length === 1, 'with its content');
    assert($('#toast').textContent === t('toast.imported'), 'toast');
    await importJson(fileOf({ format: 'actionplan-plan', version: 1, kind: 'template', name, ...resetProgress(data) }));
    assert(currentPlan().name === `${name} 2` && plans.list.length === n0 + 2, 'same name gets a number');
    await importJson(fileOf({ format: 'actionplan-plan', version: 1, kind: 'full', name: 'Fresh', ...resetProgress(data) }));
    assert(!imp.open && currentPlan().name === 'Fresh', 'a full copy without progress does not ask');
    const ids = plans.list.slice(n0).map(p => p.id);
    ids.forEach(deletePlan);
    eq(plans.list.length, n0, 'cleaned up');
    return 'ok';
  });

  await step('import: a full copy with progress asks to keep it or start fresh', async () => {
    const n0 = plans.list.length, startId = plans.current;
    const { name, data } = progressPlan();
    const file = { format: 'actionplan-plan', version: 1, kind: 'full', name, ...data };

    await importJson(fileOf(file));
    assert(imp.open && plans.list.length === n0, 'asks before adding anything');
    const text = imp.textContent;
    for (const s of [tp('import.checkins', 2), tp('import.measurements', 4), tp('import.done', 2), tp('import.started', 1)]) assert(text.includes(s), `mentions “${s}”`);
    assert(text.includes(name), 'names the plan');
    $('#importKeepBtn').click();
    await tick();
    assert(!imp.open && plans.list.length === n0 + 1 && currentPlan().name === name, 'Keep progress adds the plan');
    eq(progressCounts(db), progressCounts(data), 'with its progress');
    eq(db.activities.find(a => a.repeat).checkins, data.activities[3].checkins, 'check-ins intact');
    assert($('#toast').textContent === t('toast.imported'), 'toast');
    const kept = plans.current;

    await importJson(fileOf(file));
    assert(imp.open, 'asks again');
    $('#importFreshBtn').click();
    await tick();
    assert(!imp.open && plans.list.length === n0 + 2 && currentPlan().name === `${name} 2`, 'Start fresh adds the plan');
    eq(progressCounts(db), { checkins: 0, measurements: 0, done: 0, started: 0 }, 'without progress');
    eq(datesOf(db), datesOf(data), 'dates left as they were');
    eq([db.goals.length, db.states.length, db.activities.length, db.relations.length], [3, 2, 4, 1], 'structure intact');
    assert($('#toast').textContent === t('toast.importedFresh'), 'fresh toast');

    const before = plans.current;
    await importJson(fileOf(file));
    imp.querySelector('[data-plan-import-close]').click();
    await tick();
    assert(!imp.open && plans.list.length === n0 + 2 && plans.current === before, 'Cancel adds nothing');
    await importJson(fileOf(file));
    imp.dispatchEvent(new Event('cancel'));
    imp.close();
    await tick();
    eq(plans.list.length, n0 + 2, 'Escape adds nothing');
    $('#importKeepBtn').click();
    eq(plans.list.length, n0 + 2, 'a stale Keep click after closing adds nothing');

    // Files exported before the header count as full copies, so they are checked too.
    await importJson(fileOf({ name: 'Legacy', ...data }, 'legacy.json'));
    assert(imp.open, 'an old export with progress asks too');
    $('#importKeepBtn').click();
    await tick();
    assert(currentPlan().name === 'Legacy' && progressCounts(db).checkins === 2, 'legacy kept');

    // Bad files change nothing.
    const n1 = plans.list.length, cur = plans.current;
    await importJson(fileOf('not json', 'bad.json'));
    assert(!imp.open && plans.list.length === n1 && plans.current === cur && $('#toast').textContent === t('err.import'), 'invalid file');
    await importJson(fileOf({ format: 'actionplan-plan', version: 9, name: 'n', goals: [] }));
    assert(plans.list.length === n1 && $('#toast').textContent === t('err.importVersion'), 'newer version explained');

    plans.list.slice(n0).map(p => p.id).forEach(deletePlan);
    openPlan(startId);
    eq(plans.list.length, n0, 'cleaned up');
    return text.replace(/\s+/g, ' ').trim().slice(0, 140);
  });

  await step('import: round trip, plan buttons and the file picker', async () => {
    const src = addPlan(progressPlan());
    const original = clone(db);
    const [full] = await capture(() => exportJson());
    await importJson(fileOf(full.json, full.name));
    $('#importKeepBtn').click();
    await tick();
    assert(plans.current !== src.id && currentPlan().name === `${src.name} 2`, 'imported beside the original');
    for (const k of ['goals', 'states', 'activities', 'relations']) eq(db[k], original[k], `${k} identical after a full round trip`);

    openPlan(src.id);
    const [tpl] = await capture(() => { $('[data-plan="export"]').click(); exp.querySelector('input[name="exportKind"][value="template"]').click(); $('#exportDownloadBtn').click(); });
    await importJson(fileOf(tpl.json, tpl.name));
    assert(!imp.open && currentPlan().name === `${src.name} 3`, 'a template round trip needs no question');
    eq(db.goals.map(g => g.title), original.goals.map(g => g.title), 'template keeps the goals');

    // The plan's Import button opens the file picker; it accepts .json files (Android greys out some otherwise).
    const input = $('#importInput');
    let picked = 0;
    const origClick = input.click;
    input.click = () => picked++;
    $('[data-plan="import"]').click();
    input.click = origClick;
    eq(picked, 1, 'Import opens the file picker');
    assert(input.accept.split(',').map(s => s.trim()).includes('.json') && input.accept.includes('application/json'), `accept="${input.accept}"`);

    // Choosing a file in the picker imports it.
    const dt = new DataTransfer();
    dt.items.add(fileOf({ format: 'actionplan-plan', version: 1, kind: 'template', name: 'Picked', goals: [] }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    assert(currentPlan().name === 'Picked' && input.value === '', 'picked file imported, picker reset');

    const plansNow = plans.list.filter(p => [src.name, `${src.name} 2`, `${src.name} 3`, 'Picked'].includes(p.name)).map(p => p.id);
    plansNow.forEach(deletePlan);
    return 'round trips identical';
  });

  await step('sharing plans in Slovenian', async () => {
    changeLanguage('sl');
    const plan = addPlan(progressPlan());
    $('[data-plan="export"]').click();
    assert(exp.querySelector('h2').textContent === I18N.sl.strings['export.title'], 'export dialog in Slovenian');
    assert($('[data-plan="export"]').title === I18N.sl.strings['plan.export'], 'button title in Slovenian');
    const [tpl] = await capture(() => { exp.querySelector('input[name="exportKind"][value="template"]').click(); $('#exportDownloadBtn').click(); });
    assert(tpl.name.includes(`-${I18N.sl.strings['export.templateFile']}-`), `Slovenian template file name ${tpl.name}`);
    await importJson(fileOf({ format: 'actionplan-plan', version: 1, kind: 'full', name: 'Tek', ...progressPlan().data }));
    const text = imp.textContent;
    assert(text.includes(tp('import.checkins', 2)) && tp('import.checkins', 2) !== I18N.en.strings['import.checkins'].other.replace('{n}', 2), 'progress listed in Slovenian');
    assert(text.includes(tp('import.measurements', 4)), 'Slovenian plural for four');
    imp.close();
    deletePlan(plan.id);
    changeLanguage('en');
    return text.replace(/\s+/g, ' ').trim().slice(0, 120);
  });
  /* ---------- Merging one plan into another ---------- */

  const mrg = $('#planMerge');
  const titles = data => SYNC_COLLS.filter(c => c !== 'relations').flatMap(c => data[c].map(x => `${c}:${x.title}`)).sort();
  const allIds = data => SYNC_COLLS.flatMap(c => data[c].map(x => x.id));
  // A target plan with items of its own, a relation and progress.
  const targetPlan = () => {
    const g = { id: uid(), title: 'Save money', status: 'active', unit: '€', baseline: '0', target: '500', current: '100', category: 'Finance', updatedAt: '2026-02-02T00:00:00.000Z' };
    const a = { id: uid(), title: 'Budget', status: 'done', updatedAt: '2026-02-02T00:00:00.000Z' };
    return { name: 'Money', data: { goals: [g], states: [], activities: [a], relations: [{ id: uid(), from: a.id, to: g.id, type: 'contributes', updatedAt: '2026-02-02T00:00:00.000Z' }] } };
  };
  const cleanup = (...names) => plans.list.filter(p => names.includes(p.name)).map(p => p.id).forEach(deletePlan);
  const sum = (a, b) => Object.fromEntries(Object.keys(a).map(k => [k, a[k] + b[k]]));

  await step('merge: everything moves over and the target keeps its own', () => {
    const T = addPlan(targetPlan()), tBefore = clone(db);
    const S = addPlan(progressPlan()), sBefore = clone(db);
    const started = new Date().toISOString();
    mergePlanInto(S.id, T.id);
    assert(plans.current === T.id, 'the target plan is open afterwards');
    eq(titles(db), [...titles(tBefore), ...titles(sBefore)].sort(), 'all items of both plans');
    eq(db.relations.length, 2, 'relations of both plans');
    tBefore.goals.concat(tBefore.activities, tBefore.relations).forEach(x =>
      eq(SYNC_COLLS.flatMap(c => db[c]).find(y => y.id === x.id), x, 'target item untouched'));
    eq(progressCounts(db), sum(progressCounts(tBefore), progressCounts(sBefore)), 'progress of both kept');
    const run = db.activities.find(a => a.title === 'Run');
    eq([run.checkins, run.repeat], [sBefore.activities[3].checkins, sBefore.activities[3].repeat], 'check-ins and recurrence kept');
    eq(db.states.find(s => s.title === 'Longest run').history, sBefore.states[0].history, 'measurement history kept');
    eq(db.goals.find(g => g.title === 'Run 10 km').category, 'Health', 'category kept');
    eq(allIds(sBefore).every(id => allIds(db).includes(id)), true, 'ids without a clash kept');
    const moved = SYNC_COLLS.flatMap(c => db[c]).filter(x => allIds(sBefore).includes(x.id));
    assert(moved.length === 10 && moved.every(x => x.updatedAt >= started), 'moved items stamped, so sync carries them');
    eq(readPlan(T.id), JSON.parse(JSON.stringify(db)), 'target saved');
    eq(readPlan(S.id), sBefore, 'source left as it was');
    assert(plans.list.some(p => p.id === S.id), 'source kept');
    assert(repairRelations(clone(db)).length === db.relations.length, 'every relation still valid');
    const n = db.goals.length;
    cleanup(T.name, S.name);
    return `${n} goals`;
  });

  await step('merge: clashing ids get new ones and their links follow', () => {
    const src = progressPlan();
    const T = addPlan(src), S = addPlan(src); // two plans from the same file share ids
    // The target once deleted an item whose id the source still uses: it must not come back as that id.
    const T0 = readPlan(T.id);
    const ghost = uid();
    T0.deleted[ghost] = '2026-03-03T00:00:00.000Z';
    localStorage.setItem(planKey(T.id), JSON.stringify(T0));
    db.states.push({ id: ghost, title: 'Ghost', history: [] });
    // A relation pointing at nothing is left behind.
    db.relations.push({ id: uid(), from: db.activities[0].id, to: 'missing', type: 'contributes' });
    save();
    const sBefore = clone(db), tIds = new Set(allIds(T0));
    mergePlanInto(S.id, T.id);
    const ids = allIds(db);
    eq(new Set(ids).size, ids.length, 'all ids unique');
    eq(db.goals.length, 6, 'both copies of every goal');
    eq(db.relations.length, 2, 'the copied relation added, the dangling one dropped');
    const copy = db.relations.find(r => !tIds.has(r.id));
    assert(copy, 'copied relation has a new id');
    const from = db.activities.find(a => a.id === copy.from), to = db.goals.find(g => g.id === copy.to);
    eq([from?.title, to?.title, copy.type], ['Training plan', 'Run 10 km', 'contributes'], 'copied relation connects the same items');
    assert(!tIds.has(copy.from) && !tIds.has(copy.to), '…the copies, not the target’s own');
    const g2 = db.states.find(s => s.title === 'Ghost');
    assert(g2 && g2.id !== ghost, 'an id the target deleted is replaced');
    assert(db.deleted[ghost], 'the target’s deletion record stays');
    assert(repairRelations(clone(db)).length === db.relations.length, 'relations valid');
    eq(readPlan(S.id), sBefore, 'source untouched');
    cleanup(T.name, S.name);
    return `${ids.length} ids`;
  });

  await step('merge: the open plan can be the source, the target or another plan', () => {
    for (const open of ['source', 'target', 'other']) {
      const O = addPlan({ name: 'Other', data: emptyDb() });
      const T = addPlan(targetPlan()), tBefore = clone(db);
      const S = addPlan(progressPlan()), sBefore = clone(db);
      openPlan({ source: S, target: T, other: O }[open].id);
      mergePlanInto(S.id, T.id);
      assert(plans.current === T.id, `${open}: target open`);
      eq(titles(readPlan(T.id)), [...titles(tBefore), ...titles(sBefore)].sort(), `${open}: merged`);
      eq(readPlan(S.id), sBefore, `${open}: source untouched`);
      eq(readPlan(O.id).goals.length, 0, `${open}: the other plan untouched`);
      cleanup('Other', T.name, S.name);
    }
    return 'source, target, other';
  });

  await step('merge: deleting the source afterwards', () => {
    const T = addPlan(targetPlan());
    const S = addPlan(progressPlan()), sBefore = clone(db);
    const n0 = plans.list.length;
    mergePlanInto(S.id, T.id, true);
    assert(plans.current === T.id && plans.list.length === n0 - 1, 'source gone, target open');
    assert(!plans.list.some(p => p.id === S.id) && localStorage.getItem(planKey(S.id)) === null, 'source removed from storage');
    assert(plans.deleted?.[S.id], 'deletion recorded for sync');
    assert(titles(sBefore).every(x => titles(db).includes(x)), 'its contents live on in the target');
    eq(JSON.parse(localStorage.getItem(PLANS_KEY)).list.map(p => p.id).includes(S.id), false, 'plan list saved');
    // An empty source merges nothing and can still be deleted.
    const E = addPlan({ name: 'Empty', data: emptyDb() });
    const before = clone(readPlan(T.id));
    mergePlanInto(E.id, T.id, true);
    eq(titles(db), titles(before), 'empty source adds nothing');
    assert(!plans.list.some(p => p.id === E.id), 'empty source deleted');
    cleanup(T.name);
    return 'ok';
  });

  await step('merge dialog: pick a target, optionally delete, cancel changes nothing', () => {
    const T = addPlan(targetPlan()), U = addPlan({ name: 'Unrelated', data: emptyDb() });
    const S = addPlan(progressPlan()), sBefore = clone(db);
    const btn = () => $('[data-plan="merge"]');
    assert(btn() && !btn().disabled && btn().title === t('plan.merge'), 'merge beside the plan actions');

    // With a single plan there is nothing to merge into.
    const saved = plans.list;
    plans.list = [currentPlan()];
    renderPlanSwitch();
    assert(btn().disabled && btn().title === t('plan.mergeOnly'), 'disabled with one plan, says why');
    plans.list = saved;
    renderPlanSwitch();

    btn().click();
    assert(mrg.open, 'dialog opens');
    assert(mrg.textContent.includes(S.name), 'names the source');
    const sel = $('#mergeTarget');
    eq([...sel.options].map(o => o.value).includes(S.id), false, 'the source is not offered');
    eq([...sel.options].length, plans.list.length - 1, 'every other plan offered');
    for (const s of [tp('planDel.goals', 3), tp('planDel.states', 2), tp('planDel.measurements', 2), tp('planDel.activities', 4), tp('planDel.relations', 1)])
      assert(mrg.textContent.includes(s), `lists “${s}”`);
    assert(!$('#mergeRemove').checked, 'keeps the source by default');

    // Cancel, the close button and Escape change nothing.
    const snapshot = () => JSON.stringify([plans.list.map(p => p.id), plans.current, readPlan(T.id), readPlan(S.id)]);
    const was = snapshot();
    mrg.querySelector('.modal-foot [data-plan-merge-close]').click();
    assert(!mrg.open && snapshot() === was, 'Cancel changes nothing');
    btn().click();
    mrg.querySelector('.modal-head [data-plan-merge-close]').click();
    assert(!mrg.open && snapshot() === was, 'the close button changes nothing');
    btn().click();
    mrg.close();
    $('#mergeBtn').click();
    assert(snapshot() === was, 'a stale Merge click after closing changes nothing');

    btn().click();
    $('#mergeTarget').value = T.id;
    $('#mergeTarget').dispatchEvent(new Event('change', { bubbles: true }));
    $('#mergeBtn').click();
    assert(!mrg.open && plans.current === T.id, 'merged and switched to the target');
    assert(titles(sBefore).every(x => titles(db).includes(x)), 'contents moved');
    eq(readPlan(U.id).goals.length, 0, 'the plan not chosen is untouched');
    eq($('#toast').textContent, t('toast.merged', { from: S.name, to: T.name }), 'toast');
    assert(plans.list.some(p => p.id === S.id), 'source kept');

    openPlan(S.id);
    btn().click();
    $('#mergeTarget').value = U.id;
    $('#mergeRemove').click();
    $('#mergeBtn').click();
    assert(plans.current === U.id && !plans.list.some(p => p.id === S.id), 'merged into the chosen plan and deleted the source');
    eq($('#toast').textContent, t('toast.mergedDeleted', { from: S.name, to: U.name }), 'toast says it was deleted');
    btn().click();
    assert(!$('#mergeRemove').checked, 'delete is off again next time');
    mrg.close();
    cleanup(T.name, 'Unrelated');
    return 'ok';
  });

  await step('delete dialog: merge into another plan instead', () => {
    const T = addPlan(targetPlan());
    const S = addPlan(progressPlan()), sBefore = clone(db);
    $('[data-plan="delete"]').click();
    const instead = () => $('[data-plan-merge-instead]');
    assert(instead() && instead().textContent === t('planDel.merge'), 'offered in the delete dialog');
    instead().click();
    assert(!planDel.open && mrg.open, 'switches to the merge dialog');
    assert($('#mergeRemove').checked, 'with delete afterwards ticked');
    $('#mergeTarget').value = T.id;
    $('#mergeBtn').click();
    assert(plans.current === T.id && !plans.list.some(p => p.id === S.id), 'merged and deleted without typing the name');
    assert(titles(sBefore).every(x => titles(db).includes(x)), 'nothing lost');

    // Not offered for an empty plan, nor when there is no other plan.
    addPlan({ name: 'Empty', data: emptyDb() });
    $('[data-plan="delete"]').click();
    assert(!instead(), 'not offered for an empty plan');
    planDel.close();
    const saved = plans.list;
    openPlan(T.id);
    plans.list = [currentPlan()];
    $('[data-plan="delete"]').click();
    assert(!instead(), 'not offered when there is no other plan');
    planDel.close();
    plans.list = saved;
    renderPlanSwitch();
    cleanup('Empty', T.name);
    return 'ok';
  });

  await step('merging plans in Slovenian', () => {
    changeLanguage('sl');
    const T = addPlan(targetPlan());
    const S = addPlan(progressPlan());
    assert($('[data-plan="merge"]').title === I18N.sl.strings['plan.merge'], 'button title');
    $('[data-plan="merge"]').click();
    assert(mrg.querySelector('h2').textContent === I18N.sl.strings['merge.title'], 'dialog title');
    assert(mrg.textContent.includes(tp('planDel.goals', 3)), 'contents in Slovenian');
    const text = mrg.textContent.replace(/\s+/g, ' ').trim();
    $('#mergeTarget').value = T.id;
    $('#mergeBtn').click();
    eq($('#toast').textContent, t('toast.merged', { from: S.name, to: T.name }), 'toast in Slovenian');
    assert(t('toast.merged', { from: 'a', to: 'b' }) !== fill(I18N.en.strings['toast.merged'], { from: 'a', to: 'b' }), 'translated');
    cleanup(T.name, S.name);
    changeLanguage('en');
    return text.slice(0, 120);
  });
  /* ---------- Routine week strip: dates on hover, arrows to earlier weeks ---------- */

  const mondayAt = iso => addDays(iso, -weekday(iso));
  const longDate = iso => fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const rcard = r => $(`.card.routine[data-open="${r.id}"]`);
  const days = r => [...rcard(r).querySelectorAll('[data-checkin]')];
  const arrow = (r, dir) => rcard(r).querySelector(`[data-rt-week][data-dir="${dir}"]`);
  const shownDays = r => days(r).map(b => b.dataset.date);

  await step('routine week strip: every day shows its date on hover; days that cannot be ticked say so too', () => {
    fresh('Week strip');
    const now = today(), mon = mondayAt(now);
    const r = mk('activity', { title: 'Run', repeat: { every: 1, unit: 'week', times: 3 }, startDate: addDays(mon, -17) });
    setView('activities');
    eq(shownDays(r), daysBetween(mon, addDays(mon, 6)), 'this week shown at first');
    days(r).forEach(b => {
      const d = b.dataset.date;
      eq(b.title, t(checkedOn(r, d) ? 'rt.dayOn' : 'rt.dayOff', { date: longDate(d) }), `title of ${d}`);
      assert(b.title.includes(d.slice(0, 4)), 'with the year');
      assert(!b.disabled, 'not disabled, so the tooltip shows');
      eq(b.getAttribute('aria-disabled'), d > now ? 'true' : null, `${d} can${d > now ? 'not' : ''} be ticked`);
    });
    const future = days(r).find(b => b.dataset.date > now);
    if (future) {
      future.click();
      assert(!checkedOn(r, future.dataset.date) && !modal.open, 'clicking a future day does nothing');
    }
    days(r).find(b => b.dataset.date === now).click();
    const todayBtn = days(r).find(b => b.dataset.date === now);
    eq(todayBtn.title, t('rt.dayOn', { date: longDate(now) }), 'ticked day says done');
    assert(document.activeElement === todayBtn, 'focus stays on the day');
    return todayBtn.title;
  });

  await step('routine week strip: arrows browse back to the start week and forward to this week', () => {
    const now = today(), mon = mondayAt(now);
    const r = db.activities.find(a => a.title === 'Run');
    const first = addDays(mon, -21);
    const other = mk('activity', { title: 'Stretch', repeat: { every: 1, unit: 'week', days: [0, 1, 2, 3, 4, 5, 6] }, startDate: addDays(mon, -60) });
    render();
    assert(arrow(r, -1) && arrow(r, 1), 'arrows on both sides of the days');
    const strip = rcard(r).querySelector('.rt-week');
    assert(arrow(r, -1).nextElementSibling === strip && strip.nextElementSibling === arrow(r, 1), 'left arrow, days, right arrow');
    assert(!arrow(r, -1).disabled && arrow(r, 1).disabled, 'can go back, not forward past this week');
    eq([arrow(r, -1).title, arrow(r, 1).title], [t('rt.prevWeek'), t('rt.nextWeek')], 'arrow titles');
    eq(arrow(r, -1).getAttribute('aria-label'), t('rt.prevWeek'), 'arrow label');
    arrow(r, -1).click();
    eq(shownDays(r)[0], addDays(mon, -7), 'one week back');
    assert(document.activeElement === arrow(r, -1), 'focus stays on the arrow');
    eq(shownDays(other)[0], mon, 'other routines stay on this week');
    arrow(r, -1).click(); arrow(r, -1).click();
    eq(shownDays(r)[0], first, 'back to the week the routine started in');
    assert(arrow(r, -1).disabled && !arrow(r, 1).disabled, 'no further back');
    assert(document.activeElement === arrow(r, 1), 'focus moves to the arrow that still works');
    arrow(r, -1).click();
    shiftRoutineWeek(r.id, -1);
    eq(shownDays(r)[0], first, 'cannot go before the start, even directly');
    days(r).forEach(b => eq(b.getAttribute('aria-disabled'), b.dataset.date < r.startDate ? 'true' : null, `${b.dataset.date} before the start`));
    const before = days(r).find(b => b.dataset.date < r.startDate);
    before.click();
    assert(!checkedOn(r, before.dataset.date), 'a day before the start cannot be ticked');
    for (let i = 0; i < 5; i++) shiftRoutineWeek(r.id, 1);
    eq(shownDays(r)[0], mon, 'cannot go past this week');
    assert(arrow(r, 1).disabled, 'forward arrow off on this week');
    return `${first} … ${mon}`;
  });

  await step('routine week strip: ticking an earlier week saves it, stays there and shows that week', () => {
    const now = today(), mon = mondayAt(now);
    const r = db.activities.find(a => a.title === 'Run');
    const w2 = addDays(mon, -14), w1 = addDays(mon, -7);
    shiftRoutineWeek(r.id, -2);
    eq(shownDays(r)[0], w2, 'two weeks back');
    const label = () => rcard(r).querySelector('.rt-progress')?.textContent;
    const range = fmtRange(w2, addDays(w2, 6));
    assert(range.includes(String(Number(w2.slice(8)))) && range.includes(String(Number(addDays(w2, 6).slice(8)))), `range ${range} names both ends`);
    eq(label(), t('rt.past', { range, done: 0, target: 3 }), 'the bar shows that week');
    $('#toast').textContent = '';
    [0, 2, 4].forEach(i => days(r).find(b => b.dataset.date === addDays(w2, i)).click());
    assert([0, 2, 4].every(i => r.checkins[addDays(w2, i)] === 1), 'ticked');
    eq(readPlan(plans.current).activities.find(a => a.id === r.id).checkins, r.checkins, 'saved');
    eq(shownDays(r)[0], w2, 'still on that week');
    assert(document.activeElement?.dataset.date === addDays(w2, 4), 'focus on the last ticked day');
    eq(label(), t('rt.past', { range, done: 3, target: 3 }), 'that week met');
    assert($('#toast').textContent !== t('rt.metWeek'), 'no “this week done” for an earlier week');
    arrow(r, 1).click();
    [1, 3, 5].forEach(i => days(r).find(b => b.dataset.date === addDays(w1, i)).click());
    assert(rcard(r).textContent.includes(tp('rt.streak.week', 2)), 'streak counts the filled-in weeks');
    arrow(r, 1).click();
    eq(label(), periodText(r), 'this week shows as before');
    return label();
  });

  await step('routine week strip: an ended routine opens on its last week; a future one cannot move', () => {
    const now = today(), mon = mondayAt(now);
    const ended = mk('activity', { title: 'Old', repeat: { every: 1, unit: 'week', days: [0, 2, 4] }, startDate: addDays(mon, -35), dueDate: addDays(mon, -10) });
    const later = mk('activity', { title: 'Later', repeat: { every: 1, unit: 'week', days: [1] }, startDate: addDays(mon, 14) });
    render();
    const last = mondayAt(ended.dueDate);
    eq(shownDays(ended)[0], last, 'ended routine shows the week it ended in');
    assert(arrow(ended, 1).disabled && !arrow(ended, -1).disabled, 'only back');
    days(ended).forEach(b => eq(b.getAttribute('aria-disabled'), b.dataset.date > ended.dueDate ? 'true' : null, `${b.dataset.date} after the end`));
    const after = days(ended).find(b => b.dataset.date > ended.dueDate);
    after.click();
    assert(!checkedOn(ended, after.dataset.date), 'a day after the end cannot be ticked');
    for (let i = 0; i < 10; i++) shiftRoutineWeek(ended.id, -1);
    eq(shownDays(ended)[0], addDays(mon, -35), 'back to its start week');
    eq(shownDays(later)[0], mon, 'a routine that has not started shows this week');
    assert(arrow(later, -1).disabled && arrow(later, 1).disabled, 'both arrows off');
    assert(days(later).every(b => b.getAttribute('aria-disabled') === 'true'), 'no day can be ticked');
    assert(rcard(later).textContent.includes(t('rt.starts', { date: fmtDate(later.startDate) })), 'says when it starts');
    // A routine whose end date is in the future still stops at this week.
    const open = mk('activity', { title: 'Open', repeat: { every: 1, unit: 'week', times: 1 }, startDate: addDays(mon, -7), dueDate: addDays(mon, 60) });
    render();
    assert(arrow(open, 1).disabled && shownDays(open)[0] === mon, 'stops at this week, not the end date');
    return `${ended.startDate}–${ended.dueDate}`;
  });

  await step('routine week strip: every-2-weeks and monthly routines show their own period', () => {
    const now = today(), mon = mondayAt(now);
    const two = mk('activity', { title: 'Fortnight', repeat: { every: 2, unit: 'week', times: 2 }, startDate: addDays(mon, -28) });
    const month = mk('activity', { title: 'Monthly', repeat: { every: 1, unit: 'month', on: 'day' }, startDate: addDays(mon, -70) });
    render();
    const label = r => rcard(r).querySelector('.rt-progress')?.textContent;
    shiftRoutineWeek(two.id, -1);
    const p2 = periodProgress(two, addDays(mon, -1));
    eq(label(two), t(p2.target ? 'rt.past' : 'rt.pastNone', { range: fmtRange(p2.from, p2.to), done: p2.done, target: p2.target }), 'fortnight label');
    eq(dayNum(p2.to) - dayNum(p2.from), 13, 'its period is two weeks');
    for (let i = 0; i < 6; i++) shiftRoutineWeek(month.id, -1);
    const shown = shownDays(month)[0];
    const pm = periodProgress(month, addDays(shown, 6));
    eq(label(month), t(pm.target ? 'rt.past' : 'rt.pastNone', { range: fmtRange(pm.from, pm.to), done: pm.done, target: pm.target }), 'month label');
    eq([pm.from.slice(8), Number(pm.to.slice(8)) >= 28], ['01', true], 'its period is the calendar month');
    return `${label(two)} | ${label(month)}`;
  });

  await step('routine week strip: weeks reset when switching plans; overview unchanged; Slovenian', () => {
    const now = today(), mon = mondayAt(now);
    const r = db.activities.find(a => a.title === 'Run');
    const here = plans.current;
    shiftRoutineWeek(r.id, -2);
    eq(shownDays(r)[0], addDays(mon, -14), 'moved back');
    const other = addPlan({ name: 'Elsewhere', data: emptyDb() });
    openPlan(here);
    setView('activities');
    eq(shownDays(r)[0], mon, 'back on this week after switching plans');

    setView('dashboard');
    const row = $(`.routine-row[data-open="${r.id}"]`);
    assert(row && !row.querySelector('[data-rt-week]'), 'overview rows have no arrows');
    assert(row.querySelector('[data-checkin]').dataset.date === now, 'overview still ticks today');

    changeLanguage('sl');
    setView('activities');
    eq([arrow(r, -1).title, arrow(r, 1).title], [I18N.sl.strings['rt.prevWeek'], I18N.sl.strings['rt.nextWeek']], 'arrows in Slovenian');
    const d = days(r)[0].dataset.date;
    eq(days(r)[0].title, fill(I18N.sl.strings[checkedOn(r, d) ? 'rt.dayOn' : 'rt.dayOff'], { date: longDate(d) }), 'day title in Slovenian');
    assert(/[a-zčšž]/.test(longDate(d)) && longDate(d) !== new Date(d + 'T00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }), 'Slovenian date');
    shiftRoutineWeek(r.id, -1);
    assert(rcard(r).querySelector('.rt-progress').textContent.includes('/'), 'earlier week label in Slovenian');
    const sl = days(r)[0].title;
    changeLanguage('en');
    deletePlan(other.id);
    deletePlan(here);
    return sl;
  });
  /* ---------- Monthly routines: a chosen day, the last day, or the n-th weekday ---------- */

  const dueIn = (repeat, from, to, startDate = from) => daysBetween(from, to).filter(d => isDueDay({ repeat, startDate }, d));
  const change = (id, value) => { $(id).value = value; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
  const lastOfMonth = iso => isoOf(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0);

  await step('monthly routines: a day of the month, clamped to shorter months', () => {
    eq(dueIn({ every: 1, unit: 'month', on: 'day', day: 15 }, '2027-01-01', '2027-12-31').map(d => d.slice(5)),
      ['01-15', '02-15', '03-15', '04-15', '05-15', '06-15', '07-15', '08-15', '09-15', '10-15', '11-15', '12-15'], 'the 15th');
    eq(dueIn({ every: 1, unit: 'month', on: 'day', day: 31 }, '2027-01-01', '2027-12-31').map(d => d.slice(5)),
      ['01-31', '02-28', '03-31', '04-30', '05-31', '06-30', '07-31', '08-31', '09-30', '10-31', '11-30', '12-31'], 'day 31 falls on the last day of shorter months');
    eq(dueIn({ every: 1, unit: 'month', on: 'day', day: 30 }, '2028-02-01', '2028-03-31').map(d => d.slice(5)), ['02-29', '03-30'], 'leap February');
    eq(dueIn({ every: 1, unit: 'month', on: 'day', day: 29 }, '2027-02-01', '2027-03-31').map(d => d.slice(5)), ['02-28', '03-29'], 'non-leap February');
    eq(dueIn({ every: 3, unit: 'month', on: 'day', day: 10 }, '2027-01-20', '2027-12-31').map(d => d.slice(5)), ['04-10', '07-10', '10-10'], 'every 3 months, counted from the start month');
    // Stored without a day (older routines): the start's day of the month.
    eq(dueIn({ every: 1, unit: 'month', on: 'day' }, '2027-01-12', '2027-03-31').map(d => d.slice(5)), ['01-12', '02-12', '03-12'], 'no day: the start’s');
    eq(dueIn({ every: 1, unit: 'month' }, '2027-01-12', '2027-02-28').map(d => d.slice(5)), ['01-12', '02-12'], 'no on at all: the start’s day');
    return 'ok';
  });

  await step('monthly routines: the last day of the month', () => {
    const got = dueIn({ every: 1, unit: 'month', on: 'lastDay' }, '2027-01-01', '2028-12-31');
    eq(got.length, 24, 'one a month');
    assert(got.every(d => d === lastOfMonth(d)), 'always the last day');
    assert(got.includes('2027-02-28') && got.includes('2028-02-29') && got.includes('2027-04-30'), 'short and leap months');
    eq(dueIn({ every: 2, unit: 'month', on: 'lastDay' }, '2027-01-15', '2027-07-31').map(d => d.slice(5)), ['01-31', '03-31', '05-31', '07-31'], 'every 2 months');
    return got.slice(0, 3).join(', ');
  });

  await step('monthly routines: the n-th or last weekday, for every weekday', () => {
    const from = '2027-01-01', to = '2027-12-31';
    for (let wd = 0; wd < 7; wd++) {
      const all = daysBetween(from, to).filter(d => weekday(d) === wd);
      const byMonth = Object.values(Object.groupBy ? Object.groupBy(all, d => d.slice(0, 7)) : all.reduce((m, d) => ((m[d.slice(0, 7)] ||= []).push(d), m), {}));
      for (const nth of [1, 2, 3, 4]) eq(dueIn({ every: 1, unit: 'month', on: 'nth', nth, weekday: wd }, from, to), byMonth.map(m => m[nth - 1]), `${nth}. ${weekdayName(wd)}`);
      eq(dueIn({ every: 1, unit: 'month', on: 'nth', nth: -1, weekday: wd }, from, to), byMonth.map(m => m[m.length - 1]), `last ${weekdayName(wd)}`);
    }
    // The second Friday every month, and a fifth one only in months that have five.
    eq(dueIn({ every: 1, unit: 'month', on: 'nth', nth: 2, weekday: 4 }, '2027-01-01', '2027-04-30'), ['2027-01-08', '2027-02-12', '2027-03-12', '2027-04-09'], 'second Friday');
    eq(dueIn({ every: 1, unit: 'month', on: 'nth', nth: 5, weekday: 4 }, '2027-01-01', '2027-06-30'), ['2027-01-29', '2027-04-30'], 'fifth Friday only when there is one');
    eq(dueIn({ every: 2, unit: 'month', on: 'nth', nth: 1, weekday: 0 }, '2027-01-01', '2027-06-30'), ['2027-01-04', '2027-03-01', '2027-05-03'], 'first Monday every 2 months');
    return 'all weekdays';
  });

  await step('monthly routines: older weekday routines keep their days', () => {
    // 'weekday' and 'last' were worked out from the start date; they now read as the same n-th weekday.
    for (const start of ['2027-01-28', '2027-03-15', '2027-05-31', '2027-07-01', '2027-09-29']) {
      const nth = Math.ceil(monthDay(start) / 7), wd = weekday(start);
      eq(dueIn({ every: 1, unit: 'month', on: 'weekday' }, start, '2028-06-30'), dueIn({ every: 1, unit: 'month', on: 'nth', nth, weekday: wd }, start, '2028-06-30'), `${start} weekday`);
      if (lastInMonth(start)) eq(dueIn({ every: 1, unit: 'month', on: 'last' }, start, '2028-06-30'), dueIn({ every: 1, unit: 'month', on: 'nth', nth: -1, weekday: wd }, start, '2028-06-30'), `${start} last`);
      eq(sched({ repeat: { every: 1, unit: 'month', on: 'weekday' }, startDate: start }), { every: 1, unit: 'month', on: 'nth', nth, weekday: wd }, `${start} read as n-th`);
    }
    const old = { repeat: { every: 1, unit: 'month', on: 'last' }, startDate: '2027-01-27' };
    eq(dueIn(old.repeat, '2027-01-01', '2027-04-30', old.startDate), ['2027-01-27', '2027-02-24', '2027-03-31', '2027-04-28'], 'last Wednesday as before');
    eq(scheduleText(old), 'every month on the last Wednesday', 'same summary');
    assert(JSON.stringify(old.repeat) === '{"every":1,"unit":"month","on":"last"}', 'reading does not rewrite what is stored');
    return 'ok';
  });

  await step('monthly routines: summaries in English and Slovenian', () => {
    const at = repeat => ({ repeat, startDate: '2027-01-07' });
    eq([
      at({ every: 1, unit: 'month', on: 'day', day: 15 }), at({ every: 1, unit: 'month', on: 'lastDay' }), at({ every: 2, unit: 'month', on: 'nth', nth: 2, weekday: 4 }),
      at({ every: 1, unit: 'month', on: 'nth', nth: -1, weekday: 1 }), at({ every: 3, unit: 'month', on: 'day', day: 31 }),
    ].map(scheduleText), ['every month on day 15', 'every month on the last day', 'every 2 months on the second Friday', 'every month on the last Tuesday', 'every 3 months on day 31']);
    changeLanguage('sl');
    eq([
      at({ every: 1, unit: 'month', on: 'day', day: 15 }), at({ every: 1, unit: 'month', on: 'lastDay' }), at({ every: 2, unit: 'month', on: 'nth', nth: 2, weekday: 4 }),
      at({ every: 1, unit: 'month', on: 'nth', nth: 2, weekday: 2 }), at({ every: 1, unit: 'month', on: 'nth', nth: -1, weekday: 5 }), at({ every: 1, unit: 'month', on: 'nth', nth: 3, weekday: 6 }),
      at({ every: 1, unit: 'month', on: 'nth', nth: 1, weekday: 0 }),
    ].map(scheduleText), ['vsak mesec: 15. dan', 'vsak mesec: zadnji dan v mesecu', 'vsaka 2 meseca: drugi petek v mesecu', 'vsak mesec: druga sreda v mesecu',
      'vsak mesec: zadnja sobota v mesecu', 'vsak mesec: tretja nedelja v mesecu', 'vsak mesec: prvi ponedeljek v mesecu'], 'Slovenian, with feminine ordinals');
    changeLanguage('en');
    return 'ok';
  });

  await step('monthly routines: the form shows the right fields and saves each option', () => {
    fresh('Monthly');
    const shown = sel => !$(sel).closest('[hidden]');
    const start = d => { $('#f-startDate').value = dateInput(d); $('#f-startDate').dispatchEvent(new Event('input', { bubbles: true })); $('#f-startDate').dispatchEvent(new Event('change', { bubbles: true })); };
    const make = (title, setup) => {
      openForm('activity');
      $('#f-title').value = title;
      start('2027-03-10'); // the second Wednesday of March 2027
      change('#f-repeat', 'custom');
      change('#f-unit', 'month');
      setup();
      submitForm();
      return db.activities.find(a => a.title === title);
    };
    let checks = {};
    const a1 = make('Rent', () => {
      change('#f-on', 'day');
      checks.day = [shown('#repMonthDay'), shown('#repNth'), shown('#repTimes'), shown('#repDays'), $('#f-monthDay').value];
      $('#f-monthDay').value = '31';
    });
    eq(checks.day, [true, false, false, false, '10'], 'day field only, the start’s day by default');
    eq(a1.repeat, { every: 1, unit: 'month', on: 'day', day: 31 }, 'day saved');
    const a2 = make('Bills', () => {
      change('#f-on', 'lastDay');
      checks.last = [shown('#repMonthDay'), shown('#repNth'), shown('#repTimes')];
    });
    eq(checks.last, [false, false, false], 'no extra fields for the last day');
    eq(a2.repeat, { every: 1, unit: 'month', on: 'lastDay' }, 'last day saved');
    const a3 = make('Club', () => {
      change('#f-on', 'nth');
      checks.nth = [shown('#repMonthDay'), shown('#repNth'), $('#f-nth').value, $('#f-weekday').value, [...$('#f-nth').options].map(o => o.value)];
      change('#f-nth', '2');
      change('#f-weekday', '4');
    });
    eq(checks.nth, [false, true, '2', '2', ['1', '2', '3', '4', '-1']], 'n-th fields, the start’s weekday by default');
    eq(a3.repeat, { every: 1, unit: 'month', on: 'nth', nth: 2, weekday: 4 }, 'second Friday saved');
    eq(scheduleText(a3), 'every month on the second Friday', 'summary');

    // Wrong days are refused.
    for (const bad of ['0', '32', '1.5', 'x', '']) {
      openForm('activity', a1.id);
      $('#f-monthDay').value = bad;
      submitForm();
      const err = modal.querySelector('[data-field="monthDay"] .err').textContent;
      assert(modal.open && err === t(bad === 'x' ? 'err.number' : 'err.times', { max: 31 }), `day “${bad}” refused: ${err}`);
      modal.close();
    }
    eq(a1.repeat.day, 31, 'unchanged after refusals');

    // Reopening shows what was saved.
    openForm('activity', a3.id);
    eq([$('#f-repeat').value, $('#f-unit').value, $('#f-on').value, $('#f-nth').value, $('#f-weekday').value], ['custom', 'month', 'nth', '2', '4'], 'n-th reopened');
    modal.close();
    openForm('activity', a1.id);
    eq([$('#f-on').value, $('#f-monthDay').value], ['day', '31'], 'day reopened');
    modal.close();
    openForm('activity', a2.id);
    eq($('#f-on').value, 'lastDay', 'last day reopened');
    modal.close();

    // An older routine opens with its days chosen, and saves in the new form.
    const old = mk('activity', { title: 'Old monthly', status: 'todo', startDate: '2027-01-27', repeat: { every: 1, unit: 'month', on: 'last' } });
    openForm('activity', old.id);
    eq([$('#f-on').value, $('#f-nth').value, $('#f-weekday').value], ['nth', '-1', '2'], 'old “last Wednesday” shown as such');
    submitForm();
    eq(old.repeat, { every: 1, unit: 'month', on: 'nth', nth: -1, weekday: 2 }, 'saved the new way, same days');
    const oldDay = mk('activity', { title: 'Old day', status: 'todo', startDate: '2027-01-12', repeat: { every: 1, unit: 'month', on: 'day' } });
    openForm('activity', oldDay.id);
    eq($('#f-monthDay').value, '12', 'old day routine shows its start’s day');
    modal.close();

    // A fifth weekday from an old routine stays selectable.
    const fifth = mk('activity', { title: 'Fifth', status: 'todo', startDate: '2027-01-29', repeat: { every: 1, unit: 'month', on: 'weekday' } });
    openForm('activity', fifth.id);
    eq([$('#f-nth').value, [...$('#f-nth').options].map(o => o.value).includes('5')], ['5', true], 'a fifth Friday kept');
    modal.close();

    // Changing the start date moves the defaults until they are chosen by hand.
    openForm('activity');
    $('#f-title').value = 'Moves';
    change('#f-repeat', 'custom');
    change('#f-unit', 'month');
    change('#f-on', 'nth');
    start('2027-06-25'); // the fourth Friday
    eq([$('#f-nth').value, $('#f-weekday').value, $('#f-monthDay').value], ['4', '4', '25'], 'defaults follow the start date');
    change('#f-nth', '1');
    start('2027-06-02');
    eq($('#f-nth').value, '1', 'a choice made by hand stays');
    modal.close();
    return `${a1.repeat.day} | ${a2.repeat.on} | ${scheduleText(a3)}`;
  });

  await step('monthly routines: check-ins, streaks and the week strip', () => {
    const now = today(), lastDay = lastOfMonth(now);
    const r = mk('activity', { title: 'Month end', status: 'todo', startDate: addDays(now, -120), repeat: { every: 1, unit: 'month', on: 'lastDay' } });
    const done = daysBetween(r.startDate, addDays(now, -1)).filter(d => isDueDay(r, d));
    assert(done.length >= 3 && done.every(d => d === lastOfMonth(d)), 'past due days are month ends');
    done.forEach(d => (r.checkins = { ...r.checkins, [d]: 1 }));
    save();
    eq(routineStreak(r).n, done.length, 'streak counts every month end');
    eq(periodProgress(r, now).target, 1, 'one due this month');
    eq(nextDueDay(r), lastDay, 'next due is this month’s last day');
    setView('activities');
    const card = $(`.card.routine[data-open="${r.id}"]`);
    assert(card.textContent.includes('every month on the last day'), 'card summary');
    const strip = [...card.querySelectorAll('[data-checkin]')].map(b => b.dataset.date);
    if (strip.includes(lastDay)) assert(card.querySelector(`[data-date="${lastDay}"]`).classList.contains('due'), 'the last day is outlined');
    // Browse back to a past month end and see it ticked.
    shiftRoutineWeek(r.id, -Math.ceil((dayNum(now) - dayNum(done[done.length - 1])) / 7));
    const b = $(`.card.routine[data-open="${r.id}"] [data-date="${done[done.length - 1]}"]`);
    assert(b && b.classList.contains('due') && b.getAttribute('aria-pressed') === 'true', 'past month end shown ticked');
    deletePlan(plans.current);
    return `${done.length} months`;
  });
  /* ---------- A routine's start date is always visible in the form ---------- */

  await step('routine start date: filled in visibly, never silently today', () => {
    fresh('Start dates');
    const change = (id, value) => { $(id).value = value; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
    const now = today();
    // Choosing how it repeats fills an empty start date with today, where it can be seen and changed.
    for (const preset of ['week', 'month', 'days', 'custom']) {
      openForm('activity');
      eq($('#f-startDate').value, '', `${preset}: a new activity starts empty`);
      change('#f-repeat', preset);
      eq($('#f-startDate').value, dateInput(now), `${preset}: today filled in`);
      modal.close();
    }
    // A date already there is kept, also when switching between kinds.
    openForm('activity');
    $('#f-startDate').value = dateInput('2026-09-01');
    change('#f-repeat', 'week');
    change('#f-repeat', 'custom');
    eq($('#f-startDate').value, dateInput('2026-09-01'), 'a typed date is kept');
    // Back to a one-off: the date stays, it is the user's to clear.
    change('#f-repeat', 'none');
    eq($('#f-startDate').value, dateInput('2026-09-01'), 'kept for a one-off too');
    modal.close();
    // A one-off without dates stays without dates.
    openForm('activity');
    $('#f-title').value = 'Plain';
    submitForm();
    eq(db.activities.find(a => a.title === 'Plain').startDate, '', 'one-off saved without a start');
    // Filled in and changed before saving: the change is what is saved.
    openForm('activity');
    $('#f-title').value = 'Earlier';
    change('#f-repeat', 'days');
    $('#f-startDate').value = dateInput(addDays(now, -20));
    submitForm();
    eq(db.activities.find(a => a.title === 'Earlier').startDate, addDays(now, -20), 'the changed date is saved');
    return dateInput(now);
  });

  await step('routine start date: an older routine without one keeps the day it was created', () => {
    const now = today(), created = addDays(today(), -40);
    const old = mk('activity', { title: 'Legacy', status: 'todo', createdAt: created, repeat: { every: 1, unit: 'week', times: 2 }, checkins: { [addDays(now, -30)]: 1 } });
    delete old.startDate;
    save();
    eq(routineStart(old), created, 'runs from the day it was created');
    openForm('activity', old.id);
    eq($('#f-startDate').value, dateInput(created), 'the form shows that day');
    submitForm();
    eq(old.startDate, created, 'saving keeps it, not today');
    // Even if the field is cleared, an existing routine keeps where it started.
    openForm('activity', old.id);
    $('#f-startDate').value = '';
    submitForm();
    eq(old.startDate, created, 'a cleared field keeps the old start');
    assert(checkedOn(old, addDays(now, -30)), 'its old check-ins still count');
    setView('activities');
    shiftRoutineWeek(old.id, -10);
    eq($(`.card.routine[data-open="${old.id}"] [data-checkin]`).dataset.date, addDays(created, -weekday(created)), 'the strip still reaches back to the start');
    deletePlan(plans.current);
    return created;
  });
  /* ---------- States: the description says what is measured, not where you are now ---------- */

  await step('states: the description is what is measured, in both languages', () => {
    const labels = {
      en: ['What is measured', /how you measure it/i],
      sl: ['Kaj merite', /kako jo merite/i],
    };
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      fresh(`States ${code}`);
      const s = mk('state', { title: 'Longest run', unit: 'km', description: 'My own words stay as they were.' });
      openForm('state', s.id);
      eq(modal.querySelector('[data-field="description"] label').textContent, labels[code][0], `${code} label`);
      assert(labels[code][1].test($('#f-description').placeholder), `${code} placeholder: ${$('#f-description').placeholder}`);
      eq($('#f-description').value, 'My own words stay as they were.', `${code}: existing text kept`);
      submitForm();
      eq(s.description, 'My own words stay as they were.', `${code}: saved unchanged`);
      // The help no longer asks to describe where you stand today.
      assert(!/where you stand today|kje ste danes/i.test(t('help.view.states') + t('tour.states.text')), `${code}: help and tour updated`);
      assert(/measure|meri/i.test(t('help.view.states')) && /measure|meri/i.test(t('tour.states.text')), `${code}: they talk about measuring`);
      deletePlan(plans.current);
    }
    changeLanguage('en');
    return labels.en[0];
  });

  await step('states: sample descriptions stay true as new values come in', () => {
    const out = [];
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      loadSample();
      eq(db.states.length, 6, `${code}: six states`);
      for (const s of db.states) {
        assert(s.description && s.description.length > 20, `${code} ${s.title}: has a description`);
        // A lasting description does not repeat a reading: no measured value or change appears in it.
        const values = (s.history || []).map(h => h.value).concat(s.value).filter(Boolean);
        assert(!values.some(v => new RegExp(`(^|\\D)${v}(\\D|$)`).test(s.description)), `${code} ${s.title}: no reading in “${s.description}”`);
        assert(!/\b(so far|still|down \d|last month|doslej|še vedno|prejšnji mesec|shujšal)\b/i.test(s.description), `${code} ${s.title}: no snapshot wording in “${s.description}”`);
      }
      out.push(db.states[0].description);
      deletePlan(plans.current);
    }
    changeLanguage('en');
    return out.join(' | ');
  });
  /* ---------- The sample plan's dates are calculated when it is loaded, and then left alone ---------- */

  await step('sample plan: dates are calculated on the day it is loaded and never move after', () => {
    const RealDate = Date;
    // Pretends today is `days` from now while `run` runs.
    const on = (days, run) => {
      const shift = days * 86400000;
      window.Date = class extends RealDate {
        constructor(...a) { super(...(a.length ? a : [RealDate.now() + shift])); }
        static now() { return RealDate.now() + shift; }
      };
      try { return run(); } finally { window.Date = RealDate; }
    };
    const offsets = data => [...data.goals, ...data.activities].flatMap(x => ['startDate', 'deadline', 'dueDate'].map(k => x[k]))
      .concat(data.states.flatMap(s => [s.date, ...(s.history || []).map(h => h.date)]))
      .map(d => (d ? dayNum(d) - dayNum(today()) : null));
    const results = [];
    let first = null;
    for (const days of [0, 37, 400, -200]) {
      on(days, () => {
        const now = today();
        loadSample();
        const id = plans.current, data = clone(db);
        const offs = offsets(data);
        // The same plan, the same distances from whichever day it was loaded on.
        if (!first) first = offs;
        else eq(offs, first, `loaded ${days} days from now: same distances from that day`);
        // Routine check-ins follow weekdays, so which days they fall on depends on the day it is loaded:
        // all in the five weeks before it, and a fixed-day routine only on its own days.
        const ticks = data.activities.flatMap(a => Object.keys(a.checkins || {}));
        assert(ticks.length > 10 && ticks.every(d => d < now && d >= addDays(now, -35)), `${days}: check-ins in the weeks before the day it was loaded`);
        data.activities.filter(a => a.repeat?.days).forEach(a =>
          assert(Object.keys(a.checkins).every(d => a.repeat.days.includes(weekday(d))), `${days}: ${a.title} ticked on its own days`));
        // Late, waiting and done items are as the sample means them on that day.
        assert(data.activities.some(a => a.status !== 'done' && a.dueDate && a.dueDate < now), `${days}: something is late`);
        assert(data.goals.some(g => g.deadline > now), `${days}: goals still ahead`);
        results.push(`${days}: ${now}`);
        deletePlan(id);
      });
    }
    // Once loaded, a sample plan is an ordinary plan: opening it later moves nothing.
    loadSample();
    const id = plans.current, before = clone(db);
    on(30, () => {
      openPlan(plans.list.find(p => p.id !== id).id);
      openPlan(id);
      // Activities whose start date came meanwhile are in progress now; nothing else changes.
      const acts = list => list.map(({ status, autoStarted, updatedAt, ...rest }) => rest);
      eq(JSON.stringify({ goals: db.goals, states: db.states, activities: acts(db.activities) }),
        JSON.stringify({ goals: before.goals, states: before.states, activities: acts(before.activities) }), 'a month later its dates are where they were');
      assert(db.activities.some(a => a.status === 'doing' && before.activities.find(b => b.id === a.id).status === 'todo'), 'an activity that started meanwhile is in progress');
    });
    deletePlan(id);
    return results.join(' | ');
  });
  /* ---------- Map: select a line, Delete removes it; Delete on an item asks; double-click edits ---------- */

  const mapFixture = () => {
    fresh('Map keys');
    const g = mk('goal', { title: 'Run a marathon' });
    const a = mk('activity', { title: 'Train' });
    const b = mk('activity', { title: 'Buy shoes' });
    const s = mk('state', { title: 'Distance' });
    rel(a, g, 'contributes'); rel(b, g, 'contributes'); rel(s, g, 'measures');
    save();
    setView('map');
    return { g, a, b, s };
  };
  const clickEl = (el, detail = 1) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  const edge = id => $(`[data-rel-edit="${id}"]`);
  const nodeEl = id => $(`[data-map-node="${id}"]`);
  const press = (key, target = document.activeElement || document.body) => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  const relOf = (from, to) => db.relations.find(r => r.from === from.id && r.to === to.id);

  await step('map: clicking a line selects it; clicking it again or double-clicking opens it', () => {
    const { g, a, b, s } = mapFixture();
    const r = relOf(a, g);
    clickEl(edge(r.id));
    assert(!modal.open, 'a click does not open the form');
    eq([ui.mapRel, ui.mapSelected], [r.id, null], 'the line is selected');
    assert(edge(r.id).classList.contains('sel'), 'drawn as selected');
    assert([...document.querySelectorAll('[data-rel-edit]')].filter(e => e.dataset.relEdit !== r.id).every(e => e.classList.contains('dim')), 'other lines dimmed');
    assert(!nodeEl(a.id).classList.contains('dim') && !nodeEl(g.id).classList.contains('dim'), 'its two items stay lit');
    assert(nodeEl(b.id).classList.contains('dim') && nodeEl(s.id).classList.contains('dim'), 'the rest dims');
    const row = $('.map-rel-selection');
    assert(row && row.textContent.includes('Train') && row.textContent.includes('Run a marathon'), 'a row names the relationship');
    assert(row.querySelector('[data-rel-open]') && row.querySelector('[data-rel-remove]') && row.querySelector('[data-map-clear]'), 'with Edit, Remove and Clear (for touch screens)');
    // Selecting an item clears the line, and the other way round.
    clickEl(nodeEl(s.id));
    eq([ui.mapRel, ui.mapSelected], [null, s.id], 'an item click selects the item instead');
    clickEl(edge(r.id));
    eq([ui.mapRel, ui.mapSelected], [r.id, null], 'a line click selects the line instead');
    // A second click on the selected line opens it, so a double-click does too.
    clickEl(edge(r.id), 2);
    assert(modal.open && formCtx.kind === 'relation' && formCtx.id === r.id, 'second click opens the relationship');
    modal.close();
    clickEl(edge(relOf(b, g).id));
    clickEl(edge(relOf(b, g).id));
    assert(modal.open && formCtx.id === relOf(b, g).id, 'clicking a selected line opens it');
    modal.close();
    // Enter or Space on a focused line opens it as before.
    edge(r.id).focus();
    press('Enter', edge(r.id));
    assert(modal.open && formCtx.id === r.id, 'Enter opens');
    modal.close();
    edge(r.id).focus();
    press(' ', edge(r.id));
    assert(modal.open && formCtx.id === r.id, 'Space opens');
    modal.close();
    // The row's buttons.
    clickEl(edge(r.id));
    $('.map-rel-selection [data-rel-open]').click();
    assert(modal.open && formCtx.id === r.id, 'Edit opens it');
    modal.close();
    eq($('.map-rel-selection [data-map-clear]').textContent, 'Deselect', 'the button says Deselect');
    $('.map-rel-selection [data-map-clear]').click();
    eq(ui.mapRel, null, 'Deselect deselects it');
    ui.mapSelected = a.id; render();
    eq($('[data-map-clear]').textContent, 'Deselect', 'an item’s row says Deselect too');
    changeLanguage('sl');
    eq($('[data-map-clear]').textContent, 'Prekliči izbiro', 'in Slovenian');
    changeLanguage('en');
    $('[data-map-clear]').click();
    eq(ui.mapSelected, null, 'and deselects the item');
    clickEl(edge(r.id));
    press('Escape', document.body);
    eq(ui.mapRel, null, 'Escape clears it');
    clickEl(nodeEl(a.id));
    eq(ui.mapSelected, a.id, 'item selected');
    press('Escape', nodeEl(a.id));
    eq(ui.mapSelected, null, 'Escape deselects an item too');
    assert(!nodeEl(g.id).classList.contains('dim') && !nodeEl(s.id).classList.contains('dim'), 'nothing dimmed after Escape');
    clickEl(nodeEl(a.id));
    openForm('goal', g.id);
    press('Escape', document.body);
    eq(ui.mapSelected, a.id, 'Escape in an open form leaves the map selection alone');
    modal.close();
    press('Escape', document.body);
    clickEl(edge(r.id));
    clickEl($('.map-wrap svg') || $('.map-wrap'));
    eq(ui.mapRel, null, 'clicking empty space clears it');
    return 'ok';
  });

  await step('map: Delete or Backspace removes the selected line at once', () => {
    const { g, a, b, s } = mapFixture();
    const n0 = db.relations.length, r = relOf(a, g), keep = clone(db.relations.filter(x => x.id !== r.id));
    clickEl(edge(r.id));
    let asked = 0;
    const realConfirm = window.confirm;
    window.confirm = () => { asked++; return true; };
    try {
      assert(press('Delete', document.body), 'Delete is handled');
      eq(asked, 0, 'no question for a line');
      eq(db.relations.length, n0 - 1, 'one relationship fewer');
      assert(!relOf(a, g), 'the selected one is gone');
      eq(db.relations, keep, 'the others untouched');
      assert(findEntity(a.id) && findEntity(g.id), 'its items stay');
      eq(readPlan(plans.current).relations.length, n0 - 1, 'saved');
      eq($('#toast').textContent, t('toast.relRemoved'), 'says so');
      eq(ui.mapRel, null, 'selection cleared');
      assert(!edge(r.id), 'no longer drawn');
      // Backspace (the delete key on a Mac) works the same; so does a focused, unselected line.
      clickEl(edge(relOf(b, g).id));
      press('Backspace', document.body);
      assert(!relOf(b, g), 'Backspace removes it');
      const last = relOf(s, g);
      edge(last.id).focus();
      press('Delete', edge(last.id));
      assert(!relOf(s, g), 'Delete on a focused line removes it');
      eq(db.relations.length, 0, 'all gone');
    } finally { window.confirm = realConfirm; }
    return `${n0} → 0`;
  });

  await step('map: Delete on a selected item asks first, then deletes it with its links', () => {
    const { g, a, b, s } = mapFixture();
    const realConfirm = window.confirm;
    let question = '';
    try {
      clickEl(nodeEl(a.id));
      eq(ui.mapSelected, a.id, 'item selected');
      window.confirm = q => { question = q; return false; };
      assert(press('Delete', document.body), 'Delete is handled');
      eq(question, t('confirm.delete', { name: 'Train' }), 'the delete question names it');
      assert(findEntity(a.id) && relOf(a, g), 'cancel keeps it and its links');
      eq(ui.mapSelected, a.id, 'still selected after cancel');
      window.confirm = q => { question = q; return true; };
      press('Backspace', document.body);
      assert(!findEntity(a.id) && !relOf(a, g), 'confirm deletes it and its links');
      assert(findEntity(g.id) && relOf(b, g), 'everything else stays');
      eq(readPlan(plans.current).activities.map(x => x.id), [b.id], 'saved');
      eq($('#toast').textContent, t('toast.deleted.activity'), 'says so');
      eq(ui.mapSelected, null, 'selection cleared');
      // A focused item works without clicking it first; each kind gets its own message.
      question = '';
      nodeEl(s.id).focus();
      press('Delete', nodeEl(s.id));
      assert(question.includes('Distance') && !findEntity(s.id), 'focused state deleted');
      eq($('#toast').textContent, t('toast.deleted.state'), 'state message');
      clickEl(nodeEl(g.id));
      press('Delete', document.body);
      assert(!findEntity(g.id), 'goal deleted');
      eq($('#toast').textContent, t('toast.deleted.goal'), 'goal message');
    } finally { window.confirm = realConfirm; }
    return question;
  });

  await step('map: Delete does nothing without a selection, while typing, with a dialog open or elsewhere', () => {
    const { g, a } = mapFixture();
    const realConfirm = window.confirm;
    let asked = 0;
    window.confirm = () => { asked++; return true; };
    const count = () => db.goals.length + db.activities.length + db.states.length + db.relations.length;
    const n0 = count();
    try {
      press('Delete', document.body);
      eq([count(), asked], [n0, 0], 'nothing selected: nothing happens');
      // Typing in a field: the key edits the text.
      clickEl(nodeEl(a.id));
      const search = document.createElement('input');
      search.type = 'search';
      viewEl.append(search);
      {
        search.focus();
        assert(!press('Delete', search) && !press('Backspace', search), 'keys left to the field');
        eq([count(), asked], [n0, 0], 'nothing deleted while typing');
        search.remove();
      }
      // A dialog or menu open.
      openForm('goal', g.id);
      press('Delete', modal);
      eq([count(), asked, modal.open], [n0, 0, true], 'nothing deleted with the form open');
      modal.close();
      clickEl(nodeEl(a.id));
      settings.showModal();
      press('Delete', document.body);
      eq([count(), asked], [n0, 0], 'nothing deleted with settings open');
      settings.close();
      openCtxMenu(a.id, 10, 10);
      press('Delete', document.body);
      eq([count(), asked], [n0, 0], 'nothing deleted with the menu open');
      closeCtxMenu();
      // Other views ignore it, even with a map selection kept.
      ui.mapSelected = a.id;
      setView('activities');
      press('Delete', document.body);
      eq([count(), asked], [n0, 0], 'other views ignore it');
      setView('map');
    } finally { window.confirm = realConfirm; }
    return 'ok';
  });

  await step('map: double-clicking an item opens its edit form; keyboard presses never count as a double-click', () => {
    const { g, a, s } = mapFixture();
    clickEl(nodeEl(a.id), 1);
    clickEl(nodeEl(a.id), 2);
    assert(modal.open && formCtx.kind === 'activity' && formCtx.id === a.id, 'double-click opens the activity');
    eq(ui.mapSelected, a.id, 'and leaves it selected');
    modal.close();
    for (const [x, kind] of [[g, 'goal'], [s, 'state']]) {
      clickEl(nodeEl(x.id), 1); clickEl(nodeEl(x.id), 2);
      assert(modal.open && formCtx.kind === kind && formCtx.id === x.id, `double-click opens the ${kind}`);
      modal.close();
    }
    // Two clicks on different items, or slow clicks, just select.
    ui.mapSelected = null; render();
    clickEl(nodeEl(a.id)); clickEl(nodeEl(g.id));
    assert(!modal.open && ui.mapSelected === g.id, 'two items: just selects the second');
    ui.mapSelected = null; render();
    const realNow = performance.now.bind(performance);
    let shift = 0;
    performance.now = () => realNow() + shift;
    try {
      clickEl(nodeEl(a.id));
      shift = 2000;
      clickEl(nodeEl(a.id));
      assert(!modal.open && ui.mapSelected === null, 'a slow second click deselects as before');
    } finally { performance.now = realNow; }
    // Enter or Space on an item selects it; on the selected item they open it. Neither counts toward a double-click.
    for (const [first, second] of [['Enter', 'Enter'], [' ', ' '], ['Enter', ' ']]) {
      ui.mapSelected = null; render();
      nodeEl(a.id).focus();
      press(first, nodeEl(a.id));
      assert(!modal.open && ui.mapSelected === a.id, `“${first}” selects`);
      nodeEl(a.id).focus();
      press(second, nodeEl(a.id));
      assert(modal.open && formCtx.id === a.id && ui.mapSelected === a.id, `then “${second}” opens it`);
      modal.close();
    }
    // With an item selected by a click and the focus elsewhere in the map, Enter or Space opens it too.
    for (const key of ['Enter', ' ']) {
      ui.mapSelected = g.id; ui.mapRel = null; render();
      document.activeElement?.blur();
      assert(press(key, document.body), `“${key}” handled`);
      assert(modal.open && formCtx.kind === 'goal' && formCtx.id === g.id, `“${key}” opens the selected item`);
      modal.close();
    }
    // The same for a selected line.
    const line = db.relations[0];
    clickEl(edge(line.id));
    document.activeElement?.blur();
    press('Enter', document.body);
    assert(modal.open && formCtx.kind === 'relation' && formCtx.id === line.id, 'Enter opens the selected line');
    modal.close();
    // Nothing selected, typing, or another view: Enter and Space are left alone.
    ui.mapSelected = null; ui.mapRel = null; render();
    assert(!press('Enter', document.body) && !modal.open, 'nothing selected: Enter does nothing');
    ui.mapSelected = a.id; render();
    const field = document.createElement('input');
    viewEl.append(field);
    field.focus();
    assert(!press(' ', field) && !modal.open, 'Space in a text field types a space');
    field.remove();
    setView('activities');
    assert(!press('Enter', document.body) && !modal.open, 'other views ignore it');
    setView('map');
    // While linking by tapping, a double tap does not open anything.
    ui.mapLinkFrom = a.id; render();
    clickEl(nodeEl(s.id), 1);
    assert(!(modal.open && formCtx.kind === 'state'), 'a tap while linking finishes the link instead of opening the item');
    if (modal.open) modal.close();
    ui.mapLinkFrom = null; render();
    deletePlan(plans.current);
    return 'ok';
  });

  await step('map: help and labels mention the new keys, in both languages', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      const words = { en: [/Delete/, /double-click/i, /Enter/], sl: [/Delete/, /dvojnim klik/i, /Enter/] }[code];
      for (const key of ['help.view.map', 'tour.map.text']) words.forEach(w => assert(w.test(t(key)), `${code} ${key} mentions ${w}`));
      assert(t('map.relLabel', { rel: 'x' }).includes('x'), `${code} line label`);
    }
    changeLanguage('en');
    return t('map.relLabel', { rel: 'A contributes to B' });
  });
  /* ---------- Timeline: the same selecting, editing and deleting as the map ---------- */

  const tlFixture = () => {
    fresh('Timeline keys');
    const now = today();
    const g = mk('goal', { title: 'Renovate', startDate: addDays(now, -10), deadline: addDays(now, 60) });
    const a = mk('activity', { title: 'Plan', startDate: addDays(now, -5), dueDate: addDays(now, 5) });
    const b = mk('activity', { title: 'Build', startDate: addDays(now, 6), dueDate: addDays(now, 30) });
    const c = mk('activity', { title: 'Paint', startDate: addDays(now, 31), dueDate: addDays(now, 40) });
    rel(a, g, 'contributes'); rel(b, a, 'depends'); rel(c, b, 'depends');
    save();
    ui.tlDeps = true;
    setView('timeline');
    return { g, a, b, c };
  };
  const bar = id => $(`[data-tl-node="${id}"]`);
  const dep = id => $(`.tl-deps [data-rel-edit="${id}"]`);

  await step('timeline: double-click or Enter on the selected bar edits it; Esc deselects', () => {
    const { g, a } = tlFixture();
    clickEl(bar(a.id), 1); clickEl(bar(a.id), 2);
    assert(modal.open && formCtx.kind === 'activity' && formCtx.id === a.id, 'double-click opens the activity');
    eq(ui.mapSelected, a.id, 'left selected');
    modal.close();
    clickEl(bar(g.id), 1); clickEl(bar(g.id), 2);
    assert(modal.open && formCtx.kind === 'goal' && formCtx.id === g.id, 'double-click opens the goal');
    modal.close();
    // Enter or Space: the first selects, the next opens.
    ui.mapSelected = null; render();
    bar(a.id).focus(); press('Enter', bar(a.id));
    assert(!modal.open && ui.mapSelected === a.id, 'Enter selects');
    bar(a.id).focus(); press(' ', bar(a.id));
    assert(modal.open && formCtx.id === a.id, 'Space on the selected bar opens it');
    modal.close();
    document.activeElement?.blur();
    press('Enter', document.body);
    assert(modal.open && formCtx.id === a.id, 'Enter with the focus elsewhere opens the selected bar');
    modal.close();
    press('Escape', document.body);
    eq(ui.mapSelected, null, 'Esc deselects');
    assert(!$('.tl-row.dim'), 'nothing dimmed');
    return 'ok';
  });

  await step('timeline: Delete on a bar asks first; dependency arrows select, open and delete like map lines', () => {
    const { g, a, b, c } = tlFixture();
    const realConfirm = window.confirm;
    let question = '';
    try {
      // Bars.
      clickEl(bar(c.id));
      window.confirm = q => { question = q; return false; };
      press('Delete', document.body);
      assert(question === t('confirm.delete', { name: 'Paint' }) && findEntity(c.id), 'asks; cancel keeps it');
      window.confirm = () => true;
      press('Backspace', document.body);
      assert(!findEntity(c.id) && !db.relations.some(r => r.from === c.id || r.to === c.id), 'confirm deletes it and its links');
      eq($('#toast').textContent, t('toast.deleted.activity'), 'says so');
      // Dependency arrows: clickable, with a wide hit area, and reachable with Tab.
      const r = db.relations.find(x => x.type === 'depends' && x.from === b.id);
      assert(dep(r.id), 'the arrow is a target');
      eq(getComputedStyle(dep(r.id).querySelector('.tl-dep-hit')).pointerEvents, 'stroke', 'its hit area takes clicks');
      eq(dep(r.id).getAttribute('tabindex'), '0', 'focusable');
      clickEl(dep(r.id));
      eq([ui.mapRel, ui.mapSelected], [r.id, null], 'a click selects it');
      assert(dep(r.id).classList.contains('sel'), 'drawn as selected');
      assert(!bar(a.id).classList.contains('dim') && !bar(b.id).classList.contains('dim') && bar(g.id).classList.contains('dim'), 'its two bars lit, the rest dimmed');
      assert($('.map-rel-selection') && $('.map-rel-selection').textContent.includes('Build'), 'the selection row names it');
      clickEl(dep(r.id), 2);
      assert(modal.open && formCtx.kind === 'relation' && formCtx.id === r.id, 'a second click opens it');
      modal.close();
      press('Escape', document.body);
      eq(ui.mapRel, null, 'Esc deselects it');
      clickEl(dep(r.id));
      press('Delete', document.body);
      assert(!db.relations.some(x => x.id === r.id) && findEntity(a.id) && findEntity(b.id), 'Delete removes the dependency, not the bars');
      eq($('#toast').textContent, t('toast.relRemoved'), 'says so');
      eq(readPlan(plans.current).relations.some(x => x.id === r.id), false, 'saved');
      // With dependencies hidden there is nothing to select or delete there.
      rel(b, a, 'depends'); save();
      const r2 = db.relations.find(x => x.type === 'depends');
      ui.mapRel = r2.id; ui.tlDeps = false; render();
      press('Delete', document.body);
      assert(db.relations.some(x => x.id === r2.id), 'a hidden arrow is not deleted');
      ui.tlDeps = true; ui.mapRel = null;
      // Typing or another view: left alone.
      clickEl(bar(a.id));
      const field = document.createElement('input');
      viewEl.append(field); field.focus();
      press('Delete', field);
      assert(findEntity(a.id), 'nothing deleted while typing');
      field.remove();
      setView('goals');
      press('Delete', document.body);
      assert(findEntity(a.id), 'other views ignore it');
    } finally { window.confirm = realConfirm; }
    deletePlan(plans.current);
    return question;
  });

  await step('timeline: help mentions the keys, in both languages', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const key of ['help.view.timeline']) [/Delete/, /Enter/, /Esc/].forEach(w => assert(w.test(t(key)), `${code} ${key} mentions ${w}`));
    }
    changeLanguage('en');
    return t('tl.hint');
  });
  /* ---------- Timeline: an activity under each of its goals; collapsible goals ---------- */

  const foldFixture = () => {
    fresh('Fold');
    const g1 = mk('goal', { title: 'G1', startDate: d(-10), deadline: d(60) });
    const g1a = mk('goal', { title: 'G1a', startDate: d(-8), deadline: d(40) });
    const g2 = mk('goal', { title: 'G2', startDate: d(-5), deadline: d(50) });
    const g3 = mk('goal', { title: 'G3', startDate: d(-1), deadline: d(20) }); // nothing under it
    const a = mk('activity', { title: 'A', startDate: d(-4), dueDate: d(10) });
    const a1 = mk('activity', { title: 'A1', startDate: d(-3), dueDate: d(5) });
    const b = mk('activity', { title: 'B', startDate: d(-2), dueDate: d(12) });
    const c = mk('activity', { title: 'C', startDate: d(11), dueDate: d(20) });
    const u = mk('activity', { title: 'U', startDate: d(1), dueDate: d(3) });
    rel(g1a, g1, 'subgoal');
    rel(a, g1, 'contributes'); rel(a, g2, 'contributes'); rel(a1, a, 'subactivity');
    rel(b, g1, 'contributes'); rel(b, g1a, 'contributes');
    rel(c, g2, 'contributes'); rel(c, a, 'depends');
    save();
    ui.tlDeps = true; ui.hideDone = false; ui.timelineGoal = '';
    setView('timeline');
    return { g1, g1a, g2, g3, a, a1, b, c, u };
  };
  const rowsText = rows => rows.map(r => r.kind === 'group' ? `[${r.label}]` : r.item.title).join(' ');
  const shownRows = () => [...document.querySelectorAll('.tl-body .tl-row')].map(r => r.classList.contains('tl-group') ? '[group]' : r.querySelector('.tl-title').textContent).join(' ');
  const fold = id => $(`[data-tl-fold="${id}"]`);
  const $$ = sel => [...document.querySelectorAll(sel)];

  await step('plan menu badges: green, yellow when something is due today, red when overdue; optional', () => {
    fresh('Badges');
    const badge = () => { render(); return [...new Set([...document.querySelectorAll(`[data-plan-select] option[value="${plans.current}"]`)].map(o => o.textContent.split(' ')[0]))]; };
    eq(badge(), ['🟢'], 'an empty plan is fine');
    const a = mk('activity', { dueDate: d(0) });
    eq(badge(), ['🟡'], 'activity due today');
    a.status = 'done'; eq(badge(), ['🟢'], 'done today');
    a.status = 'todo'; a.dueDate = d(-1); eq(badge(), ['🔴'], 'overdue activity');
    a.status = 'done';
    const g = mk('goal', { deadline: d(0) });
    eq(badge(), ['🟡'], 'goal deadline today');
    g.deadline = d(-2); eq(badge(), ['🔴'], 'overdue goal');
    g.status = 'paused'; eq(badge(), ['🟢'], 'paused goals do not count');
    g.status = 'achieved'; eq(badge(), ['🟢'], 'nor achieved ones');
    const r = mk('activity', { startDate: d(-3), repeat: { every: 1, unit: 'day' }, checkins: { [d(-3)]: 1, [d(-2)]: 1, [d(-1)]: 1 } });
    eq(badge(), ['🟡'], 'daily routine not ticked today');
    r.checkins[d(0)] = 1; eq(badge(), ['🟢'], 'ticked today');
    delete r.checkins[d(-1)]; eq(badge(), ['🔴'], 'a missed day');
    r.checkins[d(-1)] = 1;
    // Another plan's badge comes from its saved data.
    save(); const busy = plans.current;
    createPlan('Badges 2');
    const other = () => $(`#planName option[value="${busy}"]`).textContent;
    eq(other(), '🟢 Badges', 'other plan, read from storage');
    assert($(`#planName option[value="${busy}"]`).title === t('plan.health.ok'), 'with a tooltip');
    // On by default; the setting hides them and is remembered.
    eq(SETTINGS.planBadges.get(), true, 'on by default');
    const box = settings.querySelector('[data-setting="planBadges"]');
    renderSettings(); assert(box.checked, 'switch shows on');
    box.click();
    assert(!ui.planBadges && prefs.get('planBadges') === false, 'switched off and remembered');
    eq(other(), 'Badges', 'plain names without badges');
    box.click();
    eq(other(), '🟢 Badges', 'back on');
    const name = other();
    deletePlan(plans.current); deletePlan(busy);
    return name;
  });

  await step('timeline: prerequisites with no goal of their own sit under the activity that waits for them', () => {
    fresh('Prereqs');
    const g1 = mk('goal', { title: 'G1' }), g2 = mk('goal', { title: 'G2' });
    const a = mk('activity', { title: 'A' }), b = mk('activity', { title: 'B' });
    const p = mk('activity', { title: 'P' }), pp = mk('activity', { title: 'PP' });
    const top = mk('activity', { title: 'Top' }), part = mk('activity', { title: 'Part' });
    const owned = mk('activity', { title: 'Owned' }), waiter = mk('activity', { title: 'Waiter' });
    rel(a, g1, 'contributes'); rel(b, g2, 'contributes'); rel(owned, g2, 'contributes');
    rel(a, p, 'depends'); rel(p, pp, 'depends');      // a chain of prerequisites
    rel(part, top, 'subactivity'); rel(a, part, 'depends'); // a prerequisite inside a tree brings the whole tree
    rel(b, p, 'depends');                              // needed by work under two goals
    rel(a, owned, 'depends');                          // has its own goal: stays there only
    rel(waiter, a, 'depends');                         // waits for goal work, but is no prerequisite
    const rows = timelineRows(null);
    eq(rowsText(rows), `G1 A P PP Top Part G2 B P PP Owned [${t('tl.unlinked')}] Waiter`, 'rows');
    const row = (title, goal) => rows.find(r => r.item?.title === title && r.goal === goal.id);
    const ra = rows.indexOf(row('A', g1));
    eq([row('P', g1).rel, row('P', g1).parent, row('P', g1).depth], ['depends', ra, row('A', g1).depth + 1], 'P hangs off A');
    eq(row('PP', g1).parent, rows.indexOf(row('P', g1)), 'PP hangs off P');
    eq([row('Part', g1).rel, row('Part', g1).parent], ['subactivity', rows.indexOf(row('Top', g1))], 'the tree keeps its shape');
    eq(row('P', g1).also, ['G2'], 'listed under both goals, marked as such');
    // Each copy gets its own arrows, paired with the copy under the same goal (arrows need dates).
    [a, b, p, pp].forEach((x, k) => Object.assign(x, { startDate: d(k), dueDate: d(k + 2) }));
    ui.tlDeps = true; render(); setView('timeline');
    const yOf = (title, goal) => rows.indexOf(row(title, goal)) * TL.ROW + TL.ROW / 2;
    const arrows = [...document.querySelectorAll(`.tl-deps [data-rel-edit]`)].map(g => [g.dataset.relEdit, ...g.querySelector('.tl-dep').getAttribute('d').match(/^M[\d.-]+,([\d.-]+).*?([\d.-]+)\s+H[\d.-]+$/).slice(1).map(Number)]);
    const has = (from, to, goal) => arrows.some(([, y1, y2]) => y1 === yOf(to, goal) && y2 === yOf(from, goal));
    assert(['G1', 'G2'].every((n, k) => { const g = [g1, g2][k]; return has(n === 'G1' ? 'A' : 'B', 'P', g) && has('P', 'PP', g); }), 'P and PP joined under each goal');
    ui.tlDeps = false;
    render(); setView('timeline');
    assert($(`[data-tl-node="${p.id}"] .tl-elbow.dash`), 'drawn with a dashed dependency line');
    assert([...document.querySelectorAll('.tl-legend span')].some(x => x.textContent === relLabel('depends')), 'the legend names it');
    // A folded goal hides its prerequisites too, without sending them to the unlinked group.
    eq(rowsText(timelineRows(null, new Set([g1.id, g2.id]))), `G1 G2 [${t('tl.unlinked')}] Waiter`, 'folded');
    return rowsText(rows);
  });

  await step('timeline: an activity that serves several goals is listed under each', () => {
    const { g1, g2, a, b, c } = foldFixture();
    eq(rowsText(timelineRows(null)), `G1 A A1 B G1a B G2 A A1 C G3 [${t('tl.unlinked')}] U`, 'under each goal, with its sub-activities');
    eq(document.querySelectorAll(`[data-tl-node="${a.id}"]`).length, 2, 'two rows for A');
    const also = id => [...document.querySelectorAll(`[data-tl-node="${id}"] .tl-also`)].map(x => x.title);
    eq(also(a.id), [t('tl.alsoUnder', { goals: 'G2' }), t('tl.alsoUnder', { goals: 'G1' })], 'each copy names the other goal');
    eq(also(b.id), [t('tl.alsoUnder', { goals: 'G1a' }), t('tl.alsoUnder', { goals: 'G1' })], 'a goal and its sub-goal');
    eq(also(c.id), [], 'an activity under one goal has no mark');
    assert($(`[data-tl-node="${a.id}"]`).getAttribute('aria-label').includes(t('tl.alsoUnder', { goals: 'G2' })), 'screen readers hear it too');
    // One item: selecting a copy lights every copy.
    clickEl($$(`[data-tl-node="${a.id}"]`)[1]);
    assert([...document.querySelectorAll(`[data-tl-node="${a.id}"]`)].every(r => r.classList.contains('selected')), 'all copies selected');
    ui.mapSelected = null; render();
    // The dependency arrow is drawn for every copy: from each copy of A to the one row of C.
    const rowsNow = [...document.querySelectorAll('.tl-body .tl-row')];
    const rowY = id => rowsNow.map((r, i) => r.dataset.tlNode === id ? i * TL.ROW + TL.ROW / 2 : null).filter(y => y !== null);
    const ends = [...document.querySelectorAll('.tl-deps [data-rel-edit] .tl-dep')].map(p => p.getAttribute('d')).map(d => [Number(d.match(/^M[\d.-]+,([\d.-]+)/)[1]), Number(d.match(/([\d.-]+)\s+H[\d.-]+$/)[1])]);
    eq(ends.map(e => e[0]).sort((x, y) => x - y), rowY(a.id), 'an arrow starts at each copy of A');
    assert(ends.every(e => e[1] === rowY(c.id)[0]), 'all end at C');
    // Editing a copy edits the one activity.
    openForm('activity', a.id); $('#f-title').value = 'A renamed'; submitForm();
    eq([...document.querySelectorAll(`[data-tl-node="${a.id}"] .tl-title`)].map(x => x.textContent), ['A renamed', 'A renamed'], 'both copies follow');
    eq(db.activities.filter(x => x.title === 'A renamed').length, 1, 'still one activity');
    // A goal filter shows only the goals in scope, so no mark there.
    ui.timelineGoal = g2.id; render();
    eq(document.querySelectorAll(`[data-tl-node="${a.id}"]`).length, 1, 'filtered to G2: one row');
    eq(also(a.id), [], 'and no mark');
    ui.timelineGoal = ''; render();
    // Hide done hides every copy.
    b.status = 'done'; ui.hideDone = true; render();
    eq(document.querySelectorAll(`[data-tl-node="${b.id}"]`).length, 0, 'done copies hidden');
    ui.hideDone = false; b.status = 'todo'; render();
    return rowsText(timelineRows(null));
  });

  await step('timeline: goals collapse and expand, remembered per plan', () => {
    const { g1, g1a, g2, g3, a, b } = foldFixture();
    assert(fold(g1.id) && fold(g2.id) && fold(g1a.id), 'goals with something under them can fold');
    assert(!fold(g3.id), 'a goal with nothing under it has no fold button');
    eq([fold(g1.id).getAttribute('aria-expanded'), fold(g1.id).getAttribute('aria-label')], ['true', t('tl.collapse', { name: 'G1' })], 'expanded at first');
    fold(g1.id).click();
    eq(shownRows(), 'G1 G2 A A1 C G3 [group] U', 'G1 folded: its activities and sub-goal hidden');
    eq([fold(g1.id).getAttribute('aria-expanded'), fold(g1.id).getAttribute('aria-label')], ['false', t('tl.expand', { name: 'G1' })], 'says it is folded');
    assert($(`[data-tl-node="${g1.id}"] .tl-bar`), 'the goal keeps its bar');
    eq(ui.mapSelected, null, 'folding does not select the goal');
    assert(!modal.open, 'nor open it');
    const folded = timelineRows(null, tlCollapsed());
    eq(folded.slice(folded.findIndex(r => r.kind === 'group') + 1).map(r => r.item.title), ['U'], 'B is still under a goal, so it does not move to the unlinked group');
    eq($$(`[data-tl-node="${a.id}"] .tl-also`).map(x => x.title), [t('tl.alsoUnder', { goals: 'G1' })], 'the copy under G2 still names folded G1');
    // Remembered: on redraw, per plan, and after switching plans.
    render();
    eq(fold(g1.id).getAttribute('aria-expanded'), 'false', 'kept on redraw');
    const here = plans.current;
    const other = addPlan({ name: 'Other fold', data: clone(db) });
    setView('timeline');
    eq(fold(g1.id).getAttribute('aria-expanded'), 'true', 'another plan has its own folds');
    openPlan(here); setView('timeline');
    eq(fold(g1.id).getAttribute('aria-expanded'), 'false', 'back in this plan, still folded');
    deletePlan(other.id); openPlan(here); setView('timeline');
    fold(g1.id).click();
    eq(shownRows(), 'G1 A A1 B G1a B G2 A A1 C G3 [group] U', 'expanded again');
    // A sub-goal folds on its own.
    fold(g1a.id).click();
    eq(shownRows(), 'G1 A A1 B G1a G2 A A1 C G3 [group] U', 'sub-goal folded');
    fold(g1a.id).click();
    // The unlinked group folds too.
    const restFold = $('[data-tl-fold="rest"]');
    assert(restFold, 'the group can fold');
    restFold.click();
    eq(shownRows(), 'G1 A A1 B G1a B G2 A A1 C G3 [group]', 'group folded');
    $('[data-tl-fold="rest"]').click();
    // Collapse all / Expand all.
    $('[data-tl-fold-all="collapse"]').click();
    eq(shownRows(), 'G1 G2 G3 [group]', 'collapse all: one line per goal');
    $('[data-tl-fold-all="expand"]').click();
    eq(shownRows(), 'G1 A A1 B G1a B G2 A A1 C G3 [group] U', 'expand all');
    eq(prefs.get('tlCollapsed.' + plans.current, null), [], 'saved as nothing folded');
    // The fold button is a real button: Enter on it is left to the button, not taken as selecting the row.
    fold(g2.id).focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    fold(g2.id).dispatchEvent(ev);
    assert(!ev.defaultPrevented && !modal.open && ui.mapSelected === null, 'Enter left to the button');
    fold(g2.id).click();
    assert(document.activeElement === fold(g2.id), 'focus stays on the button after folding');
    eq(fold(g2.id).getAttribute('aria-expanded'), 'false', 'folded with the button');
    fold(g2.id).click();
    // Arrows to hidden rows are not drawn: with G2 folded, C is hidden, so neither copy of A has one.
    fold(g2.id).click();
    eq(document.querySelectorAll('.tl-deps [data-rel-edit]').length, 0, 'C hidden: its arrow is not drawn');
    fold(g2.id).click();
    eq(document.querySelectorAll('.tl-deps [data-rel-edit]').length, 2, 'shown again, once per copy of A');
    deletePlan(plans.current);
    return 'ok';
  });

  await step('timeline: fold and “also under” wording in both languages', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const k of ['tl.collapseAll', 'tl.expandAll']) assert(t(k) && t(k) !== k, `${code} ${k}`);
      assert(t('tl.collapse', { name: 'X' }).includes('X') && t('tl.expand', { name: 'X' }).includes('X') && t('tl.alsoUnder', { goals: 'X' }).includes('X'), `${code} names`);
      assert(/↻/.test(t('tl.hint')) || /fold|collapse|strn/i.test(t('tl.hint')), `${code} hint mentions folding`);
      assert(/collapse|strn/i.test(t('help.view.timeline')), `${code} help mentions folding`);
    }
    changeLanguage('en');
    return t('tl.alsoUnder', { goals: 'G1, G2' });
  });
  /* ---------- Touch: the first tap after a long-press counts ---------- */

  await step('touch: after a long-press, the first tap on a menu item works (no click ends the press)', async () => {
    fresh('Long press');
    const g = mk('goal', { title: 'Goal' }), g2 = mk('goal', { title: 'Other goal' });
    save();
    setView('map');
    const node = id => $(`[data-map-node="${id}"]`);
    const touch = (type, el, x = 50, y = 50) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, clientX: x, clientY: y }));
    const tapMenu = act => {
      const b = ctxMenu.querySelector(`[data-ctx="${act}"]`);
      touch('pointerdown', b); touch('pointerup', b);
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    };
    const longPress = async (el, withClick) => {
      touch('pointerdown', el);
      await new Promise(r => setTimeout(r, LONG_PRESS_MS + 80));
      touch('pointerup', el);
      // iOS sends a click when the finger lifts; Android usually does not.
      if (withClick) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    };
    for (const withClick of [false, true]) {
      ui.mapSelected = null; ui.mapLinkFrom = null; render();
      await longPress(node(g2.id), withClick);
      assert(!ctxMenu.hidden && ctxMenu.dataset.id === g2.id, `${withClick ? 'with' : 'without'} a lifting click: menu open`);
      eq(ui.mapSelected, null, 'the press itself does not select the box');
      tapMenu('link');
      assert(ui.mapLinkFrom === g2.id && ctxMenu.hidden, `${withClick ? 'with' : 'without'} a lifting click: one tap on “Link to…” starts linking`);
      ui.mapLinkFrom = null; render();
      // Any menu item, not only Link to…
      await longPress(node(g.id), withClick);
      tapMenu('edit');
      assert(modal.open && formCtx.id === g.id, `${withClick ? 'with' : 'without'} a lifting click: one tap on Edit opens it`);
      modal.close();
    }
    // A short tap still selects as before.
    ui.mapSelected = null; render();
    touch('pointerdown', node(g.id)); touch('pointerup', node(g.id));
    node(g.id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    eq(ui.mapSelected, g.id, 'a short tap selects');
    deletePlan(plans.current);
    return 'ok';
  });
  /* ---------- A menu for relationship lines: long-press, right-click or the menu key ---------- */

  await step('lines: a long-press, right-click or menu key opens Edit, Remove and Deselect', async () => {
    fresh('Line menu');
    const g = mk('goal', { title: 'Goal' }), a = mk('activity', { title: 'Act' }), b = mk('activity', { title: 'Other' });
    rel(a, g, 'contributes'); rel(b, g, 'contributes');
    save();
    setView('map');
    const r = () => db.relations.find(x => x.from === a.id);
    const line = () => $(`[data-rel-edit="${r().id}"]`);
    const touch = (type, el) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 9, clientX: 60, clientY: 60 }));
    const longPress = async el => { touch('pointerdown', el); await new Promise(res => setTimeout(res, LONG_PRESS_MS + 80)); touch('pointerup', el); };
    const tapMenu = act => {
      const btn = ctxMenu.querySelector(`[data-ctx="${act}"]`);
      touch('pointerdown', btn); touch('pointerup', btn);
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    };
    const items = () => [...ctxMenu.querySelectorAll('[data-ctx]')].map(x => x.textContent);

    await longPress(line());
    assert(!ctxMenu.hidden, 'long-press opens a menu');
    eq(items(), [t('btn.edit'), t('btn.remove'), t('btn.deselect')], 'the three options');
    assert(ctxMenu.textContent.includes('Act') && ctxMenu.textContent.includes('Goal') && ctxMenu.textContent.includes(t('kind.relation')), 'names the relationship');
    eq(ui.mapRel, r().id, 'the line is selected too');
    assert(line().classList.contains('sel'), 'drawn as selected');
    // Selecting redraws the map, which puts its scroll back; that must not close the menu.
    await new Promise(res => setTimeout(res, 300));
    assert(!ctxMenu.hidden, 'still open a moment later');
    await new Promise(res => setTimeout(res, 300));
    $('.map-wrap').dispatchEvent(new Event('scroll'));
    assert(ctxMenu.hidden, 'a real scroll later still closes it');
    await longPress(line());
    tapMenu('rel-edit');
    assert(ctxMenu.hidden && modal.open && formCtx.kind === 'relation' && formCtx.id === r().id, 'one tap on Edit opens it');
    modal.close();

    await longPress(line());
    tapMenu('rel-deselect');
    assert(ctxMenu.hidden && ui.mapRel === null && !line().classList.contains('sel'), 'Deselect');
    eq(db.relations.length, 2, 'nothing removed');

    // Right-click (desktop, and Android's long-press) opens the same menu.
    line().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 80 }));
    assert(!ctxMenu.hidden && ui.mapRel === r().id, 'right-click opens it and selects');
    eq(items().length, 3, 'same options');
    press('Escape', ctxMenu);
    assert(ctxMenu.hidden, 'Escape closes the menu');
    // The menu key on a focused line.
    line().focus();
    press('ContextMenu', line());
    assert(!ctxMenu.hidden && items().length === 3, 'the menu key opens it');
    closeCtxMenu();

    await longPress(line());
    const id = r().id;
    tapMenu('rel-remove');
    assert(ctxMenu.hidden && !db.relations.some(x => x.id === id), 'Remove removes it');
    eq($('#toast').textContent, t('toast.relRemoved'), 'says so');
    assert(findEntity(a.id) && findEntity(g.id) && db.relations.length === 1, 'the items and the other line stay');

    // Boxes keep their own menu.
    const box = $(`[data-map-node="${a.id}"]`);
    await longPress(box);
    assert(!ctxMenu.hidden && ctxMenu.querySelector('[data-ctx="edit"]') && !ctxMenu.querySelector('[data-ctx="rel-edit"]'), 'a box still opens the item menu');
    closeCtxMenu();

    // Timeline dependency arrows have the same menu.
    rel(b, a, 'depends');
    a.startDate = d(-3); a.dueDate = d(3); b.startDate = d(4); b.dueDate = d(9); g.startDate = d(-5); g.deadline = d(30);
    save(); ui.tlDeps = true; setView('timeline');
    const dep = $('.tl-deps [data-rel-edit]');
    await longPress(dep);
    assert(!ctxMenu.hidden && items().length === 3, 'timeline arrow: menu');
    eq(ctxMenu.querySelector('.ctx-head strong').title, relText(db.relations.find(x => x.type === 'depends')), 'a line menu heading shows the whole text on hover');
    tapMenu('rel-remove');
    assert(!db.relations.some(x => x.type === 'depends'), 'timeline arrow removed');
    deletePlan(plans.current);
    return items().join(', ');
  });

  await step('map and timeline hints are short; the details are in the help', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const k of ['map.hint', 'tl.hint']) assert(t(k).length <= 150, `${code} ${k} is ${t(k).length} characters`);
      for (const k of ['help.view.map', 'help.view.timeline']) [/Delete/, /Enter/, /Esc/, /Ctrl/].forEach(w => assert(w.test(t(k)), `${code} ${k} mentions ${w}`));
      assert(/collapse|strn/i.test(t('help.view.timeline')), `${code}: folding in the timeline help`);
    }
    changeLanguage('en');
    setView('map');
    return `${t('map.hint')} | ${t('tl.hint')}`;
  });

  /* ---------- Moving dates by dragging the selected bar in the timeline ---------- */

  await step('timeline: dragging the selected bar moves its dates; a grip moves one end', async () => {
    fresh('Drag dates');
    const now = today();
    const g = mk('goal', { title: 'Goal', startDate: addDays(now, -10), deadline: addDays(now, 20) });
    const a = mk('activity', { title: 'Act', startDate: now, dueDate: addDays(now, 5) });
    const m = mk('activity', { title: 'Milestone', dueDate: addDays(now, 8) });
    const r = mk('activity', { title: 'Routine', startDate: now, repeat: { every: 1, unit: 'day', count: 5 } });
    r.dueDate = lastOccurrence(r, 5);
    rel(a, g, 'contributes'); rel(m, g, 'contributes');
    save();
    ui.tlPx = TL.ZOOM.week; ui.tlDeps = true;
    setView('timeline');
    const px = ui.tlPx;
    const sel = id => { ui.mapSelected = id; ui.mapRel = null; render(); };
    const row = id => $(`[data-tl-node="${id}"]`);
    const mouse = (type, el, x, y = 100) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', button: 0, clientX: x, clientY: y }));
    const touch = (type, el, x, y = 100) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 4, pointerType: 'touch', clientX: x, clientY: y }));
    const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const drag = (el, days, steps = 3) => {
      mouse('pointerdown', el, 400);
      for (let k = 1; k <= steps; k++) mouse('pointermove', document, 400 + days * px * k / steps);
      mouse('pointerup', document, 400 + days * px);
      click(el);
    };

    // Only the selected item can be dragged.
    assert(!$('[data-tl-drag]'), 'nothing selected: nothing to drag');
    sel(a.id);
    assert(row(a.id).querySelector('.tl-bar.tl-drag') && row(a.id).querySelectorAll('.tl-grip').length === 2, 'the selected bar and its two grips');
    assert(viewEl.textContent.includes(t('tl.dragHint')), 'the hint says how');

    // Moving the whole bar: the view follows during the drag, before it is let go.
    const left0 = parseFloat(row(a.id).querySelector('.tl-bar').style.left);
    mouse('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    mouse('pointermove', document, 402);
    eq(a.startDate, now, 'a 2px wobble does not drag');
    mouse('pointermove', document, 400 + 3 * px + 3);
    eq(parseFloat(row(a.id).querySelector('.tl-bar').style.left), left0 + 3 * px, 'the bar follows at once');
    eq(row(a.id).querySelector('.tl-dates').textContent, `${fmtDate(addDays(now, 3))} – ${fmtDate(addDays(now, 8))}`, 'its dates follow at once');
    eq(a.startDate, now, 'not saved until let go');
    eq($('.tl-drag-tip')?.textContent, `${fmtDate(addDays(now, 3))} – ${fmtDate(addDays(now, 8))}`, 'a label above shows the new dates');
    const tipR = $('.tl-drag-tip').getBoundingClientRect(), barR = row(a.id).querySelector('.tl-bar').getBoundingClientRect();
    assert(tipR.bottom <= barR.top && tipR.width > 0, 'the label sits above the bar');
    mouse('pointerup', document, 400 + 3 * px + 3);
    click(row(a.id));
    eq([a.startDate, a.dueDate], [addDays(now, 3), addDays(now, 8)], 'moved by three days');
    eq(ui.mapSelected, a.id, 'still selected after the drag');
    assert(JSON.parse(localStorage.getItem(planKey(plans.current))).activities.find(x => x.id === a.id).startDate === addDays(now, 3), 'saved');
    assert(row(a.id).querySelector('.tl-bar.tl-drag'), 'redrawn and still draggable');

    assert(!$('.tl-drag-tip'), 'the label goes when the bar is let go');
    // A grip changes one end only, and never past the other end; the label names that date.
    mouse('pointerdown', row(a.id).querySelector('[data-tl-edge="end"]'), 400);
    mouse('pointermove', document, 400 + 6);
    eq($('.tl-drag-tip')?.textContent, `${t('f.dueDate')}: ${fmtDate(addDays(now, 8))}`, 'the label shows from the start of the drag');
    mouse('pointermove', document, 400 + 2 * px);
    eq($('.tl-drag-tip').textContent, `${t('f.dueDate')}: ${fmtDate(addDays(now, 10))}`, 'end grip: the label names the due date');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    mouse('pointerup', document, 400 + 2 * px);
    assert(!$('.tl-drag-tip') && a.dueDate === addDays(now, 8), 'Esc removes the label and keeps the date');
    drag(row(a.id).querySelector('[data-tl-edge="end"]'), 4);
    eq([a.startDate, a.dueDate], [addDays(now, 3), addDays(now, 12)], 'end grip: due date only');
    drag(row(a.id).querySelector('[data-tl-edge="start"]'), -2);
    eq([a.startDate, a.dueDate], [addDays(now, 1), addDays(now, 12)], 'start grip: start date only');
    drag(row(a.id).querySelector('[data-tl-edge="end"]'), -30);
    eq([a.startDate, a.dueDate], [addDays(now, 1), addDays(now, 1)], 'an activity can shrink to one day');
    // A goal's deadline stays after its start.
    sel(g.id);
    drag(row(g.id).querySelector('[data-tl-edge="start"]'), 60);
    eq([g.startDate, g.deadline], [addDays(now, 19), addDays(now, 20)], 'a goal keeps its start before the deadline');
    mouse('pointerdown', row(g.id).querySelector('[data-tl-edge="end"]'), 400);
    mouse('pointermove', document, 400 + px);
    eq($('.tl-drag-tip').textContent, `${t('f.deadline')}: ${fmtDate(addDays(now, 21))}`, 'the end of a goal is its deadline');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    mouse('pointerup', document, 400 + px);

    // Esc puts it back.
    sel(a.id);
    mouse('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    mouse('pointermove', document, 400 + 5 * px);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    mouse('pointerup', document, 400 + 5 * px);
    click(row(a.id));
    eq(a.startDate, addDays(now, 1), 'Esc: not moved');
    eq(row(a.id).querySelector('.tl-dates').textContent, `${fmtDate(addDays(now, 1))} – ${fmtDate(addDays(now, 1))}`, 'Esc: drawn where it was');
    eq(ui.mapSelected, a.id, 'Esc during a drag keeps the selection');

    // A plain click on the selected bar still deselects it, and nothing moves.
    const before = JSON.stringify(a);
    mouse('pointerdown', row(a.id).querySelector('.tl-bar'), 400); mouse('pointerup', document, 400); click(row(a.id));
    eq(ui.mapSelected, null, 'a click deselects');
    eq(JSON.stringify(a), before, 'a click changes nothing');

    // A milestone (one date) moves that date.
    sel(m.id);
    assert(row(m.id).querySelector('.tl-milestone.tl-drag') && !row(m.id).querySelector('.tl-grip'), 'a milestone moves whole');
    drag(row(m.id).querySelector('.tl-milestone'), -2);
    eq([m.startDate || '', m.dueDate], ['', addDays(now, 6)], 'the milestone moved, no start date added');

    // A routine that runs a set number of times only moves; its end follows its start.
    sel(r.id);
    assert(!row(r.id).querySelector('.tl-grip') && viewEl.textContent.includes(t('tl.dragHintMove')), 'no grips on a counted routine');
    drag(row(r.id).querySelector('.tl-bar'), 2);
    eq([r.startDate, r.dueDate], [addDays(now, 2), addDays(now, 6)], 'the routine moved with its end');

    // The drag stops at the ends of the timeline as drawn.
    sel(a.id);
    const to = Number($('.tl-scroll').dataset.to);
    drag(row(a.id).querySelector('.tl-bar'), 5000);
    eq(a.dueDate, dayStr(to), 'stops at the end of the timeline');

    // Unselected bars pan as before.
    ui.mapSelected = null; render();
    const scroll = $('.tl-scroll');
    scroll.setPointerCapture = () => {}; // a synthetic pointer cannot be captured
    scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
    const sl = scroll.scrollLeft;
    mouse('pointerdown', row(g.id).querySelector('.tl-bar'), 400); mouse('pointermove', document, 300); mouse('pointerup', document, 300);
    assert(scroll.scrollLeft !== sl, 'an unselected bar pans the timeline');
    eq(g.deadline, addDays(now, 20), 'and keeps its dates');

    // Touch: moving before the long-press is up scrolls (no drag); after it, the bar drags.
    sel(a.id);
    const start = a.startDate;
    touch('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    touch('pointermove', document, 400 + 3 * px);
    await wait(LONG_PRESS_MS + 80);
    touch('pointermove', document, 400 + 6 * px);
    touch('pointerup', document, 400 + 6 * px);
    eq(a.startDate, start, 'a swipe does not drag');
    assert(ctxMenu.hidden, 'nor open the menu');
    touch('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    await wait(LONG_PRESS_MS + 80);
    assert($('.tl-scroll').classList.contains('tl-dragging') && ctxMenu.hidden, 'a long-press picks the bar up');
    const tm = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    row(a.id).querySelector('.tl-bar').dispatchEvent(tm);
    assert(tm.defaultPrevented, 'and the page does not scroll');
    touch('pointermove', document, 400 - 2 * px);
    touch('pointerup', document, 400 - 2 * px);
    eq(a.startDate, addDays(start, -2), 'long-press and drag moves the dates');
    eq(ui.mapSelected, a.id, 'still selected');
    assert(!$('.tl-scroll').classList.contains('tl-dragging'), 'put down');
    // A long-press let go without moving opens the menu, as elsewhere.
    touch('pointerdown', row(a.id).querySelector('[data-tl-edge="end"]'), 400);
    await wait(LONG_PRESS_MS + 80);
    touch('pointerup', document, 400);
    assert(!ctxMenu.hidden && ctxMenu.dataset.id === a.id, 'a long-press without moving opens the menu');
    eq(ctxMenu.querySelector('.ctx-head strong').title, a.title, 'the menu heading shows the whole title on hover');
    closeCtxMenu();
    eq(a.startDate, addDays(start, -2), 'and changes nothing');
    deletePlan(plans.current);
    return `px=${px}`;
  });

  await step('graphs: a pinch on a chart zooms the page; a sideways swipe still moves the crosshair', () => {
    loadSample();
    setView('graphs');
    const plots = [...viewEl.querySelectorAll('.gr-plot')];
    assert(plots.length, 'charts drawn');
    const ta = getComputedStyle(plots[0]).touchAction;
    assert(ta.includes('pinch-zoom'), `pinch zooms: ${ta}`);
    assert(ta.includes('pan-y') && !ta.includes('pan-x') && ta !== 'auto', `up and down scrolls, sideways is the app's: ${ta}`);
    for (const v of ['map', 'timeline']) {
      setView(v);
      const own = getComputedStyle($(ZOOM_SEL)).touchAction;
      assert(!own.includes('pinch-zoom'), `${v} keeps its own pinch: ${own}`);
    }
    deletePlan(plans.current);
    return ta;
  });

  await step('activities: on its start date a to-do activity is in progress, once per start date', () => {
    fresh('Auto start');
    const past = mk('activity', { startDate: d(-3) }), now = mk('activity', { startDate: d(0) }), soon = mk('activity', { startDate: d(1) });
    const none = mk('activity'), done = mk('activity', { status: 'done', startDate: d(-5) });
    const routine = mk('activity', { startDate: d(-10), repeat: { every: 1, unit: 'week', times: 2 }, checkins: {} });
    setView('activities');
    eq([past, now, soon, none, done, routine].map(a => a.status), ['doing', 'doing', 'todo', 'todo', 'done', 'todo'], 'statuses');
    eq(past.autoStarted, past.startDate, 'remembers the start date it acted on');
    assert($(`.col-doing [data-open="${past.id}"]`) && $(`.col-todo [data-open="${soon.id}"]`), 'cards sit in their columns');
    eq(JSON.parse(localStorage.getItem(planKey(plans.current))).activities.find(a => a.id === now.id).status, 'doing', 'and it is saved');
    // Set back by hand, it stays; a new start date starts it again.
    runCtxAction('status:todo', past.id);
    setView('dashboard'); setView('activities');
    eq(past.status, 'todo', 'set back to to do, it stays');
    past.startDate = d(-1);
    render();
    eq(past.status, 'doing', 'a new start date starts it again');
    // A start date reached while the app was in the background.
    soon.startDate = d(0);
    document.dispatchEvent(new Event('visibilitychange'));
    eq(soon.status, 'doing', 'coming back to the app starts it');
    assert($(`.col-doing [data-open="${soon.id}"]`), 'and redraws the board');
    // Only activities started by hand count as progress (when importing or saving a template).
    eq(progressCounts(db).started, 0, 'started by date is not progress');
    runCtxAction('status:doing', none.id);
    eq(progressCounts(db).started, 1, 'started by hand is');
    // A plan shared as a template starts over.
    const tpl = resetProgress(db);
    assert(tpl.activities.every(a => a.status === 'todo' && !('autoStarted' in a)), 'templates forget it');
    deletePlan(plans.current);
  });
};
