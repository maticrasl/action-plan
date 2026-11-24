/** Page tests: the monthly review (feature 14 B): goal cards with from → to and the month's facts, the four choices, waiting, finishing. */
suite(async () => {
  const only = (...ids) => plans.list.forEach(p => (p.demo = !ids.includes(p.id)));
  const card = title =>
    [...$('#view').querySelectorAll('.rv-goal')].find(c => c.querySelector('h4').textContent === title);
  const choose = (title, v) => card(title).querySelector(`[data-review="choice"][data-v="${v}"]`).click();
  const open = () => {
    reviewView.tab = 'month';
    reviewView.period = {};
    reviewView.editing = '';
    setView('review');
  };
  // Wednesday 18 November reviews November; its 1st is d(-17).
  const month = () => {
    fresh('Review month');
    const s = mk('state', { title: 'Longest run', unit: 'km' });
    recordMeasurement(s, d(-25), '2');
    recordMeasurement(s, d(-2), '4');
    const run = mk('goal', {
      title: 'Run 5 km',
      metric: 'km',
      baseline: '0',
      target: '5',
      relevant: 'Energy for the evenings',
      cost: 'Two evenings',
      startDate: d(-60),
      deadline: d(40),
    });
    rel(s, run, 'measures');
    const step = mk('activity', { title: 'Buy shoes', status: 'done', doneAt: d(-10) });
    rel(step, run, 'contributes');
    const r = mk('activity', {
      title: 'Run after work',
      repeat: { every: 1, unit: 'week', times: 1 },
      startDate: d(-60),
      checkins: { [d(-15)]: 1 },
    });
    rel(r, run, 'contributes');
    const spanish = mk('goal', { title: 'Learn Spanish', startDate: d(-30), deadline: d(90) });
    const fence = mk('goal', { title: 'Paint the fence', startDate: d(-30), deadline: d(20) });
    const paused = mk('goal', { title: 'Read more', status: 'paused' });
    save();
    only(plans.current);
    return { run, spanish, fence, paused };
  };

  await step('monthly: each goal card shows from → to, the month’s facts, why and cost', () => {
    month();
    open();
    eq(
      [...$('#view').querySelectorAll('.rv-h')].map(h => h.textContent.trim().slice(1)),
      [t('review.s.month'), t('review.s.goals'), t('review.s.waiting'), t('review.s.working'), t('review.s.sentence')],
      'five parts',
    );
    const c = card('Run 5 km');
    assert(c.querySelector('.rv-progress').textContent.includes('40 % → 80 %'), 'from the 1st to now');
    assert(c.textContent.includes(tp('review.monthSteps', 1)), 'one step this month');
    assert(c.textContent.includes(t('review.kept', { name: 'Run after work', n: 1, m: 2 })), 'kept 1 of 2 weeks');
    assert(c.textContent.includes(t('review.why', { text: 'Energy for the evenings' })), 'why');
    assert(c.textContent.includes(t('review.cost', { text: 'Two evenings' })), 'cost');
    eq(
      [...$('#view').querySelectorAll('.rv-goal h4')].map(h => h.textContent),
      ['Paint the fence', 'Run 5 km', 'Learn Spanish'],
      'active goals, soonest deadline first',
    );
    deletePlan(plans.current);
  });

  await step(
    'monthly: Pause at once, Let it go after asking (in Recently deleted), Bring back; Finish keeps the choices',
    () => {
      const { run, spanish, fence, paused } = month();
      open();
      choose('Run 5 km', 'keep');
      assert(card('Run 5 km').querySelector('[data-v="keep"]').classList.contains('active'), 'marked');
      choose('Learn Spanish', 'pause');
      eq(db.goals.find(g => g.id === spanish.id).status, 'paused', 'paused at once');
      assert(card('Learn Spanish'), 'its card stays, marked');
      window.confirm = () => false;
      choose('Paint the fence', 'drop');
      assert(
        db.goals.some(g => g.id === fence.id),
        'No: nothing deleted',
      );
      window.confirm = () => true;
      choose('Paint the fence', 'drop');
      assert(!db.goals.some(g => g.id === fence.id), 'deleted');
      assert(
        getTrash().items.some(e => e.kind === 'goal' && e.title === 'Paint the fence' && e.planName === 'Review month'),
        'in Recently deleted',
      );
      assert($('#view .rv-gone').textContent.includes('Paint the fence'), 'its title stays in the review');
      const back = $(`#view [data-review="unpause"][data-id="${paused.id}"]`);
      back.click();
      eq(db.goals.find(g => g.id === paused.id).status, 'active', 'brought back');
      $('#view [data-rv-text="sentence"]').value = 'Running took shape';
      $('#view [data-rv-text="sentence"]').dispatchEvent(new Event('input', { bubbles: true }));
      $('#view [data-review="finish"]').click();
      const r = journal.reviews.at(-1);
      eq([r.kind, r.period, r.answers.sentence], ['month', '2026-11', 'Running took shape'], 'stored');
      eq(
        [
          r.answers.goals[run.id].choice,
          r.answers.goals[spanish.id].choice,
          r.answers.goals[fence.id].choice,
          r.answers.goals[fence.id].title,
        ],
        ['keep', 'pause', 'drop', 'Paint the fence'],
        'the choices, with the title of the one let go',
      );
      eq(Math.round(r.answers.goals[run.id].from), 40, 'progress at the start kept');
      window.confirm = () => true;
      deletePlan(plans.current);
    },
  );

  await step('monthly: Change it opens the goal form; the arrows go to October', () => {
    const { run } = month();
    open();
    choose('Run 5 km', 'change');
    assert(modal.open && $('#f-title').value === run.title, 'the goal form');
    modal.close();
    $('#view [data-review="shift"][data-dir="-1"]').click();
    assert(
      $('#view .rv-title').textContent.includes(fmtDay('2026-10-01', { month: 'long', year: 'numeric' })),
      'October',
    );
    assert($('#view [data-review="shift"][data-dir="1"]:not([disabled])'), 'and back');
    deletePlan(plans.current);
  });
});
