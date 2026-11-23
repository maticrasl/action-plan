/** Page tests: Today (feature 09): all plans on one page, ticking in a plan that is not open, opening its items, this week's one thing. */
suite(async () => {
  const rows = sel => [...$('#view').querySelectorAll(sel)];
  const titles = () => rows('.row .grow').map(s => s.textContent.trim());
  const heads = () => rows('.today-plan-h').map(h => h.textContent);
  const toastText = () => $('#toast').firstChild?.textContent;
  // Plans of earlier files and steps are counted as samples, so Today shows only these.
  const only = (...ids) => plans.list.forEach(p => (p.demo = !ids.includes(p.id)));
  const rightClick = el => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 });
    el.dispatchEvent(e);
    assert(e.defaultPrevented && !ctxMenu.hidden, 'menu opens');
    return [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
  };
  // Two plans: "Today B" (not open) and "Today A" (open), each with a step due today.
  const twoPlans = () => {
    fresh('Today B');
    const b = plans.current;
    const other = mk('activity', { title: 'Call the plumber', dueDate: today() });
    save();
    fresh('Today A');
    const mine = mk('activity', { title: 'Buy shoes', dueDate: d(-3) });
    save();
    return { a: plans.current, b, other, mine };
  };

  await step('today: before Review in the nav; one plan: its steps, routines and later, no plan headings', () => {
    const nav = [...document.querySelectorAll('.nav .nav-item[data-view]')].map(b => b.dataset.view);
    eq(nav.slice(-2).join(), 'today,review', 'nav order');
    assert($('.nav-item[data-view="today"]').classList.contains('nav-extra'), 'in More on phones');
    fresh('Today solo');
    only(plans.current);
    setView('today');
    assert(
      $('#view .empty')?.textContent.startsWith(t('dash.emptyTitle') + t('dash.emptyText')),
      'empty plan: the Overview empty state',
    );
    mk('activity', { title: 'Late', dueDate: d(-2) });
    mk('activity', { title: 'Now', dueDate: today() });
    mk('activity', { title: 'Soon', dueDate: d(3) });
    mk('activity', { title: 'Far', dueDate: d(9) });
    mk('activity', { title: 'Done', dueDate: d(-1), status: 'done' });
    mk('activity', { title: 'Run', status: 'doing', repeat: { every: 1, unit: 'day' }, checkins: {} });
    save();
    render();
    eq(heads(), [], 'no plan headings');
    eq(titles().slice(0, 2), ['Late', 'Now'], 'due, overdue first');
    assert(
      titles().some(s => s.startsWith('Run')),
      'the routine',
    );
    assert(!titles().includes('Soon'), 'later is folded');
    $('#view [data-today="later"]').click();
    assert(titles().includes('Soon') && !titles().includes('Far') && !titles().includes('Done'), 'later: up to 7 days');
    $('#view [data-today="later"]').click();
    eq(ui.view, 'today', 'stays');
  });

  await step('today: a step of a plan that is not open is ticked there; the open plan is left alone', () => {
    const { a, b, other, mine } = twoPlans();
    only(a, b);
    setView('today');
    eq(heads(), ['Today A', 'Today B'], 'open plan first, with headings');
    const before = JSON.stringify(db);
    $(`#view [data-in-plan="${b}"] [data-cycle="${other.id}"]`).click(); // todo → doing
    $(`#view [data-in-plan="${b}"] [data-cycle="${other.id}"]`).click(); // doing → done
    eq(JSON.stringify(db), before, 'open plan unchanged');
    eq(readPlan(b).activities[0].status, 'done', 'done in its plan');
    eq(readPlan(b).activities[0].doneAt, today(), 'with today');
    assert(!titles().includes('Call the plumber'), 'no longer due');
    eq(db.activities[0].id, mine.id, 'still the open plan');
  });

  await step('today: a routine of another plan asks how much, and the amount lands in that plan', () => {
    const a = plans.current;
    openPlan(plans.list.find(p => p.name === 'Today B').id);
    const run = mk('activity', { title: 'Run', status: 'doing', repeat: { every: 1, unit: 'day' }, checkins: {} });
    const km = mk('state', { title: 'Km', unit: 'km', cumulative: true, scale: 'week', entries: [] });
    rel(run, km, 'improves');
    save();
    const b = plans.current;
    openPlan(a);
    setView('today');
    $(`#view [data-in-plan="${b}"] [data-checkin="${run.id}"]`).click();
    assert($('.amount-pop'), 'asks how much');
    $('.amount-pop [data-amount]').value = '5';
    $('.amount-pop').requestSubmit();
    const stored = readPlan(b);
    eq(
      stored.states.find(s => s.id === km.id).entries.map(e => [e.amount, e.routine]),
      [['5', run.id]],
      'entry there',
    );
    assert(
      checkedOn(
        stored.activities.find(x => x.id === run.id),
        today(),
      ),
      'ticked there',
    );
    eq(plans.current, a, 'plan not switched');
    assert(!db.states.some(s => s.id === km.id), 'nothing in the open plan');
  });

  await step('today: a title of another plan opens that plan, says so, and opens the form; view stays', () => {
    const b = plans.list.find(p => p.name === 'Today B').id;
    openPlan(b);
    const step = mk('activity', { title: 'Fix the tap', dueDate: today() });
    save();
    openPlan(plans.list.find(p => p.name === 'Today A').id);
    setView('today');
    $(`#view [data-in-plan="${b}"] [data-open="${step.id}"] .grow`).click();
    eq(plans.current, b, 'switched');
    eq(toastText(), t('log.openedPlan', { name: 'Today B' }), 'toast');
    assert(modal.open && $('#f-title').value === 'Fix the tap', 'its form');
    modal.close();
    eq(ui.view, 'today', 'view stays Today');
  });

  await step("today: another plan's menu offers ticks, this week's one thing and Open in", () => {
    const b = plans.current;
    openPlan(plans.list.find(p => p.name === 'Today A').id);
    setView('today');
    const id = readPlan(b).activities.find(x => x.title === 'Fix the tap').id;
    const opts = rightClick($(`#view [data-in-plan="${b}"] [data-ctx-item="${id}"]`));
    eq(opts, ['status:todo', 'status:doing', 'status:done', 'week', 'open-in'], 'only these');
    ctxMenu.querySelector('[data-ctx="status:doing"]').click();
    eq(readPlan(b).activities.find(x => x.id === id).status, 'doing', 'status set there');
    rightClick($(`#view [data-in-plan="${b}"] [data-ctx-item="${id}"]`));
    ctxMenu.querySelector('[data-ctx="week"]').click();
    eq([journal.focus.plan, journal.focus.item], [b, id], 'focus set');
    assert($('#view .focus-card').textContent.includes('Fix the tap'), 'on the card');
    eq(toastText(), t('today.focusSet', { name: 'Fix the tap' }), 'toast');
    setView('dashboard');
    assert(!$('#view .focus-card'), 'not on the Overview of another plan');
  });

  await step("today: this week's one thing from Activities shows on Today and the Overview; replaced; cleared", () => {
    const a = mk('activity', { title: 'Book the check-up', dueDate: d(4) });
    save();
    setView('activities');
    rightClick($(`.card[data-open="${a.id}"]`));
    ctxMenu.querySelector('[data-ctx="week"]').click();
    setView('dashboard');
    assert($('#view .focus-card').textContent.includes('Book the check-up'), 'on the Overview');
    setView('today');
    assert($('#view .focus-card').textContent.includes('Book the check-up'), 'on Today');
    $(`#view .focus-card [data-cycle="${a.id}"]`).click();
    $(`#view .focus-card [data-cycle="${a.id}"]`).click();
    eq($('#view .focus-done')?.textContent, t('today.focusDone'), 'done line');
    $('#view [data-today="clear"]').click();
    eq($('#view .focus-card .empty')?.textContent.includes(t('today.focusNone')), true, 'empty card');
    eq([journal.focus.item, journal.focus.plan], ['', ''], 'a cleared mark');
  });

  await step('today: the picker lists steps of all plans, filters, and sets the focus', () => {
    setView('today');
    $('#view [data-today="choose"]').click();
    const dlg = $('#focusPickDlg');
    assert(dlg.open, 'opens');
    const names = () => [...dlg.querySelectorAll('.pick-step:not([hidden]) .grow')].map(s => s.textContent);
    assert(names().includes('Fix the tap') && names().includes('Buy shoes'), 'both plans');
    assert(!names().includes('Call the plumber'), 'not done ones');
    const search = $('#focusPickSearch');
    search.value = 'TAP';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    eq(names(), ['Fix the tap'], 'filtered');
    dlg.querySelector('.pick-step:not([hidden])').click();
    assert(!dlg.open, 'closed');
    assert($('#view .focus-card').textContent.includes('Fix the tap'), 'chosen');
  });

  await step("today: the focus's plan deleted, or last week's focus: an empty card, no error", () => {
    const b = plans.list.find(p => p.name === 'Today B').id;
    journal.focus = { ...journal.focus, week: addDays(journal.focus.week, -7) };
    render();
    assert($('#view .focus-card .empty'), "last week's is not shown");
    setFocus(b, readPlan(b).activities[0].id);
    deletePlan(b);
    setView('today');
    assert($('#view .focus-card .empty'), 'empty card');
    eq(heads(), [], 'one plan left: no headings');
  });

  await step('today: a sample plan is left out, also when it is open', () => {
    const real = plans.list.find(p => p.name === 'Today A').id;
    openPlan(real);
    loadSample();
    const sample = plans.current;
    setView('today');
    assert(!rows(`[data-in-plan="${sample}"]`).length, 'nothing from the open sample');
    assert(rows(`[data-in-plan="${real}"]`).length, 'the other plan is listed');
    openPlan(real);
  });
});
