/** Page tests: the merge dialog, merging from the delete dialog, and both in Slovenian. */
suite(async () => {
  const mrg = $('#planMerge');
  const titles = data =>
    SYNC_COLLS.filter(c => c !== 'relations')
      .flatMap(c => data[c].map(x => `${c}:${x.title}`))
      .sort();
  // A target plan with items of its own, a relation and progress.
  const targetPlan = () => {
    const g = {
      id: uid(),
      title: 'Save money',
      status: 'active',
      unit: '€',
      baseline: '0',
      target: '500',
      current: '100',
      category: 'Finance',
      updatedAt: '2026-02-02T00:00:00.000Z',
    };
    const a = { id: uid(), title: 'Budget', status: 'done', updatedAt: '2026-02-02T00:00:00.000Z' };
    return {
      name: 'Money',
      data: {
        goals: [g],
        states: [],
        activities: [a],
        relations: [{ id: uid(), from: a.id, to: g.id, type: 'contributes', updatedAt: '2026-02-02T00:00:00.000Z' }],
      },
    };
  };
  const cleanup = (...names) =>
    plans.list
      .filter(p => names.includes(p.name))
      .map(p => p.id)
      .forEach(deletePlan);
  await step('merge dialog: pick a target, optionally delete, cancel changes nothing', () => {
    const T = addPlan(targetPlan()),
      U = addPlan({ name: 'Unrelated', data: emptyDb() });
    const S = addPlan(progressPlan()),
      sBefore = clone(db);
    const btn = () => $('[data-plan="merge"]');
    assert(btn() && !btn().disabled && btn().title === t('plan.merge'), 'merge beside the plan actions');

    // With a single plan there is nothing to merge into.
    const saved = plans.list;
    plans.list = [currentPlan()];
    renderPlanSwitch();
    assert(btn().disabled && btn().title === t('plan.mergeOnly'), 'disabled with one plan, says why');
    plans.list = saved;
    renderPlanSwitch();

    btn().click();
    assert(mrg.open, 'dialog opens');
    assert(mrg.textContent.includes(S.name), 'names the source');
    const sel = $('#mergeTarget');
    eq([...sel.options].map(o => o.value).includes(S.id), false, 'the source is not offered');
    eq([...sel.options].length, plans.list.length - 1, 'every other plan offered');
    for (const s of [
      tp('planDel.goals', 3),
      tp('planDel.states', 2),
      tp('planDel.measurements', 2),
      tp('planDel.activities', 4),
      tp('planDel.relations', 1),
    ])
      assert(mrg.textContent.includes(s), `lists “${s}”`);
    assert(!$('#mergeRemove').checked, 'keeps the source by default');

    // Cancel, the close button and Escape change nothing.
    const snapshot = () => JSON.stringify([plans.list.map(p => p.id), plans.current, readPlan(T.id), readPlan(S.id)]);
    const was = snapshot();
    mrg.querySelector('.modal-foot [data-plan-merge-close]').click();
    assert(!mrg.open && snapshot() === was, 'Cancel changes nothing');
    btn().click();
    mrg.querySelector('.modal-head [data-plan-merge-close]').click();
    assert(!mrg.open && snapshot() === was, 'the close button changes nothing');
    btn().click();
    mrg.close();
    $('#mergeBtn').click();
    assert(snapshot() === was, 'a stale Merge click after closing changes nothing');

    btn().click();
    $('#mergeTarget').value = T.id;
    $('#mergeTarget').dispatchEvent(new Event('change', { bubbles: true }));
    $('#mergeBtn').click();
    assert(!mrg.open && plans.current === T.id, 'merged and switched to the target');
    assert(
      titles(sBefore).every(x => titles(db).includes(x)),
      'contents moved',
    );
    eq(readPlan(U.id).goals.length, 0, 'the plan not chosen is untouched');
    eq($('#toast').textContent, t('toast.merged', { from: S.name, to: T.name }), 'toast');
    assert(
      plans.list.some(p => p.id === S.id),
      'source kept',
    );

    openPlan(S.id);
    btn().click();
    $('#mergeTarget').value = U.id;
    $('#mergeRemove').click();
    $('#mergeBtn').click();
    assert(
      plans.current === U.id && !plans.list.some(p => p.id === S.id),
      'merged into the chosen plan and deleted the source',
    );
    eq($('#toast').textContent, t('toast.mergedDeleted', { from: S.name, to: U.name }), 'toast says it was deleted');
    btn().click();
    assert(!$('#mergeRemove').checked, 'delete is off again next time');
    mrg.close();
    cleanup(T.name, 'Unrelated');
    return 'ok';
  });
  await step('delete dialog: merge into another plan instead', () => {
    const T = addPlan(targetPlan());
    const S = addPlan(progressPlan()),
      sBefore = clone(db);
    $('[data-plan="delete"]').click();
    const instead = () => $('[data-plan-merge-instead]');
    assert(instead() && instead().textContent === t('planDel.merge'), 'offered in the delete dialog');
    instead().click();
    assert(!planDel.open && mrg.open, 'switches to the merge dialog');
    assert($('#mergeRemove').checked, 'with delete afterwards ticked');
    $('#mergeTarget').value = T.id;
    $('#mergeBtn').click();
    assert(
      plans.current === T.id && !plans.list.some(p => p.id === S.id),
      'merged and deleted without typing the name',
    );
    assert(
      titles(sBefore).every(x => titles(db).includes(x)),
      'nothing lost',
    );

    // Not offered for an empty plan, nor when there is no other plan.
    addPlan({ name: 'Empty', data: emptyDb() });
    $('[data-plan="delete"]').click();
    assert(!instead(), 'not offered for an empty plan');
    planDel.close();
    const saved = plans.list;
    openPlan(T.id);
    plans.list = [currentPlan()];
    $('[data-plan="delete"]').click();
    assert(!instead(), 'not offered when there is no other plan');
    planDel.close();
    plans.list = saved;
    renderPlanSwitch();
    cleanup('Empty', T.name);
    return 'ok';
  });
  await step('merging plans in Slovenian', () => {
    changeLanguage('sl');
    const T = addPlan(targetPlan());
    const S = addPlan(progressPlan());
    assert($('[data-plan="merge"]').title === I18N.sl.strings['plan.merge'], 'button title');
    $('[data-plan="merge"]').click();
    assert(mrg.querySelector('h2').textContent === I18N.sl.strings['merge.title'], 'dialog title');
    assert(mrg.textContent.includes(tp('planDel.goals', 3)), 'contents in Slovenian');
    const text = mrg.textContent.replace(/\s+/g, ' ').trim();
    $('#mergeTarget').value = T.id;
    $('#mergeBtn').click();
    eq($('#toast').textContent, t('toast.merged', { from: S.name, to: T.name }), 'toast in Slovenian');
    assert(
      t('toast.merged', { from: 'a', to: 'b' }) !== fill(I18N.en.strings['toast.merged'], { from: 'a', to: 'b' }),
      'translated',
    );
    cleanup(T.name, S.name);
    changeLanguage('en');
    return text.slice(0, 120);
  });
});
