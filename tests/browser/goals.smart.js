/** Page tests: a goal saves unfinished; hints, letters, the card, the Overview and the Timeline without a target or deadline. */
suite(async () => {
  const fill = fields => {
    Object.entries(fields).forEach(([k, v]) => ($('#f-' + k).value = v));
    $('#modalForm').dispatchEvent(new Event('input'));
  };
  const lit = g => $$(`#view .card.goal[data-open="${g.id}"] .smart b.on`).length;

  await step('a goal saves with a title alone: toast, card, letters, Overview', () => {
    fresh('Unfinished');
    setView('goals');
    openForm('goal');
    fill({ title: 'Learn to cook' });
    eq($('#smartLiveText').textContent, t('smart.partial', { n: 0 }), 'the line counts what is lit');
    const hint = modal.querySelector('[data-field="specific"] .smart-hint');
    assert(hint && !hint.hidden && hint.textContent === t('err.specific'), 'a quiet hint under an unfinished field');
    assert(
      !modal.querySelector('.field.invalid') &&
        getComputedStyle(hint).color !== getComputedStyle(modal.querySelector('.err')).color,
      'hints are not errors',
    );
    submitForm();
    const g = db.goals.find(x => x.title === 'Learn to cook');
    assert(g && !modal.open, 'saved');
    eq($('#toast').textContent, t('toast.goalAddedPartial', { n: 0 }), 'the toast says 0 of 5');
    assert(!('obstacle' in g) && !('ifThen' in g), 'no empty obstacle fields are stored');
    const card = $(`#view .card.goal[data-open="${g.id}"]`);
    assert(
      card.textContent.includes(t('goals.noTarget')) && !card.querySelector('.trail') && lit(g) === 0,
      'the card: letters unlit, "No target yet", no trail',
    );
    assert(!card.querySelector('.tag.bad, .tag.warn') && goalState(g) !== 'late', 'no deadline: never late');
    setView('dashboard');
    eq($('.summary-line').textContent, tp('dash.headlineNone', 1), 'no goal with a target');
    // With a second goal that has one, the average counts that one and names the other.
    mk('goal', { ...SMART, title: 'Measured', current: '4', startDate: d(-5), deadline: d(30) });
    save();
    render();
    const line = $('.summary-line').textContent;
    assert(
      line.startsWith(tp('dash.headline', 2, { pct: '40 %' })) && line.endsWith(tp('dash.noTarget', 1)),
      'the average counts goals with a target: ' + line,
    );
    deletePlan(plans.current);
  });

  await step('filling the parts one by one lights the letters; the last says SMART', () => {
    fresh('Count up');
    setView('goals');
    openForm('goal');
    const steps = [
      { title: 'Read books', specific: 'Read twelve books this year' },
      { metric: 'Books', baseline: '0', target: '12' },
      { obstacle: 'Too tired at night', ifThen: 'Read on the bus instead' },
      { relevant: 'I want to learn more' },
      { startDate: d(0), deadline: d(300) },
    ];
    const seen = steps.map(s => {
      fill(s);
      return $('#smartLiveText').textContent;
    });
    eq(seen, [1, 2, 3, 4].map(n => t('smart.partial', { n })).concat(t('smart.ok')), 'counts up');
    assert(![...modal.querySelectorAll('.smart-hint')].some(h => !h.hidden), 'no hint left');
    submitForm();
    eq($('#toast').textContent, t('toast.goalCreated'), 'a SMART goal is created as before');
    const g = db.goals[0];
    eq([g.obstacle, g.ifThen, lit(g)], ['Too tired at night', 'Read on the bus instead', 5], 'stored');
    openForm('goal', g.id);
    fill({ deadline: '' });
    submitForm();
    eq($('#toast').textContent, t('toast.goalUpdatedPartial', { n: 4 }), 'updated with 4 of 5');
    deletePlan(plans.current);
  });

  await step('contradictions are refused at the field; clearing the deadline saves', () => {
    fresh('Contradictions');
    setView('goals');
    openForm('goal');
    fill({ title: 'Ordered', startDate: d(5), deadline: d(5) });
    submitForm();
    assert(modal.open && modal.querySelector('[data-field="deadline"].invalid'), 'deadline on the start refused');
    eq(modal.querySelector('[data-field="deadline"] .err').textContent, t('err.deadlineOrder'), 'its error');
    const hint = modal.querySelector('[data-field="deadline"] .smart-hint');
    assert(!hint || getComputedStyle(hint).display === 'none', 'the hint gives way to the error');
    fill({ deadline: d(2) });
    submitForm();
    assert(modal.open, 'deadline before the start refused');
    fill({ deadline: '', baseline: '5', target: '5' });
    submitForm();
    assert(modal.open && modal.querySelector('[data-field="target"].invalid'), 'target equal to the start refused');
    fill({ target: '' });
    submitForm();
    const g = db.goals[0];
    assert(!modal.open && g && !g.deadline && g.target === '', 'saved without deadline and target');
    deletePlan(plans.current);
  });

  await step('a goal without a deadline runs to today on the Timeline, fading, with no end to drag', () => {
    fresh('Open end');
    const g = mk('goal', { title: 'Sleep better', startDate: d(-10) });
    const dated = mk('goal', { ...SMART, title: 'Dated', startDate: d(-10), deadline: d(10) });
    save();
    setView('timeline');
    ui.mapSelected = ui.tlDates = g.id;
    render();
    const row = $(`#view .tl-row[data-tl-node="${g.id}"]`),
      bar = row.querySelector('.tl-bar');
    assert(bar && bar.classList.contains('tl-open') && !row.querySelector('.tl-milestone'), 'a bar, not a milestone');
    const day = ui.tlPx;
    eq(Math.round(parseFloat(bar.style.width) / day), 11, 'from its start to today');
    assert(getComputedStyle(bar).maskImage.includes('gradient'), 'its end fades');
    assert(!row.querySelector('.tl-grip') && bar.classList.contains('tl-drag'), 'no grips; the bar still moves');
    assert($('#view').textContent.includes(t('tl.dragHintOpen')), 'the hint says only the start moves');
    ui.mapSelected = ui.tlDates = dated.id;
    render();
    const other = $(`#view .tl-row[data-tl-node="${dated.id}"]`);
    assert(
      other.querySelectorAll('.tl-grip').length === 2 && !other.querySelector('.tl-open'),
      'a dated goal is as before',
    );
    ui.mapSelected = ui.tlDates = null;
    deletePlan(plans.current);
  });

  await step('section A: two new fields; an old answer shows as a third until it is cleared', () => {
    fresh('Section A');
    setView('goals');
    openForm('goal');
    assert($('#f-obstacle') && $('#f-ifThen') && !$('#f-achievable'), 'a new goal: obstacle and plan only');
    eq($('#f-obstacle').placeholder, t('f.obstaclePh'), 'placeholders');
    modal.close();
    const old = mk('goal', {
      ...SMART,
      obstacle: undefined,
      ifThen: undefined,
      achievable: 'One a month is easy',
      startDate: d(-5),
      deadline: d(30),
    });
    save();
    openForm('goal', old.id);
    assert($('#f-achievable') && $('#f-achievable').value === 'One a month is easy', 'the old answer, editable');
    const A = () => modal.querySelector('.smart-block[data-smart="A"]').classList.contains('ok');
    assert(A(), 'A lit by the old answer');
    fill({ achievable: '' });
    assert(!A(), 'cleared: A unlit');
    fill({ obstacle: 'Busy weeks at work' });
    assert(!A(), 'one new field alone does not light it');
    fill({ ifThen: 'Cook twice on Sunday' });
    assert(A(), 'both new fields light it');
    submitForm();
    eq(old.achievable, '', 'the old answer cleared');
    openForm('goal', old.id);
    assert(!$('#f-achievable'), 'and its field is gone the next time');
    modal.close();
    deletePlan(plans.current);
  });

  await step('a target without a metric name reads "Progress"; search stays on title and description', () => {
    fresh('No metric');
    const g = mk('goal', { title: 'Save money', target: '100', current: '25', baseline: '0' });
    const h = mk('goal', { title: 'Other goal', obstacle: 'zebracrossing', ifThen: 'zebracrossing' });
    save();
    setView('goals');
    const card = $(`#view .card.goal[data-open="${g.id}"]`);
    assert(
      card.querySelector('.trail') && card.textContent.includes(t('goals.progress') + ': 25'),
      'trail and "Progress"',
    );
    ui.search = 'zebracrossing';
    render();
    assert(!$(`#view .card.goal[data-open="${h.id}"]`), 'search does not look into obstacle or plan');
    ui.search = '';
    render();
    deletePlan(plans.current);
  });
});
