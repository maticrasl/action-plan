/** Page tests: the weekly review (feature 14 A): what you did, measure, look back, fix the plan, the one thing, finishing. */
suite(async () => {
  const toastText = () => $('#toast').firstChild?.textContent;
  const sec = n => $(`#view .rv-sec:nth-of-type(${n})`);
  const secTitles = () => [...$('#view').querySelectorAll('.rv-h')].map(h => h.textContent.trim().slice(1));
  // Only the given plans count; the plans of earlier steps are treated as samples.
  const only = (...ids) => plans.list.forEach(p => (p.demo = !ids.includes(p.id)));
  const open = () => {
    reviewView.tab = 'week';
    reviewView.period = {};
    reviewView.editing = '';
    setView('review');
  };
  // Wednesday 18 Nov reviews 9–15 Nov: d(-9) is that Monday, d(-3) its Sunday.
  const week = () => {
    fresh('Review week');
    const s = mk('state', { title: 'Longest run', unit: 'km' });
    recordMeasurement(s, d(-20), '3.2');
    const g = mk('goal', {
      title: 'Run 5 km',
      metric: 'km',
      baseline: '1',
      target: '5',
      startDate: d(-40),
      deadline: d(60),
    });
    rel(s, g, 'measures');
    const r = mk('activity', {
      title: 'Run after work',
      repeat: { every: 1, unit: 'day' },
      startDate: d(-30),
      checkins: {},
    });
    [-9, -8, -7, -6, -5, -4].forEach(n => (r.checkins[d(n)] = 1)); // Sunday d(-3) missed
    rel(r, g, 'contributes');
    const late = mk('activity', { title: 'Buy running shoes', dueDate: d(-5) });
    const done = mk('activity', { title: 'Book the check-up', status: 'done', doneAt: d(-6) });
    save();
    only(plans.current);
    return { s, g, r, late, done };
  };

  await step('review: the week under review, its counts and a missed day ticked from the strip', () => {
    const { r } = week();
    open();
    assert($('#view .rv-tabs .chip.active').textContent === t('review.tab.week'), 'opens on This week');
    eq(
      secTitles(),
      [t('review.s.did'), t('review.s.measure'), t('review.s.back'), t('review.s.fix'), t('review.s.nextThis')],
      'five parts',
    );
    assert($('#view .rv-title').textContent.includes(fmtRange(d(-9), d(-3))), 'last week, Monday to Thursday');
    assert(sec(1).querySelector('.rv-counts').textContent.includes(tp('log.ticks', 6)), 'six routine days');
    const day = sec(1).querySelector(`.rv-forgot [data-checkin="${r.id}"][data-date="${d(-3)}"]`);
    assert(day, 'the missed Sunday in the strip');
    day.click();
    eq(db.activities.find(a => a.id === r.id).checkins[d(-3)], 1, 'ticked on that day');
    assert(sec(1).querySelector('.rv-counts').textContent.includes(tp('log.ticks', 7)), 'counts follow');
    assert(!sec(1).querySelector(`.rv-forgot [data-open="${r.id}"]`), 'no longer forgotten');
    deletePlan(plans.current);
  });

  await step('review: Record in Measure saves the value, the state leaves the list, the goal moves', () => {
    const { s, g } = week();
    open();
    const row = sec(2).querySelector('.rv-measure');
    assert(row.textContent.includes('Longest run'), 'listed: no value from that week');
    row.querySelector('[data-rv-value]').value = 'x';
    row.querySelector('[data-review="record"]').click();
    eq(s.history.length, 1, 'not a number: nothing stored');
    const before = goalProgress(g);
    row.querySelector('[data-rv-value]').value = '4,2';
    row.querySelector('[data-review="record"]').click();
    eq([s.history.at(-1).date, s.history.at(-1).value], [today(), '4.2'], 'dated today');
    assert(goalProgress(g) > before, 'progress changed');
    // A value from today is not one from last week: the review of this week no longer lists it.
    reviewView.period.week = d(-2);
    render();
    assert(sec(2).textContent.includes(t('review.allMeasured')), 'this week has its value');
    deletePlan(plans.current);
  });

  await step('review: Fix the plan opens Move late steps for the plan the steps are in', () => {
    const { late } = week();
    const a = plans.current;
    fresh('Review other');
    mk('goal', { title: 'Other goal' });
    save();
    only(a, plans.current);
    open();
    const line = [...$('#view').querySelectorAll('.rv-fix li')].find(li =>
      li.textContent.includes(tp('review.fix.late', 1)),
    );
    assert(line && line.textContent.includes('Review week'), 'a late-steps line with its plan');
    line.querySelector('[data-review="replan"]').click();
    eq(plans.current, a, 'that plan is opened');
    assert($('#replan').open && $('#replan').textContent.includes(late.title), 'the dialog lists its step');
    $('#replan').close();
    deletePlan(plans.list.find(p => p.name === 'Review other').id);
    deletePlan(a);
  });

  await step(
    'review: choose the one thing and finish; reopen; Edit and Finish again update the same review',
    async () => {
      const { late } = week();
      open();
      assert($('.nav-item[data-view="review"]').classList.contains('has-dot'), 'dot while last week has no review');
      const box = $('#view [data-rv-text="well"]');
      box.value = 'Three runs';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      sec(5).querySelector('[data-review="focus"]').click();
      const dlg = $('#focusPickDlg');
      [...dlg.querySelectorAll('.pick-step')].find(b => b.textContent.includes(late.title)).click();
      eq([journal.focus.item, journal.focus.week], [late.id, d(-2)], 'this week’s focus (reviewed on a Wednesday)');
      const n = journal.reviews.length;
      $('#view [data-review="finish"]').click();
      eq(toastText(), t('review.toast.week'), 'toast');
      eq(journal.reviews.length, n + 1, 'stored');
      const r = journal.reviews.at(-1);
      eq(
        [r.kind, r.period, r.answers.well, r.answers.focus.title, r.answers.stats.steps],
        ['week', '2026-W46', 'Three runs', late.title, 1],
        'what it keeps',
      );
      eq(getSeen().lastReview, today(), 'the tip `week` and Getting started see it');
      assert(!$('.nav-item[data-view="review"]').classList.contains('has-dot'), 'dot gone');
      assert(
        $('#view .rv-done').textContent.includes(t('review.edit')) && $('#view [data-rv-text="well"]').readOnly,
        'finished: read-only with Edit',
      );
      $('#view [data-review="edit"]').click();
      const again = $('#view [data-rv-text="well"]');
      assert(!again.readOnly, 'Edit opens the text');
      again.value = 'Four runs';
      again.dispatchEvent(new Event('input', { bubbles: true }));
      $('#view [data-review="finish"]').click();
      eq(
        [journal.reviews.length, journal.reviews.at(-1).answers.well],
        [n + 1, 'Four runs'],
        'the same review updated',
      );
      deletePlan(plans.current);
    },
  );

  await step('review: the text is kept as a draft while typing', () => {
    week();
    open();
    const box = $('#view [data-rv-text="hard"]');
    box.value = 'Rain on Thursday';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    setView('dashboard');
    open();
    eq($('#view [data-rv-text="hard"]').value, 'Rain on Thursday', 'there again');
    deletePlan(plans.current);
  });

  await step('review: no active goal: no Measure or Fix, no dot; no items: the empty text', () => {
    fresh('Review none');
    only(plans.current);
    open();
    assert($('#view').textContent.includes(t('review.empty')), 'nothing to review');
    mk('activity', { title: 'A step' });
    save();
    render();
    eq(secTitles(), [t('review.s.did'), t('review.s.back'), t('review.s.nextThis')], 'three parts');
    assert(!$('.nav-item[data-view="review"]').classList.contains('has-dot'), 'no dot');
    deletePlan(plans.current);
  });
});
