/** Page tests: Move late steps (the button in each place, the dialog, goal deadlines, Undo). */
suite(async () => {
  const dlg = () => $('#replan');
  const toastText = () => $('#toast').firstChild?.textContent;
  const undoBtn = () => $('#toast .toast-action');
  const box = () => $('#f-replanTo');
  const newDates = () => [...dlg().querySelectorAll('[data-replan-new]')].map(e => e.textContent);
  const typeDate = iso => {
    box().value = iso.split('-').reverse().join('/');
    box().dispatchEvent(new Event('input', { bubbles: true }));
  };
  const late3 = () => {
    fresh('Late plan');
    const g = mk('goal', { title: 'Run 5 km', deadline: d(5) });
    const c = mk('activity', { title: 'Gait analysis', dueDate: d(-4) });
    const a = mk('activity', { title: 'Buy running shoes', dueDate: d(-8) });
    const b = mk('activity', { title: 'Book the check-up', dueDate: d(-6), status: 'doing', startDate: d(-9) });
    const soon = mk('activity', { title: 'First run', dueDate: d(3) });
    mk('activity', { title: 'Daily walk', repeat: { every: 1, unit: 'day' }, startDate: d(-30), dueDate: d(-1) });
    rel(c, g, 'contributes');
    save();
    return { g, a, b, c, soon };
  };
  const btnIn = view => {
    setView(view);
    return $('#view [data-replan]');
  };

  await step(
    'replan: the button shows only with late steps, on the Overview, in Activities and on the Timeline',
    () => {
      fresh('On time');
      mk('activity', { title: 'Later', dueDate: d(2) });
      mk('activity', { title: 'Done late', dueDate: d(-2), status: 'done' });
      mk('activity', { title: 'Routine', repeat: { every: 1, unit: 'day' }, startDate: d(-9), dueDate: d(-1) });
      save();
      for (const v of ['dashboard', 'activities', 'timeline']) assert(!btnIn(v), `none on ${v}`);
      late3();
      for (const v of ['dashboard', 'activities', 'timeline']) assert(btnIn(v), `on ${v}`);
      setView('dashboard');
      assert($('.fact-late [data-replan]'), 'at the end of the late fact');
      eq($('[data-replan]').textContent, t('replan.btn'), 'its words');
    },
  );

  await step(
    'replan: the dialog lists the late steps earliest first, ticked; tomorrow by default; Move and Undo',
    () => {
      const { g, a, b, c } = late3();
      setView('dashboard');
      $('[data-replan]').click();
      try {
        assert(dlg().open, 'opens');
        eq(
          [...dlg().querySelectorAll('.replan-title')].map(e => e.textContent),
          ['Buy running shoes', 'Book the check-up', 'Gait analysis'],
          'earliest first, no routine',
        );
        assert(
          [...dlg().querySelectorAll('[data-replan-id]')].every(i => i.checked),
          'all ticked',
        );
        eq(box().value, d(1).split('-').reverse().join('/'), 'tomorrow');
        eq($('#replanRel').textContent, t('day.tomorrow'), 'says tomorrow');
        eq(
          newDates(),
          [d(1), d(3), d(5)].map(x => '→ ' + fmtDay(x, { day: 'numeric', month: 'short' })),
          'keep their distance',
        );
        eq($('#replanBtn').textContent, tp('replan.do', 3), 'Move 3 steps');
        assert($('#replanGoals').hidden, 'no goal warning while all end by the deadline');
        // Unticking the earliest: the next one is the anchor.
        dlg().querySelector(`[data-replan-id="${a.id}"]`).click();
        eq(
          newDates(),
          ['', d(1), d(3)].map(x => x && '→ ' + fmtDay(x, { day: 'numeric', month: 'short' })),
          'next is the anchor',
        );
        eq($('#replanBtn').textContent, tp('replan.do', 2), 'Move 2 steps');
        dlg().querySelector(`[data-replan-id="${a.id}"]`).click();
        // A date before today is refused, and the field keeps focus while typing.
        box().focus();
        typeDate(d(-1));
        eq($('#replanErr').textContent, t('err.replanPast'), 'past refused');
        assert($('#replanBtn').disabled, 'cannot move');
        eq(document.activeElement, box(), 'focus stays in the field');
        typeDate(d(0));
        assert(!$('#replanBtn').disabled && !$('#replanErr').textContent, 'today is fine');
        $('#replanBtn').click();
      } finally {
        if (dlg().open) dlg().close();
      }
      assert(!dlg().open, 'closes');
      const due = id => db.activities.find(x => x.id === id);
      eq([due(a.id).dueDate, due(b.id).dueDate, due(c.id).dueDate], [d(0), d(2), d(4)], 'moved by the same days');
      // A To do step with a past start is started automatically, so only the unit tests see one move.
      eq(due(b.id).startDate, d(-9), 'In progress: start stays');
      eq(readPlan(plans.current).activities.find(x => x.id === a.id).dueDate, d(0), 'saved');
      eq(planHealth(db), 'today', 'plan badge no longer red');
      eq(toastText(), tp('replan.done', 3), 'toast');
      assert(!$('[data-replan]') && !$('.fact-late'), 'button and late fact gone');
      undoBtn().click();
      eq([due(a.id).dueDate, due(b.id).dueDate, due(c.id).dueDate], [d(-8), d(-6), d(-4)], 'Undo puts every date back');
      eq(db.goals.find(x => x.id === g.id).deadline, d(5), 'goal untouched');
      assert($('[data-replan]'), 'button back');
    },
  );

  await step('replan: later steps and a goal deadline move only when chosen; Undo puts the deadline back', () => {
    const { g, soon } = late3();
    openReplan();
    try {
      eq(
        $('#replanLaterCount').textContent,
        `(${tp('replan.laterCount', 1, { days: tp('replan.days', 9) })})`,
        'count beside the box',
      );
      typeDate(d(4)); // Gait analysis (−4) lands on 8, after the goal's 5
      assert(!$('#replanGoals').hidden, 'warns about the goal');
      eq(
        $('#replanGoalText').textContent,
        tp('replan.pastGoal', 1, { goal: 'Run 5 km', date: fmtDay(d(5), { day: 'numeric', month: 'short' }) }),
        'names the goal and its deadline',
      );
      $('#replanLater').click();
      eq($('#replanBtn').textContent, tp('replan.do', 4), 'later step counted');
      $('#replanMoveGoal').click();
      $('#replanBtn').click();
    } finally {
      if (dlg().open) dlg().close();
    }
    eq(db.goals.find(x => x.id === g.id).deadline, d(17), 'deadline moved by the same 12 days');
    eq(db.activities.find(x => x.id === soon.id).dueDate, d(15), 'later step moved');
    eq(toastText(), tp('replan.done', 4), 'toast counts all');
    undoBtn().click();
    eq(db.goals.find(x => x.id === g.id).deadline, d(5), 'Undo: deadline back');
    eq(db.activities.find(x => x.id === soon.id).dueDate, d(3), 'Undo: later step back');
  });

  await step('replan: one late step reads right in both languages', () => {
    fresh('One');
    mk('activity', { title: 'Only', dueDate: d(-1) });
    save();
    openReplan();
    try {
      eq($('#replanBtn').textContent, 'Move 1 step', 'English');
      setLang('sl');
      eq(
        [tp('replan.do', 1), tp('replan.do', 2), tp('replan.do', 3), tp('replan.do', 5)],
        ['Premakni 1 korak', 'Premakni 2 koraka', 'Premakni 3 korake', 'Premakni 5 korakov'],
        'Slovenian forms',
      );
      eq(tp('replan.days', 2), '2 dneva', 'Slovenian days');
    } finally {
      setLang('en');
      dlg().close();
    }
  });

  await step('replan: 40 late steps scroll inside the dialog; the buttons stay visible', () => {
    fresh('Many');
    for (let i = 0; i < 40; i++) mk('activity', { title: `Step ${i}`, dueDate: d(-1 - i) });
    save();
    openReplan();
    try {
      const body = $('#replanBody');
      assert(body.scrollHeight > body.clientHeight, 'the list scrolls');
      const foot = dlg().querySelector('.modal-foot').getBoundingClientRect();
      assert(foot.bottom <= innerHeight && foot.top >= 0, 'buttons in view');
      eq($('#replanBtn').textContent, tp('replan.do', 40), 'all ticked');
    } finally {
      dlg().close();
    }
  });

  await step('replan: the calendar opens on the date field and picks a day', () => {
    late3();
    openReplan();
    try {
      dlg().querySelector('[data-cal-open]').click();
      assert(dlg().querySelector('.cal'), 'calendar open');
      dlg()
        .querySelector(`[data-cal-day="${d(2)}"]`)
        .click();
      eq(box().value, d(2).split('-').reverse().join('/'), 'day picked');
      eq(newDates()[0], '→ ' + fmtDay(d(2), { day: 'numeric', month: 'short' }), 'preview follows');
    } finally {
      dlg().close();
    }
    assert(!dlg().querySelector('.cal'), 'calendar closed with the dialog');
  });

  await step('replan: tips back and overdue-pile and the Guide open the dialog', () => {
    late3();
    TIP_DO.replan();
    assert(dlg().open, 'from a tip');
    dlg().close();
    GUIDE_DO.replan();
    assert(dlg().open, 'from the Guide');
    dlg().close();
    fresh('Nothing late');
    GUIDE_DO.replan();
    assert(!dlg().open && toastText() === t('replan.none'), 'nothing late: says so');
    TIP_DO.replan();
    eq(ui.view, 'timeline', 'tip without late steps: the Timeline');
  });
});
