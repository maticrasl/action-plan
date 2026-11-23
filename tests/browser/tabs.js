/** Page tests: another tab saving plans or visions is merged here, so neither tab's edits are lost. */
suite(async () => {
  const T = '2099-01-01T00:00:00.000Z';
  const otherTabSaves = (key, value) => {
    localStorage.setItem(userKey(key), JSON.stringify(value));
    dispatchEvent(new StorageEvent('storage', { key: userKey(key) }));
  };

  await step('tabs: another tab saving the open plan keeps both tabs’ edits', () => {
    fresh('Tabs');
    const theirs = clone(db); // the other tab's copy, before this tab's edit
    mk('goal', { title: 'Mine' });
    save();
    theirs.goals.push({ id: 'their-goal', title: 'Theirs', status: 'active', updatedAt: T });
    otherTabSaves(planKey(plans.current), theirs);
    eq(db.goals.map(g => g.title).sort(), ['Mine', 'Theirs'], 'both goals here');
    eq(readPlan(plans.current).goals.length, 2, 'both goals stored');
  });

  await step('tabs: taking over the same save again changes nothing (two tabs settle)', () => {
    const stored = localStorage.getItem(userKey(planKey(plans.current)));
    const reordered = JSON.parse(stored);
    reordered.goals.reverse(); // the other tab lists the same goals in its own order
    otherTabSaves(planKey(plans.current), reordered);
    const once = localStorage.getItem(userKey(planKey(plans.current)));
    dispatchEvent(new StorageEvent('storage', { key: userKey(planKey(plans.current)) }));
    eq(localStorage.getItem(userKey(planKey(plans.current))), once, 'stored copy kept as it is');
  });

  await step('tabs: an item the other tab deleted goes here too', () => {
    const theirs = clone(db);
    theirs.goals = theirs.goals.filter(g => g.id !== 'their-goal');
    theirs.deleted = { ...theirs.deleted, 'their-goal': T };
    otherTabSaves(planKey(plans.current), theirs);
    eq(
      db.goals.map(g => g.title),
      ['Mine'],
      'deleted here',
    );
  });

  await step('tabs: a plan the other tab made stays when this tab saves', () => {
    const list = clone(plans);
    list.list.push({ id: 'their-plan', name: 'Their plan', updatedAt: T });
    localStorage.setItem(userKey(planKey('their-plan')), JSON.stringify(emptyDb()));
    otherTabSaves(PLANS_KEY, list);
    assert(
      plans.list.some(p => p.id === 'their-plan'),
      'taken over',
    );
    save();
    assert(
      JSON.parse(userStorage.getItem(PLANS_KEY)).list.some(p => p.id === 'their-plan'),
      'still stored',
    );
  });

  await step('tabs: a vision the other tab added is kept', () => {
    const v = clone(visions);
    v.list.push({ id: 'their-vision', title: 'Their vision', updatedAt: T });
    otherTabSaves(VISIONS_KEY, v);
    assert(
      visions.list.some(x => x.id === 'their-vision'),
      'taken over',
    );
  });

  await step('tabs: keys of other users and other data change nothing', () => {
    const before = JSON.stringify(db);
    dispatchEvent(new StorageEvent('storage', { key: 'actionplan.u.someone-else.plans' }));
    dispatchEvent(new StorageEvent('storage', { key: null }));
    eq(JSON.stringify(db), before, 'unchanged');
  });
});
