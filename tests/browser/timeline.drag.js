/** Page tests: timeline.drag. */
suite(async () => {
  await step('timeline: dragging the selected bar moves its dates; a grip moves one end', async () => {
    fresh('Drag dates');
    const now = today();
    const g = mk('goal', { title: 'Goal', startDate: addDays(now, -10), deadline: addDays(now, 20) });
    const a = mk('activity', { title: 'Act', startDate: now, dueDate: addDays(now, 5) });
    const m = mk('activity', { title: 'Milestone', dueDate: addDays(now, 8) });
    const r = mk('activity', { title: 'Routine', startDate: now, repeat: { every: 1, unit: 'day', count: 5 } });
    r.dueDate = lastOccurrence(r, 5);
    rel(a, g, 'contributes');
    rel(m, g, 'contributes');
    save();
    ui.tlPx = TL.ZOOM.week;
    ui.tlDeps = true;
    setView('timeline');
    const px = ui.tlPx;
    // Selected with its dates open for changing, as a click on its bar does.
    const sel = id => {
      ui.mapSelected = ui.tlDates = id;
      ui.mapRel = null;
      render();
    };
    const row = id => $(`[data-tl-node="${id}"]`);
    const mouse = (type, el, x, y = 100) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 3,
          pointerType: 'mouse',
          button: 0,
          clientX: x,
          clientY: y,
        }),
      );
    const touch = (type, el, x, y = 100) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 4,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
        }),
      );
    const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    // A single click, not read as the second of a double-click.
    const click1 = el => {
      lastNodeClick = { id: null, t: 0 };
      click(el);
    };
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const drag = (el, days, steps = 3) => {
      mouse('pointerdown', el, 400);
      for (let k = 1; k <= steps; k++) mouse('pointermove', document, 400 + (days * px * k) / steps);
      mouse('pointerup', document, 400 + days * px);
      click(el);
    };

    // Only the selected item can be dragged, and only once its bar (not just its row) was clicked.
    assert(!$('[data-tl-drag]'), 'nothing selected: nothing to drag');
    click1(row(a.id).querySelector('.tl-label'));
    assert(ui.mapSelected === a.id && row(a.id).classList.contains('selected'), 'a click on the row selects it');
    assert(!$('[data-tl-drag]') && !$('.tl-grip'), 'but offers no dates to drag');
    assert(
      viewEl.textContent.includes(t('tl.datesHint')) && !viewEl.textContent.includes(t('tl.dragHint')),
      'the hint says to tap the bar',
    );
    click1(row(a.id).querySelector('.tl-bar'));
    assert(ui.mapSelected === a.id && ui.tlDates === a.id, 'a click on its bar keeps it selected, now with its dates');
    assert(
      row(a.id).querySelector('.tl-bar.tl-drag') && row(a.id).querySelectorAll('.tl-grip').length === 2,
      'grips appear',
    );
    click1(row(a.id).querySelector('.tl-grip'));
    assert(!ui.mapSelected && !ui.tlDates, 'a grip is part of the bar: a second click there deselects');
    click1(row(a.id).querySelector('.tl-bar'));
    click1(row(a.id).querySelector('.tl-label'));
    assert(ui.mapSelected === a.id && !ui.tlDates && !$('.tl-grip'), 'a click on the row goes back to selecting only');
    click1(row(a.id).querySelector('.tl-bar'));
    click(row(a.id).querySelector('.tl-bar'));
    assert(modal.open, 'a double-click on the bar still edits');
    modal.close();
    ui.mapSelected = ui.tlDates = a.id;
    render();
    click1(row(a.id).querySelector('.tl-bar'));
    assert(!ui.mapSelected && !ui.tlDates, 'a second click on the bar deselects');
    click1(row(m.id).querySelector('.tl-milestone'));
    assert(ui.tlDates === m.id && row(m.id).querySelector('.tl-milestone.tl-drag'), 'a milestone counts as its bar');
    // Selected another way (the menu, Show in): selecting only.
    ui.mapSelected = null;
    render();
    runCtxAction('highlight', a.id);
    assert(ui.mapSelected === a.id && !$('[data-tl-drag]'), 'highlighting from the menu: no dates');
    // On a touch screen, a long-press on the bar of a row that is only selected opens the menu.
    touch('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    await wait(LONG_PRESS_MS + 80);
    touch('pointerup', document, 400);
    assert(
      !ctxMenu.hidden && !$('.tl-scroll').classList.contains('tl-dragging'),
      'long-press on a selected row: the menu, not a drag',
    );
    closeCtxMenu();
    await wait(20);
    sel(a.id);
    assert(
      row(a.id).querySelector('.tl-bar.tl-drag') && row(a.id).querySelectorAll('.tl-grip').length === 2,
      'the selected bar and its two grips',
    );
    assert(viewEl.textContent.includes(t('tl.dragHint')), 'the hint says how');

    // Moving the whole bar: the view follows during the drag, before it is let go.
    const left0 = parseFloat(row(a.id).querySelector('.tl-bar').style.left);
    mouse('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    mouse('pointermove', document, 402);
    eq(a.startDate, now, 'a 2px wobble does not drag');
    mouse('pointermove', document, 400 + 3 * px + 3);
    eq(parseFloat(row(a.id).querySelector('.tl-bar').style.left), left0 + 3 * px, 'the bar follows at once');
    eq(
      row(a.id).querySelector('.tl-dates').textContent,
      `${fmtDate(addDays(now, 3))} – ${fmtDate(addDays(now, 8))}`,
      'its dates follow at once',
    );
    eq(a.startDate, now, 'not saved until let go');
    eq(
      $('.tl-drag-tip')?.textContent,
      `${fmtDate(addDays(now, 3))} – ${fmtDate(addDays(now, 8))}`,
      'a label above shows the new dates',
    );
    const tipR = $('.tl-drag-tip').getBoundingClientRect(),
      barR = row(a.id).querySelector('.tl-bar').getBoundingClientRect();
    assert(tipR.bottom <= barR.top && tipR.width > 0, 'the label sits above the bar');
    mouse('pointerup', document, 400 + 3 * px + 3);
    click(row(a.id));
    eq([a.startDate, a.dueDate], [addDays(now, 3), addDays(now, 8)], 'moved by three days');
    eq(ui.mapSelected, a.id, 'still selected after the drag');
    assert(
      JSON.parse(localStorage.getItem(planKey(plans.current))).activities.find(x => x.id === a.id).startDate ===
        addDays(now, 3),
      'saved',
    );
    assert(row(a.id).querySelector('.tl-bar.tl-drag'), 'redrawn and still draggable');

    assert(!$('.tl-drag-tip'), 'the label goes when the bar is let go');
    // A grip changes one end only, and never past the other end; the label names that date.
    mouse('pointerdown', row(a.id).querySelector('[data-tl-edge="end"]'), 400);
    mouse('pointermove', document, 400 + 6);
    eq(
      $('.tl-drag-tip')?.textContent,
      `${t('f.dueDate')}: ${fmtDate(addDays(now, 8))}`,
      'the label shows from the start of the drag',
    );
    mouse('pointermove', document, 400 + 2 * px);
    eq(
      $('.tl-drag-tip').textContent,
      `${t('f.dueDate')}: ${fmtDate(addDays(now, 10))}`,
      'end grip: the label names the due date',
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    mouse('pointerup', document, 400 + 2 * px);
    assert(!$('.tl-drag-tip') && a.dueDate === addDays(now, 8), 'Esc removes the label and keeps the date');
    drag(row(a.id).querySelector('[data-tl-edge="end"]'), 4);
    eq([a.startDate, a.dueDate], [addDays(now, 3), addDays(now, 12)], 'end grip: due date only');
    drag(row(a.id).querySelector('[data-tl-edge="start"]'), -2);
    eq([a.startDate, a.dueDate], [addDays(now, 1), addDays(now, 12)], 'start grip: start date only');
    drag(row(a.id).querySelector('[data-tl-edge="end"]'), -30);
    eq([a.startDate, a.dueDate], [addDays(now, 1), addDays(now, 1)], 'an activity can shrink to one day');
    // A goal's deadline stays after its start.
    sel(g.id);
    drag(row(g.id).querySelector('[data-tl-edge="start"]'), 60);
    eq([g.startDate, g.deadline], [addDays(now, 19), addDays(now, 20)], 'a goal keeps its start before the deadline');
    mouse('pointerdown', row(g.id).querySelector('[data-tl-edge="end"]'), 400);
    mouse('pointermove', document, 400 + px);
    eq(
      $('.tl-drag-tip').textContent,
      `${t('f.deadline')}: ${fmtDate(addDays(now, 21))}`,
      'the end of a goal is its deadline',
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    mouse('pointerup', document, 400 + px);

    // Esc puts it back.
    sel(a.id);
    mouse('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    mouse('pointermove', document, 400 + 5 * px);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    mouse('pointerup', document, 400 + 5 * px);
    click(row(a.id));
    eq(a.startDate, addDays(now, 1), 'Esc: not moved');
    eq(row(a.id).querySelector('.tl-dates').textContent, 'Tomorrow – tomorrow', 'Esc: drawn where it was');
    eq(ui.mapSelected, a.id, 'Esc during a drag keeps the selection');

    // A plain click on the selected bar still deselects it, and nothing moves.
    const before = JSON.stringify(a);
    mouse('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    mouse('pointerup', document, 400);
    click1(row(a.id).querySelector('.tl-bar'));
    eq(ui.mapSelected, null, 'a click deselects');
    eq(JSON.stringify(a), before, 'a click changes nothing');

    // A milestone (one date) moves that date.
    sel(m.id);
    assert(
      row(m.id).querySelector('.tl-milestone.tl-drag') && !row(m.id).querySelector('.tl-grip'),
      'a milestone moves whole',
    );
    drag(row(m.id).querySelector('.tl-milestone'), -2);
    eq([m.startDate || '', m.dueDate], ['', addDays(now, 6)], 'the milestone moved, no start date added');

    // A routine that runs a set number of times only moves; its end follows its start.
    sel(r.id);
    assert(
      !row(r.id).querySelector('.tl-grip') && viewEl.textContent.includes(t('tl.dragHintMove')),
      'no grips on a counted routine',
    );
    drag(row(r.id).querySelector('.tl-bar'), 2);
    eq([r.startDate, r.dueDate], [addDays(now, 2), addDays(now, 6)], 'the routine moved with its end');

    // The drag stops at the ends of the timeline as drawn.
    sel(a.id);
    const to = Number($('.tl-scroll').dataset.to);
    drag(row(a.id).querySelector('.tl-bar'), 5000);
    eq(a.dueDate, dayStr(to), 'stops at the end of the timeline');

    // Unselected bars pan as before.
    ui.mapSelected = null;
    render();
    const scroll = $('.tl-scroll');
    scroll.setPointerCapture = () => {}; // a synthetic pointer cannot be captured
    scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
    const sl = scroll.scrollLeft;
    mouse('pointerdown', row(g.id).querySelector('.tl-bar'), 400);
    mouse('pointermove', document, 300);
    mouse('pointerup', document, 300);
    assert(scroll.scrollLeft !== sl, 'an unselected bar pans the timeline');
    eq(g.deadline, addDays(now, 20), 'and keeps its dates');

    // Touch: moving before the long-press is up scrolls (no drag); after it, the bar drags.
    sel(a.id);
    const start = a.startDate;
    touch('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    touch('pointermove', document, 400 + 3 * px);
    await wait(LONG_PRESS_MS + 80);
    touch('pointermove', document, 400 + 6 * px);
    touch('pointerup', document, 400 + 6 * px);
    eq(a.startDate, start, 'a swipe does not drag');
    assert(ctxMenu.hidden, 'nor open the menu');
    touch('pointerdown', row(a.id).querySelector('.tl-bar'), 400);
    await wait(LONG_PRESS_MS + 80);
    assert($('.tl-scroll').classList.contains('tl-dragging') && ctxMenu.hidden, 'a long-press picks the bar up');
    const tm = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    row(a.id).querySelector('.tl-bar').dispatchEvent(tm);
    assert(tm.defaultPrevented, 'and the page does not scroll');
    touch('pointermove', document, 400 - 2 * px);
    touch('pointerup', document, 400 - 2 * px);
    eq(a.startDate, addDays(start, -2), 'long-press and drag moves the dates');
    eq(ui.mapSelected, a.id, 'still selected');
    assert(!$('.tl-scroll').classList.contains('tl-dragging'), 'put down');
    // A long-press let go without moving opens the menu, as elsewhere.
    touch('pointerdown', row(a.id).querySelector('[data-tl-edge="end"]'), 400);
    await wait(LONG_PRESS_MS + 80);
    touch('pointerup', document, 400);
    assert(!ctxMenu.hidden && ctxMenu.dataset.id === a.id, 'a long-press without moving opens the menu');
    eq(ctxMenu.querySelector('.ctx-head strong').title, a.title, 'the menu heading shows the whole title on hover');
    closeCtxMenu();
    eq(a.startDate, addDays(start, -2), 'and changes nothing');
    deletePlan(plans.current);
    return `px=${px}`;
  });
});
