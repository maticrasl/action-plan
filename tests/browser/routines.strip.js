/** Page tests: the routine week strip: late days, due and missed days, dates, arrows, earlier weeks. */
suite(async () => {
  const longDate = iso => fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const rcard = r => $(`.card.routine[data-open="${r.id}"]`);
  const days = r => [...rcard(r).querySelectorAll('[data-checkin]')];
  const arrow = (r, dir) => rcard(r).querySelector(`[data-rt-week][data-dir="${dir}"]`);
  const shownDays = r => days(r).map(b => b.dataset.date);
  // Runs `fn` as if today were `iso` (the app reads the date through today()).
  const onDay = (iso, fn) => {
    const real = window.today;
    window.today = () => iso;
    try {
      return fn();
    } finally {
      window.today = real;
    }
  };
  const MON = '2026-11-02',
    TUE = '2026-11-03',
    WED = '2026-11-04',
    THU = '2026-11-05',
    FRI = '2026-11-06',
    SAT = '2026-11-07',
    SUN = '2026-11-08';
  await step('routines: late only until ticked again, however many days were missed; the plan badge follows', () => {
    fresh('Late rule');
    const daily = mk('activity', {
      title: 'Daily',
      startDate: '2026-10-01',
      repeat: { every: 1, unit: 'week', days: [0, 1, 2, 3, 4, 5, 6] },
      checkins: {},
    });
    const badge = () => {
      render();
      return planHealth(db);
    };
    const set = (...days) => {
      daily.checkins = Object.fromEntries(days.map(d => [d, 1]));
    };
    onDay(THU, () => {
      set(MON, TUE, WED);
      assert(
        routineState(daily) === 'doing' && routineToday(daily) === 'due' && badge() === 'today',
        'on track, due today',
      );
      set(MON);
      assert(routineState(daily) === 'late' && badge() === 'late', 'two days missed, not ticked since: late');
      set(MON, THU);
      assert(
        routineState(daily) === 'doing' && badge() === 'ok',
        'ticked today after two missed days: back on track, green',
      );
      set(THU);
      assert(routineState(daily) === 'doing' && badge() === 'ok', 'three missed, then ticked: still fine');
      set(TUE);
      assert(routineState(daily) === 'late', 'a day missed after the last tick is late again');
      set(WED);
      assert(
        routineState(daily) === 'doing' && badge() === 'today',
        'ticked yesterday after missing Mon and Tue: not late, only due today',
      );
      // A miss in last week does not count this week; a tick on a day it is not due still counts.
      const monThu = mk('activity', {
        title: 'Strength',
        startDate: '2026-10-01',
        repeat: { every: 1, unit: 'week', days: [0, 3] },
        checkins: { '2026-10-26': 1 },
      });
      eq(routineState(monThu), 'late', 'Monday missed: late');
      monThu.checkins[TUE] = 1;
      eq(
        routineState(monThu),
        'todo',
        'ticked on Tuesday (not due) after it: not late (and the tick does not count toward Monday)',
      );
      setView('activities');
      assert(!$(`.card.routine[data-open="${monThu.id}"]`).classList.contains('st-late'), 'card not red');
      delete monThu.checkins[TUE];
      render();
      assert($(`.card.routine[data-open="${monThu.id}"]`).classList.contains('st-late'), 'red while late');
    });
    // Flexible: behind once the days left cannot reach the target; a tick after that clears it.
    const flex = mk('activity', {
      title: 'Run',
      startDate: '2026-10-01',
      repeat: { every: 1, unit: 'week', times: 3 },
      checkins: {},
    });
    db.activities = [flex];
    onDay(SUN, () => {
      eq(routineState(flex), 'late', 'Sunday, none of three done: late');
      eq(badge(), 'late', 'red badge');
      flex.checkins[SUN] = 1;
      eq(routineState(flex), 'doing', 'ticked on Sunday: not late any more, though the target is out of reach');
      eq(badge(), 'ok', 'green badge');
      flex.checkins = { [FRI]: 1 };
      eq(
        routineState(flex),
        'late',
        'ticked on Friday, then behind on Sunday (Saturday skipped) without a tick since: late',
      );
      flex.checkins = { [MON]: 1 };
      eq(routineState(flex), 'late', 'one early tick, then behind since Saturday without a tick: late');
      flex.checkins[SAT] = 1;
      eq(routineState(flex), 'doing', 'a tick on the day it fell behind clears it');
    });
    onDay(WED, () => {
      flex.checkins = {};
      eq(routineToday(flex), 'any', 'Wednesday, three to go in five days: any day');
    });
    onDay(FRI, () => {
      flex.checkins = {};
      eq(routineToday(flex), 'due', 'Friday, three to go in three days: due today');
      flex.checkins = { [MON]: 1, [TUE]: 1, [WED]: 1 };
      eq(routineToday(flex), 'met', 'target met');
      flex.checkins[FRI] = 1;
      eq(routineToday(flex), 'done', 'ticked today');
    });
    // Not running today: nothing asked.
    const later = mk('activity', { startDate: '2026-12-01', repeat: { every: 1, unit: 'week', times: 2 } });
    onDay(THU, () => eq(routineToday(later), null, 'not started: no tag'));
    deletePlan(plans.current);
  });
  await step(
    'routines: the week strip shows due, missed, not-due and today’s days; the card says what today asks',
    () => {
      fresh('Strip days');
      const r = mk('activity', {
        title: 'Strength',
        startDate: '2026-10-01',
        repeat: { every: 1, unit: 'week', days: [0, 3] },
        checkins: {},
      });
      const flex = mk('activity', {
        title: 'Run',
        startDate: '2026-10-01',
        repeat: { every: 1, unit: 'week', times: 3 },
        checkins: { [TUE]: 1 },
      });
      save();
      const card = a => $(`.card.routine[data-open="${a.id}"]`);
      const day = (a, iso) => card(a).querySelector(`[data-checkin][data-date="${iso}"]`);
      const has = (a, iso, ...cls) => cls.every(c => day(a, iso).classList.contains(c));
      onDay(THU, () => {
        setView('activities');
        assert(has(r, MON, 'due', 'missed') && !has(r, MON, 'on'), 'Monday: due and missed');
        assert(has(r, TUE, 'rest') && has(r, WED, 'rest') && !has(r, TUE, 'due'), 'Tue and Wed: not due');
        assert(has(r, THU, 'due', 'today') && !has(r, THU, 'missed'), 'Thursday: due today, not missed yet');
        assert(has(r, FRI, 'rest') && day(r, FRI).getAttribute('aria-disabled') === 'true', 'Friday: not due, to come');
        eq(day(r, MON).title, t('rt.dayMissed', { date: longDate(MON) }), 'missed day says so');
        eq(day(r, TUE).title, t('rt.dayRest', { date: longDate(TUE) }), 'not-due day says so');
        eq(
          day(r, THU).title,
          t('rt.dayToday', { label: t('rt.dayDue', { date: longDate(THU) }) }),
          'today: due, not done, today',
        );
        eq(card(r).querySelector('[data-today]').dataset.today, 'due', 'tag: due today');
        eq(card(r).querySelector('[data-today]').textContent, t('rt.today.due'), 'reads Due today');
        assert(card(r).querySelector('[data-today]').classList.contains('warn'), 'due today stands out');
        // Looks: missed is hatched and dashed, in greys, not red; today is ringed; due today is filled.
        const cs = getComputedStyle(day(r, MON)),
          bad = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim();
        assert(
          cs.borderTopStyle === 'dashed' &&
            cs.backgroundImage.includes('repeating-linear-gradient') &&
            cs.textDecorationLine.includes('line-through'),
          'missed: dashed, hatched, crossed out',
        );
        const toRgb = c => {
          const x = document.createElement('i');
          x.style.color = c;
          document.body.append(x);
          const v = getComputedStyle(x).color;
          x.remove();
          return v;
        };
        assert(cs.borderTopColor !== toRgb(bad) && cs.color !== toRgb(bad), 'missed is not red');
        assert(
          getComputedStyle(day(r, THU)).outlineStyle === 'solid' &&
            getComputedStyle(day(r, THU)).backgroundColor !== getComputedStyle(day(r, WED)).backgroundColor,
          'today ringed and filled while due',
        );
        assert(
          getComputedStyle(day(r, TUE)).borderTopStyle === 'dotted' &&
            getComputedStyle(day(r, MON)).borderTopStyle === 'dashed' &&
            getComputedStyle(day(r, THU)).borderTopStyle === 'solid',
          'not due dotted, missed dashed, due solid',
        );
        assert(
          getComputedStyle(document.querySelector('.rt-legend .rt-swatch.rest')).borderTopStyle === 'dotted',
          'legend matches the strip',
        );
        assert(
          Number(getComputedStyle(day(r, MON)).opacity) === 1 &&
            Number(getComputedStyle(day(r, FRI)).opacity) < 0.7 &&
            Number(getComputedStyle(day(r, FRI)).opacity) >= 0.5,
          'past days clear, days to come fainter but readable on the glass',
        );
        // Tick today: done, ringed, tag says so; ticking Monday later clears the miss.
        day(r, THU).click();
        assert(has(r, THU, 'on', 'today') && !has(r, MON, 'on'), 'Thursday done');
        eq(card(r).querySelector('[data-today]').textContent, t('rt.today.done'), 'tag: done today');
        assert(!card(r).classList.contains('st-late'), 'not late after a tick');
        day(r, MON).click();
        assert(has(r, MON, 'on') && !has(r, MON, 'missed'), 'Monday filled in: no longer missed');
        // A flexible routine has no due, missed or not-due days, and says any day.
        assert(
          [MON, WED, THU].every(d => !has(flex, d, 'due') && !has(flex, d, 'missed') && !has(flex, d, 'rest')),
          'flexible: days all alike',
        );
        assert(has(flex, TUE, 'on') && has(flex, THU, 'today'), 'flexible: ticks and today');
        eq(card(flex).querySelector('[data-today]').dataset.today, 'any', 'flexible tag: any day');
        // Earlier weeks show their misses too.
        ui.rtWeek[r.id] = '2026-10-26';
        render();
        assert(has(r, '2026-10-26', 'missed') && has(r, '2026-10-29', 'missed'), 'last week’s misses shown');
        ui.rtWeek = {};
        render();
        // The legend names the kinds of day, matching the strip.
        const legend = [...$('.rt-legend').querySelectorAll('span')].map(s => s.textContent);
        eq(
          legend,
          ['on', 'due', 'missed', 'rest', 'today'].map(k => t('rt.legend.' + k)),
          'legend',
        );
        assert(
          [...$('.rt-legend').querySelectorAll('i')].every(i => i.getAttribute('aria-hidden') === 'true'),
          'swatches hidden from screen readers',
        );
      });
      onDay(WED, () => {
        render();
        eq(
          card(r).querySelector('[data-today]').textContent,
          t('rt.today.restNext', { date: fmtDay(THU, { weekday: 'short', day: 'numeric', month: 'short' }) }),
          'not due today: says when next',
        );
        assert(!card(r).querySelector('[data-today]').classList.contains('warn'), 'quietly');
      });
      // Its last due day passed: not due today, nothing next.
      const ending = mk('activity', {
        title: 'Ending',
        startDate: '2026-10-01',
        dueDate: SAT,
        repeat: { every: 1, unit: 'week', days: [0, 3] },
        checkins: { [THU]: 1 },
      });
      onDay(FRI, () => {
        render();
        eq(
          card(ending).querySelector('[data-today]').textContent,
          t('rt.today.rest'),
          'no next due day: just not today',
        );
      });
      // With only flexible routines, the legend leaves out the days they do not have.
      db.activities = [flex];
      save();
      onDay(THU, () => {
        render();
        eq(
          [...$('.rt-legend').querySelectorAll('span')].map(s => s.textContent),
          [t('rt.legend.on'), t('rt.legend.today')],
          'flexible only: done and today',
        );
      });
      // Slovenian.
      db.activities = [r];
      r.checkins = {};
      save();
      changeLanguage('sl');
      onDay(THU, () => {
        render();
        eq(card(r).querySelector('[data-today]').textContent, I18N.sl.strings['rt.today.due'], 'Slovenian tag');
        eq($('.rt-legend span:nth-child(3)').textContent, I18N.sl.strings['rt.legend.missed'], 'Slovenian legend');
        assert(day(r, MON).title.endsWith(I18N.sl.strings['rt.dayMissed'].split('}')[1]), 'Slovenian missed label');
      });
      changeLanguage('en');
      // Help explains the days.
      onDay(THU, () => {
        setHelp(true);
        render();
      });
      $('[data-help-tip="routines"]').click();
      assert(
        $('#helpTip').textContent.includes('hatched') && $('#helpTip').textContent.includes('late only until'),
        'help tip explains the days and the late rule',
      );
      setHelp(false);
      deletePlan(plans.current);
    },
  );
  await step('routines: the strip fits a phone, with the today ring inside the card', async () => {
    const r = {
      id: 'p1',
      title: 'Strength',
      startDate: '2026-10-01',
      repeat: { every: 1, unit: 'week', days: [0, 3] },
      checkins: { [MON]: 1 },
    };
    fresh('Strip phone');
    db.activities.push(r);
    const html = onDay(THU, () => routineCard(r));
    for (const theme of ['light', 'dark']) {
      const frame = document.createElement('iframe');
      Object.assign(frame.style, {
        width: '390px',
        height: '500px',
        position: 'fixed',
        left: '-9999px',
        top: '0',
        border: '0',
      });
      frame.srcdoc = `<!doctype html><html data-theme="${theme}"><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0 16px">${html}</body></html>`;
      await new Promise(res => {
        frame.onload = res;
        document.body.append(frame);
      });
      await fontsLoaded(frame.contentDocument);
      const doc = frame.contentDocument,
        c = doc.querySelector('.card').getBoundingClientRect();
      const ds = [...doc.querySelectorAll('.rt-day')].map(b => b.getBoundingClientRect());
      assert(
        ds.length === 7 && ds.every(b => b.width >= 28 && b.height >= 32),
        `${theme}: seven days, big enough to tap`,
      );
      const t4 = doc.querySelector('.rt-day.today').getBoundingClientRect();
      assert(t4.left - 4 >= c.left && t4.right + 4 <= c.right, `${theme}: the ring stays inside the card`);
      assert(doc.documentElement.scrollWidth <= 390, `${theme}: no sideways scroll`);
      frame.remove();
    }
    deletePlan(plans.current);
  });
  await step('routine week strip: every day shows its date on hover; days that cannot be ticked say so too', () => {
    fresh('Week strip');
    const now = today(),
      mon = mondayAt(now);
    const r = mk('activity', {
      title: 'Run',
      repeat: { every: 1, unit: 'week', times: 3 },
      startDate: addDays(mon, -17),
    });
    setView('activities');
    eq(shownDays(r), daysBetween(mon, addDays(mon, 6)), 'this week shown at first');
    days(r).forEach(b => {
      const d = b.dataset.date;
      const said = t(checkedOn(r, d) ? 'rt.dayOn' : 'rt.dayOff', { date: longDate(d) });
      eq(b.title, d === now ? t('rt.dayToday', { label: said }) : said, `title of ${d}`);
      assert(b.title.includes(d.slice(0, 4)), 'with the year');
      assert(!b.disabled, 'not disabled, so the tooltip shows');
      eq(b.getAttribute('aria-disabled'), d > now ? 'true' : null, `${d} can${d > now ? 'not' : ''} be ticked`);
    });
    const future = days(r).find(b => b.dataset.date > now);
    if (future) {
      future.click();
      assert(!checkedOn(r, future.dataset.date) && !modal.open, 'clicking a future day does nothing');
    }
    days(r)
      .find(b => b.dataset.date === now)
      .click();
    const todayBtn = days(r).find(b => b.dataset.date === now);
    eq(todayBtn.title, t('rt.dayToday', { label: t('rt.dayOn', { date: longDate(now) }) }), 'ticked day says done');
    assert(document.activeElement === todayBtn, 'focus stays on the day');
    return todayBtn.title;
  });
  await step('routine week strip: arrows browse back to the start week and forward to this week', () => {
    const now = today(),
      mon = mondayAt(now);
    const r = db.activities.find(a => a.title === 'Run');
    const first = addDays(mon, -21);
    const other = mk('activity', {
      title: 'Stretch',
      repeat: { every: 1, unit: 'week', days: [0, 1, 2, 3, 4, 5, 6] },
      startDate: addDays(mon, -60),
    });
    render();
    assert(arrow(r, -1) && arrow(r, 1), 'arrows on both sides of the days');
    const strip = rcard(r).querySelector('.rt-week');
    assert(
      arrow(r, -1).nextElementSibling === strip && strip.nextElementSibling === arrow(r, 1),
      'left arrow, days, right arrow',
    );
    assert(!arrow(r, -1).disabled && arrow(r, 1).disabled, 'can go back, not forward past this week');
    eq([arrow(r, -1).title, arrow(r, 1).title], [t('rt.prevWeek'), t('rt.nextWeek')], 'arrow titles');
    eq(arrow(r, -1).getAttribute('aria-label'), t('rt.prevWeek'), 'arrow label');
    arrow(r, -1).click();
    eq(shownDays(r)[0], addDays(mon, -7), 'one week back');
    assert(document.activeElement === arrow(r, -1), 'focus stays on the arrow');
    eq(shownDays(other)[0], mon, 'other routines stay on this week');
    arrow(r, -1).click();
    arrow(r, -1).click();
    eq(shownDays(r)[0], first, 'back to the week the routine started in');
    assert(arrow(r, -1).disabled && !arrow(r, 1).disabled, 'no further back');
    assert(document.activeElement === arrow(r, 1), 'focus moves to the arrow that still works');
    arrow(r, -1).click();
    shiftRoutineWeek(r.id, -1);
    eq(shownDays(r)[0], first, 'cannot go before the start, even directly');
    days(r).forEach(b =>
      eq(
        b.getAttribute('aria-disabled'),
        b.dataset.date < r.startDate ? 'true' : null,
        `${b.dataset.date} before the start`,
      ),
    );
    const before = days(r).find(b => b.dataset.date < r.startDate);
    before.click();
    assert(!checkedOn(r, before.dataset.date), 'a day before the start cannot be ticked');
    for (let i = 0; i < 5; i++) shiftRoutineWeek(r.id, 1);
    eq(shownDays(r)[0], mon, 'cannot go past this week');
    assert(arrow(r, 1).disabled, 'forward arrow off on this week');
    return `${first} … ${mon}`;
  });
  await step('routine week strip: ticking an earlier week saves it, stays there and shows that week', () => {
    const now = today(),
      mon = mondayAt(now);
    const r = db.activities.find(a => a.title === 'Run');
    const w2 = addDays(mon, -14),
      w1 = addDays(mon, -7);
    shiftRoutineWeek(r.id, -2);
    eq(shownDays(r)[0], w2, 'two weeks back');
    const label = () => rcard(r).querySelector('.rt-progress')?.textContent;
    const range = fmtRange(w2, addDays(w2, 6));
    assert(
      range.includes(String(Number(w2.slice(8)))) && range.includes(String(Number(addDays(w2, 6).slice(8)))),
      `range ${range} names both ends`,
    );
    eq(label(), t('rt.past', { range, done: 0, target: 3 }), 'the bar shows that week');
    $('#toast').textContent = '';
    [0, 2, 4].forEach(i =>
      days(r)
        .find(b => b.dataset.date === addDays(w2, i))
        .click(),
    );
    assert(
      [0, 2, 4].every(i => r.checkins[addDays(w2, i)] === 1),
      'ticked',
    );
    eq(readPlan(plans.current).activities.find(a => a.id === r.id).checkins, r.checkins, 'saved');
    eq(shownDays(r)[0], w2, 'still on that week');
    assert(document.activeElement?.dataset.date === addDays(w2, 4), 'focus on the last ticked day');
    eq(label(), t('rt.past', { range, done: 3, target: 3 }), 'that week met');
    assert($('#toast').textContent !== t('rt.metWeek'), 'no “this week done” for an earlier week');
    arrow(r, 1).click();
    [1, 3, 5].forEach(i =>
      days(r)
        .find(b => b.dataset.date === addDays(w1, i))
        .click(),
    );
    assert(rcard(r).textContent.includes(tp('rt.streak.week', 2)), 'streak counts the filled-in weeks');
    arrow(r, 1).click();
    eq(label(), periodText(r), 'this week shows as before');
    return label();
  });
  await step('routine week strip: an ended routine opens on its last week; a future one cannot move', () => {
    const now = today(),
      mon = mondayAt(now);
    const ended = mk('activity', {
      title: 'Old',
      repeat: { every: 1, unit: 'week', days: [0, 2, 4] },
      startDate: addDays(mon, -35),
      dueDate: addDays(mon, -10),
    });
    const later = mk('activity', {
      title: 'Later',
      repeat: { every: 1, unit: 'week', days: [1] },
      startDate: addDays(mon, 14),
    });
    render();
    const last = mondayAt(ended.dueDate);
    eq(shownDays(ended)[0], last, 'ended routine shows the week it ended in');
    assert(arrow(ended, 1).disabled && !arrow(ended, -1).disabled, 'only back');
    days(ended).forEach(b =>
      eq(
        b.getAttribute('aria-disabled'),
        b.dataset.date > ended.dueDate ? 'true' : null,
        `${b.dataset.date} after the end`,
      ),
    );
    const after = days(ended).find(b => b.dataset.date > ended.dueDate);
    after.click();
    assert(!checkedOn(ended, after.dataset.date), 'a day after the end cannot be ticked');
    for (let i = 0; i < 10; i++) shiftRoutineWeek(ended.id, -1);
    eq(shownDays(ended)[0], addDays(mon, -35), 'back to its start week');
    eq(shownDays(later)[0], mon, 'a routine that has not started shows this week');
    assert(arrow(later, -1).disabled && arrow(later, 1).disabled, 'both arrows off');
    assert(
      days(later).every(b => b.getAttribute('aria-disabled') === 'true'),
      'no day can be ticked',
    );
    assert(
      rcard(later).textContent.includes(t('rt.starts', { date: fmtDate(later.startDate) })),
      'says when it starts',
    );
    // A routine whose end date is in the future still stops at this week.
    const open = mk('activity', {
      title: 'Open',
      repeat: { every: 1, unit: 'week', times: 1 },
      startDate: addDays(mon, -7),
      dueDate: addDays(mon, 60),
    });
    render();
    assert(arrow(open, 1).disabled && shownDays(open)[0] === mon, 'stops at this week, not the end date');
    return `${ended.startDate}–${ended.dueDate}`;
  });
  await step('routine week strip: every-2-weeks and monthly routines show their own period', () => {
    const now = today(),
      mon = mondayAt(now);
    const two = mk('activity', {
      title: 'Fortnight',
      repeat: { every: 2, unit: 'week', times: 2 },
      startDate: addDays(mon, -28),
    });
    const month = mk('activity', {
      title: 'Monthly',
      repeat: { every: 1, unit: 'month', on: 'day' },
      startDate: addDays(mon, -70),
    });
    render();
    const label = r => rcard(r).querySelector('.rt-progress')?.textContent;
    shiftRoutineWeek(two.id, -1);
    const p2 = periodProgress(two, addDays(mon, -1));
    eq(
      label(two),
      t(p2.target ? 'rt.past' : 'rt.pastNone', { range: fmtRange(p2.from, p2.to), done: p2.done, target: p2.target }),
      'fortnight label',
    );
    eq(dayNum(p2.to) - dayNum(p2.from), 13, 'its period is two weeks');
    for (let i = 0; i < 6; i++) shiftRoutineWeek(month.id, -1);
    const shown = shownDays(month)[0];
    const pm = periodProgress(month, addDays(shown, 6));
    eq(
      label(month),
      t(pm.target ? 'rt.past' : 'rt.pastNone', { range: fmtRange(pm.from, pm.to), done: pm.done, target: pm.target }),
      'month label',
    );
    eq([pm.from.slice(8), Number(pm.to.slice(8)) >= 28], ['01', true], 'its period is the calendar month');
    return `${label(two)} | ${label(month)}`;
  });
  await step('routine week strip: weeks reset when switching plans; overview unchanged; Slovenian', () => {
    const now = today(),
      mon = mondayAt(now);
    const r = db.activities.find(a => a.title === 'Run');
    const here = plans.current;
    shiftRoutineWeek(r.id, -2);
    eq(shownDays(r)[0], addDays(mon, -14), 'moved back');
    const other = addPlan({ name: 'Elsewhere', data: emptyDb() });
    openPlan(here);
    setView('activities');
    eq(shownDays(r)[0], mon, 'back on this week after switching plans');

    // Nothing ticked this week, so the overview lists it whatever earlier steps ticked.
    const live = db.activities.find(a => a.id === r.id),
      kept = live.checkins;
    live.checkins = {};
    setView('dashboard');
    const row = $(`.routine-row[data-open="${r.id}"]`);
    assert(row && !row.querySelector('[data-rt-week]'), 'overview rows have no arrows');
    assert(row.querySelector('[data-checkin]').dataset.date === now, 'overview still ticks today');
    live.checkins = kept;

    changeLanguage('sl');
    setView('activities');
    eq(
      [arrow(r, -1).title, arrow(r, 1).title],
      [I18N.sl.strings['rt.prevWeek'], I18N.sl.strings['rt.nextWeek']],
      'arrows in Slovenian',
    );
    const d = days(r)[0].dataset.date;
    const said = fill(I18N.sl.strings[checkedOn(r, d) ? 'rt.dayOn' : 'rt.dayOff'], { date: longDate(d) });
    eq(
      days(r)[0].title,
      d === now ? fill(I18N.sl.strings['rt.dayToday'], { label: said }) : said,
      'day title in Slovenian',
    );
    assert(
      /[a-zčšž]/.test(longDate(d)) &&
        longDate(d) !==
          new Date(d + 'T00:00Z').toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
      'Slovenian date',
    );
    shiftRoutineWeek(r.id, -1);
    assert(rcard(r).querySelector('.rt-progress').textContent.includes('/'), 'earlier week label in Slovenian');
    const sl = days(r)[0].title;
    changeLanguage('en');
    deletePlan(other.id);
    deletePlan(here);
    return sl;
  });
});
