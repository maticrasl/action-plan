/** Page tests: the starter and sample plans, making, renaming, switching and deleting plans, storage, badges. */
suite(async () => {
  await step('boot: one empty starter plan', () => {
    assert(plans.list.length === 1);
    assert(itemCountSafe() === 0);
    return plans.list[0].name;
  });
  function itemCountSafe() {
    return db.goals.length + db.states.length + db.activities.length;
  }
  await step('empty views render', () =>
    views
      .map(v => {
        setView(v);
        return `${v}=${fp()}`;
      })
      .join(' '),
  );
  await step('load sample plan', () => {
    loadSample();
    assert(db.goals.length === 12 && db.activities.length === 25 && db.states.length === 7);
    return `${db.relations.length} relations`;
  });
  await step('plans: new, rename, switch, delete', () => {
    const n0 = plans.list.length;
    $('[data-plan="new"]').click();
    assert(plans.list.length === n0 + 1 && currentPlan().name === 'Prompted plan');
    window.prompt = () => 'Renamed plan';
    $('[data-plan="rename"]').click();
    assert(currentPlan().name === 'Renamed plan');
    // Names are unique: a taken one is asked again, with the reason.
    const asked = [];
    const answers = ['renamed plan ', 'Other name'];
    window.prompt = msg => {
      asked.push(msg);
      return answers.shift();
    };
    $('[data-plan="new"]').click();
    assert(plans.list.length === n0 + 2 && currentPlan().name === 'Other name', 'taken name rejected');
    assert(asked[1].startsWith(t('plan.nameTaken', { name: 'renamed plan' })), 'says why: ' + asked[1]);
    window.prompt = (() => {
      const a = ['Renamed plan', null];
      return () => a.shift();
    })();
    $('[data-plan="rename"]').click();
    assert(currentPlan().name === 'Other name', 'rename to a taken name refused (then cancelled)');
    window.prompt = () => 'OTHER NAME';
    $('[data-plan="rename"]').click();
    assert(currentPlan().name === 'OTHER NAME', 'a plan keeps its own name (case change allowed)');
    deletePlan(plans.current);
    window.prompt = () => 'Prompted plan';
    clickEl($(`.nav [data-plan-open="${plans.list[0].id}"]`));
    assert(plans.current === plans.list[0].id, 'a row in the list opens its plan');
    openPlan(plans.list[n0].id);
    $('[data-plan="delete"]').click();
    $('#planDeleteName').value = currentPlan().name;
    $('#planDeleteName').dispatchEvent(new Event('input', { bubbles: true }));
    $('#planDeleteBtn').click();
    assert(plans.list.length === n0 && !$('#planDelete').open);
    return plans.list.map(p => p.name).join(',');
  });

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
      const pick = v => {
        $('[data-category-select]').value = v;
        $('[data-category-select]').dispatchEvent(new Event('change', { bubbles: true }));
      };
      pick(cat);
      const cards = viewEl.querySelectorAll('.card.goal').length;
      eq($('[data-category-select]').value, cat, `${cat}: picked`);
      pick('');
      eq($('[data-category-select]').value, '', `${cat}: back to all`);
      assert(cards === 2, `${cat}: ${cards} goals`);
    }
    changeLanguage('en');
    const reno = db.goals.filter(g => ['House renovation', 'Prenova hiše'].includes(g.category));
    return reno.map(g => `${g.title}=${Math.round(goalProgress(g))}% ${goalState(g)}`).join(', ');
  });
  await step('deleting a plan: consequences spelled out, name must be typed', () => {
    fresh('Old plan');
    const g = mk('goal'),
      s = mk('state', {
        history: [
          { date: d(-1), value: '1' },
          { date: d(0), value: '2' },
        ],
      });
    mk('activity');
    rel(s, g, 'measures');
    save();
    const id = plans.current,
      count = plans.list.length;
    $('[data-plan="delete"]').click();
    const dlg = $('#planDelete'),
      btn = $('#planDeleteBtn'),
      box = $('#planDeleteName');
    assert(dlg.open && document.activeElement === box, 'dialog open, name field focused');
    const text = $('#planDeleteBody').textContent;
    [
      'Old plan',
      '1 goal',
      '1 current state',
      '2 recorded measurements',
      '1 activity',
      '1 relationship',
      'Recently deleted for 30 days',
      'only in this browser',
      'other plans are not affected',
    ].forEach(x => assert(text.includes(x), 'mentions ' + x));
    assert(btn.disabled, 'delete disabled at first');
    const type = v => {
      box.value = v;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    };
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
    loadSample();
    loadSample();
    loadSample();
    const names = plans.list.map(p => p.name).filter(n => n.startsWith(base));
    eq(names, [base, base + ' 2', base + ' 3'], 'sample plans numbered');
    eq(uniqueName('Nothing like it'), 'Nothing like it', 'free name kept');
    eq(uniqueName(base.toUpperCase()), base.toUpperCase() + ' 4', 'case is ignored');
    // The map and timeline are not limited to the page width the other views use.
    // (The test window is narrower than that limit, so the limit itself is checked.)
    const limit = v => {
      setView(v);
      return getComputedStyle(viewEl).maxWidth;
    };
    eq(['map', 'timeline', 'goals', 'dashboard'].map(limit), ['none', 'none', '1240px', '1240px'], 'width limits');
    setView('dashboard');
  });
  await step('persistence: reload, corrupt data, legacy migration', () => {
    fresh('Persist');
    const g = mk('goal', { title: 'Saved goal' });
    mk('activity');
    rel(db.activities[0], g, 'contributes');
    save();
    const before = JSON.stringify(db),
      cur = plans.current,
      names = plans.list.map(p => p.name).join();
    db = emptyDb();
    plans = { current: null, list: [] };
    load();
    assert(plans.current === cur && plans.list.map(p => p.name).join() === names, 'plan list restored');
    assert(JSON.stringify(db) === before, 'plan data restored');

    localStorage.setItem(planKey('bad'), '{oops');
    eq(readPlan('bad'), emptyDb(), 'corrupt plan reads as empty');
    localStorage.setItem(planKey('bad'), JSON.stringify({ goals: 'x', states: [{ id: 's' }], deleted: [] }));
    const part = readPlan('bad');
    assert(
      Array.isArray(part.goals) && !part.goals.length && part.states.length === 1 && !Array.isArray(part.deleted),
      'partially valid plan normalized',
    );
    localStorage.removeItem(planKey('bad'));
    eq(readPlan('never-saved'), emptyDb(), 'missing plan reads as empty');

    const index = localStorage.getItem(PLANS_KEY);
    localStorage.removeItem(PLANS_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ goals: [{ id: 'legacy', title: 'Legacy goal' }] }));
    plans = { current: null, list: [] };
    load();
    const migrated =
      plans.list.length === 1 && plans.list[0].name === t('plan.defaultName') && db.goals[0]?.title === 'Legacy goal';
    localStorage.removeItem(planKey(plans.current));
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(PLANS_KEY, index);
    plans = { current: null, list: [] };
    load();
    renderPlanSwitch();
    render();
    assert(migrated, 'single-plan data migrated into a first plan');
    assert(plans.current === cur, 'back to the saved plans');

    // A full localStorage shows a toast instead of throwing.
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    try {
      save();
    } finally {
      Storage.prototype.setItem = setItem;
    }
    assert($('#toast').textContent === t('err.storage'), 'storage error toast');
  });
  await step('plans: the plan name above the title switches plans (phones)', () => {
    const first = plans.current;
    createPlan('Second plan');
    const pick = $('#planName');
    assert(
      pick.matches('select[data-plan-select]') && pick.closest('label').textContent.includes(t('plan.label')),
      'labelled select',
    );
    assert(
      pick.options.length === plans.list.length && pick.value === plans.current,
      'lists every plan, current selected',
    );
    assert(
      pick.selectedOptions[0].textContent === 'Second plan',
      'shows the current plan name, no emoji',
    );
    pick.value = first;
    pick.dispatchEvent(new Event('change', { bubbles: true }));
    assert(plans.current === first && $('#planName').value === first, 'switches the plan');
    assert(
      [...document.querySelectorAll('[data-plan-select]')].every(s => s.value === first),
      'all switchers agree',
    );
    const second = plans.list.find(p => p.name === 'Second plan');
    deletePlan(second.id);
    assert(![...$('#planName').options].some(o => o.value === second.id), 'deleted plan gone');
    openPlan(first);
  });
  await step('sample plan: dates are calculated on the day it is loaded and never move after', () => {
    const RealDate = Date;
    // Pretends today is `days` from now while `run` runs.
    const on = (days, run) => {
      const shift = days * 86400000;
      window.Date = class extends RealDate {
        constructor(...a) {
          super(...(a.length ? a : [RealDate.now() + shift]));
        }
        static now() {
          return RealDate.now() + shift;
        }
      };
      try {
        return run();
      } finally {
        window.Date = RealDate;
      }
    };
    const offsets = data =>
      [...data.goals, ...data.activities]
        .flatMap(x => ['startDate', 'deadline', 'dueDate'].map(k => x[k]))
        // A total's date is its last run's, which follows the weekdays like the check-ins below.
        .concat(data.states.filter(s => !s.cumulative).flatMap(s => [s.date, ...(s.history || []).map(h => h.date)]))
        .map(d => (d ? dayNum(d) - dayNum(today()) : null));
    const results = [];
    let first = null;
    for (const days of [0, 37, 400, -200]) {
      on(days, () => {
        const now = today();
        loadSample();
        const id = plans.current,
          data = clone(db);
        const offs = offsets(data);
        // The same plan, the same distances from whichever day it was loaded on.
        if (!first) first = offs;
        else eq(offs, first, `loaded ${days} days from now: same distances from that day`);
        // Routine check-ins follow weekdays, so which days they fall on depends on the day it is loaded:
        // all in the five weeks before it, and a fixed-day routine only on its own days.
        const ticks = data.activities.flatMap(a => Object.keys(a.checkins || {}));
        assert(
          ticks.length > 10 && ticks.every(d => d < now && d >= addDays(now, -35)),
          `${days}: check-ins in the weeks before the day it was loaded`,
        );
        data.activities
          .filter(a => a.repeat?.days)
          .forEach(a =>
            assert(
              Object.keys(a.checkins).every(d => a.repeat.days.includes(weekday(d))),
              `${days}: ${a.title} ticked on its own days`,
            ),
          );
        // Late, waiting and done items are as the sample means them on that day.
        assert(
          data.activities.some(a => a.status !== 'done' && a.dueDate && a.dueDate < now),
          `${days}: something is late`,
        );
        assert(
          data.goals.some(g => g.deadline > now),
          `${days}: goals still ahead`,
        );
        results.push(`${days}: ${now}`);
        deletePlan(id);
      });
    }
    // Once loaded, a sample plan is an ordinary plan: opening it later moves nothing.
    loadSample();
    const id = plans.current,
      before = clone(db);
    on(30, () => {
      openPlan(plans.list.find(p => p.id !== id).id);
      openPlan(id);
      // Activities whose start date came meanwhile are in progress now; nothing else changes.
      const acts = list => list.map(({ status, autoStarted, updatedAt, ...rest }) => rest);
      eq(
        JSON.stringify({ goals: db.goals, states: db.states, activities: acts(db.activities) }),
        JSON.stringify({ goals: before.goals, states: before.states, activities: acts(before.activities) }),
        'a month later its dates are where they were',
      );
      assert(
        db.activities.some(a => a.status === 'doing' && before.activities.find(b => b.id === a.id).status === 'todo'),
        'an activity that started meanwhile is in progress',
      );
    });
    deletePlan(id);
    return results.join(' | ');
  });
  await step('plan menu badges: green, yellow when something is due today, red when overdue; optional', () => {
    fresh('Badges');
    const DOT = { ok: '🟢', today: '🟡', late: '🔴' };
    const badge = () => {
      render();
      return [
        ...new Set(
          [...document.querySelectorAll(`[data-plan-open="${plans.current}"] .plan-dot`)].map(
            o => DOT[o.dataset.health],
          ),
        ),
      ];
    };
    eq(badge(), ['🟢'], 'an empty plan is fine');
    const a = mk('activity', { dueDate: d(0) });
    eq(badge(), ['🟡'], 'activity due today');
    a.status = 'done';
    eq(badge(), ['🟢'], 'done today');
    a.status = 'todo';
    a.dueDate = d(-1);
    eq(badge(), ['🔴'], 'overdue activity');
    a.status = 'done';
    const g = mk('goal', { deadline: d(0) });
    eq(badge(), ['🟡'], 'goal deadline today');
    g.deadline = d(-2);
    eq(badge(), ['🔴'], 'overdue goal');
    g.status = 'paused';
    eq(badge(), ['🟢'], 'paused goals do not count');
    g.status = 'achieved';
    eq(badge(), ['🟢'], 'nor achieved ones');
    const r = mk('activity', {
      startDate: d(-3),
      repeat: { every: 1, unit: 'day' },
      checkins: { [d(-3)]: 1, [d(-2)]: 1, [d(-1)]: 1 },
    });
    eq(badge(), ['🟡'], 'daily routine not ticked today');
    r.checkins[d(0)] = 1;
    eq(badge(), ['🟢'], 'ticked today');
    // A daily routine is late for a day missed this week until it is ticked again; on a Monday
    // yesterday was last week.
    delete r.checkins[d(-1)];
    eq(badge(), ['🟢'], 'a missed day, then ticked today: back on track');
    delete r.checkins[d(0)];
    eq(badge(), [weekday(today()) === 0 ? '🟡' : '🔴'], 'a missed day, not ticked since');
    r.checkins[d(0)] = 1;
    r.checkins[d(-1)] = 1;
    // Another plan's badge comes from its saved data.
    save();
    const busy = plans.current;
    createPlan('Badges 2');
    const dot = () => $(`.nav [data-plan-open="${busy}"] .plan-dot`);
    const other = () =>
      (!dot().hidden ? DOT[dot().dataset.health] + ' ' : '') + $(`.nav [data-plan-open="${busy}"]`).textContent;
    eq(other(), '🟢 Badges', 'other plan, read from storage');
    assert(dot().title === t('plan.health.ok'), 'with a tooltip');
    // On by default; the setting hides them and is remembered.
    eq(SETTINGS.planBadges.get(), true, 'on by default');
    const box = settings.querySelector('[data-setting="planBadges"]');
    renderSettings();
    assert(box.checked, 'switch shows on');
    box.click();
    assert(!ui.planBadges && prefs.get('planBadges') === false, 'switched off and remembered');
    eq(other(), 'Badges', 'plain names without badges');
    box.click();
    eq(other(), '🟢 Badges', 'back on');
    const name = other();
    deletePlan(plans.current);
    deletePlan(busy);
    return name;
  });
  await step('plan list: most recently opened first; more than three fold', () => {
    const keep = plans.current;
    const ids = ['P1', 'P2', 'P3', 'P4'].map(n => (createPlan(n), plans.current));
    const rows = () => [...document.querySelectorAll('.nav .plan-row')].map(b => b.textContent);
    renderPlanSwitch();
    eq(rows().slice(0, 3), ['P4', 'P3', 'P2'], 'the last opened on top');
    eq(rows().length, 3, 'three shown');
    const more = $('.nav [data-plan-more]');
    assert(more && more.getAttribute('aria-expanded') === 'false', 'a toggle for the rest');
    clickEl(more);
    assert(rows().length === plans.list.length && rows().includes('P1'), 'all plans after expanding');
    assert($('.nav [data-plan-more]').getAttribute('aria-expanded') === 'true', 'the toggle says expanded');
    clickEl($(`.nav [data-plan-open="${ids[0]}"]`));
    eq(rows()[0], 'P1', 'opening one moves it to the top');
    eq($('.nav .plan-row[aria-current="true"]').textContent, 'P1', 'the open plan is marked');
    assert(!$('.nav .plan-switch').textContent.includes(t('plan.label')), 'no Action plan label in the sidebar');
    clickEl($('.nav [data-plan-more]'));
    ids.forEach(deletePlan);
    renderPlanSwitch();
    assert(!!$('.nav [data-plan-more]') === plans.list.length > 3, 'a toggle only with more than three plans');
    openPlan(keep);
  });
});
