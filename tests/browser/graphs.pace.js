/** Page tests: the pace line, trend and facts on a graph, and the pace tag on the goal card. */
suite(async () => {
  // A state measuring one goal: 0 → 100 km over 200 days, halfway today, at 40 and climbing 1 a day.
  const setup = (name, more = {}) => {
    fresh(name);
    const s = mk('state', { title: 'Distance', unit: 'km', value: '', history: [] });
    [
      [-28, 12],
      [-14, 26],
      [0, 40],
    ].forEach(([n, v]) => recordMeasurement(s, d(n), String(v)));
    const g = mk('goal', {
      title: 'Run far',
      metric: 'km',
      baseline: '0',
      target: '100',
      startDate: d(-100),
      deadline: d(100),
      ...more,
    });
    rel(s, g, 'measures');
    save();
    return { s, g };
  };
  const card = id => $(`[data-gr="${id}"]`);
  const cardOf = id => $(`.goal[data-open="${id}"]`);

  await step('a state measuring one goal: pace line, trend, both facts, legend; the deadline moves the line', () => {
    const { s, g } = setup('Pace one');
    setView('graphs');
    const c = card(s.id);
    const pace = c.querySelectorAll('.gr-pace');
    eq(pace.length, 1, 'one pace line');
    assert(c.querySelector('.gr-trend'), 'a trend line');
    const facts = c.querySelector('.gr-pace-facts').textContent;
    assert(facts.includes('Needs 4.2 km a week from here'), facts);
    assert(facts.includes(`At this rate: ${fmtDate(d(60))} (deadline ${fmtDate(d(100))})`), facts);
    assert(c.querySelector('.gr-legend').textContent.includes('Pace to target'), 'legend');
    const y1 = pace[0].getAttribute('y1');
    g.deadline = d(150);
    save();
    render();
    assert(card(s.id).querySelector('.gr-pace').getAttribute('y1') !== y1, 'a later deadline makes the line flatter');
    return facts;
  });

  await step('the tooltip shows the pace for the point’s day', () => {
    const { s } = setup('Pace tip');
    setView('graphs');
    const plot = card(s.id).querySelector('.gr-plot');
    showGraphPoint(plot, 2);
    const tip = plot.querySelector('.gr-tip').textContent;
    assert(tip.includes('pace: 50 km'), tip);
    return tip;
  });

  await step('the goal card: behind with what it needs; a new measurement changes the tag', () => {
    const { s, g } = setup('Pace card');
    setView('goals');
    const tag = () => cardOf(g.id).querySelector('.tag.pace');
    eq(tag().textContent, 'Behind pace', 'behind');
    assert(tag().classList.contains('warn'), 'in the warning colour');
    assert(cardOf(g.id).textContent.includes('needs 4.2 km a week'), cardOf(g.id).textContent);
    recordMeasurement(s, d(0), '52');
    save();
    render();
    eq(tag().textContent, 'On pace', 'on pace');
    recordMeasurement(s, d(0), '70');
    save();
    render();
    eq(tag().textContent, 'Ahead', 'ahead');
    assert(!cardOf(g.id).querySelector('.pace-needs'), 'no needs when ahead');
  });

  await step('two goals on one state: two lines and two named fact lines', () => {
    const { s } = setup('Pace two');
    const h = mk('goal', {
      title: 'Run farther',
      metric: 'km',
      baseline: '0',
      target: '200',
      startDate: d(-100),
      deadline: d(100),
    });
    rel(s, h, 'measures');
    save();
    setView('graphs');
    const c = card(s.id);
    eq(c.querySelectorAll('.gr-pace').length, 2, 'two lines');
    const facts = [...c.querySelectorAll('.gr-pace-facts')].map(p => p.textContent);
    eq(facts.length, 2, 'two fact lines');
    assert(facts[0].startsWith('Run far: ') && facts[1].startsWith('Run farther: '), facts.join(' | '));
  });

  await step('routines kept, paused, a single measurement, a start after today', () => {
    const { s, g } = setup('Pace none', { progress: 'routines' });
    setView('goals');
    assert(!cardOf(g.id).querySelector('.tag.pace'), 'routines kept: no tag');
    g.progress = undefined;
    g.status = 'paused';
    // The goals view hides paused goals: the card itself.
    assert(!goalCard(g).includes('tag pace'), 'paused: no tag');
    g.status = 'active';
    g.startDate = d(1);
    save();
    setView('graphs');
    assert(!card(s.id).querySelector('.gr-pace, .gr-pace-facts'), 'not started: no pace');
    // A single measurement: the tag, the needed rate, no forecast and no trend.
    const one = setup('Pace single');
    one.s.history = one.s.history.slice(-1);
    save();
    setView('graphs');
    const c = card(one.s.id);
    assert(c.querySelector('.gr-pace') && !c.querySelector('.gr-trend'), 'a pace line, no trend');
    const facts = c.querySelector('.gr-pace-facts').textContent;
    assert(!facts.includes('At this rate'), facts);
    setView('goals');
    eq(cardOf(one.g.id).querySelector('.tag.pace').textContent, 'Behind pace', 'tag shows');
  });

  await step('a running total counts; per week does not; Slovenian uses a decimal comma', () => {
    fresh('Pace total');
    const s = mk('state', { title: 'Saved', unit: '€', cumulative: true, entries: [], value: '' });
    [
      [-28, 12],
      [-14, 14],
      [0, 14],
    ].forEach(([n, v], i) => s.entries.push({ id: 'e' + i, date: d(n), amount: String(v) }));
    refreshTotal(s);
    const g = mk('goal', {
      title: 'Save',
      metric: '€',
      baseline: '0',
      target: '100',
      period: 'total',
      startDate: d(-100),
      deadline: d(100),
    });
    rel(s, g, 'measures');
    save();
    setGraphScale(s.id, 'total');
    setView('graphs');
    assert(card(s.id).querySelector('.gr-pace'), 'a pace line on the running total');
    setLanguage('sl');
    render();
    const facts = card(s.id).querySelector('.gr-pace-facts').textContent;
    setLanguage('en');
    assert(facts.includes('4,2'), facts);
    g.period = 'week';
    save();
    setView('goals');
    assert(!cardOf(g.id).querySelector('.tag.pace'), 'per week: no tag');
    return facts;
  });
});
