/** Page tests: the timeline tree: prerequisites, an activity under each goal, hiding done, folding. */
suite(async () => {
  const foldFixture = () => {
    fresh('Fold');
    const g1 = mk('goal', { title: 'G1', startDate: d(-10), deadline: d(30) });
    const g1a = mk('goal', { title: 'G1a', startDate: d(-8), deadline: d(40) });
    const g2 = mk('goal', { title: 'G2', startDate: d(-5), deadline: d(50) });
    const g3 = mk('goal', { title: 'G3', startDate: d(-1), deadline: d(60) }); // nothing under it; goals run by deadline
    const a = mk('activity', { title: 'A', startDate: d(-4), dueDate: d(10) });
    const a1 = mk('activity', { title: 'A1', startDate: d(-3), dueDate: d(5) });
    const b = mk('activity', { title: 'B', startDate: d(-2), dueDate: d(12) });
    const c = mk('activity', { title: 'C', startDate: d(11), dueDate: d(20) });
    const u = mk('activity', { title: 'U', startDate: d(1), dueDate: d(3) });
    rel(g1a, g1, 'subgoal');
    rel(a, g1, 'contributes');
    rel(a, g2, 'contributes');
    rel(a1, a, 'subactivity');
    rel(b, g1, 'contributes');
    rel(b, g1a, 'contributes');
    rel(c, g2, 'contributes');
    rel(c, a, 'depends');
    save();
    ui.hideDone = false;
    ui.timelineGoal = '';
    setView('timeline');
    return { g1, g1a, g2, g3, a, a1, b, c, u };
  };
  const rowsText = rows => rows.map(r => (r.kind === 'group' ? `[${r.label}]` : r.item.title)).join(' ');
  const shownRows = () =>
    [...document.querySelectorAll('.tl-body .tl-row')]
      .map(r => (r.classList.contains('tl-group') ? '[group]' : r.querySelector('.tl-title').textContent))
      .join(' ');
  const fold = id => $(`[data-tl-fold="${id}"]`);
  await step('timeline: prerequisites with no goal of their own sit under the activity that waits for them', () => {
    fresh('Prereqs');
    const g1 = mk('goal', { title: 'G1' }),
      g2 = mk('goal', { title: 'G2' });
    const a = mk('activity', { title: 'A' }),
      b = mk('activity', { title: 'B' });
    const p = mk('activity', { title: 'P' }),
      pp = mk('activity', { title: 'PP' });
    const top = mk('activity', { title: 'Top' }),
      part = mk('activity', { title: 'Part' });
    const owned = mk('activity', { title: 'Owned' }),
      waiter = mk('activity', { title: 'Waiter' });
    rel(a, g1, 'contributes');
    rel(b, g2, 'contributes');
    rel(owned, g2, 'contributes');
    rel(a, p, 'depends');
    rel(p, pp, 'depends'); // a chain of prerequisites
    rel(part, top, 'subactivity');
    rel(a, part, 'depends'); // a prerequisite inside a tree brings the whole tree
    rel(b, p, 'depends'); // needed by work under two goals
    rel(a, owned, 'depends'); // has its own goal: stays there only
    rel(waiter, a, 'depends'); // waits for goal work, but is no prerequisite
    const rows = timelineRows(null);
    eq(rowsText(rows), `G1 A P PP Top Part G2 B P PP Owned [${t('tl.unlinked')}] Waiter`, 'rows');
    const row = (title, goal) => rows.find(r => r.item?.title === title && r.goal === goal.id);
    const ra = rows.indexOf(row('A', g1));
    eq(
      [row('P', g1).rel, row('P', g1).parent, row('P', g1).depth],
      ['depends', ra, row('A', g1).depth + 1],
      'P hangs off A',
    );
    eq(row('PP', g1).parent, rows.indexOf(row('P', g1)), 'PP hangs off P');
    eq(
      [row('Part', g1).rel, row('Part', g1).parent],
      ['subactivity', rows.indexOf(row('Top', g1))],
      'the tree keeps its shape',
    );
    eq(row('P', g1).also, ['G2'], 'listed under both goals, marked as such');
    setView('timeline');
    assert($(`[data-tl-node="${p.id}"] .tl-elbow.dash`), 'drawn with a dashed dependency line');
    // A folded goal hides its prerequisites too, without sending them to the unlinked group.
    eq(rowsText(timelineRows(null, new Set([g1.id, g2.id]))), `G1 G2 [${t('tl.unlinked')}] Waiter`, 'folded');
    return rowsText(rows);
  });
  await step('timeline: an activity that serves several goals is listed under each', () => {
    const { g1, g2, a, b, c } = foldFixture();
    eq(
      rowsText(timelineRows(null)),
      `G1 A A1 B G1a B G2 A A1 C G3 [${t('tl.unlinked')}] U`,
      'under each goal, with its sub-activities',
    );
    eq(document.querySelectorAll(`[data-tl-node="${a.id}"]`).length, 2, 'two rows for A');
    const also = id => [...document.querySelectorAll(`[data-tl-node="${id}"] .tl-also`)].map(x => x.title);
    eq(
      also(a.id),
      [t('tl.alsoUnder', { goals: 'G2' }), t('tl.alsoUnder', { goals: 'G1' })],
      'each copy names the other goal',
    );
    eq(
      also(b.id),
      [t('tl.alsoUnder', { goals: 'G1a' }), t('tl.alsoUnder', { goals: 'G1' })],
      'a goal and its sub-goal',
    );
    eq(also(c.id), [], 'an activity under one goal has no mark');
    assert(
      $(`[data-tl-node="${a.id}"]`)
        .getAttribute('aria-label')
        .includes(t('tl.alsoUnder', { goals: 'G2' })),
      'screen readers hear it too',
    );
    // One item: selecting a copy lights every copy.
    clickEl($$(`[data-tl-node="${a.id}"]`)[1]);
    assert(
      [...document.querySelectorAll(`[data-tl-node="${a.id}"]`)].every(r => r.classList.contains('selected')),
      'all copies selected',
    );
    ui.mapSelected = null;
    render();
    // Editing a copy edits the one activity.
    openForm('activity', a.id);
    $('#f-title').value = 'A renamed';
    submitForm();
    eq(
      [...document.querySelectorAll(`[data-tl-node="${a.id}"] .tl-title`)].map(x => x.textContent),
      ['A renamed', 'A renamed'],
      'both copies follow',
    );
    eq(db.activities.filter(x => x.title === 'A renamed').length, 1, 'still one activity');
    // A goal filter shows only the goals in scope, so no mark there.
    ui.timelineGoal = g2.id;
    render();
    eq(document.querySelectorAll(`[data-tl-node="${a.id}"]`).length, 1, 'filtered to G2: one row');
    eq(also(a.id), [], 'and no mark');
    ui.timelineGoal = '';
    render();
    // Hide done hides every copy.
    b.status = 'done';
    ui.hideDone = true;
    render();
    eq(document.querySelectorAll(`[data-tl-node="${b.id}"]`).length, 0, 'done copies hidden');
    ui.hideDone = false;
    b.status = 'todo';
    render();
    return rowsText(timelineRows(null));
  });
  await step('hide done and achieved: achieved goals go too; what is under them stays', () => {
    const { g1, g1a, a, b } = foldFixture();
    const titles = () => [...document.querySelectorAll('.tl-row .tl-title')].map(x => x.textContent);
    g1.status = 'achieved';
    setToggle('hideDone', true);
    assert(
      !titles().includes('G1') && titles().includes('G1a') && titles().includes('B'),
      'timeline: G1 hidden, its sub-goal and open activity shown: ' + titles(),
    );
    eq(timelineRows(null).find(r => r.item?.id === g1a.id).depth, 0, 'its sub-goal moves up to its place');
    setView('map');
    assert(
      !$(`[data-map-node="${g1.id}"]`) && $(`[data-map-node="${g1a.id}"]`) && $(`[data-map-node="${a.id}"]`),
      'map: achieved goal hidden, the rest shown',
    );
    eq($('[data-hide-done]').textContent, t('acts.hideDone'), 'the toggle says so');
    setToggle('hideDone', false);
    assert($(`[data-map-node="${g1.id}"]`), 'shown again');
    setView('timeline');
    assert(titles().includes('G1') && b.status !== 'done', 'and on the timeline');
    changeLanguage('sl');
    eq($('[data-hide-done]').textContent, 'Skrij opravljeno in doseženo', 'Slovenian');
    changeLanguage('en');
    deletePlan(plans.current);
  });
  await step('timeline: goals collapse and expand, remembered per plan', () => {
    const { g1, g1a, g2, g3, a, b, c } = foldFixture();
    assert(fold(g1.id) && fold(g2.id) && fold(g1a.id), 'goals with something under them can fold');
    assert(!fold(g3.id), 'a goal with nothing under it has no fold button');
    eq(
      [fold(g1.id).getAttribute('aria-expanded'), fold(g1.id).getAttribute('aria-label')],
      ['true', t('tl.collapse', { name: 'G1' })],
      'expanded at first',
    );
    fold(g1.id).click();
    eq(shownRows(), 'G1 G2 A A1 C G3 [group] U', 'G1 folded: its activities and sub-goal hidden');
    eq(
      [fold(g1.id).getAttribute('aria-expanded'), fold(g1.id).getAttribute('aria-label')],
      ['false', t('tl.expand', { name: 'G1' })],
      'says it is folded',
    );
    assert($(`[data-tl-node="${g1.id}"] .tl-bar`), 'the goal keeps its bar');
    eq(ui.mapSelected, null, 'folding does not select the goal');
    assert(!modal.open, 'nor open it');
    const folded = timelineRows(null, tlCollapsed());
    eq(
      folded.slice(folded.findIndex(r => r.kind === 'group') + 1).map(r => r.item.title),
      ['U'],
      'B is still under a goal, so it does not move to the unlinked group',
    );
    eq(
      $$(`[data-tl-node="${a.id}"] .tl-also`).map(x => x.title),
      [t('tl.alsoUnder', { goals: 'G1' })],
      'the copy under G2 still names folded G1',
    );
    // Remembered: on redraw, per plan, and after switching plans.
    render();
    eq(fold(g1.id).getAttribute('aria-expanded'), 'false', 'kept on redraw');
    const here = plans.current;
    const other = addPlan({ name: 'Other fold', data: clone(db) });
    setView('timeline');
    eq(fold(g1.id).getAttribute('aria-expanded'), 'true', 'another plan has its own folds');
    openPlan(here);
    setView('timeline');
    eq(fold(g1.id).getAttribute('aria-expanded'), 'false', 'back in this plan, still folded');
    deletePlan(other.id);
    openPlan(here);
    setView('timeline');
    fold(g1.id).click();
    eq(shownRows(), 'G1 A A1 B G1a B G2 A A1 C G3 [group] U', 'expanded again');
    // A sub-goal folds on its own.
    fold(g1a.id).click();
    eq(shownRows(), 'G1 A A1 B G1a G2 A A1 C G3 [group] U', 'sub-goal folded');
    fold(g1a.id).click();
    // The unlinked group folds too.
    const restFold = $('[data-tl-fold="rest"]');
    assert(restFold, 'the group can fold');
    restFold.click();
    eq(shownRows(), 'G1 A A1 B G1a B G2 A A1 C G3 [group]', 'group folded');
    $('[data-tl-fold="rest"]').click();
    // Collapse all / Expand all: one button, reading Expand all only while everything is folded.
    const foldAll = () =>
      $$('[data-tl-fold-all]')
        .map(b => `${b.dataset.tlFoldAll}:${b.textContent}`)
        .join(',');
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'nothing folded: Collapse all only');
    fold(g1.id).click();
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'some folded: still Collapse all');
    $('[data-tl-fold-all="collapse"]').click();
    eq(shownRows(), 'G1 G2 G3 [group]', 'collapse all: one line per goal');
    eq(foldAll(), `expand:${t('tl.expandAll')}`, 'all folded: the button reads Expand all');
    assert(document.activeElement === $('[data-tl-fold-all]'), 'focus stays on the button');
    fold(g2.id).click();
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'one opened by hand: back to Collapse all');
    $('[data-tl-fold-all="collapse"]').click();
    $('[data-tl-fold-all="expand"]').click();
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'expanded: Collapse all again');
    // Folding each by hand (the sub-goal first, while it shows) counts too.
    for (const g of [g1a, g1, g2]) fold(g.id).click();
    eq(foldAll(), `collapse:${t('tl.collapseAll')}`, 'the group still open: Collapse all');
    $('[data-tl-fold="rest"]').click();
    eq(foldAll(), `expand:${t('tl.expandAll')}`, 'folded one by one: Expand all too');
    $('[data-tl-fold-all="expand"]').click();
    $('[data-tl-fold-all="collapse"]').click();
    $('[data-tl-fold-all="expand"]').click();
    eq(shownRows(), 'G1 A A1 B G1a B G2 A A1 C G3 [group] U', 'expand all');
    eq(prefs.get('tlCollapsed.' + plans.current, null), [], 'saved as nothing folded');
    // The fold button is a real button: Enter on it is left to the button, not taken as selecting the row.
    fold(g2.id).focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    fold(g2.id).dispatchEvent(ev);
    assert(!ev.defaultPrevented && !modal.open && ui.mapSelected === null, 'Enter left to the button');
    fold(g2.id).click();
    assert(document.activeElement === fold(g2.id), 'focus stays on the button after folding');
    eq(fold(g2.id).getAttribute('aria-expanded'), 'false', 'folded with the button');
    fold(g2.id).click();
    // The menu on a goal (right-click on its label) folds it, and folds all; the group's label offers fold all only.
    const menuOn = el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    const acts = () => [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
    const pick = act => ctxMenu.querySelector(`[data-ctx="${act}"]`).click();
    menuOn($(`[data-tl-node="${g2.id}"] .tl-label`));
    assert(acts().includes('fold') && acts().includes('fold-all:collapse'), `goal menu: ${acts()}`);
    eq(ctxMenu.querySelector('[data-ctx="fold"]').textContent, t('ctx.collapse'), 'reads Collapse');
    pick('fold');
    assert(ctxMenu.hidden && fold(g2.id).getAttribute('aria-expanded') === 'false', 'Collapse folds the goal');
    menuOn($(`[data-tl-node="${g2.id}"] .tl-label`));
    eq(ctxMenu.querySelector('[data-ctx="fold"]').textContent, t('ctx.expand'), 'folded: reads Expand');
    pick('fold');
    eq(fold(g2.id).getAttribute('aria-expanded'), 'true', 'Expand unfolds it');
    menuOn($(`[data-tl-node="${c.id}"] .tl-label`));
    assert(!acts().includes('fold') && acts().includes('fold-all:collapse'), 'an activity: Collapse all, no Collapse');
    closeCtxMenu();
    menuOn($('.tl-group .tl-label'));
    eq(acts(), ['fold-all:collapse'], 'the group label: Collapse all only');
    pick('fold-all:collapse');
    eq(shownRows(), 'G1 G2 G3 [group]', 'all folded from the menu');
    menuOn($('.tl-corner'));
    eq(acts(), ['fold-all:expand'], 'the corner: Expand all once all are folded');
    pick('fold-all:expand');
    eq(shownRows(), 'G1 A A1 B G1a B G2 A A1 C G3 [group] U', 'expanded from the menu');
    menuOn($('.tl-today'));
    assert(ctxMenu.hidden, 'the chart area outside bars opens no menu');
    deletePlan(plans.current);
    return 'ok';
  });
  await step('timeline: fold and “also under” wording in both languages', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const k of ['tl.collapseAll', 'tl.expandAll', 'ctx.collapse', 'ctx.expand']) assert(t(k) && t(k) !== k, `${code} ${k}`);
      assert(
        t('tl.collapse', { name: 'X' }).includes('X') &&
          t('tl.expand', { name: 'X' }).includes('X') &&
          t('tl.alsoUnder', { goals: 'X' }).includes('X'),
        `${code} names`,
      );
      assert(/↻/.test(t('tl.hint')) || /fold|collapse|strn/i.test(t('tl.hint')), `${code} hint mentions folding`);
      assert(/collapse|strn/i.test(t('help.view.timeline')), `${code} help mentions folding`);
    }
    changeLanguage('en');
    return t('tl.alsoUnder', { goals: 'G1, G2' });
  });
});
