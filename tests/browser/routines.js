/** Page tests: routines. */
suite(async () => {
  await step('routines: form, board, overview, goal progress, menu, map and sync', async () => {
    fresh('Routines UI');
    const now = today();
    const g = mk('goal', {
      title: 'Move more',
      progress: 'routines',
      startDate: addDays(now, -14),
      deadline: addDays(now, 90),
      category: 'Health',
    });
    const oneOff = mk('activity', { title: 'Buy shoes', status: 'todo' });
    const change = (id, value) => {
      $(id).value = value;
      $(id).dispatchEvent(new Event('change', { bubbles: true }));
    };
    const shown = sel => !modal.querySelector(sel).closest('[hidden]');
    // Create a routine in the form: specific days.
    openForm('activity', null, { repeat: 'once' });
    $('#f-title').value = 'Strength';
    assert(
      shown('[data-field="status"]') &&
        !shown('#repeatCustom') &&
        !shown('#repeatEnds') &&
        !shown('#repDays') &&
        !shown('#repTimes'),
      'one-off by default',
    );
    eq(
      [...$('#f-repeat').options].map(o => o.value),
      ['none', 'week', 'month', 'days', 'custom'],
      'kinds of repeat',
    );
    change('#f-repeat', 'days');
    assert(
      !shown('[data-field="status"]') &&
        !shown('[data-field="dueDate"]') &&
        !shown('#repeatCustom') &&
        shown('#repDays') &&
        !shown('#repTimes') &&
        shown('#repeatEnds'),
      'days shown, status and due date hidden',
    );
    modal.querySelector('.day-toggle[aria-pressed="true"]').click(); // the start's weekday is chosen by default
    submitForm();
    assert(modal.open && modal.querySelector('[data-field="days"] .err').textContent === t('err.days'), 'needs a day');
    modal.querySelectorAll('.day-toggle')[0].click();
    modal.querySelectorAll('.day-toggle')[3].click();
    [...modal.querySelectorAll('[data-name="goals"] .pick-opt')].find(o => o.textContent === 'Move more').click();
    // Every routine ends: there is no "never", and a day is asked for.
    assert(
      !modal.querySelector('[name="ends"][value="never"]') &&
        modal.querySelector('[name="ends"]:checked').value === 'on',
      'ends on a day by default',
    );
    submitForm();
    assert(
      modal.open && modal.querySelector('[data-field="endDate"] .err').textContent === t('err.endDate'),
      'needs an end',
    );
    $('#f-endDate').value = dateInput(addDays(now, 60));
    submitForm();
    const st = db.activities.find(a => a.title === 'Strength');
    assert(
      !modal.open &&
        st &&
        JSON.stringify(st.repeat) === '{"every":1,"unit":"week","days":[0,3]}' &&
        st.startDate === now &&
        st.dueDate === addDays(now, 60),
      'saved as a routine from today',
    );
    openForm('activity', st.id);
    assert(
      $('#f-repeat').value === 'days' && modal.querySelector('[name="ends"]:checked').value === 'on',
      'form shows the saved repeat',
    );
    change('#f-repeat', 'custom');
    assert(
      $('#f-unit').value === 'week' && $('#f-on').value === 'days' && shown('#repDays'),
      'custom starts from specific days',
    );
    modal.close();
    // A number of times per week, with validation.
    openForm('activity', null, { repeat: 'once' });
    $('#f-title').value = 'Run';
    change('#f-repeat', 'week');
    assert(shown('#repTimes') && !shown('#repDays') && !shown('#repeatCustom'), 'times shown');
    $('#f-times').value = '9';
    submitForm();
    assert(
      modal.querySelector('[data-field="times"] .err').textContent === t('err.times', { max: 7 }),
      'at most 7 a week',
    );
    $('#f-times').value = '3';
    $('#f-startDate').value = dateInput(addDays(now, -14));
    $('#f-endDate').value = dateInput(addDays(now, 60));
    [...modal.querySelectorAll('[data-name="goals"] .pick-opt')].find(o => o.textContent === 'Move more').click();
    submitForm();
    const run = db.activities.find(a => a.title === 'Run');
    assert(JSON.stringify(run.repeat) === '{"every":1,"unit":"week","times":3}', 'count routine saved');

    // Presets, custom months and when it ends.
    openForm('activity', null, { repeat: 'once' });
    $('#f-title').value = 'Check-up';
    $('#f-startDate').value = dateInput('2099-01-28'); // the fourth and last Wednesday of January 2099
    $('#f-startDate').dispatchEvent(new Event('input', { bubbles: true }));
    change('#f-repeat', 'month');
    change('#f-repeat', 'custom');
    assert(
      $('#f-unit').value === 'month' && $('#f-on').value === 'times' && shown('#repTimes') && !shown('#repDays'),
      'custom starts from times per month',
    );
    eq(
      [...$('#f-on').options].map(o => o.value),
      ['day', 'lastDay', 'nth', 'times'],
      'month options',
    );
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
    assert(
      JSON.stringify(check.repeat) === '{"every":2,"unit":"month","on":"nth","nth":-1,"weekday":2,"count":3}',
      'custom month saved: ' + JSON.stringify(check.repeat),
    );
    assert(check.dueDate === '2099-05-27', 'ends on the third occurrence: ' + check.dueDate);
    eq(
      daysBetween('2099-01-01', '2099-12-31').filter(d => runsOn(check, d) && isDueDay(check, d)),
      ['2099-01-28', '2099-03-25', '2099-05-27'],
      'last Wednesday every 2 months',
    );
    assert(scheduleText(check) === 'every 2 months on the last Wednesday', scheduleText(check));
    openForm('activity', check.id);
    assert(
      modal.querySelector('[name="ends"]:checked').value === 'after' && $('#f-count').value === '3',
      'ends after shown',
    );
    modal.querySelector('[name="ends"][value="on"]').checked = true;
    $('#f-endDate').value = dateInput('2098-01-01');
    submitForm();
    assert(
      modal.querySelector('[data-field="endDate"] .err').textContent === t('err.startAfterDue'),
      'cannot end before it starts',
    );
    $('#f-endDate').value = dateInput('2099-12-31');
    submitForm();
    assert(check.dueDate === '2099-12-31' && !check.repeat.count, 'ends on a date');
    openForm('activity', check.id);
    change('#f-unit', 'year');
    $('#f-every').value = '1';
    submitForm();
    assert(
      JSON.stringify(check.repeat) === '{"every":1,"unit":"year"}' &&
        scheduleText(check) === 'every year on 28 January',
      scheduleText(check),
    );
    removeEntity('activity', check.id);

    // Board: routines above the columns, ticking days on the week strip.
    setView('activities');
    assert($('.routines') && $('.routines').querySelectorAll('.card.routine').length === 2, 'routines strip');
    assert(
      !$('.board').querySelector(`[data-open="${run.id}"]`) && $('.board').querySelector(`[data-open="${oneOff.id}"]`),
      'columns hold one-offs only',
    );
    const day = d => $(`.card.routine[data-open="${run.id}"] [data-checkin][data-date="${d}"]`);
    assert(day(now) && !day(now).disabled, 'today can be ticked');
    const future = addDays(now, 1);
    if (weekday(now) < 6) assert(day(future).getAttribute('aria-disabled') === 'true', 'future days cannot');
    day(now).click();
    assert(
      checkedOn(run, now) && day(now).getAttribute('aria-pressed') === 'true' && !modal.open,
      'ticked without opening the form',
    );
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
      run.checkins[now] = 0;
      render();
    }

    // Overview: its own list; counts and next actions leave routines out.
    // Only routines today still asks for are listed: a set-day routine on its day, not on a rest day.
    setView('dashboard');
    const rows = () => [...$('.routine-list').querySelectorAll('.routine-row')].map(r => r.dataset.open);
    const stDays = st.repeat.days;
    st.repeat.days = [weekday(now)];
    render();
    assert(rows().includes(run.id) && rows().includes(st.id), 'routines on the overview, a set day today');
    st.repeat.days = [(weekday(now) + 1) % 7];
    render();
    assert(rows().includes(run.id) && !rows().includes(st.id), 'a set-day routine resting today is left out');
    st.repeat.days = stDays;
    render();
    assert(
      ![...$('#view').querySelectorAll('.list:not(.routine-list) > .row')].some(r => r.dataset.open === run.id),
      'not in next actions',
    );
    assert($('.facts').textContent.includes(t('dash.factDone', { done: 0, total: 1 })), 'one-off counts only');
    $(`.routine-row[data-open="${run.id}"] [data-checkin]`).click();
    assert(checkedOn(run, now) && !modal.open, 'done today from the overview');

    // Goal measured by routines: the average of their consistency since the goal started.
    const vals = [run, st].map(a => consistency(a, g.startDate)).filter(v => v !== null);
    const expected = vals.length ? (vals.reduce((x, y) => x + y, 0) / vals.length) * 100 : 0;
    assert(Math.abs(goalProgress(g) - expected) < 1e-9, `goal progress ${goalProgress(g)} = ${expected}`);
    assert(smartCheck(g).M, 'measurable without a metric');
    openForm('goal', g.id);
    assert(
      $('#f-progress').value === 'routines' && $('#measureFields').hidden && !$('#routinesHint').hidden,
      'goal form: by routines',
    );
    $('#f-progress').value = 'activities';
    $('#f-progress').dispatchEvent(new Event('change', { bubbles: true }));
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
    assert(
      $(`[data-map-node="${run.id}"] .sub`).textContent.includes(
        t('map.rt.week', { done: periodProgress(run).done, target: 3 }),
      ),
      'map shows this week',
    );
    // Switching repeat off keeps the check-ins.
    openForm('activity', run.id);
    $('#f-repeat').value = 'none';
    $('#f-repeat').dispatchEvent(new Event('change', { bubbles: true }));
    submitForm();
    assert(!isRoutine(run) && run.checkins[now] === 1, 'one-off again, check-ins kept');

    // Sync: check-ins from both devices are kept; the newer version wins on the same day.
    const base = { id: 'x', title: 'X', status: 'todo', repeat: { times: 3, per: 'week' } };
    const older = { ...base, updatedAt: '2099-01-01', checkins: { '2099-01-01': 1, '2099-01-02': 1 } };
    const newer = { ...base, updatedAt: '2099-01-03', checkins: { '2099-01-02': 0, '2099-01-03': 1 } };
    const m = mergePlans({ ...emptyDb(), activities: [older] }, { ...emptyDb(), activities: [newer] }).activities[0];
    eq(m.checkins, { '2099-01-01': 1, '2099-01-02': 0, '2099-01-03': 1 }, 'merged check-ins');
    eq(
      mergePlans({ ...emptyDb(), activities: [newer] }, { ...emptyDb(), activities: [older] }).activities[0].checkins,
      m.checkins,
      'symmetric',
    );
  });
  await step('routines: the overview lists only the routines today still asks for', () => {
    fresh('Overview routines');
    const MON = '2026-11-02',
      TUE = '2026-11-03',
      WED = '2026-11-04',
      THU = '2026-11-05';
    const onDay = (iso, fn) => {
      const real = window.today;
      window.today = () => iso;
      try {
        return fn();
      } finally {
        window.today = real;
      }
    };
    const r = (title, repeat, more = {}) =>
      mk('activity', {
        title,
        startDate: '2026-10-01',
        repeat: { every: 1, unit: 'week', ...repeat },
        checkins: {},
        ...more,
      });
    const setDay = r('Set Thu', { days: [3] });
    const offDay = r('Set Mon', { days: [0] });
    const ticked = r('Ticked', { days: [3] }, { checkins: { [THU]: 1 } });
    const flex = r('Flex', { times: 2 }, { checkins: { [MON]: 1 } });
    const flexMet = r('Flex met', { times: 2 }, { checkins: { [MON]: 1, [TUE]: 1 } });
    const makeUp = r('Make up', { days: [0], makeUp: true });
    const madeUp = r('Made up', { days: [0], makeUp: true }, { checkins: { [TUE]: 1 } });
    const metEarly = r('Met early', { days: [3], makeUp: true }, { checkins: { [WED]: 1 } });
    const ended = r('Ended', { days: [3] }, { dueDate: WED });
    const later = r('Later', { days: [3] }, { startDate: '2026-11-06' });
    const listOne = r(
      'List half',
      { days: [3] },
      {
        list: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        listDays: { [THU]: { a: 1 } },
      },
    );
    const listAll = r(
      'List done',
      { days: [3] },
      { list: [{ id: 'a', text: 'A' }], listDays: { [THU]: { a: 1 } }, checkins: { [THU]: 1 } },
    );
    const monthly = r('Monthly', { unit: 'month', times: 1 });
    const oneOff = mk('activity', { title: 'One-off', status: 'todo' });
    save();
    const rows = () => [...$('#view').querySelectorAll('.routine-list .routine-row')].map(x => x.dataset.open);
    onDay(THU, () => {
      setView('dashboard');
      render();
      eq(
        rows(),
        [setDay, flex, makeUp, listOne, monthly].map(a => a.id),
        'set day, flexible not met, make-up, half-ticked list, monthly',
      );
      assert(
        ![offDay, ticked, flexMet, madeUp, metEarly, ended, later, listAll, oneOff].some(a => rows().includes(a.id)),
        'off-day, ticked, met, made up, ended, not started, ticked list, one-off hidden',
      );
      // Ticking from the overview takes the row off; the list's last item does too.
      $(`.routine-row[data-open="${setDay.id}"] [data-checkin]`).click();
      assert(checkedOn(setDay, THU) && !rows().includes(setDay.id), 'ticked: off the overview');
      tickRoutineItem(listOne, 'b', THU);
      assert(checkedOn(listOne, THU) && !rows().includes(listOne.id), 'last item ticked: off the overview');
      // Unticking elsewhere brings it back.
      setRoutineDay(setDay, THU, false);
      setView('dashboard');
      render();
      assert(rows().includes(setDay.id), 'unticked: back on the overview');
    });
    // A flexible routine that needs every day left still shows; once met it goes.
    onDay(WED, () => {
      setView('dashboard');
      render();
      assert(rows().includes(flex.id) && rows().includes(flexMet.id) === false, 'Wednesday: flex shown, met hidden');
    });
    // Nothing asked for today: no routines section at all.
    db.activities.filter(isRoutine).forEach(a => {
      a.checkins = { ...a.checkins, [THU]: 1 };
    });
    onDay(THU, () => {
      setView('dashboard');
      render();
      assert(!$('.routine-list'), 'all ticked: no routines section');
    });
    deletePlan(plans.current);
  });
  await step('routines: the due date typed before turning an activity into a routine becomes its end, and back', () => {
    fresh('Carry end');
    const now = today();
    const change = (id, value) => {
      $(id).value = value;
      $(id).dispatchEvent(new Event('change', { bubbles: true }));
    };
    openForm('activity', null, { repeat: 'once' });
    $('#f-title').value = 'Yoga';
    $('#f-dueDate').value = dateInput(addDays(now, 30));
    change('#f-repeat', 'week');
    eq($('#f-endDate').value, dateInput(addDays(now, 30)), 'due date carried to the end');
    // Changing the kind of repeat keeps a changed end; an end already there is not overwritten.
    $('#f-endDate').value = dateInput(addDays(now, 40));
    change('#f-repeat', 'days');
    eq($('#f-endDate').value, dateInput(addDays(now, 40)), 'kept between kinds of repeat');
    change('#f-repeat', 'none');
    eq($('#f-dueDate').value, dateInput(addDays(now, 30)), 'back to one-off: its own due date was still there');
    $('#f-dueDate').value = '';
    change('#f-repeat', 'week');
    change('#f-repeat', 'none');
    eq($('#f-dueDate').value, dateInput(addDays(now, 40)), 'an empty due date takes the end');
    change('#f-repeat', 'week');
    $('#f-times').value = '2';
    submitForm();
    const y = db.activities.find(a => a.title === 'Yoga');
    assert(!modal.open && y.dueDate === addDays(now, 40), `saved with the end: ${y.dueDate}`);
    return y.dueDate;
  });
  await step('routine start date: filled in visibly, never silently today', () => {
    fresh('Start dates');
    const change = (id, value) => {
      $(id).value = value;
      $(id).dispatchEvent(new Event('change', { bubbles: true }));
    };
    const now = today();
    // A new activity starts today, in plain sight; choosing how it repeats fills an emptied start date again.
    for (const preset of ['week', 'month', 'days', 'custom']) {
      openForm('activity', null, { repeat: 'once' });
      eq($('#f-startDate').value, dateInput(now), `${preset}: a new activity starts today`);
      $('#f-startDate').value = '';
      change('#f-repeat', preset);
      eq($('#f-startDate').value, dateInput(now), `${preset}: today filled in`);
      modal.close();
    }
    // A date already there is kept, also when switching between kinds.
    openForm('activity', null, { repeat: 'once' });
    $('#f-startDate').value = dateInput('2026-09-01');
    change('#f-repeat', 'week');
    change('#f-repeat', 'custom');
    eq($('#f-startDate').value, dateInput('2026-09-01'), 'a typed date is kept');
    // Back to a one-off: the date stays, it is the user's to clear.
    change('#f-repeat', 'none');
    eq($('#f-startDate').value, dateInput('2026-09-01'), 'kept for a one-off too');
    modal.close();
    // Both dates are needed: a cleared start or a missing due date is refused.
    openForm('activity', null, { repeat: 'once' });
    $('#f-title').value = 'Plain';
    $('#f-startDate').value = '';
    submitForm();
    assert(
      modal.open && modal.querySelector('[data-field="startDate"] .err').textContent === t('err.startRequired'),
      'a start is needed',
    );
    $('#f-startDate').value = dateInput(now);
    submitForm();
    assert(
      modal.open && modal.querySelector('[data-field="dueDate"] .err').textContent === t('err.dueRequired'),
      'a due date is needed',
    );
    $('#f-dueDate').value = dateInput(addDays(now, 3));
    submitForm();
    eq(
      [db.activities.find(a => a.title === 'Plain')?.startDate, db.activities.find(a => a.title === 'Plain')?.dueDate],
      [now, addDays(now, 3)],
      'saved with both',
    );
    // Filled in and changed before saving: the change is what is saved.
    openForm('activity', null, { repeat: 'once' });
    $('#f-title').value = 'Earlier';
    change('#f-repeat', 'days');
    $('#f-startDate').value = dateInput(addDays(now, -20));
    $('#f-endDate').value = dateInput(addDays(now, 20));
    submitForm();
    eq(db.activities.find(a => a.title === 'Earlier').startDate, addDays(now, -20), 'the changed date is saved');
    return dateInput(now);
  });
  await step('routine start date: an older routine without one keeps the day it was created', () => {
    const now = today(),
      created = addDays(today(), -40);
    const old = mk('activity', {
      title: 'Legacy',
      status: 'todo',
      createdAt: created,
      repeat: { every: 1, unit: 'week', times: 2 },
      checkins: { [addDays(now, -30)]: 1 },
    });
    delete old.startDate;
    save();
    eq(routineStart(old), created, 'runs from the day it was created');
    openForm('activity', old.id);
    eq($('#f-startDate').value, dateInput(created), 'the form shows that day');
    // It never ended; now it needs an end before it saves.
    submitForm();
    assert(
      modal.open && modal.querySelector('[data-field="endDate"] .err').textContent === t('err.endDate'),
      'asked for an end when edited',
    );
    $('#f-endDate').value = dateInput(addDays(now, 30));
    submitForm();
    eq([old.startDate, old.dueDate], [created, addDays(now, 30)], 'saving keeps the start, not today');
    // A cleared start is refused, so it keeps where it started.
    openForm('activity', old.id);
    $('#f-startDate').value = '';
    submitForm();
    assert(
      modal.open && modal.querySelector('[data-field="startDate"] .err').textContent === t('err.startRequired'),
      'a cleared start is refused',
    );
    modal.close();
    eq(old.startDate, created, 'the old start stays');
    assert(checkedOn(old, addDays(now, -30)), 'its old check-ins still count');
    setView('activities');
    shiftRoutineWeek(old.id, -10);
    eq(
      $(`.card.routine[data-open="${old.id}"] [data-checkin]`).dataset.date,
      addDays(created, -weekday(created)),
      'the strip still reaches back to the start',
    );
    deletePlan(plans.current);
    return created;
  });
});
