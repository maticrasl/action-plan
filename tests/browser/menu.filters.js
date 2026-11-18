/** Page tests: the item menu's Show in clears the filters that would hide the item there. */
suite(async () => {
  await step('item menu: show in sets the filters that would hide the item there', () => {
    fresh('Show in filters');
    changeLanguage('en');
    const work = mk('goal', { category: 'Work', startDate: d(-5), deadline: d(30) });
    const home = mk('goal', { category: 'Home', startDate: d(-5), deadline: d(30) });
    const won = mk('goal', { category: 'Work', status: 'achieved', startDate: d(-20), deadline: d(-2) });
    const loose = mk('goal', { startDate: d(-5), deadline: d(20) });
    const a = mk('activity', { startDate: d(-2), dueDate: d(4) });
    const done = mk('activity', { startDate: d(-9), dueDate: d(-1), status: 'done' });
    const free = mk('activity', { startDate: d(-1), dueDate: d(3) });
    const homeAct = mk('activity', { startDate: d(-1), dueDate: d(5) });
    const ended = mk('activity', {
      startDate: d(-30),
      dueDate: d(-3),
      repeat: { every: 1, unit: 'day' },
      checkins: { [d(-4)]: 1 },
    });
    const s = mk('state', {
      value: 4,
      date: d(-1),
      history: [
        { date: d(-9), value: 2 },
        { date: d(-1), value: 4 },
      ],
    });
    rel(a, work, 'contributes');
    rel(done, work, 'contributes');
    rel(homeAct, home, 'contributes');
    rel(ended, home, 'contributes');
    rel(s, work, 'measures');
    save();
    const show = (id, view) => {
      closeCtxMenu();
      openCtxMenu(id, 10, 10);
      ctxMenu.querySelector(`[data-ctx="show:${view}"]`).click();
    };
    const filters = () => [
      ui.category,
      ui.goalFilter,
      ui.hideDone,
      ui.activityGoal,
      ui.mapGoal,
      ui.timelineGoal,
      ui.graphGoal,
    ];
    const reset = (p = {}) =>
      Object.assign(ui, {
        category: '',
        goalFilter: 'active',
        activityGoal: '',
        mapGoal: '',
        timelineGoal: '',
        graphGoal: '',
        ...p,
      });
    // Goals view: an achieved goal of another category, while active goals of Home are shown.
    setView('map');
    reset({ category: 'Home' });
    show(won.id, 'goals');
    eq(filters(), ['Work', 'all', false, '', '', '', ''], 'own category, all statuses');
    eq(prefs.get('category'), 'Work', 'the category is remembered, like a chip tap');
    assert($(`.card[data-open="${won.id}"]`).classList.contains('flash'), 'goal card shown and flashing');
    // Filters that do not hide it stay: Work and active for an active Work goal.
    setView('map');
    reset({ category: 'Work' });
    show(work.id, 'goals');
    eq(filters().slice(0, 2), ['Work', 'active'], 'nothing changed when it is shown anyway');
    // A goal without a category: all categories.
    setView('map');
    reset({ category: 'Home' });
    show(loose.id, 'goals');
    eq(ui.category, '', 'no category: all');
    assert($(`.card[data-open="${loose.id}"]`), 'card there');
    // A category no goal has any more.
    setView('map');
    reset({ category: 'Gone' });
    show(work.id, 'goals');
    eq(ui.category, 'Work', "stale category: the goal's own");
    // Activities: another goal picked in another category → the goal filter cleared, the category of its goal.
    setView('map');
    reset({ category: 'Home', activityGoal: home.id });
    show(a.id, 'activities');
    eq(filters(), ['Work', 'active', false, '', '', '', ''], 'activities: category of its goal, no goal picked');
    assert($(`.card[data-open="${a.id}"]`).classList.contains('flash'), 'activity card flashes');
    // Its own goal picked: kept.
    setView('map');
    reset({ category: 'Work', activityGoal: work.id });
    show(a.id, 'activities');
    eq([ui.category, ui.activityGoal], ['Work', work.id], 'own goal picked: kept');
    // A picked goal in the category that does not hold it, the category does: only the goal cleared.
    const other = mk('goal', { category: 'Work', startDate: d(-5), deadline: d(30) });
    save();
    setView('map');
    reset({ category: 'Work', activityGoal: other.id });
    show(a.id, 'activities');
    eq([ui.category, ui.activityGoal], ['Work', ''], 'goal cleared, category kept');
    // An activity under no goal: all categories.
    setView('map');
    reset({ category: 'Work' });
    show(free.id, 'activities');
    eq(ui.category, '', 'unlinked activity: all');
    assert($(`.card[data-open="${free.id}"]`), 'unlinked card there');
    // Done items hidden: a done one shows them; one not done leaves the toggle on.
    setView('map');
    reset();
    setToggle('hideDone', true);
    show(done.id, 'activities');
    assert(!ui.hideDone && $(`.card[data-open="${done.id}"]`), 'done activity: done shown again');
    setView('map');
    setToggle('hideDone', true);
    show(a.id, 'activities');
    assert(ui.hideDone && $(`.card[data-open="${a.id}"]`), 'not done: still hiding done');
    // A routine that has ended counts as done there.
    setView('map');
    setToggle('hideDone', true);
    show(ended.id, 'activities');
    assert(!ui.hideDone && $(`.card[data-open="${ended.id}"]`), 'ended routine: done shown again');
    // Map focused on another goal: the focus goes; focused on its own goal it stays.
    setView('activities');
    reset({ mapGoal: home.id });
    show(a.id, 'map');
    assert(
      ui.mapGoal === '' && document.activeElement === $(`[data-map-node="${a.id}"]`),
      'map focus cleared, box focused',
    );
    setView('activities');
    reset({ mapGoal: work.id });
    show(a.id, 'map');
    assert(ui.mapGoal === work.id && $(`[data-map-node="${a.id}"]`), 'own goal focus kept');
    // Achieved goal hidden on the map with the done items, in another category.
    setView('goals');
    reset({ category: 'Home', goalFilter: 'all' });
    setToggle('hideDone', true);
    show(won.id, 'map');
    assert(!ui.hideDone && ui.category === 'Work' && $(`[data-map-node="${won.id}"]`), 'achieved goal on the map');
    // Timeline: only the fold that hides it opens; another goal stays folded.
    setTlCollapsed([work.id, home.id]);
    setView('activities');
    reset();
    show(a.id, 'timeline');
    eq(tlCollapsed().has(work.id) || !tlCollapsed().has(home.id), false, 'its goal unfolded, the other stays folded');
    assert(
      ui.mapSelected === a.id && document.activeElement === $(`[data-tl-node="${a.id}"]`),
      'timeline row selected',
    );
    // A folded goal itself keeps its row: nothing unfolds.
    setTlCollapsed([work.id]);
    setView('activities');
    show(work.id, 'timeline');
    assert(tlCollapsed().has(work.id) && $(`[data-tl-node="${work.id}"]`), 'folded goal: row there, still folded');
    setTlCollapsed([]);
    // Timeline: another goal picked and done hidden.
    setView('activities');
    reset({ timelineGoal: home.id });
    setToggle('hideDone', true);
    show(done.id, 'timeline');
    assert(
      ui.timelineGoal === '' && !ui.hideDone && $(`[data-tl-node="${done.id}"]`),
      'timeline: goal cleared, done shown',
    );
    // Graphs: a state measuring a Work goal while a Home goal is picked.
    setView('states');
    reset({ category: 'Home', graphGoal: home.id });
    show(s.id, 'graphs');
    assert(
      ui.graphGoal === '' && ui.category === 'Work' && $(`[data-gr="${s.id}"]`),
      'graphs: goal cleared, category of its goal',
    );
    // The search is cleared on the way.
    setView('states');
    ui.search = 'nothing like it';
    render();
    reset();
    show(s.id, 'map');
    assert(ui.search === '' && $(`[data-map-node="${s.id}"]`), 'search cleared');
    reset();
    setToggle('hideDone', false);
    deletePlan(plans.current);
  });
});
