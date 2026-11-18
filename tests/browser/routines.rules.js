/** Page tests: routines.rules. */
suite(async () => {
  await step('routines: set days can be made up on another day', () => {
    fresh('Make up');
    const MON = '2026-11-02',
      TUE = '2026-11-03',
      WED = '2026-11-04',
      THU = '2026-11-05',
      FRI = '2026-11-06',
      SUN = '2026-11-08';
    const onDay = (iso, fn) => {
      const real = window.today;
      window.today = () => iso;
      try {
        return fn();
      } finally {
        window.today = real;
      }
    };
    const mk2 = (makeUp, checkins) =>
      mk('activity', {
        title: makeUp ? 'Loose' : 'Strict',
        startDate: '2026-10-01',
        repeat: { every: 1, unit: 'week', days: [0, 3], ...(makeUp ? { makeUp: true } : {}) },
        checkins,
      });
    const strict = mk2(false, { [TUE]: 1 }),
      loose = mk2(true, { [TUE]: 1 });
    save();
    onDay(WED, () => {
      eq(periodProgress(strict).done, 0, 'strict: Tuesday does not count');
      eq(periodProgress(loose).done, 1, 'loose: Tuesday counts');
      eq([...madeUpDays(loose, WED)], [MON], 'loose: it makes up Monday');
      eq(madeUpDays(strict, WED).size, 0, 'strict: nothing made up');
      eq(missedDays(strict, MON, TUE), [MON], 'strict: Monday missed');
      eq(missedDays(loose, MON, TUE), [], 'loose: Monday not missed');
      eq(routineToday(loose), 'rest', 'loose: nothing to make up, not due today');
      setView('activities');
      const day = (a, iso) => $(`.card.routine[data-open="${a.id}"] [data-checkin][data-date="${iso}"]`);
      assert(
        day(strict, MON).classList.contains('missed') && day(loose, MON).classList.contains('made'),
        'strip: missed vs made up',
      );
      eq(
        day(loose, MON).title,
        t('rt.dayMadeUp', { date: fmtDay(MON, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }),
        'made-up day says so',
      );
      assert(!day(loose, MON).classList.contains('missed'), 'not hatched');
      const cs = getComputedStyle(day(loose, MON));
      assert(cs.borderTopStyle === 'solid' && cs.backgroundImage === 'none', 'made up: solid, not hatched');
      eq(scheduleText(loose), t('rt.orAnotherDay', { text: scheduleText(strict) }), 'schedule says “or another day”');
      assert(
        [...$('.rt-legend').querySelectorAll('span')].some(s => s.textContent === t('rt.legend.made')),
        'legend has Made up',
      );
      // The timeline shows a made-up day as done; a missed one stays red.
      const tl = tlRoutineDays(loose, dayNum(MON), dayNum(SUN), n => n, 10),
        tls = tlRoutineDays(strict, dayNum(MON), dayNum(SUN), n => n, 10);
      assert(
        tl.startsWith('<i class="tl-day done"') && tls.startsWith('<i class="tl-day missed"'),
        'timeline: made up done, strict missed',
      );
    });
    // One tick per missed day: two missed, one extra tick.
    loose.checkins = { [FRI]: 1 };
    onDay(SUN, () => {
      eq([...madeUpDays(loose, SUN)], [MON], 'the earliest missed day is made up first');
      eq(missedDays(loose, MON, addDays(SUN, -1)), [THU], 'Thursday still missed');
      eq(periodProgress(loose), { ...periodProgress(loose), done: 1, target: 2, met: false }, '1 of 2');
      eq(routineState(loose), 'doing', 'ticked after Monday and Thursday: not late');
      eq(routineToday(loose), 'makeUp', 'Sunday: asks to make up a day');
      eq(planHealth({ ...db, activities: [loose] }) === 'late', false, 'the badge is not red for it');
      eq(planHealth({ ...db, activities: [strict] }), 'late', 'while a strict one that missed both days is');
      setView('activities');
      const tag = $(`.card.routine[data-open="${loose.id}"] [data-today]`);
      assert(tag.textContent === t('rt.today.makeUp') && tag.classList.contains('warn'), 'tag: make up a missed day');
      loose.checkins[SUN] = 1;
      eq(periodProgress(loose).met, true, 'ticked Sunday too: week met');
      eq(routineState(loose), 'done', 'done for the week');
      eq(missedDays(loose, MON, addDays(SUN, -1)), [], 'nothing missed');
    });
    // Ahead: ticks before a due day count toward it, and the due day is then not needed.
    loose.checkins = { [MON]: 1, [TUE]: 1 };
    onDay(THU, () => {
      eq(periodProgress(loose).met, true, 'Mon and Tue: the week is met');
      eq(routineToday(loose), 'met', 'Thursday: target met, not due');
      eq(planHealth({ ...db, activities: [loose] }), 'ok', 'no yellow badge for it');
    });
    onDay(FRI, () => {
      eq(missedDays(loose, MON, THU), [], 'Thursday not missed: Tuesday counted ahead');
      eq(madeUpDays(loose, FRI).has(THU), true, 'Thursday made up');
    });
    // Streak and consistency count made-up days as kept; strict ones do not.
    const ls = mk2(true, { '2026-10-26': 1, '2026-10-30': 1, [MON]: 1 }),
      ss = mk2(false, { '2026-10-26': 1, '2026-10-30': 1, [MON]: 1 });
    onDay(WED, () => {
      eq(routineStreak(ls).n, 3, 'loose streak: Mon, (Thu made up by Fri), Mon');
      eq(routineStreak(ss).n, 1, 'strict streak broken by the missed Thursday');
      assert(consistency(ls) > consistency(ss), 'loose consistency counts the made-up day');
    });
    // Extra ticks never count beyond what the period asks.
    const many = mk2(true, { [MON]: 1, [TUE]: 1, [WED]: 1 });
    onDay(WED, () => eq(periodProgress(many).done, 2, 'capped at the target'));
    // Monthly: made up within the month.
    const monthly = mk('activity', {
      title: 'Check',
      startDate: '2026-09-01',
      repeat: { every: 1, unit: 'month', on: 'day', day: 1, makeUp: true },
      checkins: { '2026-11-03': 1 },
    });
    onDay('2026-11-10', () => {
      eq(missedDays(monthly, '2026-11-01', '2026-11-09'), [], 'monthly: the 1st made up on the 3rd');
      eq(routineState(monthly), 'done', 'monthly: met');
    });
    deletePlan(plans.current);
  });
  await step('routines: the make-up option in the form', () => {
    fresh('Make up form');
    openForm('activity', null, { repeat: 'routine' });
    const box = () => $('#repMakeUp'),
      set = (id, val) => {
        $(id).value = val;
        $(id).dispatchEvent(new Event('change', { bubbles: true }));
      };
    assert(box().hidden, 'a number of times a week: no make-up option');
    set('#f-repeat', 'days');
    assert(!box().hidden && !$('#f-makeUp').checked, 'set days: offered, off by default (strict)');
    eq(box().querySelector('label').textContent.trim(), t('f.makeUp'), 'labelled');
    eq(box().querySelector('.hint').textContent, t('f.makeUpHint'), 'explained');
    set('#f-repeat', 'custom');
    set('#f-unit', 'month');
    set('#f-on', 'times');
    assert(box().hidden, 'custom times: hidden');
    set('#f-on', 'day');
    assert(!box().hidden, 'monthly day: offered');
    set('#f-repeat', 'none');
    assert(box().hidden, 'no repeat: hidden');
    set('#f-repeat', 'days');
    $('#f-title').value = 'Gym';
    $('#f-endDate').value = dateInput(addDays(today(), 30));
    $('#f-makeUp').checked = true;
    submitForm();
    const a = db.activities.find(x => x.title === 'Gym');
    assert(a && a.repeat.makeUp === true && a.repeat.days, 'saved with make-up');
    openForm('activity', a.id);
    assert($('#f-makeUp').checked && !box().hidden, 'shown checked when editing');
    $('#f-makeUp').checked = false;
    submitForm();
    assert(!('makeUp' in a.repeat), 'turned off: strict again');
    // A flexible routine never keeps it, even if the box was left ticked.
    openForm('activity', a.id);
    $('#f-makeUp').checked = true;
    set('#f-repeat', 'week');
    submitForm();
    assert(a.repeat.times && !a.repeat.makeUp, 'times a week: no make-up');
    // Older plans without it are strict; it syncs with the rest of the repeat.
    assert(!makesUp({ repeat: { every: 1, unit: 'week', days: [0] } }), 'missing: strict');
    eq(
      normalize({ activities: [{ id: 'k', title: 'K', repeat: { every: 1, unit: 'week', days: [0], makeUp: true } }] })
        .activities[0].repeat.makeUp,
      true,
      'kept on import',
    );
    // Slovenian.
    changeLanguage('sl');
    openForm('activity', a.id);
    set('#f-repeat', 'days');
    eq(box().querySelector('label').textContent.trim(), I18N.sl.strings['f.makeUp'], 'Slovenian label');
    modal.close();
    a.repeat = { every: 1, unit: 'week', days: [0, 3], makeUp: true };
    assert(scheduleText(a).endsWith(I18N.sl.strings['rt.orAnotherDay'].split('}')[1]), 'Slovenian schedule');
    changeLanguage('en');
    // The help tip mentions it.
    assert(t('help.tip.routines').includes('made up'), 'help explains making up');
    deletePlan(plans.current);
  });
  await step('routines: sample plan, tour and wording', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      loadSample();
      const exercise = db.goals.find(g => byRoutines(g));
      const routines = db.activities.filter(isRoutine);
      assert(
        exercise && goalRoutines(exercise).length === 2 && routines.length === 3,
        `${code}: goal by routines, three routines`,
      );
      assert(
        goalProgress(exercise) > 50 && goalProgress(exercise) < 100,
        `${code}: consistency ${goalProgress(exercise)}`,
      );
      assert(
        routines.every(a => routineStreak(a).n >= 0 && consistency(a) !== null),
        `${code}: routines have history`,
      );
      setView('activities');
      assert($('.routines .card.routine') && !$('.routines').textContent.includes('rt.'), `${code}: strip rendered`);
      untickCook();
      setView('dashboard');
      assert($('.routine-list') && !$('.routine-list').textContent.includes('rt.'), `${code}: overview list`);
    }
    const sl = I18N.sl.strings;
    eq(
      [1, 2, 3, 5].map(n => tp('rt.perWeek', n)),
      ['enkrat na teden', 'dvakrat na teden', '3-krat na teden', '5-krat na teden'],
      'Slovenian schedule',
    );
    eq(tp('rt.streak.week', 2), '2 tedna zapored', 'Slovenian streak');
    changeLanguage('en');
    eq(
      [1, 3].map(n => tp('rt.perWeek', n)),
      ['once a week', '3× a week'],
    );
    assert(
      scheduleText({ repeat: { days: [0, 3] } }) === 'every Mon, Thu' &&
        scheduleText({ repeat: { days: [0, 1, 2, 3, 4, 5, 6] } }) === 'every day',
      'day schedules',
    );
    const at = (repeat, startDate = '2099-01-07') => ({ repeat, startDate }); // a Wednesday
    eq(
      [
        at({ every: 1, unit: 'day' }),
        at({ every: 3, unit: 'day' }),
        at({ every: 1, unit: 'week' }),
        at({ every: 2, unit: 'week', days: [0, 4] }),
        at({ every: 1, unit: 'month' }),
        at({ every: 1, unit: 'month', on: 'weekday' }),
        at({ every: 2, unit: 'week', times: 3 }),
        at({ every: 1, unit: 'month', times: 1 }),
      ].map(scheduleText),
      [
        'every day',
        'every 3 days',
        'every Wed',
        'every 2 weeks on Mon, Fri',
        'every month on day 7',
        'every month on the first Wednesday',
        '3× every 2 weeks',
        'once a month',
      ],
    );
    changeLanguage('sl');
    eq(
      [
        at({ every: 2, unit: 'week', days: [0] }),
        at({ every: 1, unit: 'month', on: 'weekday' }),
        at({ every: 5, unit: 'year' }),
      ].map(scheduleText),
      ['vsaka 2 tedna: pon.', 'vsak mesec: prva sreda v mesecu', 'vsakih 5 let: 7. januar'].map(x => x),
      'Slovenian summaries',
    );
    changeLanguage('en');
    // Every 3 days; every 2 weeks (Mon, Fri); flexible every 2 weeks; a yearly one.
    const due = a =>
      daysBetween('2099-01-07', '2099-01-31')
        .filter(d => isDueDay(a, d))
        .map(d => d.slice(8));
    eq(due(at({ every: 3, unit: 'day' })), ['07', '10', '13', '16', '19', '22', '25', '28', '31'], 'every 3 days');
    eq(due(at({ every: 2, unit: 'week', days: [0, 4] })), ['09', '19', '23'], 'every 2 weeks on Mon, Fri');
    eq(
      periodOf(at({ every: 2, unit: 'week', times: 3 }), '2099-01-14'),
      { from: '2099-01-05', to: '2099-01-18' },
      'a two-week period',
    );
    eq(periodOf(at({ every: 1, unit: 'year' }), '2099-06-01'), { from: '2099-01-01', to: '2099-12-31' }, 'a year');
    eq(
      lastOccurrence(at({ every: 2, unit: 'week', times: 3 }), 7),
      '2099-02-15',
      'seven times at 3 per two weeks needs three periods',
    );
    // Nothing due this period: the next due day instead of 0 / 0.
    const now = today(),
      lastWeek = addDays(now, -weekday(now) - 7);
    const next = iso => t('rt.next', { date: fmtDay(iso, { weekday: 'short', day: 'numeric', month: 'short' }) });
    const offWeek = at({ every: 2, unit: 'week', days: [weekday(now)] }, lastWeek);
    eq(periodText(offWeek), next(addDays(now, 7)), 'off week shows the next due day');
    eq(
      periodText(at({ every: 2, unit: 'week', days: [weekday(now)] }, addDays(lastWeek, 7))),
      t('rt.week', { done: 0, target: 1 }),
      'on week shows progress',
    );
    eq(periodText(at({ every: 1, unit: 'month' }, addDays(now, 40))), next(addDays(now, 40)), 'not started yet');
    eq(periodText({ ...offWeek, dueDate: addDays(now, 3) }), t('rt.ended'), 'not due again before it ends');
    const i = TOUR_STEPS.findIndex(x => x.key === 'routines');
    assert(
      TOUR_STEPS[i - 1].key === 'activities' && TOUR_STEPS[i].target[0] === '.routines',
      'tour step after activities',
    );
    assert(t('tour.routines.text').includes('streak') && sl['tour.routines.text'].includes('niz'), 'tour text');
    return db.activities
      .filter(isRoutine)
      .map(a => `${a.title}: ${periodText(a)}, ${streakText(routineStreak(a))}`)
      .join(' | ');
  });
  await step('nothing depends on a routine: rules, forms, an activity turned routine, old plans and sync', async () => {
    fresh('Routine deps');
    const routine = (p = {}) =>
      mk('activity', { repeat: { every: 1, unit: 'week', times: 2 }, checkins: {}, startDate: d(-7), ...p });
    const a = mk('activity', { title: 'One-off' }),
      b = mk('activity', { title: 'Other one-off' }),
      r = routine({ title: 'Routine' }),
      r2 = routine();
    const g = mk('goal'),
      g2 = mk('goal');
    const err = t('err.dependsRoutine');
    eq(
      [canRelate(a.id, r.id, 'depends'), canRelate(r2.id, r.id, 'depends')],
      [err, err],
      'activity or routine → routine refused',
    );
    assert(
      !canRelate(r.id, a.id, 'depends') && !canRelate(a.id, b.id, 'depends') && !canRelate(g.id, g2.id, 'depends'),
      'routine → activity, activity → activity, goal → goal still fine',
    );
    assert(
      !canRelate(a.id, r.id, 'subactivity') && !canRelate(r.id, a.id, 'subactivity'),
      'other links to a routine unaffected',
    );
    assert(addRelation(a.id, r.id, 'depends') === err && !db.relations.length, 'addRelation refuses it');
    // The relationship form (also what a drag on the map opens) offers only the routine depending on the activity.
    openForm('relation', null, { from: a.id, to: r.id });
    eq(
      [...$('#f-type').options].map(o => o.value),
      ['subactivity', 'rev:subactivity', 'rev:depends'],
      'relationship form',
    );
    $('#f-type').value = 'rev:depends';
    submitForm();
    assert(
      relsFrom(r.id, 'depends').some(x => x.to === a.id),
      'routine → activity saved',
    );
    assert(canLink(a.id, r2.id) && canLink(r.id, r2.id), 'map still lets them link (as sub-activities)');
    // The activity form lists one-offs, not routines, under "Depends on".
    openForm('activity', a.id);
    const opts = [...modal.querySelectorAll('[data-name="depends"] [data-pick]')].map(x => x.dataset.pick);
    assert(opts.includes(b.id) && !opts.includes(r.id) && !opts.includes(r2.id), 'depends picker: ' + opts.length);
    modal.close();
    // An activity something waits for becomes a routine: those links go, its own stay, and the toast says so.
    const c = mk('activity', { title: 'Becomes routine', startDate: d(0), dueDate: d(10) }),
      x = mk('activity');
    rel(a, c, 'depends');
    rel(x, c, 'depends');
    rel(c, b, 'depends');
    assert(activityState(a) === 'blocked', 'blocked before');
    openForm('activity', c.id);
    $('#f-repeat').value = 'week';
    $('#f-repeat').dispatchEvent(new Event('change', { bubbles: true }));
    submitForm();
    assert(isRoutine(c) && !modal.open, 'saved as a routine');
    assert(
      !relsTo(c.id, 'depends').length && relsFrom(c.id, 'depends').length === 1,
      'incoming dependencies dropped, its own kept',
    );
    eq($('#toast').textContent, tp('toast.routineDepsDropped', 2), 'toast says so');
    assert(activityState(a) !== 'blocked', 'no longer blocked');
    // Saved again without such links: the usual message.
    openForm('activity', c.id);
    submitForm();
    eq($('#toast').textContent, t('toast.activityUpdated'), 'plain update');
    assert(I18N.sl.strings['toast.routineDepsDropped'].two && I18N.sl.strings['err.dependsRoutine'], 'Slovenian texts');
    // Old plans, plan files and synced copies drop links onto a routine; a routine depending on an activity stays.
    const old = {
      goals: [],
      states: [],
      activities: [
        { id: 'a1', title: 'A' },
        { id: 'r1', title: 'R', repeat: { every: 1, unit: 'day' } },
      ],
      relations: [
        { id: 'bad', from: 'a1', to: 'r1', type: 'depends' },
        { id: 'ok', from: 'r1', to: 'a1', type: 'depends' },
        { id: 'sub', from: 'a1', to: 'r1', type: 'subactivity' },
      ],
    };
    eq(
      normalize(old).relations.map(x => x.id),
      ['ok', 'sub'],
      'normalize',
    );
    eq(
      parsePlanFile(JSON.stringify({ name: 'F', ...old }), 'f.json').data.relations.map(x => x.id),
      ['ok', 'sub'],
      'plan file',
    );
    // Sync: one device links a1 → r1 while the other makes r1 a routine; the merge drops the link.
    eq(
      repairRelations(old).map(x => x.id),
      ['ok', 'sub'],
      'merge repair',
    );
    const id = plans.current;
    const mine = {
      goals: [],
      states: [],
      deleted: {},
      activities: [
        { id: 'a1', title: 'A', updatedAt: '2099-01-01' },
        { id: 'r1', title: 'R', updatedAt: '2099-01-01' },
      ],
      relations: [{ id: 'bad', from: 'a1', to: 'r1', type: 'depends', updatedAt: '2099-01-02' }],
    };
    const theirs = {
      ...mine,
      relations: [],
      activities: [
        mine.activities[0],
        { id: 'r1', title: 'R', repeat: { every: 1, unit: 'day' }, updatedAt: '2099-01-03' },
      ],
    };
    const store = data => ({ plans: { list: [{ id, name: 'Routine deps' }], deleted: {} }, data: { [id]: data } });
    const merged = mergeStores(store(mine), store(theirs)).data[id];
    assert(
      isRoutine(merged.activities.find(x => x.id === 'r1')) && !merged.relations.length,
      'merged: routine kept, link dropped',
    );
    return 'ok';
  });
});
