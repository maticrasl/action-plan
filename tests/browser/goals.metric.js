/** Page tests: linking a goal's metric to a current state from the goal form; unit and value follow the state. */
suite(async () => {
  await step('picking a state fills and locks unit and current, and saves the link', () => {
    fresh('Metric link');
    const s = mk('state', { title: 'Weight', unit: 'kg', value: '82', history: [{ date: d(0), value: '82' }] });
    save();
    setView('goals');
    openForm('goal');
    const opts = [...$('#f-measuredBy').options].map(o => o.value);
    eq(opts, ['', s.id], 'none, then each state');
    $('#f-title').value = 'Lose weight';
    change('#f-measuredBy', s.id);
    eq(
      [$('#f-unit').value, $('#f-current').value, $('#f-metric').value],
      ['kg', '82', 'Weight'],
      'filled from the state',
    );
    assert($('#f-unit').readOnly && $('#f-current').readOnly, 'unit and current follow the state');
    submitForm();
    const g = db.goals.find(x => x.title === 'Lose weight');
    assert(
      relsTo(g.id, 'measures').some(r => r.from === s.id),
      'the link is saved',
    );
    eq(g.unit, 'kg', 'the unit is stored');
    eq(goalCurrent(g), 82, 'current comes from the state');
    deletePlan(plans.current);
  });

  await step('an own metric name stays; reopening shows the link; none unlinks', () => {
    fresh('Metric unlink');
    const s = mk('state', { title: 'Savings', unit: '€', value: '300', history: [{ date: d(0), value: '300' }] });
    const g = mk('goal', { title: 'Fund', metric: 'Emergency fund', unit: 'EUR' });
    save();
    openForm('goal', g.id);
    eq($('#f-measuredBy').value, '', 'not linked yet');
    change('#f-measuredBy', s.id);
    eq($('#f-metric').value, 'Emergency fund', 'a metric name of its own is kept');
    submitForm();
    eq(g.unit, '€', 'unit taken from the state');
    openForm('goal', g.id);
    eq($('#f-measuredBy').value, s.id, 'the form shows the link');
    change('#f-measuredBy', '');
    assert(!$('#f-unit').readOnly && !$('#f-current').readOnly, 'editable again');
    submitForm();
    assert(!relsTo(g.id, 'measures').length, 'unlinked');
    deletePlan(plans.current);
  });

  await step('changing a state unit changes the unit of the goals it measures', () => {
    fresh('Metric unit');
    const s = mk('state', { title: 'Run', unit: 'km', value: '5', history: [{ date: d(0), value: '5' }] });
    const g = mk('goal', { title: 'Run far', unit: 'km' });
    rel(s, g, 'measures');
    save();
    openForm('state', s.id);
    $('#f-unit').value = 'mi';
    submitForm();
    eq(g.unit, 'mi', 'the goal follows');
    deletePlan(plans.current);
  });

  await step('a state that adds up shows how the goal counts it', () => {
    fresh('Metric adds up');
    const s = mk('state', { title: 'Sold', cumulative: true, entries: [entry(d(0), 3)] });
    save();
    openForm('goal');
    assert($('#f-period').closest('.field').hidden, 'no period without a state that adds up');
    change('#f-measuredBy', s.id);
    assert(!$('#f-period').closest('.field').hidden, 'the period shows');
    deletePlan(plans.current);
  });
});
