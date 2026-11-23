/** Page tests: keep goals (feature 07): the form, the card, the plan badge, the graph band, the timeline, the offer after a reached goal. */
suite(async () => {
  const card = g => $(`#view .goal[data-open="${g.id}"]`);
  const weight = () => mk('state', { title: 'Body weight', unit: 'kg' });

  await step('keep goals: made in the form; in range, out of range (red card and badge), and back', () => {
    fresh('Keep');
    const s = weight();
    recordMeasurement(s, d(-1), '74');
    save();
    openForm('goal');
    $('#f-title').value = 'Keep weight at or under 75 kg';
    $('#f-goalKind').value = 'keep';
    $('#f-goalKind').dispatchEvent(new Event('change', { bubbles: true }));
    assert($('#reachFields').hidden && !$('#keepFields').hidden, 'At least and At most in place of the target');
    assert($('[data-field="progress"]').hidden, '"Progress from" is hidden');
    eq($('[data-field="deadline"] label').textContent, t('f.until'), 'the deadline becomes Until');
    $('#f-measuredBy').value = s.id;
    $('#f-measuredBy').dispatchEvent(new Event('change', { bubbles: true }));
    submitForm();
    assert(modal.open && $('[data-field="keepMin"] .err').textContent === t('err.keepLimit'), 'a limit is needed');
    $('#f-keepMin').value = '80';
    $('#f-keepMax').value = '75';
    submitForm();
    eq($('[data-field="keepMin"] .err').textContent, t('err.keepOrder'), 'At least below At most');
    $('#f-keepMin').value = '';
    $('#f-target').value = '70'; // hidden: not stored
    submitForm();
    assert(!modal.open, 'saved');
    const g = db.goals[0];
    eq(
      [g.keep, 'target' in g, 'baseline' in g, g.progress],
      [{ max: 75 }, false, false, undefined],
      'stores only the range',
    );
    setView('goals');
    assert(card(g).textContent.includes(t('keep.in')), 'in range');
    assert(card(g).textContent.includes(t('keep.noEnd')), 'Until: no end');
    assert(!card(g).classList.contains('st-late'), 'not red');
    recordMeasurement(s, d(0), '76.2');
    save();
    render();
    assert(card(g).textContent.includes(t('keep.above', { value: '1.2 kg' })), '1.2 kg above');
    assert(card(g).classList.contains('st-late'), 'red while out');
    eq(planHealth(db), 'late', 'plan badge red');
    recordMeasurement(s, d(0), '74');
    save();
    render();
    assert(!card(g).classList.contains('st-late') && planHealth(db) === 'ok', 'back in range');
    openForm('goal', g.id);
    eq([$('#f-goalKind').value, $('#f-keepMax').value], ['keep', '75'], 'reopens as a keep goal');
    $('#f-goalKind').value = 'reach';
    $('#f-target').value = '70';
    submitForm();
    eq([g.keep, g.target], [undefined, '70'], 'switched back to a target');
    deletePlan(plans.current);
  });

  await step('keep goals: nothing measured, an old value, an Until in the past', () => {
    fresh('Keep edges');
    const s = weight();
    const g = mk('goal', { title: 'Keep', metric: 'kg', keep: { max: 75 }, startDate: d(-60), deadline: d(-1) });
    rel(s, g, 'measures');
    save();
    setView('goals');
    assert(
      card(g).textContent.includes(t('keep.none')) && !card(g).classList.contains('st-late'),
      'nothing measured yet, not red',
    );
    assert(card(g).textContent.includes(t('keep.ended', { date: fmtDate(d(-1)) })), 'Ended, not late');
    recordMeasurement(s, d(-40), '80');
    save();
    render();
    assert(card(g).textContent.includes(t('keep.stale', { when: fmtRel(d(-40)) })), 'last measured long ago');
    assert(!card(g).classList.contains('st-late'), 'an old value does not make it red');
    deletePlan(plans.current);
  });

  await step('keep goals: the graph shades the range; a point outside is in the warning colour', () => {
    fresh('Keep graph');
    const s = weight();
    [
      [-20, 74],
      [-10, 77],
      [-1, 74],
    ].forEach(([n, v]) => recordMeasurement(s, d(n), String(v)));
    const g = mk('goal', { title: 'Keep weight', metric: 'kg', keep: { min: 70, max: 75 }, startDate: d(-30) });
    rel(s, g, 'measures');
    save();
    setView('graphs');
    const cardEl = $(`#view [data-gr="${s.id}"]`);
    assert(cardEl.querySelector('rect.gr-band'), 'a band');
    assert(cardEl.textContent.includes(t('keep.legend', { goal: 'Keep weight' })), 'its legend');
    eq(cardEl.querySelectorAll('.gr-dot.out').length, 1, 'one point outside');
    assert(!cardEl.querySelector('.gr-target'), 'no target line');
    deletePlan(plans.current);
  });

  await step('keep goals: a state that adds up counted in total is refused', () => {
    fresh('Keep total');
    const s = mk('state', { title: 'Eating out', unit: '€', cumulative: true, entries: [] });
    save();
    openForm('goal');
    $('#f-title').value = 'Spend at most 400 a month';
    $('#f-goalKind').value = 'keep';
    $('#f-goalKind').dispatchEvent(new Event('change', { bubbles: true }));
    $('#f-measuredBy').value = s.id;
    $('#f-measuredBy').dispatchEvent(new Event('change', { bubbles: true }));
    $('#f-keepMax').value = '400';
    $('#f-period').value = 'total';
    submitForm();
    eq($('[data-field="period"] .err').textContent, t('err.keepTotal'), 'refused in total');
    $('#f-period').value = 'month';
    submitForm();
    assert(!modal.open, 'per month saves');
    eq([db.goals[0].keep, db.goals[0].period], [{ max: 400 }, 'month'], 'stored');
    deletePlan(plans.current);
  });

  await step(
    'keep goals: a reached goal offers one, filled in; ticked routines are linked; Cancel creates nothing',
    async () => {
      fresh('Keep offer');
      const dlg = $('#closingDlg');
      const s = weight();
      recordMeasurement(s, d(-1), '74');
      const g = mk('goal', {
        title: 'Lose weight',
        metric: 'Weight',
        unit: 'kg',
        baseline: '80',
        target: '75',
        category: 'Health',
        startDate: d(-60),
      });
      rel(s, g, 'measures');
      const run = mk('activity', { title: 'Run', repeat: { every: 1, unit: 'week' }, startDate: d(-60) });
      rel(run, g, 'contributes');
      save();
      openForm('goal', g.id);
      $('#f-status').value = 'achieved';
      submitForm();
      assert(dlg.open && !$('#closingKeep').hidden, 'offered');
      $('#closingKeepBtn').click();
      await tick();
      assert(modal.open, 'the goal form opens');
      eq(
        [
          $('#f-goalKind').value,
          $('#f-keepMax').value,
          $('#f-keepMin').value,
          $('#f-measuredBy').value,
          $('#f-category').value,
        ],
        ['keep', '75', '', s.id, 'Health'],
        'lower was better: At most the old target',
      );
      eq($('#f-title').value, t('keep.titleFrom', { metric: 'Weight', value: '75 kg' }), 'its title');
      const pk = $('#modalBody [data-name="keepRoutines"]');
      assert(
        pk?.querySelector(`.pick-opt[data-pick="${run.id}"]`) && !pk.querySelector('[data-picked-id]'),
        'the routine offered, not ticked',
      );
      modal.close();
      eq(db.goals.length, 1, 'Cancel creates nothing');
      openForm('goal', null, { keepFrom: g.id });
      $(`#modalBody [data-name="keepRoutines"] .pick-opt[data-pick="${run.id}"]`).click();
      submitForm();
      const k = db.goals[1];
      eq(k.keep, { max: 75 }, 'a keep goal');
      assert(
        relsTo(k.id, 'contributes').some(r => r.from === run.id),
        'the routine is linked',
      );
      assert(
        relsTo(k.id, 'measures').some(r => r.from === s.id),
        'the same measurement',
      );
      // Higher was better: At least.
      const h = mk('goal', { title: 'Save', metric: 'Savings', baseline: '0', target: '3000', status: 'achieved' });
      rel(s, h, 'measures');
      openForm('goal', null, { keepFrom: h.id });
      eq([$('#f-keepMin').value, $('#f-keepMax').value], ['3000', ''], 'At least the old target');
      modal.close();
      // A keep goal reached by hand is not offered another.
      openForm('goal', k.id);
      $('#f-status').value = 'achieved';
      submitForm();
      assert($('#closingKeep').hidden, 'no offer for a keep goal');
      $('#closingSkip').click();
      await tick();
      deletePlan(plans.current);
    },
  );

  await step('keep goals: on the Timeline one with no end runs to the edge, with no end to drag', () => {
    fresh('Keep timeline');
    const g = mk('goal', { title: 'Keep', keep: { max: 1 }, startDate: d(-10) });
    save();
    setView('timeline');
    ui.mapSelected = ui.tlDates = g.id;
    render();
    const row = $(`#view .tl-row[data-tl-node="${g.id}"]`),
      bar = row.querySelector('.tl-bar');
    assert(bar && !row.querySelector('.tl-grip'), 'a bar with no grips');
    assert(parseFloat(bar.style.width) / ui.tlPx > 11, 'past today');
    ui.mapSelected = ui.tlDates = null;
    deletePlan(plans.current);
  });
});
