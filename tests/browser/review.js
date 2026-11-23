/** Page tests: the Review view's done log (feature 13 part B): weeks and days, filters, all plans, Show earlier, the way in. */
suite(async () => {
  const lines = () => [...$('#view').querySelectorAll('.log-line')].map(l => l.textContent.replace(/\s+/g, ' ').trim());
  const weekNames = () => [...$('#view').querySelectorAll('.log-week-h span')].map(s => s.textContent);
  const chip = f => $(`#view [data-log="filter"][data-v="${f}"]`);
  const scope = v => {
    const sel = $('#view [data-log-scope]');
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const toastText = () => $('#toast').firstChild?.textContent;

  await step('review: the Overview line opens it; empty plan shows the empty text; last in the nav', () => {
    fresh('Review A');
    setView('review');
    eq($('#view .empty')?.textContent, t('log.empty'), 'empty');
    const nav = [...document.querySelectorAll('.nav .nav-item[data-view]')].map(b => b.dataset.view);
    eq(nav.join(), 'dashboard,map,timeline,graphs,visions,goals,activities,review', 'nav order');
    const a = mk('activity', { title: 'Buy shoes', startDate: d(-3), dueDate: d(3) });
    save();
    a.status = 'done';
    save();
    setView('dashboard');
    $('#view .week-line').click();
    eq(ui.view, 'review', 'the line opens Review');
  });

  await step('review: today under This week; a list item names its list; routines share a line; goal tag', () => {
    const g = mk('goal', { title: 'Run 5 km' });
    const a = db.activities.find(x => x.title === 'Buy shoes');
    rel(a, g, 'contributes');
    mk('activity', {
      title: 'Paperwork',
      list: [
        { id: uid(), text: 'Tax', done: true, doneAt: today() },
        { id: uid(), text: 'Bank', done: false },
      ],
    });
    mk('activity', { title: 'Run', status: 'doing', repeat: { every: 1, unit: 'day' }, checkins: { [today()]: 1 } });
    mk('activity', {
      title: 'Stretch',
      status: 'doing',
      repeat: { every: 1, unit: 'day' },
      checkins: { [today()]: 1 },
    });
    mk('state', { title: 'Weight', value: '80', history: [{ date: today(), value: '80' }] });
    save();
    render();
    eq(weekNames(), [t('log.thisWeek')], 'one week');
    const ls = lines();
    assert(
      ls.some(l => l.includes('Buy shoes') && l.includes('▸ Run 5 km')),
      'step with its goal: ' + ls.join(' | '),
    );
    assert(
      ls.some(l => l.includes('Tax') && l.includes('Paperwork')),
      'item with its list',
    );
    eq(ls.filter(l => l.includes('Run ·') || l.includes('Stretch')).length, 1, 'routines on one line');
    assert(
      ls.some(l => l.includes('Weight') && l.includes('80')),
      'the value',
    );
    $('#view .log-line.k-step .log-open').click();
    assert(modal.open, "a line opens the form");
    modal.close();
    $('#view .log-goal').click();
    assert(modal.open, 'the goal tag opens the goal');
    modal.close();
  });

  await step('review: the filter chips narrow the log', () => {
    chip('routines').click();
    assert(lines().every(l => l.startsWith('⟳')) && lines().length === 1, 'only routines');
    chip('values').click();
    eq(lines().length, 1, 'only the value');
    chip('goals').click();
    eq($('#view .empty')?.textContent, t('log.empty'), 'no goal reached: empty');
    chip('all').click();
    assert(lines().length >= 4, 'all again');
  });

  await step('review: All plans shows another plan; opening its line switches plan with the toast', () => {
    const first = plans.current;
    fresh('Review B');
    const b = mk('activity', { title: 'Other step', status: 'done', doneAt: today() });
    save();
    openPlan(first);
    setView('review');
    assert(!lines().some(l => l.includes('Other step')), 'this plan only');
    scope('all');
    assert(
      lines().some(l => l.includes('Other step') && l.includes('Review B')),
      'the other plan, named',
    );
    [...$('#view').querySelectorAll('.log-open')].find(x => x.textContent === 'Other step').click();
    eq(plans.current !== first, true, 'switched plan');
    eq(toastText(), t('log.openedPlan', { name: 'Review B' }), 'toast');
    assert(modal.open && findEntity(b.id), 'its form');
    modal.close();
    scope('plan');
  });

  await step('review: Show earlier adds eight weeks; empty weeks are skipped', () => {
    fresh('Review C');
    const monday = mondayAt(today());
    mk('activity', { title: 'Recent', status: 'done', doneAt: addDays(monday, -7 * 2) });
    mk('activity', { title: 'Long ago', status: 'done', doneAt: addDays(monday, -7 * 10) });
    save();
    setView('review');
    eq(weekNames().length, 1, 'only the week with something; This week and Last week are empty');
    assert(!lines().some(l => l.includes('Long ago')), 'older than eight weeks: hidden');
    $('#view [data-log="more"]').click();
    eq(weekNames().length, 2, 'earlier week added');
    assert(
      lines().some(l => l.includes('Long ago')),
      'shown',
    );
    assert(!$('#view [data-log="more"]'), 'nothing earlier: no button');
  });
});
