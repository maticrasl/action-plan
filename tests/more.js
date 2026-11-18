// Extra coverage, run by test.js after its own steps: rules, progress, change tracking,
// merge edge cases, persistence, sync states, drag & drop, keyboard, zoom, i18n plurals.
// The real Drive methods, before any test swaps them for fakes.
const REAL_DRIVE = { ...drive };
window.moreTests = async ({ step, assert }) => {
  /* ---------- Templates (templates.js) ---------- */

  await step('templates: every template becomes a sound plan, in both languages, and every view draws it', () => {
    const views = ['dashboard', 'goals', 'activities', 'states', 'map', 'timeline', 'graphs'];
    const made = [];
    let items = 0;
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const tpl of TEMPLATES) {
        const where = `${code} ${tpl.id}`;
        useTemplate(tpl);
        made.push(plans.current);
        assert(currentPlan().name.startsWith(tplText(tpl.name)), `${where}: plan name`);
        eq(
          [db.goals.length, db.states.length, db.activities.length],
          [tpl.goals.length, tpl.states.length, tpl.activities.length],
          `${where}: counts`,
        );
        items += itemCount();
        assert(
          [...db.goals, ...db.states, ...db.activities].every(x => typeof x.title === 'string' && x.title),
          `${where}: titles`,
        );
        assert(
          db.goals.every(g => g.category === t('tpl.area.' + tpl.area)),
          `${where}: category`,
        );
        // Every link follows the rules, as if added by hand, and survives a merge.
        const all = [...db.relations];
        all.forEach(r => {
          db.relations = all.filter(x => x !== r);
          const err = canRelate(r.from, r.to, r.type);
          assert(
            !err,
            `${where}: ${r.type} ${findEntity(r.from)?.item.title} → ${findEntity(r.to)?.item.title}: ${err}`,
          );
        });
        db.relations = all;
        assert(repairRelations(db).length === all.length, `${where}: merge repair keeps every relation`);
        // Dates make sense: nothing ends before it starts, nothing is late on the first day,
        // sub-activities sit inside their parent, and work starts once what it waits for is due.
        const title = id => findEntity(id).item.title;
        db.goals.forEach(g =>
          assert(g.startDate <= g.deadline && goalState(g) !== 'late', `${where}: goal dates ${g.title}`),
        );
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
          relsFrom(a.id, 'contributes').forEach(r =>
            assert(a.dueDate <= findEntity(r.to).item.deadline, `${where}: ${a.title} due after ${title(r.to)}`),
          );
          // Every activity works toward a goal, directly or through its parent.
          assert(
            [a.id, ...ancestors(a.id, 'subactivity')].some(id => relsFrom(id, 'contributes').length),
            `${where}: ${a.title} serves no goal`,
          );
          if (isRoutine(a)) assert(scheduleText(a) && periodProgress(a).target >= 0, `${where}: routine ${a.title}`);
        });
        db.states.forEach(s =>
          assert(
            relsFrom(s.id, 'measures').length || relsTo(s.id, 'improves').length,
            `${where}: state ${s.title} unlinked`,
          ),
        );
        db.goals
          .filter(byActivities)
          .forEach(g => assert(countedActivities(g).length, `${where}: ${g.title} has activities to count`));
        db.goals.filter(byRoutines).forEach(g => assert(goalRoutines(g).length, `${where}: ${g.title} has routines`));
        assert(!hasProgress(db), `${where}: starts without progress`);
        views.forEach(v => {
          setView(v);
          assert(viewEl.children.length, `${where}: ${v} empty`);
        });
      }
    }
    changeLanguage('en');
    made.forEach(deletePlan);
    setView('dashboard');
    return `${made.length} plans, ${items} items`;
  });

  await step(
    'templates: every template fits the current data model (normalize keeps it, routines, lists, states that add up)',
    () => {
      // Every key the picker and templateData use exists in both languages.
      const keys = [
        'tpl.title',
        'tpl.lead',
        'tpl.areas',
        'tpl.area.all',
        'tpl.use',
        'tpl.inside',
        'tpl.goalList',
        'tpl.stepList',
        'tpl.routineList',
        'tpl.goals',
        'tpl.states',
        'tpl.activities',
        'tpl.routines',
        'tpl.weeks',
        'tpl.months',
        'tpl.years',
        ...TPL_AREAS.map(a => 'tpl.area.' + a),
        'tpl.level.starter',
        'tpl.level.ambitious',
      ];
      TPL_LANGS.forEach(code => keys.forEach(k => assert(I18N[code].strings[k], `${code}: ${k}`)));
      const made = [];
      const counts = { routines: 0, makeUp: 0, lists: 0, routineLists: 0, cumulative: 0, periods: 0 };
      for (const code of TPL_LANGS) {
        changeLanguage(code);
        for (const tpl of TEMPLATES) {
          const where = `${code} ${tpl.id}`;
          let data;
          try {
            data = templateData(tpl);
          } catch (e) {
            assert(false, `${where}: templateData threw ${e.message}`);
          }
          // normalize (what a load or a sync does) changes nothing: no link or field is dropped.
          eq(
            JSON.stringify(normalize(JSON.parse(JSON.stringify(data)))),
            JSON.stringify(data),
            `${where}: normalize keeps it`,
          );
          useTemplate(tpl);
          made.push(plans.current);
          // Every link passes canRelate against the rest, and none waits for a routine.
          const all = [...db.relations];
          all.forEach(r => {
            db.relations = all.filter(x => x !== r);
            const err = canRelate(r.from, r.to, r.type);
            assert(
              !err,
              `${where}: ${r.type} ${findEntity(r.from)?.item.title} → ${findEntity(r.to)?.item.title}: ${err}`,
            );
            assert(REL_TYPES[r.type], `${where}: link type ${r.type}`);
          });
          db.relations = all;
          assert(
            !db.relations.some(r => r.type === 'depends' && isRoutine(findEntity(r.to).item)),
            `${where}: something depends on a routine`,
          );
          db.activities.forEach((a, i) => {
            const src = tpl.activities[i];
            eq(a.title, tplText(src.title), `${where}: activities in template order`);
            if (isRoutine(a)) {
              counts.routines++;
              const now = routineToday(a);
              assert(
                scheduleText(a) &&
                  shortSchedule(a) &&
                  (now === null || (now in TODAY_TAG && now !== 'done' && now !== 'makeUp')),
                `${where}: routine ${a.title} today ${now}`,
              );
              assert(
                periodProgress(a).target >= 0 && routineStreak(a).n === 0 && activityState(a) !== 'late',
                `${where}: routine ${a.title} starts fresh`,
              );
              if (a.repeat.makeUp) {
                counts.makeUp++;
                assert(!isFlexible(a) && makesUp(a), `${where}: ${a.title} makes up only set days`);
              }
            }
            if (a.list) {
              counts[isRoutine(a) ? 'routineLists' : 'lists']++;
              eq(
                a.list.map(i => i.text),
                src.list.map(tplText),
                `${where}: ${a.title} items`,
              );
              assert(
                a.list.every(i => safeId(i.id) && !i.done) && new Set(a.list.map(i => i.id)).size === a.list.length,
                `${where}: ${a.title} item ids`,
              );
              assert(
                isRoutine(a)
                  ? isListRoutine(a) && dayItemsDone(a, today()) === 0
                  : isList(a) && listDone(a) === 0 && a.status !== 'done',
                `${where}: ${a.title} list kind`,
              );
            }
            relsFrom(a.id, 'improves').forEach(r =>
              assert(findEntity(r.to)?.kind === 'state', `${where}: ${a.title} improves a state`),
            );
          });
          db.states.forEach(s => {
            if (isCumulative(s)) {
              counts.cumulative++;
              assert(
                SCALES.includes(s.scale) && Array.isArray(s.entries) && !s.entries.length && stateTotal(s) === 0,
                `${where}: ${s.title} adds up from nothing`,
              );
            } else assert(!('scale' in s) && !('entries' in s), `${where}: ${s.title} plain`);
          });
          db.goals.forEach(g => {
            if (!g.period) return;
            counts.periods++;
            const st = relsTo(g.id, 'measures').map(r => findEntity(r.from).item);
            assert(
              PERIODS.includes(g.period) && st.length && st.every(isCumulative),
              `${where}: ${g.title} counts a period of a state that adds up`,
            );
            assert(
              goalCurrent(g) === Number(g.baseline) && !goalReached(g),
              `${where}: ${g.title} starts at its baseline`,
            );
          });
        }
      }
      changeLanguage('en');
      made.forEach(deletePlan);
      setView('dashboard');
      assert(
        counts.makeUp && counts.lists && counts.routineLists && counts.cumulative && counts.periods,
        `uses the newer features: ${JSON.stringify(counts)}`,
      );
      return Object.entries(counts)
        .map(([k, v]) => `${v / 2} ${k}`)
        .join(', ');
    },
  );

  await step('templates: Exodus 90 is 90 days of prayer, asceticism and fraternity after a week of preparation', () => {
    const tpl = TEMPLATES.find(x => x.id === 'exodus-90');
    assert(tpl && tpl.area === 'faith', 'in the Faith area');
    const made = [];
    for (const code of TPL_LANGS) {
      changeLanguage(code);
      useTemplate(tpl);
      made.push(plans.current);
      const [g] = db.goals;
      const by = en => db.activities.find(a => a.title === tplText(tpl.activities.find(x => x.title[0] === en).title));
      eq(
        [g.category, byRoutines(g), g.deadline],
        [t('tpl.area.faith'), true, addDays(today(), 96)],
        `${code}: goal kept by its routines, day 90 on day 96`,
      );
      const routines = db.activities.filter(isRoutine);
      eq(routines.length, 6, `${code}: six routines`);
      assert(
        routines.every(
          a =>
            a.startDate === addDays(today(), 7) && a.dueDate === g.deadline && addDays(a.startDate, 89) === a.dueDate,
        ),
        `${code}: routines run the 90 days`,
      );
      eq(by('Daily prayer').list.length, 4, `${code}: prayer list`);
      eq(by('Daily disciplines').list.length, 9, `${code}: disciplines list`);
      eq(
        [
          by('Fast and abstain on Wednesday and Friday').repeat.days,
          !!by('Fast and abstain on Wednesday and Friday').repeat.makeUp,
        ],
        [[2, 4], false],
        `${code}: strict Wednesday and Friday fast`,
      );
      assert(
        by('Weekly fraternity meeting').repeat.makeUp && by('Intense exercise 3 times a week').repeat.times === 3,
        `${code}: meeting can move, exercise 3 a week`,
      );
      assert(goalRoutines(g).length === 6, `${code}: the goal counts every routine`);
    }
    changeLanguage('en');
    made.forEach(deletePlan);
    setView('dashboard');
    return 'Faith area, 6 routines over days 7–96, strict fast, movable meeting';
  });

  await step(
    'templates: picker from the empty plan and settings, filtered by area, opens a template as a new plan',
    () => {
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
      eq(
        cards().map(c => c.querySelector('.tpl-level').classList.contains('starter')),
        [true, true, true, false],
        'starter ones first',
      );
      assert(
        tplDialog.querySelector('[data-tpl-area="money"]').getAttribute('aria-pressed') === 'true',
        'chip pressed',
      );
      tplDialog.querySelector('[data-tpl-area=""]').click();
      eq(cards().length, TEMPLATES.length, 'all again');
      const run = tplDialog.querySelector('[data-template="run-5k"]').closest('.tpl-card');
      eq(
        [...run.querySelectorAll('.tpl-meta span')].map(x => x.textContent),
        ['10 weeks', '1 goal', '2 states', '6 activities', '2 routines'],
        'summary line',
      );
      const inside = run.querySelector('.tpl-inside').textContent;
      assert(
        inside.includes('Buy running shoes') && inside.includes('Run 3 times a week') && !inside.includes('Weeks 1–3'),
        'inside: main steps and routines, not sub-steps',
      );
      const before = plans.list.length,
        from = plans.current;
      run.querySelector('[data-template]').click();
      assert(
        !tplDialog.open && plans.list.length === before + 1 && plans.current !== from,
        'a new plan, the empty one kept',
      );
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
      assert(
        sl.includes('Za začetek') &&
          sl.includes('Ambiciozno') &&
          sl.includes('10 tednov1 cilj2 stanji6 aktivnosti2 rutini') &&
          sl.includes('Preteči 5 km'),
        'Slovene wording',
      );
      assert(sl.includes('2 leti') && sl.includes('3 leta'), 'years in Slovene');
      tplDialog.close();
      changeLanguage('en');
      deletePlan(made);
      return 'ok';
    },
  );

  await step('map: drag from one box to another to link them; touch picks by tapping', async () => {
    fresh('Linking');
    const g = mk('goal', { title: 'Big goal' }),
      g2 = mk('goal', { title: 'Other goal' });
    const a = mk('activity', { title: 'Do it' }),
      s = mk('state', { title: 'Now' });
    rel(s, g, 'measures');
    save();
    setView('map');
    const node = id => $(`[data-map-node="${id}"]`);
    const mid = id => {
      const r = node(id).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const ev = (type, el, p) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'mouse',
          button: 0,
          clientX: p.x,
          clientY: p.y,
        }),
      );
    const drag = (fromId, end, hover) => {
      const p0 = mid(fromId);
      ev('pointerdown', node(fromId), p0);
      ev('pointermove', document, { x: p0.x + 20, y: p0.y + 20 });
      if (hover) ev('pointermove', document, hover);
      ev('pointerup', document, end);
    };
    node(a.id).scrollIntoView({ block: 'center' });
    // Drag activity → goal: the form offers only what fits (contributes).
    const p0 = mid(a.id),
      pg = mid(g.id);
    ev('pointerdown', node(a.id), p0);
    ev('pointermove', document, { x: p0.x + 30, y: p0.y - 30 });
    assert(
      $('.link-line') && node(a.id).classList.contains('link-source') && $('.map-wrap').classList.contains('linking'),
      'line drawn while dragging',
    );
    assert(!$('.map-wrap').classList.contains('panning'), 'dragging a box does not pan');
    ev('pointermove', document, pg);
    assert(node(g.id).classList.contains('link-target'), 'target box marked');
    ev('pointerup', document, pg);
    assert(!$('.link-line') && !$('.link-source, .link-target'), 'line removed');
    await tick();
    assert(
      modal.open && $('#f-from').value === a.id && $('#f-to').value === g.id,
      'relationship form opened for the two items',
    );
    eq(
      [...$('#f-type').options].map(o => o.value),
      ['contributes'],
      'only fitting types',
    );
    submitForm();
    assert(
      relsFrom(a.id, 'contributes').some(r => r.to === g.id),
      'link saved',
    );

    // Goal dragged onto an activity: offered in the other direction, saved the right way round.
    const before = db.relations.length;
    drag(g2.id, mid(a.id));
    await tick();
    eq(
      [...$('#f-type').options].map(o => o.value),
      ['rev:contributes'],
      'offered the other way round',
    );
    $('#f-type').value = 'rev:contributes';
    submitForm();
    assert(
      db.relations.length === before + 1 && relsFrom(a.id, 'contributes').some(r => r.to === g2.id),
      'reverse type saved activity → goal',
    );

    // Released outside a box, on itself, or on the background: nothing happens.
    const n = db.relations.length;
    const wrap = $('.map-wrap').getBoundingClientRect();
    drag(a.id, { x: wrap.left + 3, y: wrap.top + 3 });
    await tick();
    drag(a.id, mid(a.id));
    await tick();
    assert(!modal.open && db.relations.length === n && !$('.link-line'), 'dropped outside: no link');
    // A click on a box without dragging still highlights it.
    ev('pointerdown', node(s.id), mid(s.id));
    ev('pointerup', document, mid(s.id));
    await tick();
    node(s.id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(ui.mapSelected === s.id && !modal.open, 'plain click highlights');
    ui.mapSelected = null;
    render();
    // Escape drops a link in progress.
    const ps = mid(s.id);
    ev('pointerdown', node(s.id), ps);
    ev('pointermove', document, { x: ps.x + 40, y: ps.y });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!$('.link-line'), 'Escape removes the line');
    ev('pointerup', document, mid(g.id));
    await tick();
    assert(!modal.open, 'released after Escape: no form');
    // Nothing fits (state → goal "measures" exists): a message instead of the form.
    render();
    drag(s.id, mid(g.id));
    await tick();
    assert(!modal.open && $('#toast').textContent.includes('can’t be linked'), 'no possible link: message');

    // Touch: "Link to…" from the long-press menu, then tap the other box.
    openCtxMenu(g2.id, 10, 10);
    ctxMenu.querySelector('[data-ctx="link"]').click();
    assert(
      ui.mapLinkFrom === g2.id && $('.link-bar') && node(g2.id).classList.contains('link-source'),
      'pick mode with a banner',
    );
    node(g.id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(
      !ui.mapLinkFrom && modal.open && $('#f-from').value === g2.id && $('#f-to').value === g.id,
      'tap on the other box opens the form',
    );
    eq(
      [...$('#f-type').options].map(o => o.value),
      ['subgoal', 'depends', 'rev:subgoal', 'rev:depends'],
      'goal ↔ goal types',
    );
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
    assert(
      t('tour.mapLink.text').includes('drag') && I18N.sl.strings['tour.mapLink.text'].includes('povlecite'),
      'tour text in both languages',
    );
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
    assert(
      modal.open && formCtx.kind === 'goal' && formCtx.id === g1.id && ui.mapSelected === g1.id,
      'Space on the selected item opens it',
    );
    modal.close();
    ui.mapSelected = null;
    render();
    node().dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    assert(!ctxMenu.hidden && ctxMenu.dataset.id === g1.id, 'menu key opens the context menu');
    const btns = [...ctxMenu.querySelectorAll('button')];
    const key = k => ctxMenu.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const focus = [btns.indexOf(document.activeElement)];
    key('ArrowDown');
    focus.push(btns.indexOf(document.activeElement));
    key('ArrowUp');
    key('ArrowUp');
    focus.push(btns.indexOf(document.activeElement));
    key('Home');
    focus.push(btns.indexOf(document.activeElement));
    key('End');
    focus.push(btns.indexOf(document.activeElement));
    eq(focus, [0, 1, btns.length - 1, 0, btns.length - 1], 'menu focus moves');
    key('Escape');
    assert(ctxMenu.hidden && document.activeElement === node(), 'Escape closes and returns focus');
    node().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    assert(!ctxMenu.hidden, 'Shift+F10 opens the menu');
    closeCtxMenu();
    node().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    assert(modal.open && $('#f-title').value === 'Key goal', 'double-click opens the form');
    modal.close();

    const count = plans.list.length,
      cur = plans.current;
    startTour();
    const press = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const steps = [tour.step];
    press('ArrowRight');
    press('ArrowRight');
    steps.push(tour.step);
    press('ArrowLeft');
    steps.push(tour.step);
    press('ArrowLeft');
    press('ArrowLeft');
    steps.push(tour.step);
    press('Escape');
    steps.push(tour.step);
    eq(steps, [0, 2, 1, 0, -1], 'tour steps');
    assert(plans.list.length === count && plans.current === cur, 'tour plan removed, previous plan reopened');
    return `menu=${btns.length} items, tour ${steps.join('>')}`;
  });

  await step('zoom: limits, ctrl+wheel and timeline presets', async () => {
    fresh('Zoom');
    const g = mk('goal', { deadline: d(60), startDate: d(-10) }),
      a = mk('activity', { startDate: d(1), dueDate: d(20) });
    rel(a, g, 'contributes');
    save();
    setView('map');
    const wrap = $('.map-wrap'),
      r = wrap.getBoundingClientRect();
    zoomMap(100, r.left + 10, r.top + 10);
    const max = ui.mapScale;
    zoomMap(0.001, r.left + 10, r.top + 10);
    const min = ui.mapScale;
    assert(
      max === MAP.MAX_SCALE && min === MAP.MIN_SCALE && prefs.get('mapScale') === MAP.MIN_SCALE,
      'map scale clamped and saved',
    );
    assert($('.zoom-pct').textContent === `${Math.round(MAP.MIN_SCALE * 100)} %`, 'zoom label');
    zoomMap(1, r.left, r.top);
    $('.map-wrap').dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -100,
        clientX: r.left + 50,
        clientY: r.top + 50,
      }),
    );
    $('.map-wrap').dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -100,
        clientX: r.left + 50,
        clientY: r.top + 50,
      }),
    );
    await tick();
    await tick();
    const wheel = ui.mapScale;
    assert(Math.abs(wheel - Math.exp(0.5)) < 1e-9, 'two wheel steps coalesced into one zoom: ' + wheel);
    $('.map-wrap').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    await tick();
    await tick();
    assert(ui.mapScale === wheel, 'wheel without ctrl does not zoom');
    zoomMap(1, r.left, r.top);

    setView('timeline');
    const tx = $('.tl-scroll').getBoundingClientRect().right - 20;
    ui.tlPx = 8;
    zoomTimeline(1000, tx);
    const tmax = ui.tlPx;
    zoomTimeline(1e-6, tx);
    const tmin = ui.tlPx;
    assert(tmax === TL.MAX && tmin === TL.MIN, 'timeline zoom clamped');
    $('[data-tl-zoom="quarter"]').click();
    assert(ui.tlPx === TL.ZOOM.quarter);
    $('[data-tl-zoom="month"]').click();
    assert(ui.tlPx === TL.ZOOM.month && prefs.get('tlPx') === TL.ZOOM.month);
    return `map ${min}–${max}, wheel=${wheel.toFixed(3)}, timeline ${tmin}–${tmax}`;
  });

  await step('timeline rows: tree order, hidden done, unlinked group', () => {
    fresh('Rows');
    const g1 = mk('goal', { title: 'G1', startDate: d(1) }),
      g2 = mk('goal', { title: 'G2', startDate: d(2) });
    const a = mk('activity', { title: 'A', startDate: d(3) }),
      b = mk('activity', { title: 'B', startDate: d(4) }),
      b0 = mk('activity', { title: 'B0', startDate: d(2) });
    const u = mk('activity', { title: 'U' });
    rel(g2, g1, 'subgoal');
    rel(a, g1, 'contributes');
    rel(b, a, 'subactivity');
    rel(b0, a, 'subactivity');
    const show = rows =>
      rows
        .map(r => (r.kind === 'group' ? `[${r.label}]` : `${r.item.title}:${r.depth}${r.rel ? ':' + r.rel : ''}`))
        .join(' ');
    const all = show(timelineRows(null));
    eq(all, `G1:0 A:1:contributes B0:2:subactivity B:2:subactivity G2:1:subgoal [${t('tl.unlinked')}] U:1`, 'rows');
    a.status = 'done';
    ui.hideDone = true;
    const hidden = show(timelineRows(null));
    ui.hideDone = false;
    eq(
      hidden,
      `G1:0 B0:1:contributes B:1:contributes G2:1:subgoal [${t('tl.unlinked')}] U:1`,
      "children take a hidden parent's place",
    );
    const scoped = show(timelineRows(scopeFor(g2.id)));
    return `${all} || scoped(G2): ${scoped}`;
  });

  /* ---------- Sharing plans: export as a full copy or a template, import with a progress check ---------- */

  /* ---------- Merging one plan into another ---------- */

  /* ---------- Routine week strip: dates on hover, arrows to earlier weeks ---------- */

  /* ---------- Monthly routines: a chosen day, the last day, or the n-th weekday ---------- */

  /* ---------- A routine's start date is always visible in the form ---------- */

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
      assert(
        labels[code][1].test($('#f-description').placeholder),
        `${code} placeholder: ${$('#f-description').placeholder}`,
      );
      eq($('#f-description').value, 'My own words stay as they were.', `${code}: existing text kept`);
      submitForm();
      eq(s.description, 'My own words stay as they were.', `${code}: saved unchanged`);
      // The help no longer asks to describe where you stand today.
      assert(
        !/where you stand today|kje ste danes/i.test(t('help.view.states') + t('tour.states.text')),
        `${code}: help and tour updated`,
      );
      assert(
        /measure|meri/i.test(t('help.view.states')) && /measure|meri/i.test(t('tour.states.text')),
        `${code}: they talk about measuring`,
      );
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
      eq(db.states.length, 7, `${code}: seven states`);
      for (const s of db.states) {
        assert(s.description && s.description.length > 20, `${code} ${s.title}: has a description`);
        // A lasting description does not repeat a reading: no measured value or change appears in it.
        const values = (s.history || [])
          .map(h => h.value)
          .concat(s.value)
          .filter(Boolean);
        assert(
          !values.some(v => new RegExp(`(^|\\D)${v}(\\D|$)`).test(s.description)),
          `${code} ${s.title}: no reading in “${s.description}”`,
        );
        assert(
          !/\b(so far|still|down \d|last month|doslej|še vedno|prejšnji mesec|shujšal)\b/i.test(s.description),
          `${code} ${s.title}: no snapshot wording in “${s.description}”`,
        );
      }
      out.push(db.states[0].description);
      deletePlan(plans.current);
    }
    changeLanguage('en');
    return out.join(' | ');
  });
  /* ---------- The sample plan's dates are calculated when it is loaded, and then left alone ---------- */

  /* ---------- Map: select a line, Delete removes it; Delete on an item asks; double-click edits ---------- */

  const mapFixture = () => {
    fresh('Map keys');
    const g = mk('goal', { title: 'Run a marathon' });
    const a = mk('activity', { title: 'Train' });
    const b = mk('activity', { title: 'Buy shoes' });
    const s = mk('state', { title: 'Distance' });
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    rel(s, g, 'measures');
    save();
    setView('map');
    return { g, a, b, s };
  };
  const clickEl = (el, detail = 1) =>
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  const edge = id => $(`[data-rel-edit="${id}"]`);
  const nodeEl = id => $(`[data-map-node="${id}"]`);
  const press = (key, target = document.activeElement || document.body) => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  const relOf = (from, to) => db.relations.find(r => r.from === from.id && r.to === to.id);

  await step('map: lines go straight past rows with nothing in the way, and never through a box', () => {
    loadSample();
    setView('map');
    const boxes = [...document.querySelectorAll('[data-map-node]')].map(g => ({
      id: g.dataset.mapNode,
      r: g.getBoundingClientRect(),
    }));
    let crossed = 0;
    for (const g of document.querySelectorAll('.edge-g')) {
      const r = db.relations.find(x => x.id === g.dataset.relEdit),
        path = g.querySelector('.edge');
      const m = path.getScreenCTM(),
        len = path.getTotalLength();
      for (let k = 1; k < 40; k++) {
        const p = new DOMPoint(...Object.values(path.getPointAtLength((len * k) / 40)).slice(0, 2)).matrixTransform(m);
        if (
          boxes.some(
            b =>
              b.id !== r.from &&
              b.id !== r.to &&
              p.x > b.r.left + 2 &&
              p.x < b.r.right - 2 &&
              p.y > b.r.top + 2 &&
              p.y < b.r.bottom - 2,
          )
        ) {
          crossed++;
          break;
        }
      }
    }
    eq(crossed, 0, 'no line crosses another box');
    // Lines never pass so close that they seem to touch, away from where they start and end. And laying
    // the sample out stays quick.
    const lines = [...document.querySelectorAll('.edge-g')]
      .map(g => {
        const path = g.querySelector('.edge'),
          len = path.getTotalLength();
        const pts = Array.from({ length: 121 }, (_, k) => {
          const p = path.getPointAtLength((len * k) / 120);
          return [p.x, p.y];
        }).sort((p, q) => p[1] - q[1]);
        return { r: db.relations.find(x => x.id === g.dataset.relEdit), pts };
      })
      .filter(l => l.pts.at(-1)[1] - l.pts[0][1] > MAP.NH);
    const xAt = (l, y) => {
      for (let i = 1; i < l.length; i++)
        if (y >= l[i - 1][1] && y <= l[i][1])
          return l[i - 1][0] + (l[i][0] - l[i - 1][0]) * ((y - l[i - 1][1]) / (l[i][1] - l[i - 1][1] || 1));
      return null;
    };
    const grazes = [];
    lines.forEach((c, i) =>
      lines.slice(i + 1).forEach(o => {
        const a = c.pts,
          b = o.pts,
          signs = new Set();
        let min = Infinity;
        for (let y = Math.max(a[0][1], b[0][1]) + 24; y <= Math.min(a.at(-1)[1], b.at(-1)[1]) - 24; y += 3) {
          const xa = xAt(a, y),
            xb = xAt(b, y);
          if (xa === null || xb === null) continue;
          if (Math.abs(xa - xb) > 1) signs.add(Math.sign(xa - xb));
          min = Math.min(min, Math.abs(xa - xb));
        }
        if (min < 6 && signs.size === 1) grazes.push(`${relText(c.r)} | ${relText(o.r)}`);
      }),
    );
    eq(grazes, [], 'no lines grazing each other');
    // (Its draw time is checked in perf.js: the clock stands still here.)
    deletePlan(plans.current);

    // A state measuring a goal crosses three rows of activities; nothing is in its way, so one curve.
    fresh('Straight lines');
    const g = mk('goal', { title: 'G' }),
      s = mk('state', { title: 'S' });
    const a = mk('activity', { title: 'A' }),
      b = mk('activity', { title: 'B' }),
      c = mk('activity', { title: 'C' });
    rel(a, g, 'contributes');
    rel(b, a, 'subactivity');
    rel(c, b, 'subactivity');
    rel(s, g, 'measures');
    save();
    setView('map');
    const d = $(`[data-rel-edit="${db.relations.find(x => x.from === s.id).id}"] .edge`).getAttribute('d');
    const xs = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => +m[1]);
    assert(
      xs.every((x, i) => !i || (x - xs[i - 1]) * (xs.at(-1) - xs[0]) >= -0.5),
      'no zigzag, it bends one way only: ' + d,
    );
    assert((d.match(/C/g) || []).length <= 2, 'straight down its column, curving only at the ends: ' + d);
    deletePlan(plans.current);

    // Goals sit as low as they can, next to the activities; parents still above their sub-goals.
    fresh('Low goals');
    const top = mk('goal', { title: 'Parent' }),
      sub = mk('goal', { title: 'Sub' }),
      lone = mk('goal', { title: 'Lone' });
    const mid = mk('goal', { title: 'Mid' }),
      deep = mk('goal', { title: 'Deep' });
    rel(sub, top, 'subgoal');
    rel(mid, top, 'subgoal');
    rel(deep, mid, 'subgoal');
    save();
    setView('map');
    const y = it => Math.round($(`[data-map-node="${it.id}"]`).getBoundingClientRect().top);
    assert(y(top) < y(mid) && y(mid) < y(deep), 'a chain of sub-goals keeps its order');
    eq([y(lone), y(sub)], [y(deep), y(deep)], 'a goal with nothing below it sits in the lowest goal row');
    deletePlan(plans.current);
    return 'ok';
  });

  await step('map: right-clicking empty space opens the Add menu there; elsewhere the browser keeps its own', () => {
    const { g } = mapFixture();
    const rc = (el, x, y) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
      el.dispatchEvent(e);
      return e;
    };
    const ev = rc($('.map-wrap svg'), 300, 200);
    assert(ev.defaultPrevented && !ctxMenu.hidden, 'the menu opens instead of the browser menu');
    eq(
      [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx),
      ['new:goal', 'new:activity', 'new:state', 'new:vision'],
      'what the Add button offers',
    );
    ctxMenu.style.animation = 'none';
    const m = ctxMenu.getBoundingClientRect();
    assert(Math.abs(m.left - 300) < 1 && Math.abs(m.top - 200) < 1, `at the pointer: ${m.left},${m.top}`);
    ctxMenu.querySelector('[data-ctx="new:vision"]').click();
    assert(ctxMenu.hidden && modal.open && formCtx.kind === 'vision' && !formCtx.id, 'picking one opens its new form');
    modal.close();
    // Near the bottom right corner it stays on screen.
    rc($('.map-wrap svg'), innerWidth - 2, innerHeight - 2);
    const c = ctxMenu.getBoundingClientRect();
    assert(c.right <= innerWidth - 7 && c.bottom <= innerHeight - 7, 'kept on screen');
    closeCtxMenu();
    // A box still gets its own menu.
    rc(nodeEl(g.id), 100, 100);
    assert(!ctxMenu.hidden && !ctxMenu.dataset.add && ctxMenu.dataset.id === g.id, 'a box: its item menu');
    closeCtxMenu();
    // Outside the map's drawing, and in other views, nothing changes.
    assert(!rc($('#view'), 10, 10).defaultPrevented && ctxMenu.hidden, 'not on the controls around the map');
    setView('goals');
    assert(!rc($('#view'), 10, 10).defaultPrevented && ctxMenu.hidden, 'not in other views');
    setView('map');
  });

  await step('map: clicking a line selects it; clicking it again or double-clicking opens it', () => {
    const { g, a, b, s } = mapFixture();
    const r = relOf(a, g);
    clickEl(edge(r.id));
    assert(!modal.open, 'a click does not open the form');
    eq([ui.mapRel, ui.mapSelected], [r.id, null], 'the line is selected');
    assert(
      edge(r.id).classList.contains('sel') &&
        getComputedStyle(edge(r.id).querySelector('.edge')).filter.includes('line-glow') &&
        $('#line-glow') &&
        [...document.querySelectorAll('.map-wrap .edge-g:not(.sel) .edge')].every(
          e => getComputedStyle(e).filter === 'none',
        ),
      'drawn as selected, glowing, under the boxes',
    );
    assert(
      [...document.querySelectorAll('[data-rel-edit]')]
        .filter(e => e.dataset.relEdit !== r.id)
        .every(e => e.classList.contains('dim')),
      'other lines dimmed',
    );
    assert(
      !nodeEl(a.id).classList.contains('dim') && !nodeEl(g.id).classList.contains('dim'),
      'its two items stay lit',
    );
    assert(nodeEl(b.id).classList.contains('dim') && nodeEl(s.id).classList.contains('dim'), 'the rest dims');
    const row = $('.map-rel-selection');
    assert(
      row && row.textContent.includes('Train') && row.textContent.includes('Run a marathon'),
      'a row names the relationship',
    );
    assert(
      row.querySelector('[data-rel-open]') &&
        row.querySelector('[data-rel-remove]') &&
        row.querySelector('[data-map-clear]'),
      'with Edit, Remove and Clear (for touch screens)',
    );
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
    ui.mapSelected = a.id;
    render();
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
    assert(
      !nodeEl(g.id).classList.contains('dim') && !nodeEl(s.id).classList.contains('dim'),
      'nothing dimmed after Escape',
    );
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
    const n0 = db.relations.length,
      r = relOf(a, g),
      keep = clone(db.relations.filter(x => x.id !== r.id));
    clickEl(edge(r.id));
    let asked = 0;
    const realConfirm = window.confirm;
    window.confirm = () => {
      asked++;
      return true;
    };
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
    } finally {
      window.confirm = realConfirm;
    }
    return `${n0} → 0`;
  });

  await step('map: Delete on a selected item asks first, then deletes it with its links', () => {
    const { g, a, b, s } = mapFixture();
    const realConfirm = window.confirm;
    let question = '';
    try {
      clickEl(nodeEl(a.id));
      eq(ui.mapSelected, a.id, 'item selected');
      window.confirm = q => {
        question = q;
        return false;
      };
      assert(press('Delete', document.body), 'Delete is handled');
      eq(question, t('confirm.delete', { name: 'Train' }), 'the delete question names it');
      assert(findEntity(a.id) && relOf(a, g), 'cancel keeps it and its links');
      eq(ui.mapSelected, a.id, 'still selected after cancel');
      window.confirm = q => {
        question = q;
        return true;
      };
      press('Backspace', document.body);
      assert(!findEntity(a.id) && !relOf(a, g), 'confirm deletes it and its links');
      assert(findEntity(g.id) && relOf(b, g), 'everything else stays');
      eq(
        readPlan(plans.current).activities.map(x => x.id),
        [b.id],
        'saved',
      );
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
    } finally {
      window.confirm = realConfirm;
    }
    return question;
  });

  await step('map: Delete does nothing without a selection, while typing, with a dialog open or elsewhere', () => {
    const { g, a } = mapFixture();
    const realConfirm = window.confirm;
    let asked = 0;
    window.confirm = () => {
      asked++;
      return true;
    };
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
    } finally {
      window.confirm = realConfirm;
    }
    return 'ok';
  });

  await step('map: double-clicking an item opens its edit form; keyboard presses never count as a double-click', () => {
    const { g, a, s } = mapFixture();
    clickEl(nodeEl(a.id), 1);
    clickEl(nodeEl(a.id), 2);
    assert(modal.open && formCtx.kind === 'activity' && formCtx.id === a.id, 'double-click opens the activity');
    eq(ui.mapSelected, a.id, 'and leaves it selected');
    modal.close();
    for (const [x, kind] of [
      [g, 'goal'],
      [s, 'state'],
    ]) {
      clickEl(nodeEl(x.id), 1);
      clickEl(nodeEl(x.id), 2);
      assert(modal.open && formCtx.kind === kind && formCtx.id === x.id, `double-click opens the ${kind}`);
      modal.close();
    }
    // Two clicks on different items, or slow clicks, just select.
    ui.mapSelected = null;
    render();
    clickEl(nodeEl(a.id));
    clickEl(nodeEl(g.id));
    assert(!modal.open && ui.mapSelected === g.id, 'two items: just selects the second');
    ui.mapSelected = null;
    render();
    const realNow = performance.now.bind(performance);
    let shift = 0;
    performance.now = () => realNow() + shift;
    try {
      clickEl(nodeEl(a.id));
      shift = 2000;
      clickEl(nodeEl(a.id));
      assert(!modal.open && ui.mapSelected === null, 'a slow second click deselects as before');
    } finally {
      performance.now = realNow;
    }
    // Enter or Space on an item selects it; on the selected item they open it. Neither counts toward a double-click.
    for (const [first, second] of [
      ['Enter', 'Enter'],
      [' ', ' '],
      ['Enter', ' '],
    ]) {
      ui.mapSelected = null;
      render();
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
      ui.mapSelected = g.id;
      ui.mapRel = null;
      render();
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
    ui.mapSelected = null;
    ui.mapRel = null;
    render();
    assert(!press('Enter', document.body) && !modal.open, 'nothing selected: Enter does nothing');
    ui.mapSelected = a.id;
    render();
    const field = document.createElement('input');
    viewEl.append(field);
    field.focus();
    assert(!press(' ', field) && !modal.open, 'Space in a text field types a space');
    field.remove();
    setView('activities');
    assert(!press('Enter', document.body) && !modal.open, 'other views ignore it');
    setView('map');
    // While linking by tapping, a double tap does not open anything.
    ui.mapLinkFrom = a.id;
    render();
    clickEl(nodeEl(s.id), 1);
    assert(
      !(modal.open && formCtx.kind === 'state'),
      'a tap while linking finishes the link instead of opening the item',
    );
    if (modal.open) modal.close();
    ui.mapLinkFrom = null;
    render();
    deletePlan(plans.current);
    return 'ok';
  });

  await step('map: help and labels mention the new keys, in both languages', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      const words = { en: [/Delete/, /double-click/i, /Enter/], sl: [/Delete/, /dvojnim klik/i, /Enter/] }[code];
      for (const key of ['help.view.map', 'tour.map.text'])
        words.forEach(w => assert(w.test(t(key)), `${code} ${key} mentions ${w}`));
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
    rel(a, g, 'contributes');
    rel(b, a, 'depends');
    rel(c, b, 'depends');
    save();
    ui.tlDeps = true;
    setView('timeline');
    return { g, a, b, c };
  };
  const bar = id => $(`[data-tl-node="${id}"]`);
  const dep = id => $(`.tl-deps [data-rel-edit="${id}"]`);

  await step('timeline: double-click or Enter on the selected bar edits it; Esc deselects', () => {
    const { g, a } = tlFixture();
    clickEl(bar(a.id), 1);
    clickEl(bar(a.id), 2);
    assert(modal.open && formCtx.kind === 'activity' && formCtx.id === a.id, 'double-click opens the activity');
    eq(ui.mapSelected, a.id, 'left selected');
    modal.close();
    clickEl(bar(g.id), 1);
    clickEl(bar(g.id), 2);
    assert(modal.open && formCtx.kind === 'goal' && formCtx.id === g.id, 'double-click opens the goal');
    modal.close();
    // Enter or Space: the first selects, the next opens.
    ui.mapSelected = null;
    render();
    bar(a.id).focus();
    press('Enter', bar(a.id));
    assert(!modal.open && ui.mapSelected === a.id, 'Enter selects');
    bar(a.id).focus();
    press(' ', bar(a.id));
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
      window.confirm = q => {
        question = q;
        return false;
      };
      press('Delete', document.body);
      assert(question === t('confirm.delete', { name: 'Paint' }) && findEntity(c.id), 'asks; cancel keeps it');
      window.confirm = () => true;
      press('Backspace', document.body);
      assert(
        !findEntity(c.id) && !db.relations.some(r => r.from === c.id || r.to === c.id),
        'confirm deletes it and its links',
      );
      eq($('#toast').textContent, t('toast.deleted.activity'), 'says so');
      // Dependency arrows: clickable, with a wide hit area, and reachable with Tab.
      const r = db.relations.find(x => x.type === 'depends' && x.from === b.id);
      assert(dep(r.id), 'the arrow is a target');
      eq(getComputedStyle(dep(r.id).querySelector('.tl-dep-hit')).pointerEvents, 'stroke', 'its hit area takes clicks');
      eq(dep(r.id).getAttribute('tabindex'), '0', 'focusable');
      clickEl(dep(r.id));
      eq([ui.mapRel, ui.mapSelected], [r.id, null], 'a click selects it');
      assert(dep(r.id).classList.contains('sel'), 'drawn as selected');
      assert(
        !bar(a.id).classList.contains('dim') &&
          !bar(b.id).classList.contains('dim') &&
          bar(g.id).classList.contains('dim'),
        'its two bars lit, the rest dimmed',
      );
      assert(
        $('.map-rel-selection') && $('.map-rel-selection').textContent.includes('Build'),
        'the selection row names it',
      );
      clickEl(dep(r.id), 2);
      assert(modal.open && formCtx.kind === 'relation' && formCtx.id === r.id, 'a second click opens it');
      modal.close();
      press('Escape', document.body);
      eq(ui.mapRel, null, 'Esc deselects it');
      clickEl(dep(r.id));
      press('Delete', document.body);
      assert(
        !db.relations.some(x => x.id === r.id) && findEntity(a.id) && findEntity(b.id),
        'Delete removes the dependency, not the bars',
      );
      eq($('#toast').textContent, t('toast.relRemoved'), 'says so');
      eq(
        readPlan(plans.current).relations.some(x => x.id === r.id),
        false,
        'saved',
      );
      // With dependencies hidden there is nothing to select or delete there.
      rel(b, a, 'depends');
      save();
      const r2 = db.relations.find(x => x.type === 'depends');
      ui.mapRel = r2.id;
      ui.tlDeps = false;
      render();
      press('Delete', document.body);
      assert(
        db.relations.some(x => x.id === r2.id),
        'a hidden arrow is not deleted',
      );
      ui.tlDeps = true;
      ui.mapRel = null;
      // Typing or another view: left alone.
      clickEl(bar(a.id));
      const field = document.createElement('input');
      viewEl.append(field);
      field.focus();
      press('Delete', field);
      assert(findEntity(a.id), 'nothing deleted while typing');
      field.remove();
      setView('goals');
      press('Delete', document.body);
      assert(findEntity(a.id), 'other views ignore it');
    } finally {
      window.confirm = realConfirm;
    }
    deletePlan(plans.current);
    return question;
  });

  await step('timeline: help mentions the keys, in both languages', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const key of ['help.view.timeline'])
        [/Delete/, /Enter/, /Esc/].forEach(w => assert(w.test(t(key)), `${code} ${key} mentions ${w}`));
    }
    changeLanguage('en');
    return t('tl.hint');
  });
  /* ---------- Timeline: an activity under each of its goals; collapsible goals ---------- */

  const foldFixture = () => {
    fresh('Fold');
    const g1 = mk('goal', { title: 'G1', startDate: d(-10), deadline: d(30) });
    const g1a = mk('goal', { title: 'G1a', startDate: d(-8), deadline: d(40) });
    const g2 = mk('goal', { title: 'G2', startDate: d(-5), deadline: d(50) });
    const g3 = mk('goal', { title: 'G3', startDate: d(-1), deadline: d(60) }); // nothing under it; goals run by deadline
    const a = mk('activity', { title: 'A', startDate: d(-4), dueDate: d(10) });
    const a1 = mk('activity', { title: 'A1', startDate: d(-3), dueDate: d(5) });
    const b = mk('activity', { title: 'B', startDate: d(-2), dueDate: d(12) });
    const c = mk('activity', { title: 'C', startDate: d(11), dueDate: d(20) });
    const u = mk('activity', { title: 'U', startDate: d(1), dueDate: d(3) });
    rel(g1a, g1, 'subgoal');
    rel(a, g1, 'contributes');
    rel(a, g2, 'contributes');
    rel(a1, a, 'subactivity');
    rel(b, g1, 'contributes');
    rel(b, g1a, 'contributes');
    rel(c, g2, 'contributes');
    rel(c, a, 'depends');
    save();
    ui.tlDeps = true;
    ui.hideDone = false;
    ui.timelineGoal = '';
    setView('timeline');
    return { g1, g1a, g2, g3, a, a1, b, c, u };
  };
  const rowsText = rows => rows.map(r => (r.kind === 'group' ? `[${r.label}]` : r.item.title)).join(' ');
  const shownRows = () =>
    [...document.querySelectorAll('.tl-body .tl-row')]
      .map(r => (r.classList.contains('tl-group') ? '[group]' : r.querySelector('.tl-title').textContent))
      .join(' ');
  const fold = id => $(`[data-tl-fold="${id}"]`);
  const $$ = sel => [...document.querySelectorAll(sel)];

  await step('timeline: prerequisites with no goal of their own sit under the activity that waits for them', () => {
    fresh('Prereqs');
    const g1 = mk('goal', { title: 'G1' }),
      g2 = mk('goal', { title: 'G2' });
    const a = mk('activity', { title: 'A' }),
      b = mk('activity', { title: 'B' });
    const p = mk('activity', { title: 'P' }),
      pp = mk('activity', { title: 'PP' });
    const top = mk('activity', { title: 'Top' }),
      part = mk('activity', { title: 'Part' });
    const owned = mk('activity', { title: 'Owned' }),
      waiter = mk('activity', { title: 'Waiter' });
    rel(a, g1, 'contributes');
    rel(b, g2, 'contributes');
    rel(owned, g2, 'contributes');
    rel(a, p, 'depends');
    rel(p, pp, 'depends'); // a chain of prerequisites
    rel(part, top, 'subactivity');
    rel(a, part, 'depends'); // a prerequisite inside a tree brings the whole tree
    rel(b, p, 'depends'); // needed by work under two goals
    rel(a, owned, 'depends'); // has its own goal: stays there only
    rel(waiter, a, 'depends'); // waits for goal work, but is no prerequisite
    const rows = timelineRows(null);
    eq(rowsText(rows), `G1 A P PP Top Part G2 B P PP Owned [${t('tl.unlinked')}] Waiter`, 'rows');
    const row = (title, goal) => rows.find(r => r.item?.title === title && r.goal === goal.id);
    const ra = rows.indexOf(row('A', g1));
    eq(
      [row('P', g1).rel, row('P', g1).parent, row('P', g1).depth],
      ['depends', ra, row('A', g1).depth + 1],
      'P hangs off A',
    );
    eq(row('PP', g1).parent, rows.indexOf(row('P', g1)), 'PP hangs off P');
    eq(
      [row('Part', g1).rel, row('Part', g1).parent],
      ['subactivity', rows.indexOf(row('Top', g1))],
      'the tree keeps its shape',
    );
    eq(row('P', g1).also, ['G2'], 'listed under both goals, marked as such');
    // Each copy gets its own arrows, paired with the copy under the same goal (arrows need dates).
    [a, b, p, pp].forEach((x, k) => Object.assign(x, { startDate: d(k), dueDate: d(k + 2) }));
    ui.tlDeps = true;
    render();
    setView('timeline');
    const yOf = (title, goal) => rows.indexOf(row(title, goal)) * TL.ROW + TL.ROW / 2;
    const arrows = [...document.querySelectorAll(`.tl-deps [data-rel-edit]`)].map(g => [
      g.dataset.relEdit,
      ...g
        .querySelector('.tl-dep')
        .getAttribute('d')
        .match(/^M[\d.-]+,([\d.-]+).*?([\d.-]+)\s+H[\d.-]+$/)
        .slice(1)
        .map(Number),
    ]);
    const has = (from, to, goal) => arrows.some(([, y1, y2]) => y1 === yOf(to, goal) && y2 === yOf(from, goal));
    assert(
      ['G1', 'G2'].every((n, k) => {
        const g = [g1, g2][k];
        return has(n === 'G1' ? 'A' : 'B', 'P', g) && has('P', 'PP', g);
      }),
      'P and PP joined under each goal',
    );
    ui.tlDeps = false;
    render();
    setView('timeline');
    assert($(`[data-tl-node="${p.id}"] .tl-elbow.dash`), 'drawn with a dashed dependency line');
    assert(
      [...document.querySelectorAll('.tl-legend span')].some(x => x.textContent === relLabel('depends')),
      'the legend names it',
    );
    // A folded goal hides its prerequisites too, without sending them to the unlinked group.
    eq(rowsText(timelineRows(null, new Set([g1.id, g2.id]))), `G1 G2 [${t('tl.unlinked')}] Waiter`, 'folded');
    return rowsText(rows);
  });

  await step('timeline: an activity that serves several goals is listed under each', () => {
    const { g1, g2, a, b, c } = foldFixture();
    eq(
      rowsText(timelineRows(null)),
      `G1 A A1 B G1a B G2 A A1 C G3 [${t('tl.unlinked')}] U`,
      'under each goal, with its sub-activities',
    );
    eq(document.querySelectorAll(`[data-tl-node="${a.id}"]`).length, 2, 'two rows for A');
    const also = id => [...document.querySelectorAll(`[data-tl-node="${id}"] .tl-also`)].map(x => x.title);
    eq(
      also(a.id),
      [t('tl.alsoUnder', { goals: 'G2' }), t('tl.alsoUnder', { goals: 'G1' })],
      'each copy names the other goal',
    );
    eq(
      also(b.id),
      [t('tl.alsoUnder', { goals: 'G1a' }), t('tl.alsoUnder', { goals: 'G1' })],
      'a goal and its sub-goal',
    );
    eq(also(c.id), [], 'an activity under one goal has no mark');
    assert(
      $(`[data-tl-node="${a.id}"]`)
        .getAttribute('aria-label')
        .includes(t('tl.alsoUnder', { goals: 'G2' })),
      'screen readers hear it too',
    );
    // One item: selecting a copy lights every copy.
    clickEl($$(`[data-tl-node="${a.id}"]`)[1]);
    assert(
      [...document.querySelectorAll(`[data-tl-node="${a.id}"]`)].every(r => r.classList.contains('selected')),
      'all copies selected',
    );
    ui.mapSelected = null;
    render();
    // The dependency arrow is drawn for every copy: from each copy of A to the one row of C.
    const rowsNow = [...document.querySelectorAll('.tl-body .tl-row')];
    const rowY = id =>
      rowsNow.map((r, i) => (r.dataset.tlNode === id ? i * TL.ROW + TL.ROW / 2 : null)).filter(y => y !== null);
    const ends = [...document.querySelectorAll('.tl-deps [data-rel-edit] .tl-dep')]
      .map(p => p.getAttribute('d'))
      .map(d => [Number(d.match(/^M[\d.-]+,([\d.-]+)/)[1]), Number(d.match(/([\d.-]+)\s+H[\d.-]+$/)[1])]);
    eq(
      ends.map(e => e[0]).sort((x, y) => x - y),
      rowY(a.id),
      'an arrow starts at each copy of A',
    );
    assert(
      ends.every(e => e[1] === rowY(c.id)[0]),
      'all end at C',
    );
    // Editing a copy edits the one activity.
    openForm('activity', a.id);
    $('#f-title').value = 'A renamed';
    submitForm();
    eq(
      [...document.querySelectorAll(`[data-tl-node="${a.id}"] .tl-title`)].map(x => x.textContent),
      ['A renamed', 'A renamed'],
      'both copies follow',
    );
    eq(db.activities.filter(x => x.title === 'A renamed').length, 1, 'still one activity');
    // A goal filter shows only the goals in scope, so no mark there.
    ui.timelineGoal = g2.id;
    render();
    eq(document.querySelectorAll(`[data-tl-node="${a.id}"]`).length, 1, 'filtered to G2: one row');
    eq(also(a.id), [], 'and no mark');
    ui.timelineGoal = '';
    render();
    // Hide done hides every copy.
    b.status = 'done';
    ui.hideDone = true;
    render();
    eq(document.querySelectorAll(`[data-tl-node="${b.id}"]`).length, 0, 'done copies hidden');
    ui.hideDone = false;
    b.status = 'todo';
    render();
    return rowsText(timelineRows(null));
  });

  await step('hide done and achieved: achieved goals go too; what is under them stays', () => {
    const { g1, g1a, a, b } = foldFixture();
    const titles = () => [...document.querySelectorAll('.tl-row .tl-title')].map(x => x.textContent);
    g1.status = 'achieved';
    setToggle('hideDone', true);
    assert(
      !titles().includes('G1') && titles().includes('G1a') && titles().includes('B'),
      'timeline: G1 hidden, its sub-goal and open activity shown: ' + titles(),
    );
    eq(timelineRows(null).find(r => r.item?.id === g1a.id).depth, 0, 'its sub-goal moves up to its place');
    setView('map');
    assert(
      !$(`[data-map-node="${g1.id}"]`) && $(`[data-map-node="${g1a.id}"]`) && $(`[data-map-node="${a.id}"]`),
      'map: achieved goal hidden, the rest shown',
    );
    eq($('[data-hide-done]').textContent, t('acts.hideDone'), 'the toggle says so');
    setToggle('hideDone', false);
    assert($(`[data-map-node="${g1.id}"]`), 'shown again');
    setView('timeline');
    assert(titles().includes('G1') && b.status !== 'done', 'and on the timeline');
    changeLanguage('sl');
    eq($('[data-hide-done]').textContent, 'Skrij opravljeno in doseženo', 'Slovenian');
    changeLanguage('en');
    deletePlan(plans.current);
  });

  await step('timeline: goals collapse and expand, remembered per plan', () => {
    const { g1, g1a, g2, g3, a, b } = foldFixture();
    assert(fold(g1.id) && fold(g2.id) && fold(g1a.id), 'goals with something under them can fold');
    assert(!fold(g3.id), 'a goal with nothing under it has no fold button');
    eq(
      [fold(g1.id).getAttribute('aria-expanded'), fold(g1.id).getAttribute('aria-label')],
      ['true', t('tl.collapse', { name: 'G1' })],
      'expanded at first',
    );
    fold(g1.id).click();
    eq(shownRows(), 'G1 G2 A A1 C G3 [group] U', 'G1 folded: its activities and sub-goal hidden');
    eq(
      [fold(g1.id).getAttribute('aria-expanded'), fold(g1.id).getAttribute('aria-label')],
      ['false', t('tl.expand', { name: 'G1' })],
      'says it is folded',
    );
    assert($(`[data-tl-node="${g1.id}"] .tl-bar`), 'the goal keeps its bar');
    eq(ui.mapSelected, null, 'folding does not select the goal');
    assert(!modal.open, 'nor open it');
    const folded = timelineRows(null, tlCollapsed());
    eq(
      folded.slice(folded.findIndex(r => r.kind === 'group') + 1).map(r => r.item.title),
      ['U'],
      'B is still under a goal, so it does not move to the unlinked group',
    );
    eq(
      $$(`[data-tl-node="${a.id}"] .tl-also`).map(x => x.title),
      [t('tl.alsoUnder', { goals: 'G1' })],
      'the copy under G2 still names folded G1',
    );
    // Remembered: on redraw, per plan, and after switching plans.
    render();
    eq(fold(g1.id).getAttribute('aria-expanded'), 'false', 'kept on redraw');
    const here = plans.current;
    const other = addPlan({ name: 'Other fold', data: clone(db) });
    setView('timeline');
    eq(fold(g1.id).getAttribute('aria-expanded'), 'true', 'another plan has its own folds');
    openPlan(here);
    setView('timeline');
    eq(fold(g1.id).getAttribute('aria-expanded'), 'false', 'back in this plan, still folded');
    deletePlan(other.id);
    openPlan(here);
    setView('timeline');
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
    // Collapse all / Expand all: one button, reading Expand all only while everything is folded.
    const foldAll = () =>
      $$('[data-tl-fold-all]')
        .map(b => `${b.dataset.tlFoldAll}:${b.textContent}`)
        .join(',');
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'nothing folded: Collapse all only');
    fold(g1.id).click();
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'some folded: still Collapse all');
    $('[data-tl-fold-all="collapse"]').click();
    eq(shownRows(), 'G1 G2 G3 [group]', 'collapse all: one line per goal');
    eq(foldAll(), `expand:${t('tl.expandAll')}`, 'all folded: the button reads Expand all');
    assert(document.activeElement === $('[data-tl-fold-all]'), 'focus stays on the button');
    fold(g2.id).click();
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'one opened by hand: back to Collapse all');
    $('[data-tl-fold-all="collapse"]').click();
    $('[data-tl-fold-all="expand"]').click();
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'expanded: Collapse all again');
    // Folding each by hand (the sub-goal first, while it shows) counts too.
    for (const g of [g1a, g1, g2]) fold(g.id).click();
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'the group still open: Collapse all');
    $('[data-tl-fold="rest"]').click();
    eq(foldAll(), `expand:${t('tl.expandAll')}`, 'folded one by one: Expand all too');
    $('[data-tl-fold-all="expand"]').click();
    $('[data-tl-fold-all="collapse"]').click();
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
      assert(
        t('tl.collapse', { name: 'X' }).includes('X') &&
          t('tl.expand', { name: 'X' }).includes('X') &&
          t('tl.alsoUnder', { goals: 'X' }).includes('X'),
        `${code} names`,
      );
      assert(/↻/.test(t('tl.hint')) || /fold|collapse|strn/i.test(t('tl.hint')), `${code} hint mentions folding`);
      assert(/collapse|strn/i.test(t('help.view.timeline')), `${code} help mentions folding`);
    }
    changeLanguage('en');
    return t('tl.alsoUnder', { goals: 'G1, G2' });
  });
  /* ---------- Touch: the first tap after a long-press counts ---------- */

  await step('touch: after a long-press, the first tap on a menu item works (no click ends the press)', async () => {
    fresh('Long press');
    const g = mk('goal', { title: 'Goal' }),
      g2 = mk('goal', { title: 'Other goal' });
    save();
    setView('map');
    const node = id => $(`[data-map-node="${id}"]`);
    const touch = (type, el, x = 50, y = 50) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 7,
          clientX: x,
          clientY: y,
        }),
      );
    const tapMenu = act => {
      const b = ctxMenu.querySelector(`[data-ctx="${act}"]`);
      touch('pointerdown', b);
      touch('pointerup', b);
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
      ui.mapSelected = null;
      ui.mapLinkFrom = null;
      render();
      await longPress(node(g2.id), withClick);
      assert(
        !ctxMenu.hidden && ctxMenu.dataset.id === g2.id,
        `${withClick ? 'with' : 'without'} a lifting click: menu open`,
      );
      eq(ui.mapSelected, null, 'the press itself does not select the box');
      tapMenu('link');
      assert(
        ui.mapLinkFrom === g2.id && ctxMenu.hidden,
        `${withClick ? 'with' : 'without'} a lifting click: one tap on “Link to…” starts linking`,
      );
      ui.mapLinkFrom = null;
      render();
      // Any menu item, not only Link to…
      await longPress(node(g.id), withClick);
      tapMenu('edit');
      assert(
        modal.open && formCtx.id === g.id,
        `${withClick ? 'with' : 'without'} a lifting click: one tap on Edit opens it`,
      );
      modal.close();
    }
    // A scroll that arrives just after the menu opens (one a redraw made before the press, delivered on
    // the next frame) does not close it; a scroll later does.
    ui.mapSelected = null;
    render();
    await longPress(node(g2.id), false);
    document.dispatchEvent(new Event('scroll'));
    $('.map-wrap').dispatchEvent(new Event('scroll'));
    assert(!ctxMenu.hidden, 'a scroll right after opening leaves the item menu open');
    await new Promise(r => setTimeout(r, 450));
    // On a short screen (a phone held sideways) the menu scrolls inside itself, and that keeps it open.
    ctxMenu.style.maxHeight = '120px';
    assert(
      ctxMenu.scrollHeight > ctxMenu.clientHeight && getComputedStyle(ctxMenu).overflowY === 'auto',
      'a menu taller than the screen scrolls',
    );
    assert(ctxMenu.querySelector('button').offsetHeight >= 30, 'its items keep their height');
    ctxMenu.scrollTop = 40;
    ctxMenu.dispatchEvent(new Event('scroll'));
    assert(!ctxMenu.hidden && ctxMenu.scrollTop > 0, 'scrolling the menu leaves it open');
    ctxMenu.style.maxHeight = '';
    $('.map-wrap').dispatchEvent(new Event('scroll'));
    assert(ctxMenu.hidden, 'a scroll later closes it');
    // A short tap still selects as before.
    ui.mapSelected = null;
    render();
    touch('pointerdown', node(g.id));
    touch('pointerup', node(g.id));
    node(g.id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    eq(ui.mapSelected, g.id, 'a short tap selects');
    deletePlan(plans.current);
    return 'ok';
  });
  /* ---------- A menu for relationship lines: long-press, right-click or the menu key ---------- */

  await step('lines: a long-press, right-click or menu key opens Edit, Remove and Deselect', async () => {
    fresh('Line menu');
    const g = mk('goal', { title: 'Goal' }),
      a = mk('activity', { title: 'Act' }),
      b = mk('activity', { title: 'Other' });
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    save();
    setView('map');
    const r = () => db.relations.find(x => x.from === a.id);
    const line = () => $(`[data-rel-edit="${r().id}"]`);
    const touch = (type, el) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 9,
          clientX: 60,
          clientY: 60,
        }),
      );
    const longPress = async el => {
      touch('pointerdown', el);
      await new Promise(res => setTimeout(res, LONG_PRESS_MS + 80));
      touch('pointerup', el);
    };
    const tapMenu = act => {
      const btn = ctxMenu.querySelector(`[data-ctx="${act}"]`);
      touch('pointerdown', btn);
      touch('pointerup', btn);
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    };
    const items = () => [...ctxMenu.querySelectorAll('[data-ctx]')].map(x => x.textContent);

    await longPress(line());
    assert(!ctxMenu.hidden, 'long-press opens a menu');
    eq(items(), [t('btn.edit'), t('btn.remove'), t('btn.deselect')], 'the three options');
    // Opened by a finger, the menu takes focus but marks no item; the arrow keys still reach them.
    const btns = () => [...ctxMenu.querySelectorAll('[data-ctx]')];
    assert(document.activeElement === ctxMenu, 'the menu itself focused');
    eq(
      btns().map(b => getComputedStyle(b).backgroundColor),
      btns().map(() => 'rgba(0, 0, 0, 0)'),
      'no item marked',
    );
    press('ArrowUp', ctxMenu);
    assert(document.activeElement === btns().at(-1), 'Up from the menu: last item');
    ctxMenu.focus();
    press('ArrowDown', ctxMenu);
    assert(document.activeElement === btns()[0], 'Down from the menu: first item');
    assert(
      ctxMenu.textContent.includes('Act') &&
        ctxMenu.textContent.includes('Goal') &&
        ctxMenu.textContent.includes(t('kind.relation')),
      'names the relationship',
    );
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
    assert(
      ctxMenu.hidden && modal.open && formCtx.kind === 'relation' && formCtx.id === r().id,
      'one tap on Edit opens it',
    );
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
    assert(
      document.activeElement === ctxMenu.querySelector('[data-ctx]'),
      'from the keyboard, the first item is focused',
    );
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
    assert(
      !ctxMenu.hidden && ctxMenu.querySelector('[data-ctx="edit"]') && !ctxMenu.querySelector('[data-ctx="rel-edit"]'),
      'a box still opens the item menu',
    );
    closeCtxMenu();

    // Timeline dependency arrows have the same menu.
    rel(b, a, 'depends');
    a.startDate = d(-3);
    a.dueDate = d(3);
    b.startDate = d(4);
    b.dueDate = d(9);
    g.startDate = d(-5);
    g.deadline = d(30);
    save();
    ui.tlDeps = true;
    setView('timeline');
    const dep = $('.tl-deps [data-rel-edit]');
    await longPress(dep);
    assert(!ctxMenu.hidden && items().length === 3, 'timeline arrow: menu');
    eq(
      ctxMenu.querySelector('.ctx-head strong').title,
      relText(db.relations.find(x => x.type === 'depends')),
      'a line menu heading shows the whole text on hover',
    );
    tapMenu('rel-remove');
    assert(!db.relations.some(x => x.type === 'depends'), 'timeline arrow removed');
    deletePlan(plans.current);
    return items().join(', ');
  });

  await step('map and timeline hints are short; the details are in the help', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const k of ['map.hint', 'tl.hint']) assert(t(k).length <= 150, `${code} ${k} is ${t(k).length} characters`);
      for (const k of ['help.view.map', 'help.view.timeline'])
        [/Delete/, /Enter/, /Esc/, /Ctrl/].forEach(w => assert(w.test(t(k)), `${code} ${k} mentions ${w}`));
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
    rel(a, g, 'contributes');
    rel(m, g, 'contributes');
    save();
    ui.tlPx = TL.ZOOM.week;
    ui.tlDeps = true;
    setView('timeline');
    const px = ui.tlPx;
    // Selected with its dates open for changing, as a click on its bar does.
    const sel = id => {
      ui.mapSelected = ui.tlDates = id;
      ui.mapRel = null;
      render();
    };
    const row = id => $(`[data-tl-node="${id}"]`);
    const mouse = (type, el, x, y = 100) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 3,
          pointerType: 'mouse',
          button: 0,
          clientX: x,
          clientY: y,
        }),
      );
    const touch = (type, el, x, y = 100) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 4,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
        }),
      );
    const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    // A single click, not read as the second of a double-click.
    const click1 = el => {
      lastNodeClick = { id: null, t: 0 };
      click(el);
    };
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const drag = (el, days, steps = 3) => {
      mouse('pointerdown', el, 400);
      for (let k = 1; k <= steps; k++) mouse('pointermove', document, 400 + (days * px * k) / steps);
      mouse('pointerup', document, 400 + days * px);
      click(el);
    };

    // Only the selected item can be dragged, and only once its bar (not just its row) was clicked.
    assert(!$('[data-tl-drag]'), 'nothing selected: nothing to drag');
    click1(row(a.id).querySelector('.tl-label'));
    assert(ui.mapSelected === a.id && row(a.id).classList.contains('selected'), 'a click on the row selects it');
    assert(!$('[data-tl-drag]') && !$('.tl-grip'), 'but offers no dates to drag');
    assert(
      viewEl.textContent.includes(t('tl.datesHint')) && !viewEl.textContent.includes(t('tl.dragHint')),
      'the hint says to tap the bar',
    );
    click1(row(a.id).querySelector('.tl-bar'));
    assert(ui.mapSelected === a.id && ui.tlDates === a.id, 'a click on its bar keeps it selected, now with its dates');
    assert(
      row(a.id).querySelector('.tl-bar.tl-drag') && row(a.id).querySelectorAll('.tl-grip').length === 2,
      'grips appear',
    );
    click1(row(a.id).querySelector('.tl-grip'));
    assert(!ui.mapSelected && !ui.tlDates, 'a grip is part of the bar: a second click there deselects');
    click1(row(a.id).querySelector('.tl-bar'));
    click1(row(a.id).querySelector('.tl-label'));
    assert(ui.mapSelected === a.id && !ui.tlDates && !$('.tl-grip'), 'a click on the row goes back to selecting only');
    click1(row(a.id).querySelector('.tl-bar'));
    click(row(a.id).querySelector('.tl-bar'));
    assert(modal.open, 'a double-click on the bar still edits');
    modal.close();
    ui.mapSelected = ui.tlDates = a.id;
    render();
    click1(row(a.id).querySelector('.tl-bar'));
    assert(!ui.mapSelected && !ui.tlDates, 'a second click on the bar deselects');
    click1(row(m.id).querySelector('.tl-milestone'));
    assert(ui.tlDates === m.id && row(m.id).querySelector('.tl-milestone.tl-drag'), 'a milestone counts as its bar');
    // Selected another way (the menu, Show in): selecting only.
    ui.mapSelected = null;
    render();
    runCtxAction('highlight', a.id);
    assert(ui.mapSelected === a.id && !$('[data-tl-drag]'), 'highlighting from the menu: no dates');
    // On a touch screen, a long-press on the bar of a row that is only selected opens the menu.
    touch('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    await wait(LONG_PRESS_MS + 80);
    touch('pointerup', document, 400);
    assert(
      !ctxMenu.hidden && !$('.tl-scroll').classList.contains('tl-dragging'),
      'long-press on a selected row: the menu, not a drag',
    );
    closeCtxMenu();
    await wait(20);
    sel(a.id);
    assert(
      row(a.id).querySelector('.tl-bar.tl-drag') && row(a.id).querySelectorAll('.tl-grip').length === 2,
      'the selected bar and its two grips',
    );
    assert(viewEl.textContent.includes(t('tl.dragHint')), 'the hint says how');

    // Moving the whole bar: the view follows during the drag, before it is let go.
    const left0 = parseFloat(row(a.id).querySelector('.tl-bar').style.left);
    mouse('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    mouse('pointermove', document, 402);
    eq(a.startDate, now, 'a 2px wobble does not drag');
    mouse('pointermove', document, 400 + 3 * px + 3);
    eq(parseFloat(row(a.id).querySelector('.tl-bar').style.left), left0 + 3 * px, 'the bar follows at once');
    eq(
      row(a.id).querySelector('.tl-dates').textContent,
      `${fmtDate(addDays(now, 3))} – ${fmtDate(addDays(now, 8))}`,
      'its dates follow at once',
    );
    eq(a.startDate, now, 'not saved until let go');
    eq(
      $('.tl-drag-tip')?.textContent,
      `${fmtDate(addDays(now, 3))} – ${fmtDate(addDays(now, 8))}`,
      'a label above shows the new dates',
    );
    const tipR = $('.tl-drag-tip').getBoundingClientRect(),
      barR = row(a.id).querySelector('.tl-bar').getBoundingClientRect();
    assert(tipR.bottom <= barR.top && tipR.width > 0, 'the label sits above the bar');
    mouse('pointerup', document, 400 + 3 * px + 3);
    click(row(a.id));
    eq([a.startDate, a.dueDate], [addDays(now, 3), addDays(now, 8)], 'moved by three days');
    eq(ui.mapSelected, a.id, 'still selected after the drag');
    assert(
      JSON.parse(localStorage.getItem(planKey(plans.current))).activities.find(x => x.id === a.id).startDate ===
        addDays(now, 3),
      'saved',
    );
    assert(row(a.id).querySelector('.tl-bar.tl-drag'), 'redrawn and still draggable');

    assert(!$('.tl-drag-tip'), 'the label goes when the bar is let go');
    // A grip changes one end only, and never past the other end; the label names that date.
    mouse('pointerdown', row(a.id).querySelector('[data-tl-edge="end"]'), 400);
    mouse('pointermove', document, 400 + 6);
    eq(
      $('.tl-drag-tip')?.textContent,
      `${t('f.dueDate')}: ${fmtDate(addDays(now, 8))}`,
      'the label shows from the start of the drag',
    );
    mouse('pointermove', document, 400 + 2 * px);
    eq(
      $('.tl-drag-tip').textContent,
      `${t('f.dueDate')}: ${fmtDate(addDays(now, 10))}`,
      'end grip: the label names the due date',
    );
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
    eq(
      $('.tl-drag-tip').textContent,
      `${t('f.deadline')}: ${fmtDate(addDays(now, 21))}`,
      'the end of a goal is its deadline',
    );
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
    eq(row(a.id).querySelector('.tl-dates').textContent, 'Tomorrow – tomorrow', 'Esc: drawn where it was');
    eq(ui.mapSelected, a.id, 'Esc during a drag keeps the selection');

    // A plain click on the selected bar still deselects it, and nothing moves.
    const before = JSON.stringify(a);
    mouse('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    mouse('pointerup', document, 400);
    click1(row(a.id).querySelector('.tl-bar'));
    eq(ui.mapSelected, null, 'a click deselects');
    eq(JSON.stringify(a), before, 'a click changes nothing');

    // A milestone (one date) moves that date.
    sel(m.id);
    assert(
      row(m.id).querySelector('.tl-milestone.tl-drag') && !row(m.id).querySelector('.tl-grip'),
      'a milestone moves whole',
    );
    drag(row(m.id).querySelector('.tl-milestone'), -2);
    eq([m.startDate || '', m.dueDate], ['', addDays(now, 6)], 'the milestone moved, no start date added');

    // A routine that runs a set number of times only moves; its end follows its start.
    sel(r.id);
    assert(
      !row(r.id).querySelector('.tl-grip') && viewEl.textContent.includes(t('tl.dragHintMove')),
      'no grips on a counted routine',
    );
    drag(row(r.id).querySelector('.tl-bar'), 2);
    eq([r.startDate, r.dueDate], [addDays(now, 2), addDays(now, 6)], 'the routine moved with its end');

    // The drag stops at the ends of the timeline as drawn.
    sel(a.id);
    const to = Number($('.tl-scroll').dataset.to);
    drag(row(a.id).querySelector('.tl-bar'), 5000);
    eq(a.dueDate, dayStr(to), 'stops at the end of the timeline');

    // Unselected bars pan as before.
    ui.mapSelected = null;
    render();
    const scroll = $('.tl-scroll');
    scroll.setPointerCapture = () => {}; // a synthetic pointer cannot be captured
    scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
    const sl = scroll.scrollLeft;
    mouse('pointerdown', row(g.id).querySelector('.tl-bar'), 400);
    mouse('pointermove', document, 300);
    mouse('pointerup', document, 300);
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

  await step('timeline: a routine on set days marks each one done, missed or to come; a flexible one none', () => {
    fresh('Routine days');
    const g = mk('goal', { startDate: d(-20), deadline: d(30) });
    // Every day from 6 days ago to 3 days ahead: two done, today not yet.
    const a = mk('activity', {
      title: 'Stretch',
      repeat: { every: 1, unit: 'day' },
      startDate: d(-6),
      dueDate: d(3),
      checkins: { [d(-6)]: 1, [d(-2)]: 1 },
    });
    const open = mk('activity', { title: 'Weigh in', repeat: { every: 1, unit: 'week' }, startDate: d(-14) });
    const flex = mk('activity', { title: 'Run', repeat: { times: 3, per: 'week' }, startDate: d(-6), dueDate: d(3) });
    [a, open, flex].forEach(x => rel(x, g, 'contributes'));
    save();
    setView('timeline');
    ui.tlPx = TL.ZOOM.week;
    render();
    const marks = id => [...$(`[data-tl-node="${id}"]`).querySelectorAll('.tl-day')];
    const kinds = id => marks(id).map(m => m.classList[1]);
    eq(
      kinds(a.id),
      ['done', 'missed', 'missed', 'missed', 'done', 'missed', 'due', 'due', 'due', 'due'],
      'each day in order',
    );
    const from = Number($('.tl-scroll').dataset.from),
      x0 = Number(marks(a.id)[0].style.left.slice(0, -2));
    assert(Math.abs(x0 - ((dayNum(d(-6)) - from) * TL.ZOOM.week + 1)) < 0.01, `on its own day: ${x0}`);
    eq(marks(flex.id).length, 0, 'a flexible routine has no set days');
    const ends = Number($('.tl-scroll').dataset.to),
      weeks = kinds(open.id);
    assert(
      weeks.length === Math.floor((ends - dayNum(d(-14))) / 7) + 1 && weeks.slice(0, 2).join() === 'missed,missed',
      `without an end: every week to the timeline's end (${weeks.length})`,
    );
    // Narrow days merge into a band; the legend names the colours.
    ui.tlPx = TL.MIN;
    render();
    const w = marks(a.id).map(m => m.style.width);
    assert(
      w.every(x => x === `${TL.MIN}px`),
      `merged: ${w[0]}`,
    );
    eq(
      [...$$('.tl-legend .swatch.tl-day')].map(s => s.classList[2]),
      ['done', 'missed', 'due'],
      'legend',
    );
    a.repeat = { times: 3, per: 'week' };
    open.repeat = { times: 1, per: 'week' };
    save();
    render();
    assert(!$('.tl-legend .tl-day'), 'no legend without routines on set days');
    ui.tlPx = TL.ZOOM.month;
    return weeks.length + ' weeks';
  });

  await step('pinch: zooming the timeline or the map with two fingers opens no menu', async () => {
    fresh('Pinch');
    const g = mk('goal', { title: 'Goal', startDate: d(-5), deadline: d(30) });
    const a = mk('activity', { title: 'First', startDate: d(-2), dueDate: d(10) }),
      b = mk('activity', { title: 'Second', startDate: d(1), dueDate: d(20) });
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    save();
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const ptr = (type, el, id, x, y) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: id,
          isPrimary: id === 31,
          clientX: x,
          clientY: y,
        }),
      );
    const tch = (type, el, fingers) =>
      el.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches:
            type === 'touchend'
              ? []
              : fingers.map(([target, x, y], i) => new Touch({ identifier: i, target, clientX: x, clientY: y })),
        }),
      );
    // Two fingers down (each on its own item, or the second off any item), held, spread, lifted.
    const pinchOn = async (el1, el2) => {
      const r1 = el1.getBoundingClientRect(),
        r2 = el2.getBoundingClientRect();
      const f1 = [el1, r1.left + 20, r1.top + 5],
        f2 = [el2, r2.left + 30, r2.top + 5];
      ptr('pointerdown', el1, 31, f1[1], f1[2]);
      tch('touchstart', el1, [f1]);
      ptr('pointerdown', el2, 32, f2[1], f2[2]);
      tch('touchstart', el2, [f1, f2]);
      await wait(LONG_PRESS_MS + 80);
      // Phones may also report the still finger as a long-press.
      const cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: f1[1], clientY: f1[2] });
      el1.dispatchEvent(cm);
      // Checked while the fingers are still: zooming redraws the view, which would close a menu.
      const menu = !ctxMenu.hidden,
        prevented = cm.defaultPrevented;
      tch('touchmove', el1, [f1, [el2, f2[1] + 60, f2[2]]]);
      await wait(20);
      ptr('pointerup', el2, 32, f2[1], f2[2]);
      tch('touchend', el2, []);
      ptr('pointerup', el1, 31, f1[1], f1[2]);
      tch('touchend', el1, []);
      await wait(LONG_PRESS_MS + 80);
      return { menu: menu || !ctxMenu.hidden, prevented };
    };
    setView('timeline');
    ui.mapSelected = null;
    render();
    const row = id => $(`[data-tl-node="${id}"]`);
    let px = ui.tlPx;
    let res = await pinchOn(row(a.id), row(b.id));
    assert(!res.menu, 'two fingers on two rows: no menu');
    assert(res.prevented, 'the browser menu is held back too');
    assert(ui.tlPx > px, `and the timeline zoomed (${px} → ${ui.tlPx})`);
    res = await pinchOn(row(a.id), $('.tl-scroll .tl-scale') || $('.tl-scroll'));
    assert(!res.menu, 'second finger off any row: no menu');
    // With a bar selected, a pinch that starts on it does not pick it up.
    ui.mapSelected = ui.tlDates = a.id;
    render();
    const start = a.startDate;
    res = await pinchOn(row(a.id).querySelector('.tl-bar'), row(b.id));
    assert(
      !res.menu && !tlDrag && !$('.tl-scroll').classList.contains('tl-dragging'),
      'selected bar: not picked up, no menu',
    );
    eq(a.startDate, start, 'its dates stay');
    // The map, the same.
    setView('map');
    ui.mapSelected = null;
    render();
    px = ui.mapScale;
    res = await pinchOn($(`[data-map-node="${a.id}"]`), $(`[data-map-node="${b.id}"]`));
    assert(!res.menu, 'map: no menu');
    // One finger held still is still a long-press.
    const node = $(`[data-map-node="${a.id}"]`);
    ptr('pointerdown', node, 31, 50, 50);
    await wait(LONG_PRESS_MS + 80);
    ptr('pointerup', node, 31, 50, 50);
    assert(!ctxMenu.hidden && ctxMenu.dataset.id === a.id, 'a one-finger long-press still opens the menu');
    closeCtxMenu();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    deletePlan(plans.current);
    return `map ${px} → ${ui.mapScale}`;
  });

  await step('touch: tapping or long-pressing a line or box shows no tap highlight box', () => {
    loadSample();
    const clear = el => getComputedStyle(el).webkitTapHighlightColor;
    const out = [];
    for (const v of ['map', 'timeline']) {
      setView(v);
      if (v === 'timeline') {
        ui.tlDeps = true;
        render();
      }
      const els = [...viewEl.querySelectorAll('[data-rel-edit], [data-map-node], [data-tl-node]')];
      assert(
        els.some(el => el.matches('[data-rel-edit]')),
        `${v}: has lines`,
      );
      const shown = els.filter(el => clear(el) !== 'rgba(0, 0, 0, 0)');
      assert(!shown.length, `${v}: ${shown.length} with a highlight, e.g. ${shown[0] && clear(shown[0])}`);
      const line = viewEl.querySelector('[data-rel-edit]');
      line.focus();
      const cs = getComputedStyle(line);
      assert(
        document.activeElement === line && cs.outlineStyle === 'none',
        `${v}: a focused line draws no box (${cs.outlineStyle})`,
      );
      out.push(`${v}: ${els.length}`);
    }
    // Elsewhere the browser's highlight is untouched.
    setView('dashboard');
    eq(clear(viewEl.querySelector('.row') || viewEl), clear(document.body), 'other views keep the browser default');
    deletePlan(plans.current);
    return out.join(', ');
  });

  await step('item menu: show in another view, selected there', () => {
    fresh('Show in');
    changeLanguage('en');
    const g = mk('goal', { startDate: d(-5), deadline: d(30) });
    const a = mk('activity', { startDate: d(-2), dueDate: d(4) });
    const done = mk('activity', { dueDate: d(-1), status: 'done' });
    const s = mk('state', {
      value: 4,
      date: d(-1),
      history: [
        { date: d(-9), value: 2 },
        { date: d(-1), value: 4 },
      ],
    });
    const bare = mk('state');
    rel(a, g, 'contributes');
    rel(done, g, 'contributes');
    rel(s, g, 'measures');
    const rightClick = el => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 });
      el.dispatchEvent(e);
      assert(e.defaultPrevented && !ctxMenu.hidden, `menu on ${el.className || el.tagName}`);
      return [...ctxMenu.querySelectorAll('[data-ctx^="show:"]')].map(b => b.dataset.ctx.slice(5));
    };
    const pick = view => ctxMenu.querySelector(`[data-ctx="show:${view}"]`).click();
    // Goals view → map: the box is selected and focused, its neighbours stay lit.
    setView('goals');
    eq(rightClick($(`.card[data-open="${g.id}"]`)), ['map', 'timeline'], 'goal card');
    const showMap = ctxMenu.querySelector('[data-ctx="show:map"]');
    assert(
      showMap.textContent === t('nav.map') &&
        showMap.querySelector('svg').outerHTML === $('.nav-item[data-view="map"] svg').outerHTML,
      'the map icon and name',
    );
    assert(
      showMap.getAttribute('aria-label') === t('ctx.showInView', { view: t('nav.map') }) &&
        showMap.title === 'Show in Map view',
      'named in full',
    );
    ctxMenu.querySelector('[data-ctx-sub]').click();
    const box = showMap.querySelector('svg').getBoundingClientRect();
    assert(
      box.width === 18 && box.height === 18 && getComputedStyle(showMap.querySelector('svg')).fill === 'none',
      'icon drawn like in the navigation',
    );
    const all = () => [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
    eq(
      all(),
      [
        'edit',
        'status:achieved',
        'add:goal:subgoal',
        'add:activity:contributes',
        'show:map',
        'show:timeline',
        'link',
        'delete',
      ],
      'goal options: no highlight or focus outside the map and timeline',
    );
    pick('map');
    const node = $(`[data-map-node="${g.id}"]`);
    assert(ui.view === 'map' && ui.mapSelected === g.id && ctxMenu.hidden, 'map, goal selected');
    assert(
      node.querySelector('rect').style.strokeWidth === '' && document.activeElement === node,
      'box drawn selected and focused',
    );
    assert(
      node.classList.contains('sel') &&
        [...document.querySelectorAll('.map-wrap .node.sel')].length === 1 &&
        (() => {
          const lift = getComputedStyle(node.querySelector('.node-lift')),
            other = getComputedStyle($('.map-wrap .node:not(.sel) .node-lift'));
          return (
            lift.stroke === 'none' &&
            lift.filter.includes('node-glow') &&
            lift.fill ===
              getComputedStyle(node)
                .getPropertyValue('--tint')
                .trim()
                .replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${[r, g, b].map(h => parseInt(h, 16)).join(', ')})`) &&
            other.filter === 'none'
          );
        })() &&
        $('#node-glow feComposite[operator="out"]'),
      'only the selected box glows, in its own colour, outside its face, with no outline',
    );
    assert(
      [...document.querySelectorAll('.map-wrap .node')].every(n => n.querySelector('.node-lift')) &&
        [...document.querySelectorAll('.map-wrap marker')].every(
          m => m.getAttribute('markerUnits') === 'userSpaceOnUse',
        ),
      'every box can glow; arrowheads keep one size whatever the line width',
    );
    // Under each box's face, its glass slab: one drawing per colour and thickness, defined once.
    const boxes = [...document.querySelectorAll('.map-wrap .node')],
      uses = boxes.map(n => n.querySelector('use'));
    assert(
      uses.every(
        (u, i) =>
          u &&
          u.nextElementSibling === boxes[i].querySelector('rect') &&
          document.querySelector(u.getAttribute('href')),
      ),
      'every box has its slab, right under its face',
    );
    const slabs = [...document.querySelectorAll('.map-wrap defs > g[id^="glass-"]')];
    eq(slabs.length, new Set(uses.map(u => u.getAttribute('href'))).size, 'one slab per colour and thickness used');
    assert(
      [...document.querySelectorAll('.map-wrap filter')].map(f => f.id).join() === 'node-glow,line-glow' &&
        [...document.querySelectorAll('.map-wrap .node:not(.sel) *')].every(
          x => getComputedStyle(x).filter === 'none',
        ) &&
        getComputedStyle(node.querySelector('rect')).stroke === 'none',
      'no edge; the only blur is the glow of what is selected',
    );
    // Goals are cut from thicker glass; the slab reaches down and to the right of the face, and casts no shadow.
    const reach = n => {
      const b = n.querySelector('use').getBBox();
      return [b.x + b.width, b.y + b.height];
    };
    const goalBox = boxes.find(n => n.classList.contains('goal')),
      actBox = boxes.find(n => n.classList.contains('activity'));
    assert(
      reach(actBox)[0] > MAP.NW && reach(actBox)[1] > MAP.NH && reach(goalBox)[1] > reach(actBox)[1],
      `goals thicker: ${reach(goalBox)} vs ${reach(actBox)}`,
    );
    assert(
      slabs.every(g => !g.querySelector('[opacity]')) &&
        reach(goalBox)[1] <= MAP.NH + GLASS.DEPTH.goal + 0.5 &&
        reach(actBox)[0] <= MAP.NW + GLASS.DEPTH.other + 0.5,
      `no cast shadow: ${reach(goalBox)} vs ${reach(actBox)}`,
    );
    eq(
      [actBox, goalBox].map(n => getComputedStyle(n.querySelector('text')).fontWeight),
      ['400', '500'],
      'box titles in lighter type',
    );
    // The side is lit from the left: the bottom (shaded from the corner to its left end) is lighter at its left end,
    // and the right side is darker still. Each is one strip with a gradient; the corners are small pieces.
    const slab = goalBox.querySelector('use').getAttribute('href'),
      lums = run =>
        [...document.querySelectorAll(`${slab}-${run} stop`)].map(x =>
          x
            .getAttribute('stop-color')
            .match(/\d+/g)
            .reduce((sum, v) => sum + +v, 0),
        );
    const bottom = lums('b'),
      right = lums('r');
    assert(
      bottom.length > 10 &&
        right.length > 5 &&
        bottom.at(-1) > bottom[0] &&
        Math.max(...right) < bottom.at(-1) &&
        $(slab).querySelectorAll('path').length < 20,
      `side shaded by the light: bottom ${bottom[0]} → ${bottom.at(-1)}, right ${Math.max(...right)}`,
    );
    // Lines meet a box's bottom below its glass, so no arrowhead hides under the slab.
    const at = b =>
      b
        .getAttribute('transform')
        .match(/[-\d.]+/g)
        .map(Number);
    const ends = [...document.querySelectorAll('.map-wrap .edge')].flatMap(e => {
      const v = e
        .getAttribute('d')
        .match(/[-\d.]+/g)
        .map(Number);
      return [v.slice(0, 2), v.slice(-2)];
    });
    const hidden = ends.filter(([x, y]) =>
      boxes.some(b => {
        const [bx, by] = at(b),
          d = b.classList.contains('goal') ? GLASS.DEPTH.goal : GLASS.DEPTH.other;
        return x > bx && x < bx + MAP.NW && y > by + MAP.NH - 0.5 && y < by + MAP.NH + d - 0.5;
      }),
    );
    eq(hidden, [], 'no line ends under a slab');
    // Every line ends with a straight stretch, so its arrowhead sits in line with it; the line stops inside the
    // arrowhead's wide back (TIP short of where it points), so even a thick line never shows past the head's tip.
    const bent = [...document.querySelectorAll('.map-wrap .edge')]
      .map(e => e.getAttribute('d'))
      .filter(d => {
        const v = d.match(/[-\d.]+/g).map(Number),
          [x1, y1, x2, y2] = v.slice(-4);
        return !/L[-\d.]+,[-\d.]+$/.test(d) || Math.hypot(x2 - x1, y2 - y1) < MAP.LEAD - MAP.TIP - 0.5;
      });
    eq(bent, [], 'lines end straight into their arrowheads');
    assert(
      [...document.querySelectorAll('.map-wrap marker')].every(m => +m.getAttribute('refX') === 10 - MAP.TIP),
      'arrowheads reach the rest of the way',
    );
    // Down the layers a line stops exactly TIP short of the box (or slab) it points at, so the head's tip just touches it.
    const tipGaps = [...document.querySelectorAll('.map-wrap .edge')]
      .map(e =>
        e
          .getAttribute('d')
          .match(/[-\d.]+/g)
          .map(Number)
          .slice(-4),
      )
      .filter(([x1, , x2]) => x1 === x2)
      .map(([, , x, y]) =>
        Math.min(
          ...boxes
            .filter(b => x > at(b)[0] && x < at(b)[0] + MAP.NW)
            .flatMap(b => {
              const by = at(b)[1],
                d = b.classList.contains('goal') ? GLASS.DEPTH.goal : GLASS.DEPTH.other;
              return [Math.abs(y - by), Math.abs(y - (by + MAP.NH + d))];
            }),
        ),
      );
    assert(tipGaps.length && tipGaps.every(g => Math.abs(g - MAP.TIP) < 0.01), `lines stop TIP short: ${tipGaps}`);
    // Lines are fine and their colours muted toward grey, arrowheads and the legend's keys alike.
    const lines = [...document.querySelectorAll('.map-wrap .edge')];
    assert(
      lines.every(e => parseFloat(e.style.strokeWidth) <= 1.6 && e.style.stroke.includes('color-mix')) &&
        [...document.querySelectorAll('.map-wrap marker path, .rel-toggle i')].every(x =>
          x.getAttribute('style').includes('color-mix'),
        ),
      'fine, muted lines',
    );
    assert(
      [...document.querySelectorAll('.map-wrap .col-label')].every(
        l => l.compareDocumentPosition($('.map-wrap .edge-g')) & Node.DOCUMENT_POSITION_PRECEDING,
      ),
      'band labels drawn over the lines',
    );
    assert(!$(`[data-map-node="${a.id}"]`).classList.contains('dim'), 'neighbours not dimmed');
    // Map → timeline: the same item stays selected; a different one replaces the selection.
    rightClick(node);
    eq(
      all(),
      [
        'edit',
        'highlight',
        'focus',
        'status:achieved',
        'add:goal:subgoal',
        'add:activity:contributes',
        'show:goals',
        'show:timeline',
        'link',
        'delete',
      ],
      'goal options on the map',
    );
    closeCtxMenu();
    eq(rightClick($(`[data-map-node="${a.id}"]`)), ['activities', 'timeline'], 'activity box');
    pick('timeline');
    const row = $(`[data-tl-node="${a.id}"]`);
    assert(
      ui.view === 'timeline' &&
        ui.mapSelected === a.id &&
        row.classList.contains('selected') &&
        document.activeElement === row,
      'timeline row selected',
    );
    assert(!row.querySelector('.tl-drag'), 'its dates are not offered for dragging yet');
    // Timeline → activities: the card is brought into view and glows.
    eq(rightClick(row), ['activities', 'map'], 'timeline row');
    pick('activities');
    const card = $(`.card[data-open="${a.id}"]`);
    assert(ui.view === 'activities' && card.classList.contains('flash'), 'card flashes');
    card.dispatchEvent(new Event('animationend'));
    assert(!card.classList.contains('flash'), 'and stops');
    // States: graphs only for one with measurements; graphs → states.
    setView('states');
    eq(rightClick($(`.card[data-open="${s.id}"]`)), ['map', 'graphs'], 'state with data');
    closeCtxMenu();
    eq(rightClick($(`.card[data-open="${bare.id}"]`)), ['map'], 'state without data');
    closeCtxMenu();
    setView('graphs');
    eq(rightClick($(`[data-gr="${s.id}"] .card-head`)), ['states', 'map'], 'graph heading');
    pick('states');
    assert(ui.view === 'states' && $(`.card[data-open="${s.id}"]`).classList.contains('flash'), 'state card flashes');
    const plot = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    setView('graphs');
    $(`[data-gr="${s.id}"] .gr-plot`).dispatchEvent(plot);
    assert(
      plot.defaultPrevented && !ctxMenu.hidden && ctxMenu.dataset.id === s.id,
      'the chart itself opens the menu too',
    );
    closeCtxMenu();
    // Overview rows have the menu too (the activity is in progress, not due yet: listed once expanded).
    ui.nextAll = true;
    setView('dashboard');
    eq(rightClick($(`.row[data-open="${a.id}"]`)), ['activities', 'map', 'timeline'], 'next action row');
    pick('map');
    assert(ui.view === 'map' && ui.mapSelected === a.id, 'from the overview to the map');
    ui.nextAll = false;
    // A done item hidden with the done ones: they are shown again, and it is selected.
    setToggle('hideDone', true);
    setView('activities');
    openCtxMenu(done.id, 10, 10);
    pick('map');
    assert(
      ui.view === 'map' &&
        !ui.hideDone &&
        prefs.get('hideDone') === false &&
        $(`[data-map-node="${done.id}"]`) === document.activeElement,
      'done shown again, box focused',
    );
    setToggle('hideDone', false);
    changeLanguage('sl');
    setView('goals');
    rightClick($(`.card[data-open="${g.id}"]`));
    assert(
      ctxMenu.querySelector('[data-ctx-sub]').textContent === 'Prikaži v …' &&
        ctxMenu.querySelector('[data-ctx="show:map"]').textContent === 'Zemljevid' &&
        ctxMenu.querySelector('[data-ctx="show:map"]').getAttribute('aria-label') === 'Prikaži v pogledu Zemljevid',
      'Slovenian',
    );
    closeCtxMenu();
    changeLanguage('en');
    deletePlan(plans.current);
  });

  await step('item menu: "Show in…" opens its views in place', async () => {
    fresh('Show in place');
    changeLanguage('en');
    const g = mk('goal', { startDate: d(-5), deadline: d(30) });
    const bare = mk('state');
    save();
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = '.ctx-menu { animation: none }';
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const touch = (type, el) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 12,
          clientX: 60,
          clientY: 60,
        }),
      );
    const tap = el => {
      touch('pointerdown', el);
      touch('pointerup', el);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    };
    const key = k => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const parent = () => ctxMenu.querySelector('[data-ctx-sub]'),
      sub = () => $('#ctxSub');
    const seen = () =>
      [...ctxMenu.querySelectorAll('button')].filter(b => b.offsetHeight).map(b => b.dataset.ctx || 'parent');
    const inView = () => {
      const r = ctxMenu.getBoundingClientRect();
      return r.top >= 8 && r.bottom <= innerHeight - 8;
    };
    setView('goals');
    // Closed: one "Show in…" entry with a chevron, its views hidden.
    openCtxMenu(g.id, 60, 60);
    eq(
      seen(),
      ['edit', 'status:achieved', 'add:goal:subgoal', 'add:activity:contributes', 'parent', 'link', 'delete'],
      'one entry for the views',
    );
    assert(
      parent().textContent === 'Show in…' &&
        parent().querySelector('.ctx-chev') &&
        parent().getAttribute('aria-expanded') === 'false' &&
        parent().getAttribute('aria-controls') === 'ctxSub' &&
        sub().hidden,
      'closed, with a chevron',
    );
    // A tap opens it in place and keeps the menu open (also after the scroll guard has run out).
    tap(parent());
    assert(!ctxMenu.hidden && parent().getAttribute('aria-expanded') === 'true' && !sub().hidden, 'opened by a tap');
    eq(
      seen(),
      [
        'edit',
        'status:achieved',
        'add:goal:subgoal',
        'add:activity:contributes',
        'parent',
        'show:map',
        'show:timeline',
        'link',
        'delete',
      ],
      'views below it',
    );
    eq(
      [...sub().querySelectorAll('button')].map(b => b.textContent),
      ['Map', 'Timeline'],
      'named like the navigation',
    );
    assert(
      sub().querySelector('button').getBoundingClientRect().left > parent().getBoundingClientRect().left + 20 &&
        getComputedStyle(parent().querySelector('.ctx-chev')).transform !== 'none',
      'indented; the chevron turned',
    );
    await wait(450);
    ctxMenu.dispatchEvent(new Event('scroll'));
    assert(!ctxMenu.hidden, 'still open');
    tap(parent());
    assert(
      !ctxMenu.hidden && sub().hidden && parent().getAttribute('aria-expanded') === 'false',
      'a second tap closes it, not the menu',
    );
    // A sub-item picked: the view, with the item shown there.
    tap(parent());
    tap(ctxMenu.querySelector('[data-ctx="show:map"]'));
    assert(
      ctxMenu.hidden &&
        ui.view === 'map' &&
        ui.mapSelected === g.id &&
        document.activeElement === $(`[data-map-node="${g.id}"]`),
      'shown in the map',
    );
    // Keyboard: hidden views are skipped; Right opens onto the first, Left and Escape go back.
    setView('goals');
    openCtxMenu(g.id, 60, 60, true);
    while (document.activeElement !== parent()) key('ArrowDown');
    key('ArrowDown');
    eq(document.activeElement.dataset.ctx, 'link', 'Down skips the closed views');
    key('ArrowUp');
    key('ArrowRight');
    assert(
      parent().getAttribute('aria-expanded') === 'true' && document.activeElement.dataset.ctx === 'show:map',
      'Right opens onto the first view',
    );
    key('ArrowDown');
    eq(document.activeElement.dataset.ctx, 'show:timeline', 'Down moves through them');
    key('ArrowDown');
    eq(document.activeElement.dataset.ctx, 'link', 'and on past them');
    key('ArrowUp');
    key('ArrowLeft');
    assert(sub().hidden && document.activeElement === parent() && !ctxMenu.hidden, 'Left closes back onto the parent');
    key('ArrowRight');
    key('Escape');
    assert(
      sub().hidden && document.activeElement === parent() && !ctxMenu.hidden,
      'Escape on a view closes them, not the menu',
    );
    parent().click();
    assert(!sub().hidden && document.activeElement === parent(), 'Enter or Space (a click) opens it, focus stays');
    key('ArrowLeft');
    assert(sub().hidden && document.activeElement === parent(), 'Left on the open parent closes it');
    key('Escape');
    assert(ctxMenu.hidden, 'Escape on the parent closes the menu');
    // Near the bottom of the screen, opening it moves the menu up to stay on screen.
    openCtxMenu(g.id, 60, innerHeight - 4);
    const top = ctxMenu.getBoundingClientRect().top;
    assert(inView(), 'on screen');
    tap(parent());
    assert(
      inView() && ctxMenu.getBoundingClientRect().top < top,
      `moved up: ${top} → ${ctxMenu.getBoundingClientRect().top}`,
    );
    closeCtxMenu();
    // Taller than the screen: the menu scrolls to show the opened views, and stays open.
    openCtxMenu(g.id, 60, 60);
    ctxMenu.style.maxHeight = '200px';
    tap(parent());
    ctxMenu.dispatchEvent(new Event('scroll'));
    const last = sub().lastElementChild.getBoundingClientRect(),
      box = ctxMenu.getBoundingClientRect();
    assert(
      !ctxMenu.hidden && ctxMenu.scrollTop > 0 && last.bottom <= box.bottom && last.top >= box.top,
      'scrolled to the views',
    );
    ctxMenu.style.maxHeight = '';
    closeCtxMenu();
    // Only one other view: offered directly.
    setView('states');
    openCtxMenu(bare.id, 60, 60);
    const one = ctxMenu.querySelector('[data-ctx="show:map"]');
    assert(
      !parent() && one.offsetHeight && one.textContent === 'Show in Map view' && one.querySelector('svg'),
      'one view: a direct item',
    );
    tap(one);
    assert(ui.view === 'map' && ui.mapSelected === bare.id, 'and it shows the item there');
    // Slovenian.
    changeLanguage('sl');
    setView('goals');
    openCtxMenu(g.id, 60, 60);
    assert(
      parent().textContent === 'Prikaži v …' && $('#ctxSub').getAttribute('aria-label') === 'Prikaži v …',
      'Slovenian',
    );
    closeCtxMenu();
    changeLanguage('en');
    style.remove();
    deletePlan(plans.current);
  });

  await step('item menu: show in sets the filters that would hide the item there', () => {
    fresh('Show in filters');
    changeLanguage('en');
    const work = mk('goal', { category: 'Work', startDate: d(-5), deadline: d(30) });
    const home = mk('goal', { category: 'Home', startDate: d(-5), deadline: d(30) });
    const won = mk('goal', { category: 'Work', status: 'achieved', startDate: d(-20), deadline: d(-2) });
    const loose = mk('goal', { startDate: d(-5), deadline: d(20) });
    const a = mk('activity', { startDate: d(-2), dueDate: d(4) });
    const done = mk('activity', { startDate: d(-9), dueDate: d(-1), status: 'done' });
    const free = mk('activity', { startDate: d(-1), dueDate: d(3) });
    const homeAct = mk('activity', { startDate: d(-1), dueDate: d(5) });
    const ended = mk('activity', {
      startDate: d(-30),
      dueDate: d(-3),
      repeat: { every: 1, unit: 'day' },
      checkins: { [d(-4)]: 1 },
    });
    const s = mk('state', {
      value: 4,
      date: d(-1),
      history: [
        { date: d(-9), value: 2 },
        { date: d(-1), value: 4 },
      ],
    });
    rel(a, work, 'contributes');
    rel(done, work, 'contributes');
    rel(homeAct, home, 'contributes');
    rel(ended, home, 'contributes');
    rel(s, work, 'measures');
    save();
    const show = (id, view) => {
      closeCtxMenu();
      openCtxMenu(id, 10, 10);
      ctxMenu.querySelector(`[data-ctx="show:${view}"]`).click();
    };
    const filters = () => [
      ui.category,
      ui.goalFilter,
      ui.hideDone,
      ui.activityGoal,
      ui.mapGoal,
      ui.timelineGoal,
      ui.graphGoal,
    ];
    const reset = (p = {}) =>
      Object.assign(ui, {
        category: '',
        goalFilter: 'active',
        activityGoal: '',
        mapGoal: '',
        timelineGoal: '',
        graphGoal: '',
        ...p,
      });
    // Goals view: an achieved goal of another category, while active goals of Home are shown.
    setView('map');
    reset({ category: 'Home' });
    show(won.id, 'goals');
    eq(filters(), ['Work', 'all', false, '', '', '', ''], 'own category, all statuses');
    eq(prefs.get('category'), 'Work', 'the category is remembered, like a chip tap');
    assert($(`.card[data-open="${won.id}"]`).classList.contains('flash'), 'goal card shown and flashing');
    // Filters that do not hide it stay: Work and active for an active Work goal.
    setView('map');
    reset({ category: 'Work' });
    show(work.id, 'goals');
    eq(filters().slice(0, 2), ['Work', 'active'], 'nothing changed when it is shown anyway');
    // A goal without a category: all categories.
    setView('map');
    reset({ category: 'Home' });
    show(loose.id, 'goals');
    eq(ui.category, '', 'no category: all');
    assert($(`.card[data-open="${loose.id}"]`), 'card there');
    // A category no goal has any more.
    setView('map');
    reset({ category: 'Gone' });
    show(work.id, 'goals');
    eq(ui.category, 'Work', "stale category: the goal's own");
    // Activities: another goal picked in another category → the goal filter cleared, the category of its goal.
    setView('map');
    reset({ category: 'Home', activityGoal: home.id });
    show(a.id, 'activities');
    eq(filters(), ['Work', 'active', false, '', '', '', ''], 'activities: category of its goal, no goal picked');
    assert($(`.card[data-open="${a.id}"]`).classList.contains('flash'), 'activity card flashes');
    // Its own goal picked: kept.
    setView('map');
    reset({ category: 'Work', activityGoal: work.id });
    show(a.id, 'activities');
    eq([ui.category, ui.activityGoal], ['Work', work.id], 'own goal picked: kept');
    // A picked goal in the category that does not hold it, the category does: only the goal cleared.
    const other = mk('goal', { category: 'Work', startDate: d(-5), deadline: d(30) });
    save();
    setView('map');
    reset({ category: 'Work', activityGoal: other.id });
    show(a.id, 'activities');
    eq([ui.category, ui.activityGoal], ['Work', ''], 'goal cleared, category kept');
    // An activity under no goal: all categories.
    setView('map');
    reset({ category: 'Work' });
    show(free.id, 'activities');
    eq(ui.category, '', 'unlinked activity: all');
    assert($(`.card[data-open="${free.id}"]`), 'unlinked card there');
    // Done items hidden: a done one shows them; one not done leaves the toggle on.
    setView('map');
    reset();
    setToggle('hideDone', true);
    show(done.id, 'activities');
    assert(!ui.hideDone && $(`.card[data-open="${done.id}"]`), 'done activity: done shown again');
    setView('map');
    setToggle('hideDone', true);
    show(a.id, 'activities');
    assert(ui.hideDone && $(`.card[data-open="${a.id}"]`), 'not done: still hiding done');
    // A routine that has ended counts as done there.
    setView('map');
    setToggle('hideDone', true);
    show(ended.id, 'activities');
    assert(!ui.hideDone && $(`.card[data-open="${ended.id}"]`), 'ended routine: done shown again');
    // Map focused on another goal: the focus goes; focused on its own goal it stays.
    setView('activities');
    reset({ mapGoal: home.id });
    show(a.id, 'map');
    assert(
      ui.mapGoal === '' && document.activeElement === $(`[data-map-node="${a.id}"]`),
      'map focus cleared, box focused',
    );
    setView('activities');
    reset({ mapGoal: work.id });
    show(a.id, 'map');
    assert(ui.mapGoal === work.id && $(`[data-map-node="${a.id}"]`), 'own goal focus kept');
    // Achieved goal hidden on the map with the done items, in another category.
    setView('goals');
    reset({ category: 'Home', goalFilter: 'all' });
    setToggle('hideDone', true);
    show(won.id, 'map');
    assert(!ui.hideDone && ui.category === 'Work' && $(`[data-map-node="${won.id}"]`), 'achieved goal on the map');
    // Timeline: only the fold that hides it opens; another goal stays folded.
    setTlCollapsed([work.id, home.id]);
    setView('activities');
    reset();
    show(a.id, 'timeline');
    eq(tlCollapsed().has(work.id) || !tlCollapsed().has(home.id), false, 'its goal unfolded, the other stays folded');
    assert(
      ui.mapSelected === a.id && document.activeElement === $(`[data-tl-node="${a.id}"]`),
      'timeline row selected',
    );
    // A folded goal itself keeps its row: nothing unfolds.
    setTlCollapsed([work.id]);
    setView('activities');
    show(work.id, 'timeline');
    assert(tlCollapsed().has(work.id) && $(`[data-tl-node="${work.id}"]`), 'folded goal: row there, still folded');
    setTlCollapsed([]);
    // Timeline: another goal picked and done hidden.
    setView('activities');
    reset({ timelineGoal: home.id });
    setToggle('hideDone', true);
    show(done.id, 'timeline');
    assert(
      ui.timelineGoal === '' && !ui.hideDone && $(`[data-tl-node="${done.id}"]`),
      'timeline: goal cleared, done shown',
    );
    // Graphs: a state measuring a Work goal while a Home goal is picked.
    setView('states');
    reset({ category: 'Home', graphGoal: home.id });
    show(s.id, 'graphs');
    assert(
      ui.graphGoal === '' && ui.category === 'Work' && $(`[data-gr="${s.id}"]`),
      'graphs: goal cleared, category of its goal',
    );
    // The search is cleared on the way.
    setView('states');
    ui.search = 'nothing like it';
    render();
    reset();
    show(s.id, 'map');
    assert(ui.search === '' && $(`[data-map-node="${s.id}"]`), 'search cleared');
    reset();
    setToggle('hideDone', false);
    deletePlan(plans.current);
  });

  await step('tap-tap-drag: one-finger zoom on the map and the timeline', async () => {
    const plan0 = plans.current;
    // A map larger than the view, so it can scroll to keep the tapped point in place.
    loadSample();
    const g = mk('goal', { title: 'Goal', startDate: d(-40), deadline: d(60) });
    const a = mk('activity', { title: 'First', startDate: d(-2), dueDate: d(10) }),
      b = mk('activity', { title: 'Second', startDate: d(1), dueDate: d(20) });
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    save();
    const wait = ms => new Promise(res => setTimeout(res, ms));
    // One finger: touch events, with the pointer events a browser sends alongside.
    const touch = (type, el, x, y) => {
      const f = new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
      const ev = new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [f],
        changedTouches: [f],
      });
      el.dispatchEvent(ev);
      return ev;
    };
    const ptr = (type, el, x, y) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 7,
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      );
    const clickAt = (el, x, y) => {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: x, clientY: y });
      el.dispatchEvent(ev);
      return ev;
    };
    const tap = (el, x, y) => {
      ptr('pointerdown', el, x, y);
      touch('touchstart', el, x, y);
      ptr('pointerup', el, x, y);
      touch('touchend', el, x, y);
      clickAt(el, x, y);
    };
    // Tap, then touch again and drag by dy in steps. `get` finds the element under the finger; touch
    // events keep going to the one first touched, even once a redraw has detached it, as in a browser.
    const tapDrag = async (get, x, y, dy, { gap = 50, second = [x, y] } = {}) => {
      tap(get(), x, y);
      await wait(gap);
      const el = get(),
        [x2, y2] = second;
      ptr('pointerdown', el, x2, y2);
      touch('touchstart', el, x2, y2);
      let prevented = true;
      for (let i = 1; i <= 5; i++) {
        prevented = touch('touchmove', el, x2, y2 + (dy * i) / 5).defaultPrevented && prevented;
        await wait(20);
      }
      touch('touchend', el, x2, y2 + dy);
      ptr('pointerup', el, x2, y2 + dy);
      const click = clickAt(el, x2, y2 + dy);
      await wait(20);
      return { prevented, clickSwallowed: click.defaultPrevented };
    };
    const out = [];

    // Map: down zooms in around the tapped point, up zooms out.
    setView('map');
    ui.mapScale = 1;
    ui.mapSelected = null;
    render();
    const wrap = () => $('.map-wrap');
    // A point on the drawing (it is centred in the view while smaller than it).
    const sr = $('.map-wrap svg').getBoundingClientRect(),
      wr = wrap().getBoundingClientRect();
    const x = Math.max(sr.left, wr.left) + 60,
      y = Math.max(sr.top, wr.top) + 60;
    const svgPoint = () => {
      const bx = $('.map-wrap svg').getBoundingClientRect();
      return [(x - bx.left) / ui.mapScale, (y - bx.top) / ui.mapScale];
    };
    const p0 = svgPoint();
    let res = await tapDrag(wrap, x, y, 100);
    assert(ui.mapScale > 1.5, `zoomed in: ${ui.mapScale}`);
    assert(res.prevented, 'the drag does not scroll the map');
    const p1 = svgPoint();
    assert(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 2, `the tapped point stays put: ${p0} → ${p1}`);
    const zoomedIn = ui.mapScale;
    await wait(400);
    await tapDrag(wrap, x, y, -60);
    assert(ui.mapScale < zoomedIn, `up zooms out: ${zoomedIn} → ${ui.mapScale}`);
    out.push(`map ${zoomedIn.toFixed(2)} → ${ui.mapScale.toFixed(2)}`);
    deletePlan(plans.current);
    openPlan(plan0);
    fresh('Tap zoom');
    // The same three items on their own, for the rest.
    collection('goal').push(g);
    collection('activity').push(a, b);
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    save();

    // Started on a box: the second touch neither toggles nor opens it, nor brings up its menu.
    await wait(400);
    const node = () => $(`[data-map-node="${a.id}"]`);
    ui.mapScale = 1;
    ui.mapSelected = null;
    render();
    let nr = node().getBoundingClientRect();
    const nx = nr.left + 20,
      ny = nr.top + 10,
      before = ui.mapScale;
    tap(node(), nx, ny);
    const selectedByFirst = ui.mapSelected;
    await wait(50);
    const n2 = node();
    ptr('pointerdown', n2, nx, ny);
    touch('touchstart', n2, nx, ny);
    touch('touchmove', n2, nx, ny + 40);
    await wait(LONG_PRESS_MS + 80);
    touch('touchend', n2, nx, ny + 40);
    ptr('pointerup', n2, nx, ny + 40);
    const click = clickAt(n2, nx, ny + 40);
    await wait(20);
    assert(ui.mapScale > before, 'zoomed from a box');
    assert(ctxMenu.hidden, 'no long-press menu while zooming');
    assert(
      click.defaultPrevented && ui.mapSelected === selectedByFirst && !modal.open,
      'the lifted finger neither toggles nor opens the box',
    );

    // A plain double-tap on a box still opens it.
    await wait(400);
    ui.mapSelected = null;
    render();
    nr = node().getBoundingClientRect();
    tap(node(), nr.left + 20, nr.top + 10);
    await wait(50);
    tap(node(), nr.left + 20, nr.top + 10);
    assert(modal.open, 'double-tap edits');
    modal.close();

    // Not a tap-and-drag: a second touch too late, too far away, or after a swipe.
    for (const [why, opts] of [
      ['too late', { gap: 400 }],
      ['too far', { second: [x + 80, y] }],
    ]) {
      await wait(400);
      const s0 = ui.mapScale;
      res = await tapDrag(wrap, x, y, 100, opts);
      assert(ui.mapScale === s0 && !res.prevented && !res.clickSwallowed, `${why}: scrolls, no zoom`);
    }
    await wait(400);
    let s0 = ui.mapScale;
    ptr('pointerdown', wrap(), x, y);
    touch('touchstart', wrap(), x, y);
    touch('touchmove', wrap(), x, y + 40);
    touch('touchend', wrap(), x, y + 40);
    await wait(50);
    touch('touchstart', wrap(), x, y + 40);
    const swipe = touch('touchmove', wrap(), x, y + 120);
    touch('touchend', wrap(), x, y + 120);
    await wait(50);
    assert(ui.mapScale === s0 && !swipe.defaultPrevented, 'after a swipe: scrolls, no zoom');

    // Timeline: the days stretch around the tapped one; the rows are redrawn during the drag.
    await wait(400);
    setView('timeline');
    ui.tlPx = 8;
    ui.mapSelected = null;
    render();
    const sc = () => $('.tl-scroll');
    const tx = $('.tl-corner').getBoundingClientRect().right + 120,
      ty = $(`[data-tl-node="${b.id}"]`).getBoundingClientRect().top + 10;
    const dayAt = () => (tx - $('.tl-scale').getBoundingClientRect().left) / ui.tlPx + Number(sc().dataset.from);
    const under = () => document.elementFromPoint(tx, ty) || sc();
    const day0 = dayAt();
    res = await tapDrag(under, tx, ty, 80);
    assert(ui.tlPx > 8 && res.prevented, `timeline zoomed in: ${ui.tlPx}`);
    assert(Math.abs(dayAt() - day0) < 1, `the tapped day stays put: ${day0.toFixed(1)} → ${dayAt().toFixed(1)}`);
    const wide = ui.tlPx;
    await wait(400);
    await tapDrag(under, tx, ty, -80);
    assert(ui.tlPx < wide, `and out: ${wide} → ${ui.tlPx}`);
    out.push(`timeline 8 → ${wide.toFixed(1)} → ${ui.tlPx.toFixed(1)} px/day`);

    // Elsewhere nothing changes.
    await wait(400);
    setView('activities');
    const card = () => $(`.card[data-open="${a.id}"]`);
    const cr = card().getBoundingClientRect();
    s0 = ui.mapScale;
    modal.close();
    res = await tapDrag(card, cr.left + 10, cr.top + 10, 80);
    assert(!res.prevented && ui.mapScale === s0, 'activities: scrolls as usual');
    modal.close();
    deletePlan(plans.current);
    return out.join(', ');
  });
  /* ---------- States that add up (cumulative states) ---------- */

  await step('cumulative: goals use the higher of this and the last period; reached only by a complete one', () => {
    fresh('Cumulative goals');
    const now = today(),
      lastWeek = addDays(now, -7);
    const s = mk('state', { cumulative: true, scale: 'month', entries: [entry(lastWeek, 20)] });
    const g = mk('goal', {
      title: 'Run 30 km a week',
      unit: 'km',
      baseline: '10',
      target: '30',
      metric: 'Weekly km',
      period: 'week',
    });
    rel(s, g, 'measures');
    refreshTotal(s);
    assert(
      goalCurrent(g) === 20 && Math.round(goalProgress(g)) === 50,
      `last week counts while this week is behind: ${goalCurrent(g)}`,
    );
    s.entries.push(entry(now, 25));
    assert(goalCurrent(g) === 25, 'this week counts once it is ahead');
    assert(!goalReached(g), 'not reached');
    s.entries.push(entry(now, 10));
    assert(goalProgress(g) === 100 && !goalReached(g), 'a strong week under way is 100 % but not reached yet');
    s.entries.push(entry(lastWeek, 11));
    assert(goalReached(g), 'a complete week at the target is');
    // A goal that goes down: a month under way only counts once it is worse than the last full one.
    const sp = mk('state', {
      cumulative: true,
      entries: [entry(addDays(calPeriod('month', now).from, -1), 350), entry(now, 50)],
    });
    const h = mk('goal', {
      title: 'Spend less',
      unit: '€',
      baseline: '400',
      target: '300',
      metric: 'Spending',
      period: 'month',
    });
    rel(sp, h, 'measures');
    assert(goalCurrent(h) === 350 && Math.round(goalProgress(h)) === 50, `last month: ${goalCurrent(h)}`);
    sp.entries.push(entry(now, 330));
    assert(goalCurrent(h) === 380, 'this month once it is worse');
    // Before entries reach back into a complete month, nothing counts: the month under way (or an empty one
    // before it) is well under target, but says nothing yet.
    const sq = mk('state', { cumulative: true, entries: [entry(now, 50)] });
    const q = mk('goal', {
      title: 'Spend less, just begun',
      unit: '€',
      baseline: '400',
      target: '300',
      metric: 'Spending',
      period: 'month',
    });
    rel(sq, q, 'measures');
    assert(
      goalCurrent(q) === 400 && goalProgress(q) === 0 && !goalReached(q),
      `first month: ${goalCurrent(q)}, ${goalProgress(q)} %`,
    );
    sq.entries.push(entry(addDays(calPeriod('month', now).from, -1), 280));
    assert(goalCurrent(q) === 280 && goalReached(q), 'a full month under target reaches it');
    // The same state counted in total by another goal.
    const k = mk('goal', {
      title: 'Spend under 1000 in all',
      unit: '€',
      baseline: '0',
      target: '1000',
      metric: 'Spending',
    });
    rel(sp, k, 'measures');
    assert(goalCurrent(k) === 730 && goalPeriod(k) === 'total' && !goalReached(k), `in total: ${goalCurrent(k)}`);
    // Goal card: the two periods side by side.
    setView('goals');
    ui.goalFilter = 'all';
    render();
    const line = $(`.card.goal[data-open="${g.id}"] .cu-periods`).textContent;
    assert(line === 'This week: 35 km · last week: 31 km', line);
    // An in-total state suggests its total as the starting value.
    const tot = mk('state', { cumulative: true, unit: '€', entries: [entry(now, 2450)] });
    const f = mk('goal', { title: 'Save 6000 more', unit: '€', baseline: '', target: '6000', metric: 'Saved' });
    rel(tot, f, 'measures');
    openForm('goal', f.id);
    assert($('[data-field="baseline"] .hint').textContent.includes('2,450 €'), 'baseline hint');
    modal.close();
    deletePlan(plans.current);
    return line;
  });

  await step('cumulative: a goal picks how it counts a state that adds up', () => {
    fresh('Goal counts');
    const now = today(),
      lastWeek = addDays(calPeriod('week', now).from, -1);
    const km = mk('state', {
      title: 'Km',
      unit: 'km',
      cumulative: true,
      scale: 'month',
      entries: [entry(lastWeek, 24), entry(now, 6)],
    });
    const g = mk('goal', {
      title: 'Run 30 a week',
      specific: 'Run thirty kilometres every week.',
      achievable: 'Three short runs.',
      relevant: 'For the marathon.',
      unit: 'km',
      baseline: '0',
      target: '30',
      metric: 'Km',
      startDate: addDays(now, -30),
      deadline: addDays(now, 60),
    });
    // A new state that adds up, nothing added yet: the goal can already pick how it counts.
    const empty = mk('state', { title: 'New km', unit: 'km', cumulative: true, entries: [] });
    const g0 = mk('goal', { title: 'Run 20 a week' });
    rel(empty, g0, 'measures');
    openForm('goal', g0.id);
    assert(
      $('#f-period') && $('[data-field="period"] .hint').textContent.includes('New km'),
      'Counts before the first amount',
    );
    modal.close();
    rel(km, g, 'measures');
    save();
    openForm('goal', g.id);
    eq(
      [...$('#f-period').options].map(o => o.value),
      ['total', 'day', 'week', 'month', 'year'],
      'Counts: in total or per period',
    );
    assert(
      $('#f-period').value === 'total' && $('[data-field="baseline"] .hint').textContent,
      'in total by default, with the baseline hint',
    );
    $('#f-period').value = 'week';
    submitForm();
    assert(g.period === 'week' && goalCurrent(g) === 24, `per week: ${goalCurrent(g)}`);
    setView('goals');
    ui.goalFilter = 'all';
    render();
    eq(
      $(`.card.goal[data-open="${g.id}"] .cu-periods`).textContent,
      'This week: 6 km · last week: 24 km',
      'goal card line',
    );
    openForm('goal', g.id);
    assert(
      $('#f-period').value === 'week' && !$('[data-field="baseline"] .hint')?.textContent,
      'per week: no baseline hint',
    );
    modal.close();
    // Several states: the most recently updated one counts, and it adds up.
    const old = mk('state', { title: 'Old', history: [] });
    recordMeasurement(old, addDays(now, -20), '3');
    rel(old, g, 'measures');
    openForm('goal', g.id);
    assert($('#f-period') && measuringState(g) === km, 'the newer state adds up: Counts shown');
    modal.close();
    // Switched to plain: the period stays on the goal but is not used, and Counts is not shown.
    convertState(km, false);
    save();
    openForm('goal', g.id);
    assert(!$('#f-period'), 'no Counts for a plain state');
    $('#f-target').value = '31';
    submitForm();
    assert(g.period === 'week' && goalCurrent(g) === Number(stateValue(km)), `kept, unused: ${goalCurrent(g)}`);
    deletePlan(plans.current);
    return g.period;
  });

  await step(
    'cumulative: a tick asks how much; untick, delete and an amount on the state keep both in step',
    async () => {
      fresh('Cumulative routines');
      const now = today(),
        y = addDays(now, -1);
      const run = mk('activity', {
        title: 'Run',
        startDate: addDays(now, -30),
        repeat: { every: 1, unit: 'week', times: 3 },
        checkins: {},
      });
      const km = mk('state', { title: 'Km', unit: 'km', cumulative: true, scale: 'week', entries: [] });
      const longest = mk('state', { title: 'Longest', history: [] });
      rel(run, km, 'improves');
      rel(run, longest, 'improves');
      save();
      setView('activities');
      const day = iso => $(`.card.routine[data-open="${run.id}"] [data-checkin][data-date="${iso}"]`);
      day(now).click();
      const pop = $('.amount-pop');
      assert(
        pop &&
          pop.querySelectorAll('[data-amount]').length === 1 &&
          document.activeElement === pop.querySelector('[data-amount]'),
        'one field (plain states are not asked), focused',
      );
      assert(!checkedOn(run, now), 'nothing ticked yet');
      pop.querySelector('[data-amount]').value = 'abc';
      pop.requestSubmit();
      assert(
        $('.amount-pop .amount-err').textContent === t('err.number') && !km.entries.length,
        'a wrong number is refused',
      );
      $('.amount-pop [data-amount]').value = '7,5';
      $('.amount-pop').requestSubmit();
      assert(!$('.amount-pop') && checkedOn(run, now), 'ticked');
      eq(
        km.entries.map(e => [e.date, e.amount, e.routine]),
        [[now, '7.5', run.id]],
        'entry tagged with the routine',
      );
      assert(!longest.history.length, 'plain state untouched');
      // Escape (or "Just tick") only ticks.
      if (runsOn(run, y)) {
        ui.rtWeek[run.id] = mondayOf(y);
        render();
        day(y).click();
        $('.amount-pop [data-amount]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert(checkedOn(run, y) && km.entries.length === 1, 'Escape ticks only');
        day(y).click();
        assert(!checkedOn(run, y) && !$('.amount-pop'), 'unticking asks nothing');
      }
      // A click elsewhere leaves it unticked.
      ui.rtWeek = {};
      render();
      // Unticking removes the routine's amounts that day.
      day(now).click();
      assert(
        !checkedOn(run, now) && !km.entries.length && Object.keys(km.droppedEntries).length === 1,
        'untick drops the entry, remembered for sync',
      );
      assert(km.value === '', 'total follows');
      // An amount added on the state ticks the routine, tagged.
      const e1 = addEntry(km, y, 5);
      assert(checkedOn(run, y) && e1.routine === run.id, 'entry on the state ticks the routine');
      const e2 = addEntry(km, y, 3);
      deleteEntry(km, e1.id);
      assert(checkedOn(run, y), 'another entry that day keeps the tick');
      deleteEntry(km, e2.id);
      assert(!checkedOn(run, y), 'deleting the last one unticks');
      // Not before the routine starts, and not in the future.
      const early = addEntry(km, addDays(now, -60), 4),
        later = addEntry(km, addDays(now, 3), 4);
      assert(
        !checkedOn(run, addDays(now, -60)) && !early.routine && !later.routine,
        'outside the routine’s days: no tick, no tag',
      );
      // With two routines feeding it, an entry ticks both, tagged with neither.
      const bike = mk('activity', {
        title: 'Bike',
        startDate: addDays(now, -30),
        repeat: { every: 1, unit: 'week', times: 2 },
        checkins: {},
      });
      rel(bike, km, 'improves');
      const both = addEntry(km, now, 10);
      assert(checkedOn(run, now) && checkedOn(bike, now) && !both.routine, 'two routines: both ticked, untagged');
      // Overview rows ask the same (a routine ticked today is not on the overview).
      setView('dashboard');
      assert(!$(`.routine-row[data-open="${bike.id}"]`), 'ticked today: not on the overview');
      setView('activities');
      $(`.card.routine[data-open="${bike.id}"] [data-checkin][data-date="${now}"]`).click();
      assert(!checkedOn(bike, now) && !$('.amount-pop'), 'unticking asks nothing');
      setView('dashboard');
      $(`.routine-row[data-open="${bike.id}"] [data-checkin]`).click();
      assert($('.amount-pop'), 'ticking from the overview asks');
      $('.amount-pop [data-amount-skip]').click();
      assert(checkedOn(bike, now) && !$('.amount-pop'), '"Just tick"');
      deletePlan(plans.current);
      return `${km.entries.length} entries left`;
    },
  );

  await step('cumulative: + on the state card adds an amount with its date', () => {
    fresh('Cumulative card');
    const s = mk('state', { title: 'Saved', unit: '€', cumulative: true, entries: [] });
    save();
    setView('states');
    assert($(`.card.state[data-open="${s.id}"]`).textContent.includes(t('cu.noEntries')), 'nothing added yet');
    $(`[data-add-amount="${s.id}"]`).click();
    assert(
      !modal.open && $('.amount-pop [data-amount-date]').value === dateInput(today()),
      'opens by the button, not the form; today',
    );
    $('.amount-pop [data-amount]').value = '120';
    $('.amount-pop [data-amount-date]').value = '31/02/2026';
    $('.amount-pop').requestSubmit();
    assert($('.amount-pop .amount-err').textContent === t('err.date'), 'a wrong date is refused');
    $('.amount-pop [data-amount-date]').value = '01/02/2026';
    $('.amount-pop').requestSubmit();
    eq(
      s.entries.map(e => [e.date, e.amount]),
      [['2026-02-01', '120']],
      'added',
    );
    assert($('#toast').textContent === t('cu.added', { value: '120 €', name: 'Saved' }), $('#toast').textContent);
    const card = $(`.card.state[data-open="${s.id}"]`);
    assert(
      card.querySelector('.cu-total').textContent === '120 € in total' &&
        document.activeElement === $(`[data-add-amount="${s.id}"]`),
      'total on the card, focus back on +',
    );
    // Empty adds nothing; a click elsewhere closes.
    $(`[data-add-amount="${s.id}"]`).click();
    $('.amount-pop').requestSubmit();
    assert(!$('.amount-pop') && s.entries.length === 1, 'empty: nothing');
    $(`[data-add-amount="${s.id}"]`).click();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    assert(!$('.amount-pop'), 'click elsewhere closes');
    deletePlan(plans.current);
    return card.querySelector('.cu-total').textContent;
  });

  await step('cumulative: the card shows the total, and this period’s sum when the graph shows periods', () => {
    fresh('Cumulative scale card');
    const s = mk('state', {
      title: 'Run',
      unit: 'km',
      cumulative: true,
      scale: 'week',
      entries: [entry(addDays(calPeriod('week', today()).from, -1), 12)],
    });
    save();
    setView('states');
    const card = () => $(`.card.state[data-open="${s.id}"]`);
    eq(
      [card().querySelector('.cu-total').textContent, card().querySelector('.cu-now').textContent],
      ['12 km in total', '0 km this week'],
      'total, and nothing yet this week',
    );
    eq(scaleText(s, 'week'), '0 km this week', 'scaleText');
    s.scale = 'total';
    render();
    assert(!card().querySelector('.cu-now'), 'in total: just the total');
    const text = card().querySelector('.cu-total').textContent;
    deletePlan(plans.current);
    return text;
  });

  await step('states: a click on a card asks for a new value; Edit is in its menu', () => {
    fresh('State value');
    const now = today();
    const s = mk('state', { title: 'Weight', unit: 'kg', history: [] });
    recordMeasurement(s, addDays(now, -3), '80');
    const sum = mk('state', { title: 'Run', unit: 'km', cumulative: true, scale: 'week', entries: [] });
    save();
    setView('states');
    const card = id => $(`.card.state[data-open="${id}"]`);
    card(s.id).click();
    assert(!modal.open && $('.amount-pop'), 'a popup, not the form');
    eq(
      [
        $('.amount-pop .amount-title').textContent,
        $('.amount-pop .amount-hint').textContent,
        $('.amount-pop [data-amount-date]').value,
      ],
      [
        t('sv.title', { name: 'Weight' }),
        t('sv.latest', { value: '80 kg', date: fmtDate(addDays(now, -3)) }),
        dateInput(now),
      ],
      'title, latest value, today',
    );
    $('.amount-pop [data-amount]').value = 'lots';
    $('.amount-pop').requestSubmit();
    assert($('.amount-pop .amount-err').textContent === t('err.number'), 'not a number: refused');
    $('.amount-pop [data-amount]').value = '78,5';
    $('.amount-pop').requestSubmit();
    eq([s.value, s.date, s.history.length], ['78.5', now, 2], 'recorded as the latest');
    eq($('#toast').textContent, t('sv.saved', { value: '78.5 kg', name: 'Weight' }), 'says so');
    assert(card(s.id).querySelector('.tag.state').textContent === '78.5 kg', 'the card shows it');
    // Empty saves nothing; Escape closes.
    card(s.id).click();
    $('.amount-pop').requestSubmit();
    assert(!$('.amount-pop') && s.history.length === 2, 'empty: nothing');
    card(s.id).click();
    $('.amount-pop input').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    assert(!$('.amount-pop'), 'Escape closes');
    // A state that adds up asks for an amount.
    card(sum.id).click();
    assert(
      $('.amount-pop .amount-title').textContent === t('cu.addTo', { name: 'Run' }) && !$('.amount-pop .amount-hint'),
      'an amount for one that adds up',
    );
    closeAmountPop();
    // Editing is in the card's menu.
    card(s.id).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );
    ctxMenu.querySelector('[data-ctx="edit"]').click();
    assert(ctxMenu.hidden && modal.open && formCtx.kind === 'state' && formCtx.id === s.id, 'Edit opens the form');
    modal.close();
    // So is adding: a value, or an amount for one that adds up; on the map too.
    const menuOn = el =>
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    menuOn(card(s.id));
    eq(ctxMenu.querySelector('[data-ctx="value"]').textContent, t('ctx.addValue'), 'Add a value in the menu');
    ctxMenu.querySelector('[data-ctx="value"]').click();
    assert(
      ctxMenu.hidden && !modal.open && $('.amount-pop .amount-title').textContent === t('sv.title', { name: 'Weight' }),
      'it opens the popup',
    );
    closeAmountPop();
    menuOn(card(sum.id));
    eq(
      ctxMenu.querySelector('[data-ctx="value"]').textContent,
      t('ctx.addAmount'),
      'Add an amount for one that adds up',
    );
    ctxMenu.querySelector('[data-ctx="value"]').click();
    assert($('.amount-pop .amount-title').textContent === t('cu.addTo', { name: 'Run' }), 'it asks for an amount');
    closeAmountPop();
    setView('map');
    menuOn($(`[data-map-node="${s.id}"]`));
    ctxMenu.querySelector('[data-ctx="value"]').click();
    $('.amount-pop [data-amount]').value = '77';
    $('.amount-pop').requestSubmit();
    assert(s.value === '77' && s.history.length === 2, 'from the map: same day replaced');
    deletePlan(plans.current);
    return `${s.history.length} measurements`;
  });

  await step('cumulative: the form switches between adding up and single values, both ways', () => {
    fresh('Cumulative form');
    const now = today();
    const s = mk('state', { title: 'Pages', history: [] });
    recordMeasurement(s, addDays(now, -2), '10');
    recordMeasurement(s, now, '20');
    save();
    openForm('state', s.id);
    const change = (sel, v) => {
      $(sel).value = v;
      $(sel).dispatchEvent(new Event('change', { bubbles: true }));
    };
    assert($('[data-field="value"] label').textContent === t('f.value') && !$('#addsUpHint').textContent, 'plain form');
    eq(
      [...$('#f-addsUp').options].map(o => o.value),
      ['', 'yes'],
      'adds up: no or yes',
    );
    change('#f-addsUp', 'yes');
    assert(
      $('[data-field="value"] label').textContent === t('cu.addAmount') &&
        $('#addsUpHint').textContent === t('cu.toCumulative'),
      'labels follow',
    );
    let asked = '';
    window.confirm = m => {
      asked = m;
      return false;
    };
    submitForm();
    assert(
      asked === t('cu.confirmToCumulative', { name: 'Pages' }) && !s.cumulative && modal.open,
      'asks first; cancelling keeps it',
    );
    window.confirm = () => true;
    $('#f-value').value = '5';
    submitForm();
    assert(
      s.cumulative === true && s.entries.length === 3 && stateScale(s) === 'total',
      `measurements became entries, plus the new amount: ${s.entries.length}`,
    );
    eq(
      entriesOf(s)
        .filter(e => e.date === now)
        .map(e => e.amount)
        .sort(),
      ['20', '5'],
      'today: two entries',
    );
    // Saving again keeps the graph's scale and the entries.
    s.scale = 'month';
    openForm('state', s.id);
    assert($('#entryList') && !$('#entryList').hidden && $('#f-addsUp').value === 'yes', 'entry list');
    submitForm();
    assert(s.cumulative === true && s.scale === 'month' && s.entries.length === 3, 'scale and entries kept');
    // Marking an entry deletes it on saving, not on cancelling.
    openForm('state', s.id);
    const first = $('[data-drop-entry]');
    first.click();
    assert(
      first.getAttribute('aria-pressed') === 'true' && first.closest('.entry').classList.contains('dropped'),
      'marked',
    );
    modal.close();
    assert(s.entries.length === 3, 'cancel keeps it');
    openForm('state', s.id);
    $(`[data-drop-entry="${first.dataset.dropEntry}"]`).click();
    submitForm();
    assert(s.entries.length === 2 && s.droppedEntries[first.dataset.dropEntry], 'save deletes it');
    // Back to single values: each day's amounts add up.
    s.entries.push(entry(now, 1.5));
    openForm('state', s.id);
    change('#f-addsUp', '');
    assert($('#addsUpHint').textContent === t('cu.toPlain'), 'hint');
    submitForm();
    assert(!s.cumulative, 'plain again');
    const todayValue = s.history.find(h => h.date === now).value;
    assert(stateValue(s) === s.value && s.date === stateDate(s), 'value follows its history');
    deletePlan(plans.current);
    return `today ${todayValue}`;
  });

  await step('cumulative: the scale switch and Counts in Slovenian', () => {
    fresh('Slovenian scales');
    const km = mk('state', {
      title: 'Km',
      unit: 'km',
      cumulative: true,
      scale: 'week',
      entries: [{ id: 'a', date: today(), amount: '5' }],
    });
    const g = mk('goal', { title: 'Teči' });
    rel(km, g, 'measures');
    save();
    changeLanguage('sl');
    setView('graphs');
    eq(
      [...document.querySelectorAll(`[data-gr="${km.id}"] .gr-scale button`)].map(b => b.textContent),
      ['Dan', 'Teden', 'Mesec', 'Leto', 'Skupaj'],
      'switch',
    );
    eq($(`[data-gr="${km.id}"] .gr-scale`).getAttribute('aria-label'), 'Prikaži vsote po', 'its label');
    eq($(`[data-gr="${km.id}"] .gr-value`).textContent, '5 km ta teden', 'this week');
    setView('states');
    eq($(`.card.state[data-open="${km.id}"] .cu-total`).textContent, '5 km skupaj', 'card total');
    openForm('goal', g.id);
    eq(
      [$('[data-field="period"] label').textContent, $('#f-period').selectedOptions[0].textContent],
      ['Šteje', 'Skupno'],
      'Counts',
    );
    modal.close();
    openForm('state', km.id);
    eq(
      [...$('#f-addsUp').options].map(o => o.textContent),
      ['Ne – vsaka vrednost nadomesti prejšnjo', 'Da – količine se seštevajo'],
      'adds up',
    );
    modal.close();
    changeLanguage('en');
    deletePlan(plans.current);
  });

  await step('cumulative: the scale switch fits a phone on one row, in both languages', async () => {
    const km = { id: 'k', cumulative: true, scale: 'week' };
    const out = [];
    for (const lang of ['en', 'sl']) {
      changeLanguage(lang);
      const frame = document.createElement('iframe');
      Object.assign(frame.style, {
        width: '390px',
        height: '300px',
        position: 'fixed',
        left: '-9999px',
        top: '0',
        border: '0',
      });
      frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0 16px"><article class="card gr-card">${scaleSwitch(km)}</article></body>`;
      await new Promise(res => {
        frame.onload = res;
        document.body.append(frame);
      });
      const doc = frame.contentDocument,
        card = doc.querySelector('.gr-card').getBoundingClientRect();
      const btns = [...doc.querySelectorAll('.gr-scale button')].map(b => b.getBoundingClientRect());
      assert(
        btns.length === 5 && btns.every(r => r.left >= card.left - 1 && r.right <= card.right + 1),
        `${lang}: every chip inside the card`,
      );
      assert(
        doc.documentElement.scrollWidth <= 390,
        `${lang}: no sideways scroll (${doc.documentElement.scrollWidth})`,
      );
      assert(
        btns.every(r => r.height >= 24),
        `${lang}: chips big enough to tap (${Math.min(...btns.map(r => r.height))} px)`,
      );
      const rows = new Set(btns.map(r => Math.round(r.top))).size;
      assert(rows === 1, `${lang}: one row (${rows})`);
      out.push(`${lang} ${rows} row`);
      frame.remove();
    }
    changeLanguage('en');
    return out.join(', ');
  });

  await step(
    'cumulative: a state card with both sums keeps its title on one line and everything inside the card',
    async () => {
      loadSample();
      setView('states');
      const km = db.states.find(s => s.cumulative && s.scale === 'week');
      const html = $(`.card.state[data-open="${km.id}"]`).outerHTML,
        out = [];
      // A phone, and the narrowest column of the desktop grid (320 px).
      for (const [name, width, pad] of [
        ['phone', 390, 16],
        ['desktop column', 352, 16],
      ]) {
        const frame = document.createElement('iframe');
        Object.assign(frame.style, {
          width: `${width}px`,
          height: '400px',
          position: 'fixed',
          left: '-9999px',
          top: '0',
          border: '0',
        });
        frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0 ${pad}px">${html}</body>`;
        await new Promise(res => {
          frame.onload = res;
          document.body.append(frame);
        });
        const doc = frame.contentDocument,
          card = doc.querySelector('.card').getBoundingClientRect();
        const title = doc.querySelector('.card-head h3'),
          head = doc.querySelector('.cu-head').getBoundingClientRect();
        const lineH = parseFloat(frame.contentWindow.getComputedStyle(title).lineHeight) || 24;
        assert(
          head.right <= card.right + 1 && head.left >= card.left - 1,
          `${name}: the sums and + inside the card (${Math.round(head.right)} > ${Math.round(card.right)})`,
        );
        assert(
          title.getBoundingClientRect().height < lineH * 1.5,
          `${name}: title on one line (${Math.round(title.getBoundingClientRect().height)} px)`,
        );
        out.push(`${name} ok`);
        frame.remove();
      }
      deletePlan(plans.current);
      return out.join(', ');
    },
  );

  await step('cumulative: Counts in the goal form has room like the fields around it', () => {
    loadSample();
    const km = db.states.find(s => s.cumulative),
      g = db.goals.find(x => relsFrom(km.id, 'measures').some(r => r.to === x.id));
    openForm('goal', g.id);
    const field = $('[data-field="period"]').getBoundingClientRect();
    const above = $('[data-field="unit"]').closest('.row2').getBoundingClientRect(),
      below = $('[data-field="baseline"]').closest('.row3').getBoundingClientRect();
    const gaps = [Math.round(field.top - above.bottom), Math.round(below.top - field.bottom)];
    assert(
      gaps.every(px => px >= 10),
      `gaps above and below Counts: ${gaps}`,
    );
    modal.close();
    deletePlan(plans.current);
    return gaps.join(', ') + ' px';
  });

  await step('cumulative: three years of daily amounts draw on every scale', () => {
    // Draw time is not checked here: the test browser runs on virtual time, where the clock stands
    // still during a script (measured outside it: about 0.3 s a render, nearly all of it the table).
    fresh('Long history');
    const entries = Array.from({ length: 1100 }, (_, i) => ({
      id: 'e' + i,
      date: addDays(today(), -i),
      amount: String(i % 7),
    }));
    const km = mk('state', { title: 'Km', unit: 'km', cumulative: true, scale: 'day', entries });
    save();
    const bars = {};
    for (const scale of SCALES) {
      km.scale = scale;
      setView('graphs');
      bars[scale] = document.querySelectorAll(`[data-gr="${km.id}"] .gr-bar`).length;
    }
    eq(
      bars,
      {
        day: 1100,
        week: periodTotals(km, 'week').length,
        month: periodTotals(km, 'month').length,
        year: periodTotals(km, 'year').length,
        total: 0,
      },
      'a bar per period',
    );
    assert(
      $(`[data-gr="${km.id}"] .gr-line`) && $(`[data-gr="${km.id}"] .gr-value`).textContent === totalText(km),
      'in total: the line',
    );
    deletePlan(plans.current);
    return JSON.stringify(bars);
  });

  await step('cumulative: wording in both languages', () => {
    const keys = Object.keys(I18N.en.strings).filter(
      k => k.startsWith('cu.') || k.startsWith('reached.') || k === 'help.tip.addAmount',
    );
    const missing = keys.filter(k => !(k in I18N.sl.strings));
    assert(keys.length > 50 && !missing.length, `missing in Slovenian: ${missing}`);
    changeLanguage('sl');
    const s = { cumulative: true, unit: 'km', entries: [entry(today(), 3)] };
    const text = scaleText(s, 'week');
    changeLanguage('en');
    assert(text === '3 km ta teden', text);
    const added = [
      'cu.opt.yes',
      'cu.inTotal',
      'cu.now.day',
      'cu.now.week',
      'cu.now.month',
      'cu.now.year',
      'cu.scaleLabel',
      ...SCALES.map(k => 'cu.scale.' + k),
      'cu.counts',
      'cu.countsHint',
      ...['total', ...PERIODS].map(k => 'cu.count.' + k),
      'cu.legend.total',
    ];
    const gone = [
      'cu.opt.day',
      'cu.opt.week',
      'cu.opt.month',
      'cu.opt.year',
      'cu.opt.none',
      'cu.total.week',
      'cu.total.none',
      'cu.legend.none',
    ];
    added.forEach(k =>
      assert(
        I18N.en.strings[k] && I18N.sl.strings[k] && I18N.en.strings[k] !== I18N.sl.strings[k],
        `${k} in both languages`,
      ),
    );
    gone.forEach(k => assert(!(k in I18N.en.strings) && !(k in I18N.sl.strings), `${k} removed`));
    // Help and tour no longer speak of a state adding up per period; they tell of the switch and of goals.
    const en = I18N.en.strings,
      sl = I18N.sl.strings;
    assert(
      !/per day, week, month or year, or in total/.test(en['help.view.states']) &&
        !/po dnevih, tednih, mesecih ali letih ali skupno:/.test(sl['help.view.states']),
      'help.view.states',
    );
    assert(
      en['help.view.graphs'].includes('switch above the graph') &&
        sl['help.view.graphs'].includes('preklopite nad grafom'),
      'help.view.graphs',
    );
    assert(
      !en['help.tip.addAmount'].includes('the better of this period') &&
        !sl['help.tip.addAmount'].includes('boljše od tekočega'),
      'help.tip.addAmount',
    );
    assert(
      en['tour.goals.text'].includes('picks how it counts') && sl['tour.goals.text'].includes('izbere, kako šteje'),
      'tour.goals.text',
    );
    assert(
      en['tour.graphs.text'].includes('per day, week, month or year, or in total') &&
        sl['tour.graphs.text'].includes('po dnevih, tednih, mesecih ali letih ali skupno'),
      'tour.graphs.text',
    );
    // Sample plan and the Marathon template are in the new form.
    const sample = sampleData(),
      dist = sample.states.find(s => s.cumulative);
    const wk = sample.goals.find(g =>
      sample.relations.some(r => r.type === 'measures' && r.from === dist.id && r.to === g.id),
    );
    eq([dist.cumulative, dist.scale, wk.period], [true, 'week', 'week'], 'sample');
    const weekly = templateData(TEMPLATES.find(x => x.id === 'marathon')).states.find(s => s.cumulative);
    eq([weekly.cumulative, weekly.scale], [true, 'week'], 'Marathon template');
    return text;
  });

  await step(
    'map and timeline: + asks whether to add a goal, an activity or a current state (on the map also a vision)',
    () => {
      fresh('Map add');
      const g = mk('goal', { title: 'Map goal' });
      save();
      setView('map');
      const btn = $('#addBtn');
      eq(btn.getAttribute('aria-label'), t('add.item'), 'the button just says Add');
      btn.click();
      const acts = () => [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx).join(',');
      // The map draws visions too, so it offers one as well.
      assert(
        !ctxMenu.hidden &&
          acts() === 'new:goal,new:activity,new:state,new:vision' &&
          !ctxMenu.querySelector('.ctx-head'),
        `offers the kinds: ${acts()}`,
      );
      const r = btn.getBoundingClientRect(),
        m = ctxMenu.getBoundingClientRect();
      assert(Math.abs(m.right - r.right) < 2 && m.top >= r.bottom, 'opens below the button, lined up with it');
      ctxMenu.querySelector('[data-ctx="new:activity"]').click();
      assert(
        ctxMenu.hidden &&
          modal.open &&
          formCtx.kind === 'activity' &&
          !formCtx.id &&
          modal.querySelectorAll('[data-act-kind]').length === 4,
        'Activity asks which kind',
      );
      modal.close();
      for (const k of ['goal', 'state']) {
        btn.click();
        ctxMenu.querySelector(`[data-ctx="new:${k}"]`).click();
        assert(modal.open && formCtx.kind === k && !formCtx.id, `${k}: opens its form`);
        modal.close();
      }
      // From the keyboard: the first item focused; Escape returns to the button.
      btn.focus();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
      assert(document.activeElement === ctxMenu.querySelector('[data-ctx="new:goal"]'), 'keyboard: first item focused');
      ctxMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(ctxMenu.hidden && document.activeElement === btn, 'Escape returns to the button');
      // A box's menu afterwards is still the item's own.
      $(`[data-map-node="${g.id}"]`).dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
      $('[data-ctx="edit"]', ctxMenu).click();
      assert(modal.open && formCtx.id === g.id, 'a box menu still works after');
      modal.close();
      // On phones the button floats at the bottom; the menu opens above it.
      const phone = document.head.appendChild(document.createElement('style'));
      phone.textContent =
        '.ctx-menu { animation: none !important } .topbar { backdrop-filter: none !important } .add-btn { position: fixed !important; right: 16px; bottom: 76px; z-index: 21 }';
      btn.click();
      const r2 = btn.getBoundingClientRect(),
        m2 = ctxMenu.getBoundingClientRect();
      assert(
        m2.bottom <= r2.top && m2.right <= innerWidth - 8 + 1,
        `floating button: menu above it (${m2.bottom} ≤ ${r2.top})`,
      );
      closeCtxMenu();
      phone.remove();
      // The timeline asks the same.
      setView('timeline');
      eq(btn.getAttribute('aria-label'), t('add.item'), 'timeline: the button just says Add');
      btn.click();
      assert(
        !ctxMenu.hidden && acts() === 'new:goal,new:activity,new:state',
        `timeline: offers the three kinds: ${acts()}`,
      );
      ctxMenu.querySelector('[data-ctx="new:goal"]').click();
      assert(ctxMenu.hidden && modal.open && formCtx.kind === 'goal' && !formCtx.id, 'timeline: Goal opens a new goal');
      modal.close();
      // The other views add straight away; the empty relationship list still adds a relationship.
      setView('goals');
      btn.click();
      assert(ctxMenu.hidden && modal.open && formCtx.kind === 'goal', 'goals view: + adds a goal directly');
      modal.close();
      changeLanguage('sl');
      const sl = t('add.item');
      changeLanguage('en');
      eq(sl, 'Dodaj', 'Slovenian label');
      deletePlan(plans.current);
      return acts();
    },
  );

  await step(
    'timeline lines are drawn like on the map, with square corners; menus, dialogs and fields are clear glass',
    () => {
      loadSample();
      ui.tlDeps = true;
      setView('timeline');
      const css = el => getComputedStyle(el),
        dep = REL_TYPES.depends;
      const lines = [...document.querySelectorAll('.tl-deps .tl-dep')];
      assert(lines.length > 3, `${lines.length} dependency arrows`);
      // The map's muted colour, width and finer dash; only straight runs, each ending with a straight stretch into the head.
      assert(
        lines.every(
          l =>
            l.style.stroke === mapLineColour(dep.color) &&
            parseFloat(l.style.strokeWidth) === (dep.width || 1.1) &&
            l.getAttribute('stroke-dasharray') === '4 3',
        ),
        'map line style',
      );
      const runs = lines.map(l => l.getAttribute('d'));
      assert(
        runs.every(d => /^M[\d.-]+,[\d.-]+( (h|H|V)[\d.-]+)+$/.test(d)),
        'only horizontal and vertical runs',
      );
      const tail = d => {
        const v = d.match(/V([\d.-]+) H([\d.-]+)$/),
          h = d.match(/H([\d.-]+) V[\d.-]+ H[\d.-]+$/);
        return +v[2] - +h[1];
      };
      assert(
        runs.every(d => Math.abs(tail(d) - (MAP.LEAD - MAP.TIP)) < 0.01),
        `each ends with a straight stretch: ${runs.map(tail)}`,
      );
      // The map's arrowhead, one size whatever the line width, its tip TIP beyond the line's end.
      const head = $('#tl-arrow'),
        mapHead = 'M1,1.5 L10,5 L1,8.5 L3,5 z';
      assert(
        head.getAttribute('markerUnits') === 'userSpaceOnUse' &&
          +head.getAttribute('refX') === 10 - MAP.TIP &&
          head.querySelector('path').getAttribute('d') === mapHead,
        'map arrowhead',
      );
      // Tree lines in the labels: the map's colours and widths, square corners.
      const elbow = $('.tl-elbow');
      assert(
        elbow.style.getPropertyValue('--rel').includes('color-mix') &&
          css(elbow).borderBottomLeftRadius === '0px' &&
          parseFloat(css(elbow).borderLeftWidth) <= 1.6,
        'thin muted elbows with square corners',
      );
      assert(
        [...document.querySelectorAll('.tl-legend .line-key')].every(k =>
          k.style.getPropertyValue('--rel').includes('color-mix'),
        ),
        'line keys in the map colours',
      );
      // A selected arrow glows, like a selected map line.
      ui.mapRel = null;
      const g = $('.tl-deps [data-rel-edit]');
      g.classList.add('sel');
      assert(
        css(g.querySelector('.tl-dep')).filter.includes('line-glow') && $('.tl-deps #line-glow'),
        'a selected arrow glows',
      );
      // Menus, dialogs, the calendar and fields: what is behind shows faintly through.
      const alpha = el => +(css(el).backgroundColor.match(/[\d.]+/g)[3] ?? 1);
      openCtxMenu(db.goals[0].id, 10, 10);
      assert(
        alpha(ctxMenu) > 0.8 && alpha(ctxMenu) < 0.95 && css(ctxMenu).backgroundImage.includes('radial-gradient'),
        `menu see-through: ${alpha(ctxMenu)}`,
      );
      closeCtxMenu();
      setView('goals');
      $('#view .card').click();
      const dlg = $('dialog.modal[open]'),
        field = dlg.querySelector('input[type=text]');
      assert(
        alpha(dlg) > 0.8 && alpha(dlg) < 0.95 && alpha(field) < alpha(dlg),
        `dialog ${alpha(dlg)}, field ${alpha(field)}`,
      );
      // One scrollbar: the body scrolls, the dialog never does; thin, on a clear track.
      const body = dlg.querySelector('.modal-body');
      assert(
        css(dlg).overflowY === 'hidden' &&
          dlg.scrollHeight <= dlg.clientHeight + 1 &&
          css(body).overflowY === 'auto' &&
          css(body).scrollbarWidth === 'thin' &&
          ['transparent', 'rgba(0, 0, 0, 0)'].some(c => css(body).scrollbarColor.endsWith(c)),
        `one thin scrollbar: ${dlg.scrollHeight}/${dlg.clientHeight} ${css(body).scrollbarColor}`,
      );
      dlg.close();
      // A select's open list is solid, not the see-through colour of its field.
      setView('map');
      const opt = $('#view select option'),
        surface = css(document.body).getPropertyValue('--surface').trim();
      const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
      assert(
        opt && css(opt).backgroundColor === rgb(surface) && alpha($('#view select')) < 1,
        `option list ${css(opt).backgroundColor}`,
      );
      setView('dashboard');
    },
  );

  await step('map: switching between light and dark redraws the glass in the new theme', () => {
    loadSample();
    setView('map');
    const slabColours = () =>
      [...document.querySelectorAll('.map-wrap defs > g[id^="glass-"] path, .map-wrap defs linearGradient stop')]
        .map(x => x.getAttribute('fill') || x.getAttribute('stop-color'))
        .join();
    const pick = k => $(`#themeSeg [data-theme-set="${k}"]`).click();
    const was = theme;
    pick('light');
    const light = slabColours();
    pick('dark');
    const dark = slabColours();
    assert(dark !== light, 'slabs redrawn when switching to dark');
    // The same as a map first drawn in dark.
    render();
    eq(slabColours(), dark, 'as if drawn in dark from the start');
    pick('light');
    eq(slabColours(), light, 'and back to light');
    // Following the system: a change of the system theme redraws it too.
    pick('system');
    document.documentElement.dataset.theme = 'dark';
    darkScheme.dispatchEvent(new Event('change'));
    eq(slabColours(), dark, 'system theme change redraws the map');
    // Other views follow the CSS: nothing is redrawn, so an open popup stays.
    setView('dashboard');
    const first = $('#view').firstElementChild;
    pick('light');
    darkScheme.dispatchEvent(new Event('change'));
    assert($('#view').firstElementChild === first, 'other views are not redrawn');
    pick(was);
  });

  await step('map: box text stays inside its box, bands sit close, the light on the faces is defined once', () => {
    const { NW } = MAP;
    // Text that ends within 4 px of the box's right edge (inside its border), with its box's title.
    const overflow = () =>
      [...document.querySelectorAll('.map-wrap .node')].flatMap(n =>
        [...n.querySelectorAll('text')]
          .filter(x => +x.getAttribute('x') + x.getComputedTextLength() > NW - 4)
          .map(x => `${n.getAttribute('aria-label')}: ${x.textContent} (${Math.round(x.getComputedTextLength())})`),
      );
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      loadSample();
      setView('map');
      eq(overflow(), [], `${code} sample plan: nothing overflows`);
      // Bands: one gap between them, smaller than the gap between rows inside a band.
      const bands = [...document.querySelectorAll('.map-wrap .band')].map(b => [
        +b.getAttribute('y'),
        +b.getAttribute('y') + +b.getAttribute('height'),
      ]);
      assert(
        bands.length === 3 &&
          bands.slice(1).every(([top], i) => top - bands[i][1] === MAP.BAND_GAP) &&
          MAP.BAND_GAP <= 16 &&
          MAP.BAND_GAP < MAP.VG,
        `${code}: bands ${MAP.BAND_GAP} px apart`,
      );
      // Each band's label sits below the boxes of the band above, inside its own band.
      const labels = [...document.querySelectorAll('.map-wrap .col-label')].map(l => l.getBBox());
      assert(
        labels.every((l, i) => l.y >= bands[i][0] && l.y + l.height <= bands[i][0] + MAP.HEAD),
        `${code}: labels in their band's head`,
      );
      // The light on the face: its reflection and its shading, defined once, used by every box, over its glass.
      const svg = $('.map-wrap svg');
      assert(
        svg.querySelectorAll('radialGradient').length === 2 &&
          svg.querySelectorAll('#glass-spec').length === 1 &&
          svg.querySelectorAll('#glass-shade').length === 1 &&
          svg.querySelectorAll('filter').length === 2,
        `${code}: face light defined once`,
      );
      assert(
        [...svg.querySelectorAll('.node')].every(n => n.querySelector('rect + .glass-shade + .glass-spec')),
        `${code}: every box has its light, right over its glass`,
      );
      const spec = getComputedStyle(svg.querySelector('.glass-spec'));
      assert(spec.fill.includes('#glass-spec') && spec.pointerEvents === 'none', `${code}: light fill ${spec.fill}`);
      // Milk glass, solid and tinted by status: a done box green, a late one red; to-do boxes take more grey.
      const rectOf = st => getComputedStyle(svg.querySelector(`.node.activity.st-${st} rect`));
      assert(
        +rectOf('done').fillOpacity === 1 && rectOf('done').fill !== rectOf('late').fill,
        `${code}: glass tinted by status`,
      );
      assert(
        getComputedStyle(svg.querySelector('.node.activity.st-todo')).getPropertyValue('--glass-tint').trim() ===
          getComputedStyle(document.documentElement).getPropertyValue('--glass-tint-quiet').trim(),
        `${code}: to-do boxes take more grey`,
      );
      // By night the glass is drawn on a dark base, and states take more colour than the rest.
      const theme = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = 'dark';
      render();
      const rootCss = getComputedStyle(document.documentElement);
      assert(
        parseFloat(rootCss.getPropertyValue('--glass-tint-state')) >
          parseFloat(rootCss.getPropertyValue('--glass-tint')) && $('.map-wrap defs > g[id="glass-state-other"]'),
        `${code}: states take more colour by night`,
      );
      if (theme) document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
      render();
      deletePlan(plans.current);
    }

    // Long routine text: short on the box, cut with "…" if still too wide, in full in the tooltip.
    changeLanguage('sl');
    fresh('Long text');
    const monthly = mk('activity', {
      title: 'Mesečni pregled financ',
      startDate: '2026-01-01',
      repeat: { every: 1, unit: 'month', times: 1 },
      checkins: { '2026-09-10': 1, '2026-10-10': 1 },
    });
    const weekly = mk('activity', {
      title: 'Tek trikrat na teden',
      startDate: '2026-01-01',
      repeat: { every: 1, unit: 'week', times: 3 },
      checkins: {},
    });
    const long = mk('activity', {
      title: 'Zelo dolg naslov aktivnosti, ki gotovo ne gre v okvir',
      dueDate: d(400),
      status: 'doing',
    });
    const wide = mk('goal', { title: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWW', deadline: d(30) });
    const state = mk('state', {
      title: 'Prihranki',
      value: '1234567890',
      unit: 'kilometrov in še nekaj',
      date: d(-1),
      history: [],
    });
    save();
    setView('map');
    eq(overflow(), [], 'sl long texts: nothing overflows');
    const node = x => $(`[data-map-node="${x.id}"]`);
    const sub = x => node(x).querySelector('.sub').textContent,
      tip = x => node(x).querySelector('title').textContent;
    const p = periodProgress(monthly),
      s = routineStreak(monthly);
    assert(s.n > 0, `the monthly routine has a streak (${s.n})`);
    eq(
      sub(monthly),
      `${t('map.rt.month', { done: p.done, target: 1 })}, ${t('map.rt.streak', { n: s.n })}`,
      'monthly: the short form',
    );
    assert(
      tip(monthly).includes(`${periodText(monthly)}, ${streakText(s)}`),
      `monthly: in full in the tooltip: ${tip(monthly)}`,
    );
    eq(sub(weekly), t('map.rt.week', { done: 0, target: 3 }), 'weekly without a streak: just this week');
    assert(
      node(long).querySelector('text').textContent.endsWith('…') && tip(long).startsWith(long.title),
      'long title: cut with … and whole in the tooltip',
    );
    assert(node(wide).querySelector('text').textContent.endsWith('…'), 'wide letters: cut by width, not by count');
    assert(
      sub(state).endsWith('…') && tip(state).includes('kilometrov in še nekaj'),
      `long amount: cut, whole in the tooltip: ${sub(state)}`,
    );
    changeLanguage('en');
    render();
    eq(overflow(), [], 'en long texts: nothing overflows');
    eq(sub(monthly), `${p.done}/1 this month, ${s.n}× in a row`, 'English short form');
    deletePlan(plans.current);
  });

  /* ---------- Visions ---------- */
  const clearVisions = () => {
    visions = { list: [], deleted: {} };
    saveVisions();
  };
  const mkV = (title, parents = [], p = {}) => {
    const v = { id: uid(), title, parents: parents.map(x => x.id), ...p };
    visions.list.push(v);
    return v;
  };
  const ids = list => [...list].map(x => x.id || x).sort();
  // Purpose counts the goals of every plan: these steps set the other plans aside while they run.
  let asideList = [];
  const setAside = () => {
    asideList = plans.list.filter(p => p.id !== plans.current);
    plans.list = plans.list.filter(p => p.id === plans.current);
  };
  const putBack = () => {
    plans.list.push(...asideList);
    asideList = [];
  };

  await step('visions: sync merges them like plans, repairs loops, keeps the Purpose found first', () => {
    // The merging itself is tested in src/core/visions.test.ts.
    // Stores: a file without visions, this device's store, merge and apply.
    clearVisions();
    const A = mkV('Shared');
    saveVisions();
    const local = localStore();
    eq(
      local.visions.list.map(x => x.title),
      ['Shared'],
      'this device sends its visions',
    );
    const old = parseStore(
      JSON.stringify({ format: SYNC_FORMAT, version: 1, plans: { list: [], deleted: {} }, data: {} }),
    );
    eq(old.visions, { list: [], deleted: {} }, 'an older file has none');
    const merged = mergeStores(local, old);
    eq(
      merged.visions.list.map(x => x.id),
      [A.id],
      'merged with a file without visions: kept',
    );
    eq(toFile(merged).visions.list.length, 1, 'written to the file');
    merged.visions.list.push({
      id: 'remote',
      title: 'From the other device',
      parents: [A.id],
      updatedAt: new Date().toISOString(),
    });
    applyStore(merged);
    assert(
      findVision('remote') && JSON.parse(localStorage.getItem(VISIONS_KEY)).list.length === 2,
      'applied and stored',
    );
    applyStore({ plans: merged.plans, data: merged.data });
    assert(findVision('remote'), 'a store without visions leaves them alone');
    clearVisions();
  });

  await step('visions: the view – empty, cards in tree order, status toward a Purpose, both languages', () => {
    clearVisions();
    fresh('Vision view');
    setView('visions');
    assert(
      $('#view .empty [data-new="vision"]') && $('#view').textContent.includes(t('vis.shared')),
      'empty: explains and offers to add one',
    );
    eq($('#addBtn').getAttribute('aria-label'), t('add.vision'), 'the add button adds a vision');
    assert(!$('#view [data-sample], #view [data-templates]'), 'no sample or templates offered for visions');
    const A = mkV('Zeta life'),
      B = mkV('Alpha under Zeta', [A]),
      D = mkV('Beta top'),
      C = mkV('Child of two', [B, D]);
    const g = mk('goal', { title: 'Serving goal', visions: [B.id] }),
      u = mk('goal', { title: 'Lonely goal' });
    save();
    saveVisions();
    render();
    const cards = [...document.querySelectorAll('#view .card.vision')];
    eq(
      cards.map(c => c.querySelector('h3').textContent),
      ['Beta top', 'Zeta life', 'Alpha under Zeta', 'Child of two'],
      'roots by title, each child under its first parent',
    );
    eq(
      cards.map(c => c.style.getPropertyValue('--level')),
      ['0', '0', '1', '2'],
      'indented by level',
    );
    const childCard = cards[3];
    assert(
      childCard.textContent.includes(t('vis.alsoUnder')) && childCard.querySelector(`.tag.vision[data-open="${D.id}"]`),
      'a second parent is named',
    );
    assert(cards[2].querySelector(`.tag.goal[data-open="${g.id}"]`), 'goals serving it are listed');
    assert(
      cards[1].classList.contains('reached') &&
        cards[2].classList.contains('reached') &&
        !cards[0].classList.contains('reached'),
      'reached visions are brighter',
    );
    const status = $('#view .vis-status').textContent;
    assert(
      status.includes(tp('vis.manyRoots', 2, { names: '“Zeta life”, “Beta top”' })),
      `status names the visions at the top: ${status}`,
    );
    assert(status.includes('Lonely goal'), 'and the goals serving none');
    // A goal from another plan is listed with its plan's name.
    const here = plans.current;
    fresh('Other plan');
    mk('goal', { title: 'Far goal', visions: [A.id] });
    save();
    openPlan(here);
    setView('visions');
    assert(
      $('#view .tag.other-plan').textContent.includes('Far goal') &&
        $('#view .tag.other-plan').textContent.includes('Other plan'),
      "other plans' goals show their plan",
    );
    assert(
      $('#view .vis-status').textContent.includes(t('vis.goalInPlan', { goal: 'Lonely goal', plan: 'Vision view' })),
      'with several plans, unlinked goals name their plan',
    );
    deletePlan(plans.list.find(p => p.name === 'Other plan').id);
    openPlan(here);
    setView('visions');
    // Escaping.
    mkV('<img src=x onerror=alert(1)>');
    saveVisions();
    render();
    assert(!$('#view img') && $('#view').textContent.includes('<img'), 'titles are escaped');
    visions.list.pop();
    saveVisions();
    // Help mode: no tutorial text for visions, and no raw key either.
    setHelp(true);
    assert(
      !$('#view .help-banner') && !$('#view').textContent.includes('help.view'),
      'help mode: no banner, no raw key',
    );
    setHelp(false);
    // Slovenian.
    changeLanguage('sl');
    setView('visions');
    assert(
      $('#viewTitle').textContent === 'Vizije' && $('#view').textContent.includes('Vizije so skupne'),
      'Slovenian',
    );
    changeLanguage('en');
    render();
    deletePlan(plans.current);
    clearVisions();
  });

  await step('visions: forms – add, edit, loop-free parents, goals both ways, delete', () => {
    clearVisions();
    fresh('Vision forms');
    setView('visions');
    const g = mk('goal', { title: 'Goal one' }),
      g2 = mk('goal', { title: 'Goal two' });
    save();
    $('#view [data-new="vision"]').click();
    assert(modal.open && $('#modalTitle').textContent === t('new.vision'), 'the form opens');
    submitForm();
    assert(modal.querySelector('[data-field="title"].invalid'), 'a title is required');
    $('#f-title').value = '  To be fit  ';
    $('#f-description').value = 'Strong and rested';
    submitForm();
    assert(!modal.open && visions.list.length === 1, 'added');
    const A = visions.list[0];
    eq([A.title, A.description, A.parents], ['To be fit', 'Strong and rested', []], 'trimmed');
    assert($('#toast').textContent.includes(t('toast.visionAdded')), 'toast');
    // A narrower one from the card's menu, with its parent picked.
    openCtxMenu(A.id, 10, 10);
    const acts = [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
    assert(
      acts.includes('edit') &&
        acts.includes('add:vision:parents') &&
        acts.includes('show:map') &&
        acts.includes('delete') &&
        !acts.includes('link') &&
        !acts.includes('show:visions'),
      `menu: ${acts}`,
    );
    runCtxAction('add:vision:parents', A.id);
    assert(modal.querySelector(`[data-picker="vision"] [data-picked-id="${A.id}"]`), 'the broader vision is picked');
    $('#f-title').value = 'Run';
    // Goals in this plan, picked in the form.
    pickItem(modal.querySelector(`[data-name="goals"] .pick-opt[data-pick="${g.id}"]`));
    submitForm();
    const B = visions.list.find(v => v.title === 'Run');
    eq(B.parents, [A.id], 'saved under it');
    eq(g.visions, [B.id], 'the goal serves it');
    // Editing the broader one offers no vision below it.
    openForm('vision', A.id);
    const offered = [...modal.querySelectorAll('[data-name="parents"] .pick-opt')].map(o => o.dataset.pick);
    eq(offered, [], 'neither itself nor the one below it');
    modal.close();
    openForm('vision', B.id);
    eq(
      [...modal.querySelectorAll('[data-name="parents"] .pick-opt')].map(o => o.dataset.pick),
      [A.id],
      'the narrower one can go under the broader',
    );
    // Unpicking the goal takes the link away.
    unpickItem(modal.querySelector('[data-name="goals"]'), g.id);
    submitForm();
    assert(!('visions' in g), 'no visions left: no field');
    // The goal form links goals to visions, and drops ids of visions that are gone.
    g2.visions = ['ghost', A.id];
    save();
    openForm('goal', g2.id);
    const picker = modal.querySelector('[data-picker="vision"][data-name="visions"]');
    assert(
      picker && [...picker.querySelectorAll('[data-picked-id]')].map(x => x.dataset.pickedId).join() === A.id,
      'the goal form shows the visions it serves',
    );
    pickItem(picker.querySelector(`.pick-opt[data-pick="${B.id}"]`));
    Object.entries({
      specific: 'A specific outcome that is long enough',
      metric: 'Runs',
      unit: 'x',
      baseline: '0',
      target: '10',
      achievable: 'Yes it is doable',
      relevant: 'Matters a lot to me',
      deadline: '01/01/2099',
    }).forEach(([k, val]) => {
      const el = $('#f-' + k);
      if (el) el.value = val;
    });
    submitForm();
    assert(!modal.open, 'goal saved: ' + [...modal.querySelectorAll('.field.invalid')].map(f => f.dataset.field));
    eq(g2.visions, [A.id, B.id], 'serves both; the one that is gone is dropped');
    // Without any visions, the goal form has no such field.
    const kept = visions;
    visions = { list: [], deleted: {} };
    openForm('goal', g.id);
    assert(!modal.querySelector('[data-name="visions"]'), 'no visions: no field');
    modal.close();
    visions = kept;
    // Delete from the form: a narrower one lets go, goals keep a dangling id that is ignored.
    openForm('vision', A.id);
    $('#deleteBtn').click();
    assert(!findVision(A.id) && visions.deleted[A.id], 'deleted');
    eq(findVision(B.id).parents, [], 'the narrower vision lets go of it');
    eq(ownVisions(g2), [B.id], 'the goal keeps only what is there');
    assert($('#toast').textContent.includes(t('toast.deleted.vision')), 'toast');
    // Clicking a card opens it; the menu's delete asks and deletes.
    setView('visions');
    $(`#view .card.vision[data-open="${B.id}"]`).click();
    assert(modal.open && $('#modalTitle').textContent === t('edit.vision'), 'a card opens its form');
    modal.close();
    runCtxAction('delete', B.id);
    assert(!visions.list.length, 'deleted from the menu');
    deletePlan(plans.current);
    clearVisions();
  });

  await step('visions: the map – a band above goals, clouds, lines, hiding unrelated visions, linking', () => {
    clearVisions();
    fresh('Vision map');
    const A = mkV('Health'),
      B = mkV('Fitness', [A]),
      C = mkV('Unrelated');
    const g = mk('goal', { title: 'Run', visions: [B.id], deadline: d(30) }),
      g2 = mk('goal', { title: 'Read', deadline: d(40) });
    const a = mk('activity', { title: 'Train', dueDate: d(5) });
    rel(a, g, 'contributes');
    save();
    saveVisions();
    setView('map');
    const svg = $('.map-wrap svg');
    eq(
      [...svg.querySelectorAll('.band')].map(b => b.classList[1]),
      ['vision', 'goal', 'activity'],
      'visions on top',
    );
    const y = id =>
      Number(
        svg
          .querySelector(`[data-map-node="${id}"]`)
          .getAttribute('transform')
          .match(/,([\d.]+)\)/)[1],
      );
    assert(y(A.id) < y(B.id) && y(B.id) < y(g.id), 'the broader vision above the narrower, both above goals');
    assert(
      svg.querySelectorAll('.node.vision').length === 3 && !svg.querySelector('.node.vision use'),
      'visions are clouds, not glass',
    );
    assert(svg.querySelector('#vision-cloud') && svg.querySelector('#vision-glow'), 'their filters are defined');
    eq(
      getComputedStyle(svg.querySelector(`[data-map-node="${B.id}"] rect.cloud`)).filter.includes('url'),
      true,
      'with blurred edges',
    );
    assert(
      svg.querySelector(`[data-map-node="${B.id}"]`).classList.contains('reached') &&
        !svg.querySelector(`[data-map-node="${C.id}"]`).classList.contains('reached'),
      'reached visions are brighter',
    );
    assert(
      svg.querySelector(`[data-rel-edit="${visionRelId(g.id, B.id)}"]`) &&
        svg.querySelector(`[data-rel-edit="${visionRelId(B.id, A.id)}"]`),
      'lines to visions',
    );
    // Glow on what works toward a vision.
    assert(
      svg.querySelector(`[data-map-node="${g.id}"]`).classList.contains('vglow') &&
        svg.querySelector(`.vglow-halos [data-halo="${a.id}"]`),
      'the goal and its activity glow',
    );
    // The glow lies under every line and box: its layer comes before them all.
    const layer = svg.querySelector('.vglow-halos');
    const lineLayer = svg.querySelector('.vglow-lines');
    assert(
      lineLayer &&
        !svg.querySelector('.edge-g .edge-vglow') &&
        [...svg.querySelectorAll('.edge-g, .node')].every(
          x => lineLayer.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      'lines glow in a layer under all lines and boxes',
    );
    assert(
      parseFloat(getComputedStyle(lineLayer.querySelector('.edge-vglow')).strokeWidth) >= 12 &&
        getComputedStyle(lineLayer).filter.includes('vision-line-glow'),
      'a wide, soft glow',
    );
    assert(
      svg.querySelector('#vision-glow feComposite[operator="out"]'),
      "the boxes' glow is cut away inside every box",
    );
    assert(
      !svg.querySelector('.node .node-vglow') &&
        [...svg.querySelectorAll('.edge-g, .node')].every(
          x => layer.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      'the glow is drawn under all lines and boxes',
    );
    assert(!svg.querySelector(`[data-map-node="${g2.id}"]`).classList.contains('vglow'), 'an unrelated goal does not');
    assert(
      svg.querySelector(`[data-rel-edit="${db.relations[0].id}"]`).classList.contains('vglow') &&
        svg.querySelector(`.vglow-lines [data-line-glow="${visionRelId(g.id, B.id)}"]`),
      'and the lines between them',
    );
    // Toggles for the two link types.
    $('[data-rel-toggle="serves"]').click();
    assert(
      !$(`[data-rel-edit="${visionRelId(g.id, B.id)}"]`) && $(`[data-rel-edit="${visionRelId(B.id, A.id)}"]`),
      'goal → vision lines hidden',
    );
    $('[data-rel-toggle="serves"]').click();
    $('[data-rel-toggle="subvision"]').click();
    assert(!$(`[data-rel-edit="${visionRelId(B.id, A.id)}"]`), 'vision → vision lines hidden');
    $('[data-rel-toggle="subvision"]').click();
    eq($('[data-rel-toggle="serves"] .count').textContent, '1', 'counted');
    // Hide unrelated visions.
    $('[data-hide-visions]').click();
    eq(
      [...$('.map-wrap svg').querySelectorAll('.node.vision')].map(n => n.dataset.mapNode).sort(),
      ids([A, B]),
      'only what goals serve, and above it',
    );
    assert(
      prefs.get('hideVisions') === true && $('[data-hide-visions]').getAttribute('aria-pressed') === 'true',
      'remembered',
    );
    $('[data-hide-visions]').click();
    eq($('.map-wrap svg').querySelectorAll('.node.vision').length, 3, 'shown again');
    // One goal picked: only its visions.
    ui.mapGoal = g2.id;
    render();
    eq($('.map-wrap svg').querySelectorAll('.node.vision').length, 0, 'a goal serving none: no visions');
    ui.mapGoal = g.id;
    render();
    eq(
      [...$('.map-wrap svg').querySelectorAll('.node.vision')].map(n => n.dataset.mapNode).sort(),
      ids([A, B]),
      'its visions and those above',
    );
    ui.mapGoal = '';
    render();
    // Linking by tapping (or dragging).
    assert(
      canLink(g2.id, C.id) &&
        canLink(C.id, g2.id) &&
        !canLink(a.id, A.id) &&
        !canLink(A.id, B.id) &&
        canLink(C.id, A.id),
      'which links fit',
    );
    linkItems(C.id, g2.id);
    eq(g2.visions, [C.id], 'vision then goal: the goal serves it');
    assert(
      $('#toast').textContent.includes(t('map.visionLinked', { a: 'Read', b: 'Unrelated' })),
      'said so, goal first',
    );
    linkItems(g2.id, C.id);
    assert($('#toast').textContent.includes(t('err.relExists')), 'not twice');
    linkItems(C.id, A.id);
    eq(C.parents, [A.id], 'vision onto vision: serves it');
    linkItems(A.id, C.id);
    assert($('#toast').textContent.includes(t('err.visionLoop')) && !A.parents.length, 'no loops');
    linkItems(a.id, A.id);
    assert($('#toast').textContent.includes(t('err.visionGoalOnly')) && !('visions' in a), 'only goals serve visions');
    // Selecting a line, editing and removing it.
    const line = visionRelId(g.id, B.id);
    $(`[data-rel-edit="${line}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    assert(
      ui.mapRel === line &&
        $('.map-rel-selection').textContent.includes('Run') &&
        $('.map-rel-selection').textContent.includes(t('rel.serves')),
      'selected, and named',
    );
    openForm('relation', line);
    assert(
      modal.open && $('#modalTitle').textContent === t('edit.vision') && $('#f-title').value === 'Fitness',
      'editing it opens the vision',
    );
    modal.close();
    openRelMenu(line, 20, 20);
    assert(!ctxMenu.hidden && ctxMenu.querySelector('[data-ctx="rel-remove"]'), 'it has a menu');
    closeCtxMenu();
    $(`[data-rel-remove="${line}"]`).click();
    assert(!('visions' in g) && !ui.mapRel && $('#toast').textContent.includes(t('map.visionUnlinked')), 'removed');
    removeRelation(visionRelId(C.id, A.id));
    eq(C.parents, [], 'a vision line removed');
    // A vision's menu on the map links and highlights.
    openCtxMenu(A.id, 10, 10);
    const acts = [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
    assert(
      acts.includes('link') &&
        acts.includes('highlight') &&
        acts.includes('show:visions') &&
        !acts.includes('show:map'),
      `map menu: ${acts}`,
    );
    closeCtxMenu();
    // Shown in the map from the Visions view, with filters that hid it cleared.
    ui.hideVisions = true;
    ui.mapGoal = g2.id;
    setView('visions');
    showIn('map', C.id);
    assert(
      ui.view === 'map' && $(`[data-map-node="${C.id}"]`) && !ui.hideVisions && !ui.mapGoal,
      'show in map reveals it',
    );
    // Double-click opens it.
    const n = () => $(`[data-map-node="${A.id}"]`);
    n().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    n().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    assert(modal.open && $('#f-title').value === 'Health', 'double-click opens it');
    modal.close();
    // Only visions, no items: the map still draws them.
    fresh('Only visions');
    setView('map');
    assert($('.map-wrap svg .node.vision') && !$('#view > .empty'), 'visions alone are drawn');
    clearVisions();
    render();
    assert(!$('[data-hide-visions]') && !$('[data-rel-toggle="serves"]'), 'no visions: no vision chips');
    deletePlan(plans.current);
    deletePlan(plans.list.find(p => p.name === 'Vision map').id);
  });

  await step('visions: glow in every view, gold Purpose, logo, popup once', async () => {
    clearVisions();
    fresh('Glow');
    setAside();
    const A = mkV('Purposeful life');
    const g = mk('goal', { title: 'Lead', visions: [A.id], deadline: d(20), startDate: d(-5) });
    const u = mk('goal', { title: 'Loose', deadline: d(25), startDate: d(-5) });
    const a = mk('activity', { title: 'Practise', status: 'doing', dueDate: d(0), startDate: d(-2) });
    const r = mk('activity', {
      title: 'Daily habit',
      startDate: d(-10),
      repeat: { every: 1, unit: 'day' },
      checkins: {},
    });
    const s = mk('state', {
      title: 'Level',
      value: '3',
      date: d(-1),
      history: [
        { date: d(-3), value: '1' },
        { date: d(-1), value: '3' },
      ],
    });
    const ua = mk('activity', { title: 'Loose work', status: 'doing', dueDate: d(0), startDate: d(-2) });
    rel(a, g, 'contributes');
    rel(r, g, 'contributes');
    rel(s, g, 'measures');
    rel(ua, u, 'contributes');
    save();
    saveVisions();
    const glowing = () =>
      [...document.querySelectorAll('#view .vglow')].map(el => el.dataset.ctxItem || el.dataset.tlNode);
    const per = {};
    for (const v of ['dashboard', 'goals', 'activities', 'states', 'timeline', 'graphs']) {
      setView(v);
      per[v] = glowing();
      assert(
        per[v].length && !per[v].includes(u.id) && !per[v].includes(ua.id),
        `${v}: only what serves a vision glows (${per[v]})`,
      );
    }
    assert(
      per.goals.includes(g.id) &&
        per.activities.includes(a.id) &&
        per.states.includes(s.id) &&
        per.timeline.includes(g.id) &&
        per.graphs.includes(s.id) &&
        per.dashboard.includes(a.id),
      JSON.stringify(per),
    );
    // On the timeline the labels beside the bars stay over every bar's glow.
    setView('timeline');
    const lbl = $('#view .tl-bar-label'),
      bar = $('#view .tl-row.vglow .tl-bar, #view .tl-row.vglow .tl-milestone');
    assert(
      lbl && bar && +getComputedStyle(lbl).zIndex > +getComputedStyle(bar).zIndex,
      'timeline labels sit over glowing bars',
    );
    assert(
      getComputedStyle(bar).boxShadow.includes('12px'),
      `a bar's glow stays within its row: ${getComputedStyle(bar).boxShadow}`,
    );
    setView('goals');
    const card = id => $(`#view .card[data-ctx-item="${id}"]`);
    // The glow lies behind the cards: a layer under the card itself, not a shadow of the card that could cover its neighbours.
    const halo = getComputedStyle(card(g.id), '::before');
    assert(
      halo.boxShadow.includes('26px') &&
        halo.zIndex === '-1' &&
        getComputedStyle(card(u.id), '::before').boxShadow === 'none',
      `the glow is a layer behind the card: ${halo.boxShadow}`,
    );
    const withGlow = getComputedStyle(card(g.id)).boxShadow;
    card(g.id).classList.remove('vglow');
    eq(withGlow, getComputedStyle(card(g.id)).boxShadow, 'the card itself looks the same');
    card(g.id).classList.add('vglow');
    assert(getComputedStyle($('#view')).isolation === 'isolate', 'the view keeps the glow above its own background');
    const silver = getComputedStyle(document.documentElement).getPropertyValue('--vglow').trim();
    assert(!document.documentElement.classList.contains('purpose'), 'not yet a Purpose');
    const logo = () => getComputedStyle($('.brand .blaze-mark circle')).fill;
    const red = logo();
    // Purpose: the loose goal is paused.
    assert(!visions.purposeFound, 'not found yet');
    u.status = 'paused';
    save();
    render();
    assert(document.documentElement.classList.contains('purpose'), 'Purpose');
    const dlg = $('#purposeDlg');
    assert(dlg.open && $('#purposeText').textContent === t('purpose.text', { name: A.title }), 'congratulated');
    eq(visions.purposeFound, today(), 'remembered');
    assert(
      getComputedStyle(document.documentElement).getPropertyValue('--vglow').trim() !== silver,
      'the glow turns gold',
    );
    assert(logo() !== red, `the logo turns gold: ${logo()}`);
    dlg.querySelector('button').click();
    await tick();
    assert(!dlg.open, 'closes');
    render();
    assert(!dlg.open, 'not shown again');
    setView('visions');
    assert(
      $('#view .card.vision.purpose .tag.purpose') && $('#view .vis-status.found').textContent.includes(A.title),
      'the Purpose card is gold, tagged, and the status says so',
    );
    setView('map');
    assert(
      $(`[data-map-node="${A.id}"]`).classList.contains('purpose') &&
        $(`[data-map-node="${A.id}"] .sub`).textContent.startsWith(t('vis.purpose')),
      'gold on the map too',
    );
    // Lost and found again: no second popup.
    u.status = 'active';
    save();
    render();
    assert(
      !document.documentElement.classList.contains('purpose') && logo() === red,
      'lost: silver again, the logo red',
    );
    u.status = 'paused';
    save();
    render();
    assert(document.documentElement.classList.contains('purpose') && !dlg.open, 'found again without a popup');
    // In Slovenian.
    visions.purposeFound = undefined;
    changeLanguage('sl');
    render();
    assert(
      dlg.open &&
        $('#purposeTitle').textContent === 'Našli ste svoj Smisel' &&
        $('#purposeText').textContent.includes('Purposeful life'),
      'Slovenian popup',
    );
    dlg.close();
    changeLanguage('en');
    render();
    // No visions: nothing glows.
    clearVisions();
    setView('goals');
    assert(
      !document.querySelector('#view .vglow') && !document.documentElement.classList.contains('purpose'),
      'no visions: no glow',
    );
    putBack();
    deletePlan(plans.current);
  });

  await step('visions: phone – cards fit 390 px, the deepest level too', async () => {
    clearVisions();
    fresh('Phone visions');
    const A = mkV('A long vision title that goes on and on and on'),
      B = mkV('Narrower', [A]),
      C = mkV('Narrowest of them all', [B]),
      D = mkV('Deeper still', [C]);
    mk('goal', { title: 'G', visions: [D.id] });
    save();
    saveVisions();
    setView('visions');
    const frame = document.createElement('iframe');
    Object.assign(frame.style, {
      width: '390px',
      height: '900px',
      position: 'fixed',
      left: '-9999px',
      top: '0',
      border: '0',
    });
    frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0 16px">${$('#view').innerHTML}</body>`;
    await new Promise(res => {
      frame.onload = res;
      document.body.append(frame);
    });
    const doc = frame.contentDocument,
      cards = [...doc.querySelectorAll('.card.vision')];
    eq(cards.length, 4, 'all four drawn');
    assert(
      cards.every(c => c.getBoundingClientRect().right <= 390 - 16 + 0.5 && c.getBoundingClientRect().width > 200),
      `inside the screen, still wide enough: ${cards.map(c => Math.round(c.getBoundingClientRect().width))}`,
    );
    assert(
      cards[3].getBoundingClientRect().left > cards[0].getBoundingClientRect().left,
      'deeper visions are indented',
    );
    assert(doc.documentElement.scrollWidth <= 390, `no sideways scroll: ${doc.documentElement.scrollWidth}`);
    frame.remove();
    deletePlan(plans.current);
    clearVisions();
  });

  /* ---------- Users: one per Google account on a shared device, their data strictly apart ---------- */

  // A fake Google: each token belongs to the account picked in the "popup", and each account has its
  // own Drive file. A write with one account's token can only land in that account's file.
  const G = {
    accounts: {
      A: { id: 'perm-A', email: 'ana@example.com', name: 'Ana Novak' },
      B: { id: 'perm-B', email: 'bor@example.com', name: 'Bor' },
      C: { id: 'perm-C', email: 'cene@example.com', name: '' },
    },
    files: {},
    tokens: {},
    pick: 'A',
    requests: [],
    n: 0,
    reads: 0,
  };
  const fakeGoogle = () => {
    Object.assign(drive, REAL_DRIVE);
    drive.request = async (hint, prompt) => {
      G.requests.push({ hint, prompt });
      const value = `tok${++G.n}`;
      G.tokens[value] = G.accounts[G.pick].id;
      return { value, expires: Date.now() + 3600e3 };
    };
    drive.whoami = async value => ({ ...Object.values(G.accounts).find(a => a.id === G.tokens[value]) });
    drive.read = async value => {
      G.reads++;
      const f = G.files[G.tokens[value]];
      return { id: f ? 'file-' + G.tokens[value] : null, content: f ? parseStore(JSON.stringify(f)) : null, extra: [] };
    };
    drive.write = async (value, id, content) => {
      const acct = G.tokens[value];
      if (!acct || (id && id !== 'file-' + acct)) throw new Error('write to a file of another account');
      G.files[acct] = JSON.parse(JSON.stringify(content));
      return 'file-' + acct;
    };
    drive.remove = async () => {};
  };
  const realPrompt = window.prompt,
    realOffer = offerTour;
  let prompts = [],
    offers = 0,
    nameAnswer = null;
  window.prompt = (msg, def) => {
    prompts.push([msg, def]);
    return nameAnswer ?? def;
  };
  offerTour = () => offers++;
  const SECRET = { A: 'SECRET-ana-goal', B: 'SECRET-bor-goal', G: 'SECRET-guest-goal', C: 'SECRET-cene-goal' };
  const fileText = acct => JSON.stringify(G.files[acct] || null);
  const keysText = u =>
    userKeys(u)
      .sort()
      .map(k => `${k}=${localStorage.getItem(k)}`)
      .join('\n');
  const memText = () =>
    JSON.stringify({ db, plans, visions, other: allPlansData().map(p => p.data) }) +
    document.querySelector('.app').innerHTML;
  const byAcct = key => users.list.find(u => u.account?.id === G.accounts[key].id);
  const addSecret = title => {
    setView('goals');
    mk('goal', { title });
    visions.list.push({ id: uid(), title: title + '-vision', parents: [] });
    save();
    saveVisions();
    render();
  };
  const noLeak = (text, keys, where) =>
    keys.forEach(k => assert(!text.includes(SECRET[k]), `${where} holds ${SECRET[k]}`));
  const settle = async () => {
    for (let i = 0; i < 5; i++) await tick();
    clearTimeout(syncState.timer);
    syncState.timer = null;
  };

  await step("users: the first Google login takes this device's data to that account", async () => {
    fakeGoogle();
    clearTimeout(syncState.timer);
    Object.assign(syncState, { busy: false, again: false, timer: null });
    fresh('Ana plan');
    addSecret(SECRET.A);
    theme = 'dark';
    prefs.set('theme', 'dark');
    applyTheme();
    prefs.set('view', 'goals');
    G.pick = 'A';
    prompts = [];
    nameAnswer = 'Ana';
    await logIn();
    await settle();
    const me = currentUser();
    assert(users.list.length === 1 && me.id === 'local', 'still the one user');
    eq(me.account, { id: 'perm-A', email: 'ana@example.com' }, 'linked to the account');
    eq(
      prompts.map(p => p[1]),
      ['Ana Novak'],
      'asked for a name once, suggesting the Google name',
    );
    assert(me.name === 'Ana' && JSON.parse(localStorage.getItem(USERS_KEY)).list[0].name === 'Ana', 'name kept');
    eq(G.requests.at(-1), { hint: '', prompt: 'select_account' }, 'Google lets the user pick the account');
    assert(
      fileText('perm-A').includes(SECRET.A) && fileText('perm-A').includes('Ana plan'),
      'everything synced to that account',
    );
    assert(syncState.status === 'synced' && !$('#syncBtn').hidden, 'synced, cloud shown');
    assert(
      G.tokens[JSON.parse(sessionStorage.getItem('actionplan.syncToken')).value] === 'perm-A',
      'token kept for this user',
    );
    assert(!offers, 'no first-visit tour: the data is the same');
  });

  await step(
    'users: another account on a device already logged in gets an empty user, as on a first visit',
    async () => {
      const aFile = fileText('perm-A');
      G.pick = 'B';
      prompts = [];
      nameAnswer = null;
      await logIn();
      await settle();
      const bor = currentUser();
      assert(
        users.list.length === 2 && bor.id !== 'local' && bor.ns === `u.${bor.id}.`,
        'a second user on their own prefix',
      );
      eq(bor.account, { id: 'perm-B', email: 'bor@example.com' }, 'linked to the new account');
      eq(bor.name, 'Bor', 'name prompted (Google name taken as given)');
      assert(
        plans.list.length === 1 &&
          plans.list[0].name === t('plan.defaultName') &&
          itemCount() === 0 &&
          !visions.list.length,
        'one empty starter plan, no visions',
      );
      assert(
        ui.view === 'dashboard' && theme === 'system' && !document.documentElement.dataset.theme,
        "default view and theme, not Ana's",
      );
      eq(offers, 1, 'the first-visit language picker and tour are offered');
      noLeak(memText(), ['A'], "Bor's screen and memory");
      noLeak(fileText('perm-B'), ['A'], "Bor's Drive");
      noLeak(keysText(bor), ['A'], "Bor's stored keys");
      assert(fileText('perm-A') === aFile, "Ana's Drive untouched");
      assert(
        G.tokens[JSON.parse(sessionStorage.getItem(`actionplan.u.${bor.id}.syncToken`)).value] === 'perm-B',
        "Bor's own token, under his prefix",
      );
      assert(
        G.tokens[JSON.parse(sessionStorage.getItem('actionplan.syncToken')).value] === 'perm-A',
        "Ana's token stays hers",
      );
      // The real offer: a new user has not seen the tour, so the language picker opens.
      realOffer();
      await tick();
      await tick();
      assert($('.lang-pick'), 'language picker shown');
      $('.lang-pick [data-lang-done]').click();
      assert(tour.step >= 0, 'then the tour');
      endTour(false);
      assert(prefs.get('tourSeen') === true && plans.list.length === 1, 'tour seen, its plan gone');
      addSecret(SECRET.B);
      await syncNow(true);
      await settle();
      assert(fileText('perm-B').includes(SECRET.B), "Bor's edits sync to Bor's Drive");
      assert(fileText('perm-A') === aFile, "and not to Ana's");
    },
  );

  await step("users: switching back opens that user's own data, as they left it", async () => {
    renderSync();
    const ana = byAcct('A');
    const row = [...$('#syncSection .user-list').children].find(li => li.textContent.includes('Ana'));
    assert(row && row.textContent.includes('ana@example.com'), 'Ana listed under others, with her email');
    G.pick = 'A';
    prompts = [];
    row.querySelector('[data-sync="switch"]').click();
    await settle();
    await settle();
    assert(currentUser() === ana && !prompts.length, 'Ana again, no name asked');
    eq(G.requests.at(-1), { hint: 'ana@example.com', prompt: 'select_account' }, 'Google is told which account');
    assert(theme === 'dark' && ui.view === 'goals', 'her theme and view');
    assert(
      db.goals.some(g => g.title === SECRET.A) ||
        allPlansData().some(p => p.data.goals.some(g => g.title === SECRET.A)),
      'her goal',
    );
    noLeak(memText(), ['B'], "Ana's screen and memory");
    noLeak(keysText(ana), ['B'], "Ana's stored keys");
    noLeak(keysText(byAcct('B')), ['A'], "Bor's stored keys");
    noLeak(fileText('perm-A'), ['B'], "Ana's Drive");
    assert($('#toast').textContent === t('user.switched', { name: 'Ana' }), 'toast says who');
  });

  await step("users: a renewed token for someone else's account is refused", async () => {
    const aFile = fileText('perm-A'),
      bFile = fileText('perm-B');
    drive.forget();
    G.pick = 'B'; // the popup picked Bor's account while Ana renews
    await syncNow(true);
    await settle();
    eq(syncState.status, 'account', 'status says it was another account');
    assert($('#syncBtn').title === t('sync.status.account', { email: 'ana@example.com' }), 'and which to choose');
    assert(!sessionStorage.getItem('actionplan.syncToken') && !drive.token, 'the wrong token is not kept');
    assert(fileText('perm-A') === aFile && fileText('perm-B') === bFile, 'neither Drive touched');
    G.pick = 'A';
    await syncNow(true);
    await settle();
    eq(syncState.status, 'synced', 'the right account syncs again');
    eq(G.requests.at(-1), { hint: 'ana@example.com', prompt: '' }, "renewal hints Ana's account");
  });

  await step('users: a sync on its way when another user takes over stops, both ways', async () => {
    const ana = currentUser(),
      bFile = fileText('perm-B');
    let release;
    const slow = drive.read;
    drive.read = value =>
      new Promise(r => {
        release = () => r(slow(value));
      });
    addSecret(SECRET.A + '-2');
    clearTimeout(syncState.timer);
    const running = syncNow(false);
    await tick();
    G.pick = 'B';
    const switching = logIn('bor@example.com', byAcct('B'));
    await settle();
    assert(currentUser() === byAcct('B'), 'Bor took over');
    const reads = G.reads;
    drive.read = slow;
    release();
    await running;
    await switching;
    await settle();
    noLeak(memText(), ['A'], "Bor's screen after Ana's late answer");
    noLeak(keysText(currentUser()), ['A'], "Bor's keys after Ana's late answer");
    assert(!fileText('perm-A').includes(SECRET.A + '-2'), "Ana's stopped sync wrote nothing");
    assert(fileText('perm-B') === bFile, "nor into Bor's Drive");
    assert(!syncState.busy, 'not stuck');
    await syncNow(true);
    await settle();
    noLeak(fileText('perm-B'), ['A'], "Bor's next sync");
    assert(G.reads > reads, 'Bor syncs normally');
    // Back to Ana: her unsynced edit is still hers and goes up now.
    G.pick = 'A';
    await logIn('ana@example.com', ana);
    await settle();
    assert(fileText('perm-A').includes(SECRET.A + '-2'), "Ana's edit synced once she is back");
    noLeak(fileText('perm-A'), ['B'], "Ana's Drive");
  });

  await step("users: log out leaves an empty guest; a guest's login keeps the guest's data", async () => {
    const before = users.list.length,
      ana = currentUser();
    $('#settingsBtn').click();
    $('#syncSection [data-sync="logout"]').click();
    const guest = currentUser();
    assert(
      users.list.length === before + 1 && !guest.account && guest.ns === `u.${guest.id}.`,
      'a new guest on their own prefix',
    );
    assert(
      $('#syncBtn').hidden && !drive.token && !sessionStorage.getItem('actionplan.syncToken'),
      "signed out, Ana's token gone",
    );
    assert(plans.list.length === 1 && itemCount() === 0 && !visions.list.length, 'an empty start');
    noLeak(memText(), ['A', 'B'], "the guest's screen and memory");
    assert($('#toast').textContent === t('user.loggedOut', { name: 'Ana' }), 'toast');
    const names = [...$('#syncSection .user-list').querySelectorAll('b')].map(b => b.textContent);
    eq(names, ['Ana', 'Bor'], 'everyone signed in here is listed');
    assert(
      [...document.querySelectorAll('#syncSection .user-list [data-sync="switch"]')].every(
        b => b.textContent === t('user.logIn'),
      ),
      'each with Log in',
    );
    assert(keysText(ana).includes(SECRET.A), "Ana's data stays on the device");
    settings.close();
    addSecret(SECRET.G);
    G.pick = 'C';
    prompts = [];
    await logIn();
    await settle();
    assert(currentUser() === guest && users.list.length === before + 1, "the guest becomes the new account's user");
    eq(guest.name, 'cene', "no Google name: the email's name is suggested");
    assert(fileText('perm-C').includes(SECRET.G), "the guest's data synced to it");
    noLeak(fileText('perm-C'), ['A', 'B'], "Cene's Drive");
    // Logging out again makes a new guest; a known account from there opens its user and leaves the guest be.
    logOut();
    const guest2 = currentUser();
    assert(guest2 !== guest && !guest2.account && users.list.length === before + 2, 'a new guest');
    addSecret('guest-two-goal');
    G.pick = 'B';
    await logIn();
    await settle();
    assert(
      currentUser() === byAcct('B') && users.list.includes(guest2) && !guest2.account,
      'Bor opened, guest kept as it was',
    );
    noLeak(memText(), ['A', 'C', 'G'], "Bor's screen");
    assert(
      !memText().includes('guest-two-goal') && keysText(guest2).includes('guest-two-goal'),
      "the guest's goal stays the guest's",
    );
    logOut();
    assert(
      currentUser() === guest2 && db.goals.some(g => g.title === 'guest-two-goal'),
      'logging out returns to that one guest',
    );
  });

  await step('users: no item of one user is stored under another, in storage or session', () => {
    const owner = { A: byAcct('A'), B: byAcct('B'), G: byAcct('C') }; // the first guest's data became Cene's
    Object.entries(owner).forEach(([k, u]) => {
      assert(keysText(u).includes(SECRET[k]), `${k} still has their own`);
      users.list
        .filter(o => o !== u)
        .forEach(o => assert(!keysText(o).includes(SECRET[k]), `${SECRET[k]} found under ${o.name || o.id}`));
    });
    users.list.forEach(u => {
      const tok = userKeys(u, sessionStorage)
        .map(k => JSON.parse(sessionStorage.getItem(k))?.value)
        .filter(Boolean);
      tok.forEach(v => assert(G.tokens[v] === u.account?.id, `${u.name}: a token of ${G.tokens[v]}`));
    });
    // Every stored key belongs to exactly one user (or the device: the user list and the language).
    const owners = {};
    for (let i = 0; i < localStorage.length; i++) owners[localStorage.key(i)] = 0;
    users.list.forEach(u => userKeys(u).forEach(k => owners[k]++));
    const odd = Object.entries(owners).filter(([k, n]) => n !== 1 && k !== USERS_KEY && k !== LANG_KEY);
    assert(!odd.length, 'keys with no single owner: ' + odd.map(o => o.join(':')));
    eq(
      Object.values(G.files).map(f => f.format),
      ['actionplan-sync', 'actionplan-sync', 'actionplan-sync'],
      'one file per account',
    );
    return `${users.list.length} users`;
  });

  await step('users: name on the first login, changed in Settings, escaped', async () => {
    G.pick = 'A';
    await logIn('ana@example.com', byAcct('A'));
    await settle();
    $('#settingsBtn').click();
    const input = $('#syncSection [data-user-name]');
    assert(
      input.value === 'Ana' &&
        $('#syncSection').textContent.includes(t('user.signedInAs', { email: 'ana@example.com' })),
      'name and account shown',
    );
    input.focus();
    setSyncStatus('syncing');
    assert(
      document.activeElement === input && $('#syncSection .sync-status').dataset.status === 'syncing',
      'a status change keeps the field in focus',
    );
    input.value = '  <img src=x onerror=alert(1)> Ana  ';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    renderSync();
    eq(currentUser().name, '<img src=x onerror=alert(1)> Ana', 'renamed, trimmed');
    eq(
      JSON.parse(localStorage.getItem(USERS_KEY)).list.find(u => u.id === currentUser().id).name,
      currentUser().name,
      'stored',
    );
    eq(byAcct('B').name, 'Bor', 'others keep their names');
    G.pick = 'B';
    await logIn('bor@example.com', byAcct('B'));
    await settle();
    renderSync();
    assert(!$('#syncSection img') && $('#syncSection .user-list').textContent.includes('<img src=x'), 'shown as text');
    $('#syncSection [data-user-name]').value = '';
    $('#syncSection [data-user-name]').dispatchEvent(new Event('change', { bubbles: true }));
    renderSync();
    assert($('#syncSection [data-user-name]').placeholder === 'bor@example.com', 'an empty name shows the email');
    byAcct('B').name = 'Bor';
    saveUsers();
    changeLanguage('sl');
    assert(
      $('#syncSection').textContent.includes(I18N.sl.strings['user.logOut']) &&
        $('#syncSection h3').textContent === I18N.sl.strings['sync.title'],
      'Slovenian',
    );
    changeLanguage('en');
    settings.close();
  });

  await step('users: a device linked before users existed learns its account on the next sync', async () => {
    const bor = currentUser();
    bor.account = { id: '', email: '' };
    drive.forget();
    G.pick = 'B';
    await syncNow(true);
    await settle();
    eq(bor.account, { id: 'perm-B', email: 'bor@example.com' }, 'account learnt');
    eq(syncState.status, 'synced', 'and synced');
    // Picked from the list while its account is not known yet: that user, not a new one.
    bor.account = { id: '', email: '' };
    saveUsers();
    const count = users.list.length;
    logOut();
    await logIn('', bor);
    await settle();
    assert(currentUser() === bor && users.list.length === count && bor.account.id === 'perm-B', 'the picked user');
  });

  await step('users: failed or cancelled Google sign-in changes nothing', async () => {
    const me = currentUser(),
      count = users.list.length,
      file = fileText('perm-B');
    drive.request = async () => {
      throw new SyncError('auth');
    };
    await logIn();
    assert(
      currentUser() === me && users.list.length === count && $('#toast').textContent === t('sync.connectFailed'),
      'same user, toast',
    );
    fakeGoogle();
    drive.whoami = async () => {
      throw new SyncError('offline');
    };
    await logIn();
    assert(
      currentUser() === me && users.list.length === count && fileText('perm-B') === file,
      'identity unknown: nothing changes',
    );
    fakeGoogle();
  });

  await step('users: phone width – the account section fits 390 px', async () => {
    $('#settingsBtn').click();
    const frame = document.createElement('iframe');
    Object.assign(frame.style, {
      width: '390px',
      height: '900px',
      position: 'fixed',
      left: '-9999px',
      top: '0',
      border: '0',
    });
    frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0"><div class="modal-body" style="padding:0 16px">${$('#syncSection').outerHTML}</div></body>`;
    await new Promise(res => {
      frame.onload = res;
      document.body.append(frame);
    });
    const doc = frame.contentDocument;
    const wide = [...doc.querySelectorAll('#syncSection *')]
      .filter(el => el.getBoundingClientRect().right > 390 - 16 + 0.5)
      .map(el => `${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().right)}`);
    assert(
      doc.documentElement.scrollWidth <= 390,
      `no sideways scroll: ${doc.documentElement.scrollWidth} ${wide.join(' ')}`,
    );
    [...doc.querySelectorAll('.user-list li, .user-name')].forEach(el =>
      assert(el.getBoundingClientRect().right <= 390 - 16 + 0.5, 'row inside the screen'),
    );
    frame.remove();
    settings.close();
  });

  await step(
    'users: removing a user deletes only their data here; logging in again brings back what synced',
    async () => {
      const ana = byAcct('A'),
        bor = currentUser(),
        cene = byAcct('C');
      const allKeys = area => Object.keys(area);
      const nsKeys = (u, area = localStorage) => allKeys(area).filter(k => k.startsWith(KEY_ROOT + u.ns));
      const anaKeys = keysText(ana),
        borKeys = keysText(bor),
        lang = localStorage.getItem(LANG_KEY);
      assert(bor === byAcct('B'), 'Bor is on');
      renderSync();
      const removeBtn = u => $(`#syncSection [data-sync="remove"][data-user="${u.id}"]`);
      // Cancelled: nothing changes.
      window.confirm = () => false;
      removeBtn(cene).click();
      assert(users.list.includes(cene) && keysText(cene).includes(SECRET.G), 'cancel keeps everything');
      window.confirm = () => true;
      removeBtn(cene).click();
      assert(
        !users.list.includes(cene) && !JSON.parse(localStorage.getItem(USERS_KEY)).list.some(u => u.id === cene.id),
        'gone from the list, stored too',
      );
      assert(!nsKeys(cene).length && !nsKeys(cene, sessionStorage).length, 'every key of theirs deleted');
      assert(
        keysText(ana) === anaKeys &&
          keysText(bor) === borKeys &&
          localStorage.getItem(LANG_KEY) === lang &&
          currentUser() === bor,
        'the others and the device untouched, still Bor',
      );
      eq($('#toast').textContent, t('user.removed', { name: 'cene' }), 'toast');
      assert(!removeBtn(cene), 'no longer listed');
      // Logging in again makes a new user with what had synced to their Drive.
      G.pick = 'C';
      await logIn();
      await settle();
      const back = currentUser();
      assert(
        back !== cene &&
          back.account.id === 'perm-C' &&
          JSON.stringify(allPlansData().map(p => p.data)).includes(SECRET.G),
        'their synced data is back',
      );
      // Removing the user you are: the guest opens, nobody else is touched.
      const guest = users.list.find(u => !u.account);
      renderSync();
      removeBtn(back).click();
      assert(
        currentUser() === guest &&
          !users.list.includes(back) &&
          !nsKeys(back).length &&
          !nsKeys(back, sessionStorage).length,
        'the guest opens, their keys are gone',
      );
      assert(!drive.token && $('#syncBtn').hidden, 'signed out');
      noLeak(memText(), ['A', 'B', 'G'], "the guest's screen");
      // The first user, on the plain keys: only theirs go (the device's language and the user list stay).
      const borKeys2 = keysText(bor);
      removeUser(ana.id);
      const plain = allKeys(localStorage).filter(
        k => !users.list.some(u => u.ns && k.startsWith(KEY_ROOT + u.ns)) && k !== USERS_KEY && k !== LANG_KEY,
      );
      assert(!users.list.includes(ana) && !plain.length, 'no plain keys left: ' + plain);
      assert(!sessionStorage.getItem('actionplan.syncToken'), 'nor her token');
      assert(keysText(bor) === borKeys2 && localStorage.getItem(LANG_KEY) === lang, 'Bor and the language untouched');
      eq(
        readUsers().list.map(u => u.id),
        users.list.map(u => u.id),
        'stored list matches',
      );
      // A guest is never offered for removal.
      assert(!removeBtn(guest), 'no remove for the guest');
    },
  );

  await step(
    "users: linked before users existed – learnt from a token still valid, never another user's account",
    async () => {
      fakeGoogle();
      const legacy = addUser();
      legacy.account = { id: '', email: '' };
      saveUsers();
      enterUser(legacy.id);
      G.pick = 'C';
      drive.keep(await drive.request('', '')); // a token from before the update
      const reqs = G.requests.length;
      await syncNow(false);
      await settle();
      eq(legacy.account, { id: 'perm-C', email: 'cene@example.com' }, 'learnt from the token, without a popup');
      assert(G.requests.length === reqs && syncState.status === 'synced', 'no popup, synced');
      // Another such user whose token is for Bor, who has a user here: refused, the token dropped, Bor's Drive untouched.
      const twin = addUser();
      twin.account = { id: '', email: '' };
      saveUsers();
      enterUser(twin.id);
      G.pick = 'B';
      drive.keep(await drive.request('', ''));
      const bFile = fileText('perm-B');
      await syncNow(false);
      await settle();
      eq(syncState.status, 'account', 'refused');
      eq($('#syncBtn').title, t('sync.status.accountTaken'), "says the account is someone else's here");
      assert(
        !twin.account.id &&
          !drive.token &&
          !sessionStorage.getItem(userKey('actionplan.syncToken')) &&
          fileText('perm-B') === bFile,
        'not taken, token dropped, nothing synced',
      );
      await syncNow(true);
      await settle();
      eq(G.requests.at(-1), { hint: '', prompt: 'select_account' }, 'renewing lets them choose the account');
      eq(syncState.status, 'account', 'Bor again: still refused');
      eq(users.list.filter(u => u.account?.id === 'perm-B').length, 1, 'one user per account');
      removeUser(twin.id);
      removeUser(legacy.id);
      assert(!users.list.includes(twin) && !users.list.includes(legacy), 'cleaned up');
    },
  );

  await step('users: a login whose user list cannot be stored changes nothing', async () => {
    const me = currentUser(),
      count = users.list.length,
      stored = localStorage.getItem(USERS_KEY);
    assert(!me.account, 'from the guest');
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === USERS_KEY) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
    G.pick = 'C';
    try {
      await logIn();
      await settle();
    } finally {
      Storage.prototype.setItem = set;
    }
    assert(
      currentUser().id === me.id && !currentUser().account && users.list.length === count,
      'the guest stays a guest, no user added',
    );
    assert(
      !users.list.some(u => u.account?.id === 'perm-C') && localStorage.getItem(USERS_KEY) === stored,
      "the account is nobody's here",
    );
    assert(!drive.token && $('#syncBtn').hidden, 'its token not kept, not signed in');
    eq($('#toast').textContent, t('err.storage'), 'says storage is full');
  });

  await step('users: another tab changing the user list is taken over, never written back old', async () => {
    const me = currentUser();
    const other = JSON.parse(localStorage.getItem(USERS_KEY));
    other.list.find(u => u.account?.id === 'perm-B').name = 'Bor from tab 2';
    other.list.push({
      id: 'tab2user',
      ns: 'u.tab2user.',
      name: 'Dana',
      account: { id: 'perm-D', email: 'dana@example.com' },
    });
    other.current = 'tab2user';
    localStorage.setItem(USERS_KEY, JSON.stringify(other));
    dispatchEvent(new StorageEvent('storage', { key: USERS_KEY }));
    assert(currentUser().id === me.id, 'this tab stays with its user');
    assert(
      users.list.some(u => u.id === 'tab2user') && byAcct('B').name === 'Bor from tab 2',
      'the new list is taken over',
    );
    saveUsers();
    assert(
      JSON.parse(localStorage.getItem(USERS_KEY)).list.some(u => u.id === 'tab2user'),
      'saving here keeps what the other tab added',
    );
    // The other tab removes the user open here: this tab drops their token and opens the guest.
    G.pick = 'B';
    await logIn('bor@example.com', byAcct('B'));
    await settle();
    const bor = currentUser(),
      tokenKey = `actionplan.${bor.ns}syncToken`;
    assert(sessionStorage.getItem(tokenKey), 'Bor signed in here');
    const after = JSON.parse(localStorage.getItem(USERS_KEY));
    after.list = after.list.filter(u => u.id !== bor.id);
    localStorage.setItem(USERS_KEY, JSON.stringify(after));
    dispatchEvent(new StorageEvent('storage', { key: USERS_KEY }));
    assert(!currentUser().account && !users.list.some(u => u.id === bor.id), 'the guest opens');
    assert(!sessionStorage.getItem(tokenKey) && !drive.token, "Bor's token gone from this tab");
    noLeak(memText(), ['B'], "the guest's screen");
    // Put Bor back (his data is still stored) for what follows.
    users.list.push(bor);
    users.list = users.list.filter(u => u.id !== 'tab2user');
    saveUsers();
  });

  await step('users: a new user whose account already has plans in Drive gets no first-visit tour', async () => {
    G.accounts.D = { id: 'perm-D', email: 'dana@example.com', name: 'Dana' };
    G.files['perm-D'] = JSON.parse(fileText('perm-B'));
    G.pick = 'B';
    await logIn('bor@example.com', byAcct('B'));
    await settle();
    const before = offers;
    G.pick = 'D';
    await logIn();
    await settle();
    const dana = currentUser();
    assert(dana.account.id === 'perm-D' && dana !== byAcct('B'), 'a new user for Dana');
    assert(
      SYNC_COLLS.some(c => allPlansData().some(p => p.data[c].length)),
      'her plans came down',
    );
    eq(offers, before, 'no tour offered');
    removeUser(dana.id);
  });

  // Back to a device nobody has signed in on, for anything after this.
  users.list
    .filter(u => u.ns)
    .forEach(u => {
      userKeys(u).forEach(k => localStorage.removeItem(k));
      userKeys(u, sessionStorage).forEach(k => sessionStorage.removeItem(k));
    });
  users.list = [{ id: 'local', ns: '', name: '', account: null }];
  enterUser('local');
  drive.forget();
  theme = 'system';
  prefs.set('theme', 'system');
  applyTheme();
  renderSync();
  window.prompt = realPrompt;
  offerTour = realOffer;
};
