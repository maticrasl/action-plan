/** Page tests: routine schedule tags, the monthly options in the form, monthly check-ins and streaks. */
suite(async () => {
  const lastOfMonth = iso => isoOf(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0);
  await step('routine cards: a short schedule tag that fits, the full one as its tooltip', async () => {
    const at = (repeat, title = 'R') => ({
      id: 'sc' + Math.random().toString(36).slice(2),
      title,
      repeat,
      startDate: '2027-01-07',
    });
    const kinds = [
      at({ every: 1, unit: 'week', days: [0, 2, 5], makeUp: true }),
      at({ every: 1, unit: 'week', days: [0, 1, 2, 3, 4] }),
      at({ every: 1, unit: 'week', days: [5, 6] }),
      at({ every: 1, unit: 'week', days: [0, 1, 2, 3, 4, 5, 6] }),
      at({ every: 1, unit: 'week', days: [0, 1, 3, 4, 5] }),
      at({ every: 1, unit: 'week', times: 3 }),
      at({ every: 1, unit: 'month', on: 'lastDay' }),
      at({ every: 1, unit: 'month', on: 'day', day: 15 }),
      at({ every: 2, unit: 'month', on: 'nth', nth: 2, weekday: 4 }),
      at({ every: 1, unit: 'month', on: 'nth', nth: -1, weekday: 5 }),
      at({ every: 2, unit: 'week', days: [0, 4] }),
      at({ every: 1, unit: 'year' }),
      at({ every: 3, unit: 'day' }),
    ];
    eq(kinds.map(shortSchedule), [
      'Mon, Wed, Sat ↻',
      'Mon–Fri',
      'Sat, Sun',
      'every day',
      'Mon, Tue, Thu–Sat',
      '3× a week',
      'monthly: last day',
      'monthly: day 15',
      'every 2 months: second Fri',
      'monthly: last Sat',
      'every 2 weeks: Mon, Fri',
      'yearly: 7 Jan',
      'every 3 days',
    ]);
    changeLanguage('sl');
    eq(
      kinds.map(shortSchedule),
      [
        'pon., sre., sob. ↻',
        'pon.–pet.',
        'sob., ned.',
        'vsak dan',
        'pon., tor., čet.–sob.',
        '3-krat na teden',
        'mesečno: zadnji dan',
        'mesečno: 15. dan',
        'vsaka 2 meseca: drugi pet.',
        'mesečno: zadnja sob.',
        'vsaka 2 tedna: pon., pet.',
        'letno: 7. jan.',
        'vsake 3 dni',
      ],
      'Slovenian',
    );
    assert(
      kinds.every(a => shortSchedule(a).length <= scheduleText(a).length),
      'never longer than the full text',
    );
    fresh('Short tags');
    kinds[0].title = '3 zmenki';
    kinds[6].title = 'Mesečni pregled';
    // A tag too long to fit even when short: every 3 weeks on four scattered days.
    const long = at({ every: 3, unit: 'week', days: [0, 2, 4, 6], makeUp: true }, 'V službi najkasneje');
    db.activities.push(...kinds, long);
    save();
    setView('activities');
    const tag = a => $(`.card.routine[data-open="${a.id}"] .rt-sched`);
    eq(tag(kinds[0]).textContent, 'pon., sre., sob. ↻', 'the card shows the short text');
    eq(tag(kinds[0]).title, 'vsak pon., sre., sob. ali drug dan', 'the full text as its tooltip');
    // In a narrow card the title keeps most of the row and the tag ends in an ellipsis inside the card.
    const wordy = at({ every: 1, unit: 'week', days: [1, 3] }, 'A routine with a title long enough to wrap');
    const html = [kinds[0], kinds[6], long, wordy].map(routineCard).join('');
    const frame = document.createElement('iframe');
    Object.assign(frame.style, {
      width: '260px',
      height: '900px',
      position: 'fixed',
      left: '-9999px',
      top: '0',
      border: '0',
    });
    frame.srcdoc = `<!doctype html><html><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0">${html}</body></html>`;
    await new Promise(res => {
      frame.onload = res;
      document.body.append(frame);
    });
    await fontsLoaded(frame.contentDocument);
    [...frame.contentDocument.querySelectorAll('.card')].forEach(c => {
      const card = c.getBoundingClientRect(),
        h = c.querySelector('h3').getBoundingClientRect(),
        g = c.querySelector('.rt-sched').getBoundingClientRect();
      assert(
        g.right <= card.right + 0.5 && g.left >= h.right,
        `${c.querySelector('h3').textContent}: the tag stays inside the card, beside the title`,
      );
      const oneLine = h.height < parseFloat(getComputedStyle(c.querySelector('h3')).lineHeight) * 1.5;
      assert(
        c.querySelector('h3').textContent === wordy.title ? h.width >= (card.width - 40) * 0.6 : oneLine,
        `${c.querySelector('h3').textContent}: a short title stays on one line, a long one keeps most of the row`,
      );
    });
    const longTag = frame.contentDocument.querySelectorAll('.rt-sched')[2];
    assert(longTag.scrollWidth > longTag.clientWidth, 'the long tag is cut with an ellipsis');
    frame.remove();
    changeLanguage('en');
    deletePlan(plans.current);
  });
  changeLanguage('en'); // also when the step above failed in Slovenian
  await step('monthly routines: the form shows the right fields and saves each option', () => {
    fresh('Monthly');
    const shown = sel => !$(sel).closest('[hidden]');
    const start = d => {
      $('#f-startDate').value = dateInput(d);
      $('#f-startDate').dispatchEvent(new Event('input', { bubbles: true }));
      $('#f-startDate').dispatchEvent(new Event('change', { bubbles: true }));
    };
    const make = (title, setup) => {
      openForm('activity', null, { repeat: 'once' });
      $('#f-title').value = title;
      start('2027-03-10'); // the second Wednesday of March 2027
      change('#f-repeat', 'custom');
      change('#f-unit', 'month');
      $('#f-endDate').value = dateInput('2027-12-31');
      setup();
      submitForm();
      return db.activities.find(a => a.title === title);
    };
    let checks = {};
    const a1 = make('Rent', () => {
      change('#f-on', 'day');
      checks.day = [
        shown('#repMonthDay'),
        shown('#repNth'),
        shown('#repTimes'),
        shown('#repDays'),
        $('#f-monthDay').value,
      ];
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
      checks.nth = [
        shown('#repMonthDay'),
        shown('#repNth'),
        $('#f-nth').value,
        $('#f-weekday').value,
        [...$('#f-nth').options].map(o => o.value),
      ];
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
      assert(
        modal.open && err === t(bad === 'x' ? 'err.number' : 'err.times', { max: 31 }),
        `day “${bad}” refused: ${err}`,
      );
      modal.close();
    }
    eq(a1.repeat.day, 31, 'unchanged after refusals');

    // Reopening shows what was saved.
    openForm('activity', a3.id);
    eq(
      [$('#f-repeat').value, $('#f-unit').value, $('#f-on').value, $('#f-nth').value, $('#f-weekday').value],
      ['custom', 'month', 'nth', '2', '4'],
      'n-th reopened',
    );
    modal.close();
    openForm('activity', a1.id);
    eq([$('#f-on').value, $('#f-monthDay').value], ['day', '31'], 'day reopened');
    modal.close();
    openForm('activity', a2.id);
    eq($('#f-on').value, 'lastDay', 'last day reopened');
    modal.close();

    // An older routine opens with its days chosen, and saves in the new form.
    const old = mk('activity', {
      title: 'Old monthly',
      status: 'todo',
      startDate: '2027-01-27',
      dueDate: '2027-12-31',
      repeat: { every: 1, unit: 'month', on: 'last' },
    });
    openForm('activity', old.id);
    eq(
      [$('#f-on').value, $('#f-nth').value, $('#f-weekday').value],
      ['nth', '-1', '2'],
      'old “last Wednesday” shown as such',
    );
    submitForm();
    eq(old.repeat, { every: 1, unit: 'month', on: 'nth', nth: -1, weekday: 2 }, 'saved the new way, same days');
    const oldDay = mk('activity', {
      title: 'Old day',
      status: 'todo',
      startDate: '2027-01-12',
      repeat: { every: 1, unit: 'month', on: 'day' },
    });
    openForm('activity', oldDay.id);
    eq($('#f-monthDay').value, '12', 'old day routine shows its start’s day');
    modal.close();

    // A fifth weekday from an old routine stays selectable.
    const fifth = mk('activity', {
      title: 'Fifth',
      status: 'todo',
      startDate: '2027-01-29',
      repeat: { every: 1, unit: 'month', on: 'weekday' },
    });
    openForm('activity', fifth.id);
    eq(
      [$('#f-nth').value, [...$('#f-nth').options].map(o => o.value).includes('5')],
      ['5', true],
      'a fifth Friday kept',
    );
    modal.close();

    // Changing the start date moves the defaults until they are chosen by hand.
    openForm('activity', null, { repeat: 'once' });
    $('#f-title').value = 'Moves';
    change('#f-repeat', 'custom');
    change('#f-unit', 'month');
    change('#f-on', 'nth');
    start('2027-06-25'); // the fourth Friday
    eq(
      [$('#f-nth').value, $('#f-weekday').value, $('#f-monthDay').value],
      ['4', '4', '25'],
      'defaults follow the start date',
    );
    change('#f-nth', '1');
    start('2027-06-02');
    eq($('#f-nth').value, '1', 'a choice made by hand stays');
    modal.close();
    return `${a1.repeat.day} | ${a2.repeat.on} | ${scheduleText(a3)}`;
  });
  await step('monthly routines: check-ins, streaks and the week strip', () => {
    const now = today(),
      lastDay = lastOfMonth(now);
    const r = mk('activity', {
      title: 'Month end',
      status: 'todo',
      startDate: addDays(now, -120),
      repeat: { every: 1, unit: 'month', on: 'lastDay' },
    });
    const done = daysBetween(r.startDate, addDays(now, -1)).filter(d => isDueDay(r, d));
    assert(done.length >= 3 && done.every(d => d === lastOfMonth(d)), 'past due days are month ends');
    done.forEach(d => (r.checkins = { ...r.checkins, [d]: 1 }));
    save();
    eq(routineStreak(r).n, done.length, 'streak counts every month end');
    eq(periodProgress(r, now).target, 1, 'one due this month');
    eq(nextDueDay(r), lastDay, 'next due is this month’s last day');
    setView('activities');
    const card = $(`.card.routine[data-open="${r.id}"]`);
    assert(
      card.textContent.includes('monthly: last day') &&
        card.querySelector('.rt-sched').title === 'every month on the last day',
      'card summary',
    );
    const strip = [...card.querySelectorAll('[data-checkin]')].map(b => b.dataset.date);
    if (strip.includes(lastDay))
      assert(card.querySelector(`[data-date="${lastDay}"]`).classList.contains('due'), 'the last day is outlined');
    // Browse back to a past month end and see it ticked.
    shiftRoutineWeek(r.id, -(dayNum(mondayAt(now)) - dayNum(mondayAt(done[done.length - 1]))) / 7);
    const b = $(`.card.routine[data-open="${r.id}"] [data-date="${done[done.length - 1]}"]`);
    assert(
      b && b.classList.contains('due') && b.getAttribute('aria-pressed') === 'true',
      'past month end shown ticked',
    );
    deletePlan(plans.current);
    return `${done.length} months`;
  });
});
