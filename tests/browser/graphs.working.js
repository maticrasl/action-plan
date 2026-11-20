/** Page tests: "Is it working?" under a state's and a routine's graph, and the wrong-way tip's second button. */
suite(async () => {
  // Today is Wednesday 18 November; the last complete week starts on Monday d(-9). Oldest first.
  const mondays = n => Array.from({ length: n }, (_, i) => d(-9 - 7 * (n - 1 - i)));
  const KEPT = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0];
  // A state measured every Sunday that rose 0.4 km in kept weeks and 0.1 in the others, toward a goal.
  const setup = (name, kept = KEPT) => {
    fresh(name);
    const mons = mondays(kept.length);
    const s = mk('state', { title: 'Longest run', unit: 'km', value: '', history: [] });
    let v = 5;
    recordMeasurement(s, addDays(mons[0], -1), String(v));
    mons.forEach((m, i) =>
      recordMeasurement(s, addDays(m, 6), String((v = Number((v + (KEPT[i] ? 0.4 : 0.1)).toFixed(2))))),
    );
    const a = mk('activity', {
      title: 'Run after work',
      status: 'doing',
      startDate: mons[0],
      repeat: { every: 1, unit: 'week', days: [0] },
      checkins: Object.fromEntries(mons.filter((_, i) => kept[i]).map(m => [m, 1])),
    });
    rel(a, s, 'improves');
    const g = mk('goal', { title: 'Run 10 km', metric: 'km', baseline: '5', target: '10', deadline: d(200) });
    rel(s, g, 'measures');
    save();
    return { s, a };
  };
  const fold = id => $(`[data-gr="${id}"] .gr-work`);
  const open = id => {
    const f = fold(id);
    f.open = true;
    fillWork(f);
    return f;
  };

  await step('the fold shows both lines, the bars and the verdict; the routine’s card shows the same', () => {
    const { s, a } = setup('Working');
    setView('graphs');
    eq(fold(s.id).querySelector('summary').textContent, 'Is it working?', 'the fold');
    eq(fold(s.id).querySelector('.gr-work-body').childElementCount, 0, 'nothing worked out before it opens');
    const text = open(s.id).textContent;
    assert(text.includes('Run after work'), text);
    assert(text.includes('Weeks you kept it (7):') && text.includes('Weeks you did not (5):'), text);
    assert(text.includes('Longest run rose 0.4 km a week on average'), text);
    assert(text.includes('Longest run rose 0.1 km a week on average'), text);
    assert(text.includes('In your numbers, the weeks you kept it went better.'), text);
    assert(text.includes('not proof'), 'the caution line');
    eq(fold(s.id).querySelectorAll('.work-bar').length, 2, 'two bars');
    const widths = [...fold(s.id).querySelectorAll('.work-bar rect')].map(r => Number(r.getAttribute('width')));
    assert(widths[0] > widths[1] * 3, `bars to one scale: ${widths}`);
    const own = open(a.id).textContent;
    assert(own.includes('Longest run') && own.includes('went better'), own);
    return text;
  });

  await step('too little to compare: the few text with the counts', () => {
    const { s } = setup(
      'Working few',
      KEPT.map(() => 1),
    );
    setView('graphs');
    const text = open(s.id).textContent;
    assert(text.includes('Not enough weeks to compare yet: 12 kept, 0 not.'), text);
    assert(!fold(s.id).querySelector('.work-bar'), 'no bars');
  });

  await step('three routines: three blocks, one caution line; a routine without data shows nothing', () => {
    const { s, a } = setup('Working three');
    const { id: _id, ...copy } = a;
    ['Stretch', 'Strength'].forEach(title => {
      const b = mk('activity', { ...copy, title, checkins: { ...a.checkins } });
      rel(b, s, 'improves');
    });
    const empty = mk('activity', { ...copy, title: 'Never ticked', checkins: {} });
    rel(empty, s, 'improves');
    save();
    setView('graphs');
    open(s.id);
    eq(fold(s.id).querySelectorAll('.work-pair').length, 3, 'three blocks');
    eq(fold(s.id).querySelectorAll('.work-caution').length, 1, 'one caution');
    assert(!fold(s.id).textContent.includes('Never ticked'), 'nothing for a routine without ticks');
  });

  await step('a deleted measurement changes the result on the next opening', () => {
    const { s } = setup('Working delete');
    setView('graphs');
    const before = open(s.id).textContent;
    deleteMeasurement(s, s.history.at(-1).date);
    save();
    render();
    const after = open(s.id).textContent;
    assert(after.includes('(4):') && !before.includes('(4):'), after);
  });

  await step('Slovenian: decimal comma', () => {
    const { s } = setup('Working SL');
    setLang('sl');
    setView('graphs');
    const text = open(s.id).textContent;
    setLang('en');
    assert(text.includes('0,4 km'), text);
    assert(text.includes('Ali deluje?'), text);
  });

  await step('the wrong-way tip: a second button that opens the fold', () => {
    const { s } = setup('Working tip');
    const tip = CATALOGUE.find(x => x.id === 'wrong-way');
    const c = { tip, key: `wrong-way:${s.id}`, hit: { id: s.id, vars: { name: s.title } } };
    const html = tipHtml(c, false);
    assert(html.includes('data-tip="do2"') && html.includes('Is it working?'), html);
    TIP_DO.working(c, document.body);
    eq(ui.view, 'graphs', 'Graphs');
    assert(fold(s.id).open && fold(s.id).textContent.includes('went better'), 'the fold is open and filled');
    fresh('Working tip, no routine');
    const t2 = mk('state', { title: 'Weight', value: '', history: [] });
    assert(
      !tipHtml({ ...c, hit: { id: t2.id, vars: { name: 'Weight' } } }, false).includes('do2'),
      'no second button without a routine',
    );
  });
});
