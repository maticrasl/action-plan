/** Page tests: completion dates (feature 13 part A): stamped on save, Done on / Achieved on in the forms, the Overview's week line, the sample. */
suite(async () => {
  const line = () => $('#view .week-line')?.textContent;
  const err = name => modal.querySelector(`[data-field="${name}"] .err`).textContent;
  const shown = name => modal.querySelector(`[data-field="${name}"]`)?.hidden === false;

  await step('done dates: ticking a step stamps today; the Overview counts the week; nothing done, no line', () => {
    fresh('Done dates');
    const a = mk('activity', { title: 'Buy shoes', startDate: d(-5), dueDate: d(5) });
    mk('activity', { title: 'Old step', status: 'done', startDate: d(-40), dueDate: d(-30) });
    save();
    // As a step finished before this feature: no date, last changed long ago.
    const old = db.activities[1];
    delete old.doneAt;
    old.updatedAt = new Date(Date.now() - 30 * 864e5).toISOString();
    takeSnapshot(db);
    setView('dashboard');
    eq(line(), undefined, 'nothing done this week: no line');
    a.status = 'done';
    save();
    eq(a.doneAt, today(), 'stamped');
    eq(findEntity(db.activities[1].id).doneAt, undefined, 'a step done before stays without a date');
    const g = mk('goal', { title: 'Run 5 km' });
    save();
    g.status = 'achieved';
    save();
    requestRender();
    render();
    eq(
      line(),
      t('log.week', { parts: [t('log.reached', { name: 'Run 5 km' }), tp('log.steps', 1)].join(' · ') }),
      'the line',
    );
  });

  await step('done dates: Done on shows with the status Done, refuses a later day, stores the day given', () => {
    const a = db.activities.find(x => x.title === 'Buy shoes');
    a.status = 'todo';
    save();
    openForm('activity', a.id);
    assert(!shown('doneAt'), 'hidden while not done');
    change('#f-status', 'done');
    assert(shown('doneAt'), 'shown once Done');
    eq($('#f-doneAt').value, dateInput(today()), 'filled with today');
    $('#f-doneAt').value = dateInput(d(2));
    $('#saveBtn').click();
    assert(modal.open && err('doneAt') === t('err.doneFuture'), 'a day still to come is refused');
    $('#f-doneAt').value = dateInput(d(-3));
    $('#saveBtn').click();
    assert(!modal.open, 'saved');
    eq(a.doneAt, d(-3), 'the day given');
    // Saving again without touching it keeps it; an estimate for an older step is never stored.
    openForm('activity', a.id);
    eq($('#f-doneAt').value, dateInput(d(-3)), 'shows the stored day');
    $('#saveBtn').click();
    eq(a.doneAt, d(-3), 'kept');
    const old = db.activities.find(x => x.title === 'Old step');
    openForm('activity', old.id);
    assert(shown('doneAt'), 'an old done step shows the field');
    $('#saveBtn').click();
    eq(old.doneAt, undefined, 'its estimate is not stored');
  });

  await step('done dates: Achieved on in the goal form', () => {
    const g = mk('goal', { title: 'Swim' });
    save();
    openForm('goal', g.id);
    assert(!shown('achievedAt'), 'hidden while active');
    change('#f-status', 'achieved');
    assert(shown('achievedAt'), 'shown once Achieved');
    $('#f-achievedAt').value = dateInput(d(-1));
    $('#saveBtn').click();
    eq([g.status, g.achievedAt], ['achieved', d(-1)], 'stored');
  });

  await step('done dates: a list keeps its items’ days when edited in the form', () => {
    const l = mk('activity', {
      title: 'Paperwork',
      startDate: d(-5),
      dueDate: d(5),
      list: [
        { id: uid(), text: 'Tax', done: false },
        { id: uid(), text: 'Bank', done: false },
      ],
    });
    save();
    l.list[0].done = true;
    save();
    eq(l.list[0].doneAt, today(), 'a tick is dated');
    l.list[0].doneAt = d(-2);
    save();
    const tax = l.list[0].id;
    openForm('activity', l.id);
    modal.querySelector(`[data-li-row="${tax}"] .li-input`).value = 'Taxes';
    $('#saveBtn').click();
    const item = l.list.find(i => i.id === tax);
    eq([item.text, item.doneAt], ['Taxes', d(-2)], 'renamed, still dated');
  });

  await step('done dates: the sample has dated done steps and a dated reached goal', () => {
    loadSample();
    const done = db.activities.filter(a => a.status === 'done');
    assert(
      done.length && done.every(a => a.doneAt && a.doneAt >= d(-14) && a.doneAt <= today()),
      'every done step dated',
    );
    assert(
      db.goals.filter(g => g.status === 'achieved').every(g => g.achievedAt),
      'the reached goal dated',
    );
  });
});
