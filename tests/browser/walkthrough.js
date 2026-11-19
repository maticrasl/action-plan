/** Page tests: Getting started on the Overview: ticks, toasts, Show me, fold and hide, the Guide's line, finishing. */
const walkCard = () => $('#view .walk');
const startWalk = (more = {}) => {
  replaceWalk({ state: 'on', started: today(), done: {}, skipped: [], ...more });
  walkUi.shown = walkUi.stage = null;
  walkUi.inGuide = false;
};
const shownTask = () => $('#view .walk-body')?.id.replace('walk-body-', '');
const pct = () => $('#view .walk .trail').getAttribute('aria-label');
// 13 tasks, or 12 where the browser cannot install the app (headless Chrome).
const total = () => walkView(getWalk(), walkInput(getWalk())).total;

suite(async () => {
  await step('walkthrough: off unless turned on; the card on the Overview above everything, also when empty', () => {
    fresh('Walk');
    setView('dashboard');
    assert(!walkCard() && getWalk().state === 'off', 'nothing stored: off, no card');
    assert(prefs.get('walk') === undefined, 'and nothing written');
    startWalk();
    setView('dashboard');
    assert(walkCard() && $('#view').firstElementChild === walkCard(), 'card first in the view');
    assert($('#view .empty'), 'the empty state stays under it');
    eq($('#view .walk-head .walk-n').textContent, t('walk.count', { done: 0, total: total() }), 'count: nothing done yet');
    eq(shownTask(), 'goal', 'the next task shows its text');
    assert(
      $('#view [data-stage="first"] .walk-stage-head').getAttribute('aria-expanded') === 'true' &&
        !$('#view [data-stage="rhythm"] .walk-tasks'),
      'only the stage with the next task unfolded',
    );
    const shown = pct();
    setView('goals');
    assert(!walkCard(), 'not on other views');
    return shown;
  });

  await step('walkthrough: a goal through the form ticks, toasts the next task, moves the trail', async () => {
    fresh('Walk goal');
    startWalk();
    setView('goals');
    hideToast();
    openForm('goal');
    $('#f-title').value = 'Run 5 km';
    submitForm();
    assert(getWalk().done.goal === today(), 'goal ticked');
    await tick();
    eq($('#toast').textContent, t('walk.tickedNext', { task: t('walk.goal.title'), next: t('walk.state.title') }), 'toast');
    setView('dashboard');
    assert(pct() !== '0%' && $('#view [data-task="goal"].done'), 'trail moved, goal shows done');
    eq(shownTask(), 'state', 'next: where you stand');
    // Ticks stay: deleting the goal does not take it back.
    db.goals = [];
    save();
    render();
    assert(getWalk().done.goal, 'latched');
    return $('#toast').textContent;
  });

  await step('walkthrough: Show me and the buttons land on the right view or form, the goal chosen', async () => {
    fresh('Walk show');
    startWalk();
    const g = mk('goal', { title: 'Fit' });
    const res = [];
    // Forms: the goal is preselected where the task links to it.
    for (const [task, sel] of [
      ['state', `[data-pick="${g.id}"][data-picked]`],
      ['steps', '[data-act-kind]'],
      ['routine', '#f-title'],
      ['goal', '#f-title'],
      ['vision', '#f-title'],
    ]) {
      setView('dashboard');
      WALK_DO[task]();
      assert(modal.open && $(sel, modal), `${task}: form open with ${sel}`);
      res.push(`${task}:${$('#modalTitle').textContent}`);
      modal.close();
    }
    // "Add an activity" asks the kind first; the goal is still chosen after it.
    WALK_DO.steps();
    $('[data-act-kind="once"]', modal)?.click();
    assert($(`[data-pick="${g.id}"][data-picked]`, modal), 'steps: goal chosen after the kind');
    modal.close();
    // Show me: the ring surrounds a visible control and goes on the next press.
    const a = mk('activity', { title: 'Small step' });
    const r = mk('activity', { title: 'Run', repeat: { every: 1, unit: 'day' } });
    mk('state', { title: 'Weight', value: '80', date: today(), description: '' });
    save();
    for (const [task, view] of [
      ['firstDone', 'activities'],
      ['tick', 'dashboard|activities'], // the Overview when it lists the routine, else Activities
      ['measure', 'states'],
    ]) {
      setView('dashboard');
      WALK_DO[task]();
      assert(view.split('|').includes(ui.view) && $('.spot-ring'), `${task}: ${view} with the ring, got ${ui.view}`);
      const ring = $('.spot-ring').getBoundingClientRect();
      assert(ring.width > 10 && ring.height > 10 && ring.top >= 0, `${task}: ring on screen`);
      await tick();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      assert(!$('.spot-ring'), `${task}: gone on the next press`);
      res.push(`${task}:${ui.view}`);
    }
    WALK_DO.views();
    eq(ui.view, 'map', 'views: the first not opened');
    WALK_DO.review();
    assert(ui.view === 'guide' && guideState.open === 'review', 'review: the Guide article');
    return res.join(' ') + ` ${a.title}/${r.title}`;
  });

  await step('walkthrough: skip, tap another task, fold, hide; the Guide brings it back', () => {
    fresh('Walk fold');
    startWalk();
    setView('dashboard');
    $('#view [data-walk="skip:goal"]').click();
    assert(getWalk().skipped.includes('goal') && $('#view [data-task="goal"].skipped'), 'skipped: hollow tick');
    eq($('#view .walk-head .walk-n').textContent, t('walk.count', { done: 1, total: total() }), 'counts as done');
    $('#view [data-walk="show:steps"]').click();
    eq(shownTask(), 'steps', 'tapping another open task shows it');
    $('#view [data-walk="stage:rhythm"]').click();
    assert($('#view [data-stage="rhythm"] .walk-tasks'), 'any stage unfolds');
    $('#view [data-walk="fold"]').click();
    assert(walkCard().classList.contains('folded') && getWalk().folded, 'folded and remembered');
    assert(walkCard().textContent.includes(t('walk.next', { task: t('walk.state.title') })), 'one line with the next task');
    assert(document.activeElement === $('#view [data-walk="fold"]'), 'focus stays on the fold button');
    $('#view [data-walk="fold"]').click();
    assert(!getWalk().folded, 'unfolded');
    $('#view [data-walk="hide"]').click();
    assert(!walkCard() && getWalk().state === 'off', 'hidden');
    eq($('#toast').textContent, t('walk.hidden'), 'toast says where it is');
    setView('guide');
    $('#view [data-walk="start"]').click();
    assert(getWalk().state === 'on' && getWalk().skipped.includes('goal'), 'Start: on again, ticks kept');
    assert($('#view .guide-walk .walk-stages'), 'the list in the Guide');
    setView('dashboard');
    assert(walkCard(), 'card back');
  });

  await step('walkthrough: finishing shows the closing text; Close ends it; the Guide shows it done', () => {
    fresh('Walk end');
    startWalk({ done: Object.fromEntries(['goal', 'state', 'steps', 'firstDone', 'routine', 'tick', 'measure', 'days', 'backup', 'install', 'views', 'vision'].map(id => [id, d(-1)])) });
    setView('dashboard');
    eq(shownTask(), 'review', 'one left');
    replaceWalk({ ...getWalk(), skipped: ['review'] });
    render();
    assert(walkCard().classList.contains('finished') && $('#view .walk h2').textContent === t('walk.finished.title'), 'closing text');
    $('#view [data-walk="close"]').click();
    assert(!walkCard() && getWalk().state === 'finished', 'gone for good');
    setView('guide');
    assert($('#view .guide-walk').textContent.includes(t('walk.doneWord')), 'Guide: done');
    $('#view [data-walk="guide"]').click();
    assert($('#view .guide-walk .walk-stages'), 'Look again shows the list');
    // Start over keeps only what the open plan shows.
    $('#view [data-walk="over"]').click();
    assert(getWalk().state === 'on' && !getWalk().done.goal && !getWalk().skipped.length, 'ticks not true now cleared');
  });

  // A template's states have no value yet (a template is a plan without the person in it): where you stand stays open.
  await step('walkthrough: a plan from a template ticks goal, steps and routine at once; where you stand is next', () => {
    startWalk();
    const fits = TEMPLATES.find(tp => {
      const inp = { ...walkInput(getWalk()), db: templateData(tp) };
      return ['goal', 'steps', 'routine'].every(id => checkTask(id, inp)) && inp.db.states.length;
    });
    assert(fits, 'a template with a goal, two steps, a routine and a state');
    useTemplate(fits);
    setView('dashboard');
    const done = getWalk().done;
    assert(done.goal && done.steps && done.routine && !done.state, 'three ticked: ' + Object.keys(done));
    eq(shownTask(), 'state', 'next: record where you stand');
    return fits.id;
  });

  await step('walkthrough: days and views are counted while it or the tips are on', () => {
    fresh('Walk days');
    replaceWalk({ state: 'off', done: {}, skipped: [] });
    const tipsBefore = getTips();
    saveTips({ ...tipsBefore, off: true });
    markSeen({ days: [], views: {} });
    setView('map');
    assert(!getSeen().days.length && !getSeen().views.map, 'both off: nothing recorded');
    startWalk();
    setView('timeline');
    assert(getSeen().days.includes(today()) && getSeen().views.timeline, 'on: today and the view');
    setView('dashboard');
    eq(walkView(getWalk(), walkInput(getWalk())).days, 1, 'one day so far');
    saveTips(tipsBefore);
  });

  await step('walkthrough: without sync set up the copy task offers the export only', () => {
    fresh('Walk copy');
    startWalk({ done: { goal: today(), state: today(), steps: today(), firstDone: today(), routine: today(), tick: today(), measure: today(), days: today() } });
    setView('dashboard');
    eq(shownTask(), 'backup', 'copy is next');
    const text = $('#view .walk-body p').textContent;
    const sync = syncConfigured();
    assert(text.includes(t(sync ? 'walk.backup.text' : 'walk.backup.textLocal')), 'text fits the set-up');
    assert(!!$('#view [data-walk="do:backup"]') === sync && $('#view [data-walk="export"]'), 'buttons fit too');
    return sync ? 'sync set up' : 'export only';
  });
});
