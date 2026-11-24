/** Page tests: the yearly review (feature 14 C) and Past reviews: the year's facts, a vision's choices, the buttons, delete. */
suite(async () => {
  const only = (...ids) => plans.list.forEach(p => (p.demo = !ids.includes(p.id)));
  const open = tab => {
    reviewView.tab = tab;
    reviewView.period = {};
    reviewView.editing = '';
    reviewView.open = '';
    setView('review');
  };
  // Visions of earlier files are set aside while these steps run.
  let kept = [];
  const year = () => {
    kept = visions.list.splice(0);
    fresh('Review year');
    const fit = mkV('To be fit', [], { description: 'Energy in the evenings', avoid: 'Out of breath on the stairs' });
    const g = mk('goal', { title: 'Run 5 km', status: 'achieved', achievedAt: '2026-06-10', visions: [fit.id] });
    g.notes = [
      {
        id: 'n1',
        date: '2026-06-10',
        text: 'Running with Ana on Sundays',
        kind: 'closing',
        at: '2026-06-10T10:00:00.000Z',
      },
    ];
    mk('goal', { title: 'Run 10 km', visions: [fit.id], startDate: d(-10) });
    const s = mk('state', { title: 'Longest run', unit: 'km' });
    recordMeasurement(s, '2026-02-01', '1.5');
    recordMeasurement(s, '2026-10-01', '8');
    save();
    only(plans.current);
    return { fit };
  };
  const done = () => {
    deletePlan(plans.current);
    visions.list.splice(0, visions.list.length, ...kept);
  };

  await step('yearly: counts, goals reached with the closing note, biggest changes, the vision with its year', () => {
    const { fit } = year();
    open('year');
    assert($('#view .rv-title').textContent.includes('2026'), 'the year under way in November');
    const text = $('#view').textContent;
    assert(
      text.includes(t('review.reachedOne', { name: 'Run 5 km', month: fmtDay('2026-06-10', { month: 'long' }) })),
      'reached, with its month',
    );
    assert(text.includes(t('review.difference', { text: 'Running with Ana on Sundays' })), 'what made the difference');
    assert(
      text.includes(t('review.changeLine', { name: 'Longest run', from: '1.5', to: '8 km' })),
      'the biggest change',
    );
    const card = $('#view .rv-vision');
    assert(card.textContent.includes('Out of breath on the stairs'), 'its future to avoid, open');
    assert(card.textContent.includes(t('review.visionYear', { reached: 1, active: 1 })), '1 reached, 1 active');
    card.querySelector('[data-v="true"]').click();
    assert($('#view .rv-vision [data-v="true"]').classList.contains('active'), 'Still true marked');
    $('#view .rv-vision [data-v="change"]').click();
    assert(modal.open && $('#f-title').value === fit.title, 'Change it opens the vision');
    modal.close();
    done();
  });

  await step(
    'yearly: the two buttons open discovery and the goal form; Let it go deletes the vision; Finish stores',
    () => {
      const { fit } = year();
      open('year');
      $('#view .rv-sec:nth-of-type(4) [data-disc]').click();
      assert($('#discDlg').open, 'discovery opens');
      $('#discDlg').close();
      $('#view [data-new="goal"]').click();
      assert(modal.open && $('#f-title'), 'the goal form');
      modal.close();
      window.confirm = () => true;
      $('#view .rv-vision [data-v="drop"]').click();
      assert(!visions.list.some(v => v.id === fit.id), 'the vision is deleted');
      assert($('#view .rv-gone').textContent.includes('To be fit'), 'its title stays');
      $('#view [data-rv-text="next"]').value = 'Calm';
      $('#view [data-rv-text="next"]').dispatchEvent(new Event('input', { bubbles: true }));
      $('#view [data-review="finish"]').click();
      const r = journal.reviews.at(-1);
      eq(
        [r.kind, r.period, r.answers.next, r.answers.visions[fit.id].choice, r.answers.stats.goals],
        ['year', '2026', 'Calm', 'drop', 1],
        'stored',
      );
      done();
    },
  );

  await step('yearly: no visions: the line and Find your visions', () => {
    kept = visions.list.splice(0);
    fresh('Review no visions');
    mk('goal', { title: 'A goal' });
    save();
    only(plans.current);
    open('year');
    assert($('#view').textContent.includes(t('review.noVisions')), 'the line');
    assert($('#view .rv-sec:nth-of-type(2) [data-disc]'), 'and the button');
    done();
  });

  await step('past reviews: all three kinds, newest first; one opens read-only; Delete removes it for good', () => {
    fresh('Review past');
    mk('goal', { title: 'G' });
    save();
    only(plans.current);
    journal.reviews.length = 0;
    const stats = { steps: 2, routineDays: 3, values: 1, goals: 0 };
    addReview({
      kind: 'week',
      period: '2026-W46',
      doneAt: '2026-11-16T09:00:00.000Z',
      answers: { well: 'Three runs', hard: '', focus: { title: 'Book it' }, stats },
    });
    addReview({
      kind: 'month',
      period: '2026-10',
      doneAt: '2026-11-02T09:00:00.000Z',
      answers: {
        sentence: 'Running took shape',
        goals: { x: { plan: 'p', title: 'Gone goal', choice: 'drop', from: 10, to: 20 } },
      },
    });
    addReview({ kind: 'year', period: '2025', doneAt: '2026-01-05T09:00:00.000Z', answers: { glad: 'The move' } });
    addReview({ kind: 'week', period: '2026-W47', answers: {} }); // not finished: not listed
    open('past');
    const rows = [...$('#view').querySelectorAll('.rv-past-open .grow')].map(s => s.textContent);
    eq(rows.length, 3, 'only finished ones');
    assert(rows[0].includes(fmtRange('2026-11-09', '2026-11-15')) && rows[2].includes('2025'), 'newest first');
    $('#view .rv-past-open').click();
    const page = $('#view .rv-past-one');
    assert(page.textContent.includes('Three runs'), 'what was written');
    assert(page.textContent.includes(t('review.past.focus', { title: 'Book it' })), 'and chosen');
    assert(!page.querySelector('textarea'), 'read-only');
    window.confirm = () => true;
    const id = journal.reviews[0].id;
    page.querySelector('[data-review="pastDelete"]').click();
    assert(!journal.reviews.some(r => r.id === id) && journal.deleted[id], 'deleted, and remembered for sync');
    eq($('#view').querySelectorAll('.rv-past-open').length, 2, 'back to the list');
    $('#view .rv-past-open').click();
    assert(
      $('#view').textContent.includes(t('review.past.choice', { title: 'Gone goal', choice: t('review.choice.drop') })),
      'a deleted goal keeps its title',
    );
    journal.reviews.length = 0;
    saveJournal();
    deletePlan(plans.current);
  });
});
