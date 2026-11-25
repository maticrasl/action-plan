/** Page tests: timeline rows, selecting, editing and deleting bars and arrows, routine days, line drawing. */
suite(async () => {
  await step('timeline rows: tree order, hidden done, unlinked group', () => {
    fresh('Rows');
    const g1 = mk('goal', { title: 'G1', startDate: d(1) }),
      g2 = mk('goal', { title: 'G2', startDate: d(2) });
    const a = mk('activity', { title: 'A', startDate: d(3) }),
      b = mk('activity', { title: 'B', startDate: d(4) }),
      b0 = mk('activity', { title: 'B0', startDate: d(2) });
    const u = mk('activity', { title: 'U' });
    rel(g2, g1, 'subgoal');
    rel(a, g1, 'contributes');
    rel(b, a, 'subactivity');
    rel(b0, a, 'subactivity');
    const show = rows =>
      rows
        .map(r => (r.kind === 'group' ? `[${r.label}]` : `${r.item.title}:${r.depth}${r.rel ? ':' + r.rel : ''}`))
        .join(' ');
    const all = show(timelineRows(null));
    eq(all, `G1:0 A:1:contributes B0:2:subactivity B:2:subactivity G2:1:subgoal [${t('tl.unlinked')}] U:1`, 'rows');
    a.status = 'done';
    ui.hideDone = true;
    const hidden = show(timelineRows(null));
    ui.hideDone = false;
    eq(
      hidden,
      `G1:0 B0:1:contributes B:1:contributes G2:1:subgoal [${t('tl.unlinked')}] U:1`,
      "children take a hidden parent's place",
    );
    const scoped = show(timelineRows(scopeFor(g2.id)));
    return `${all} || scoped(G2): ${scoped}`;
  });
  const tlFixture = () => {
    fresh('Timeline keys');
    const now = today();
    const g = mk('goal', { title: 'Renovate', startDate: addDays(now, -10), deadline: addDays(now, 60) });
    const a = mk('activity', { title: 'Plan', startDate: addDays(now, -5), dueDate: addDays(now, 5) });
    const b = mk('activity', { title: 'Build', startDate: addDays(now, 6), dueDate: addDays(now, 30) });
    const c = mk('activity', { title: 'Paint', startDate: addDays(now, 31), dueDate: addDays(now, 40) });
    rel(a, g, 'contributes');
    rel(b, a, 'depends');
    rel(c, b, 'depends');
    save();
    setView('timeline');
    return { g, a, b, c };
  };
  const bar = id => $(`[data-tl-node="${id}"]`);
  await step('timeline: double-click or Enter on the selected bar edits it; Esc deselects', () => {
    const { g, a } = tlFixture();
    a.description = 'Three runs a week';
    clickEl(bar(a.id), 1);
    eq($('#view .sel-desc')?.textContent, 'Three runs a week', 'the selection shows its description');
    clickEl(bar(a.id), 2);
    assert(modal.open && formCtx.kind === 'activity' && formCtx.id === a.id, 'double-click opens the activity');
    eq(ui.mapSelected, a.id, 'left selected');
    modal.close();
    clickEl(bar(g.id), 1);
    clickEl(bar(g.id), 2);
    assert(modal.open && formCtx.kind === 'goal' && formCtx.id === g.id, 'double-click opens the goal');
    modal.close();
    // Enter or Space: the first selects, the next opens.
    ui.mapSelected = null;
    render();
    bar(a.id).focus();
    press('Enter', bar(a.id));
    assert(!modal.open && ui.mapSelected === a.id, 'Enter selects');
    bar(a.id).focus();
    press(' ', bar(a.id));
    assert(modal.open && formCtx.id === a.id, 'Space on the selected bar opens it');
    modal.close();
    document.activeElement?.blur();
    press('Enter', document.body);
    assert(modal.open && formCtx.id === a.id, 'Enter with the focus elsewhere opens the selected bar');
    modal.close();
    press('Escape', document.body);
    eq(ui.mapSelected, null, 'Esc deselects');
    assert(!$('.tl-row.dim'), 'nothing dimmed');
    return 'ok';
  });
  await step('timeline: Delete on a bar deletes it; no dependency arrows to select', () => {
    const { g, a, b, c } = tlFixture();
    const realConfirm = window.confirm;
    let question = '';
    try {
      // Bars.
      clickEl(bar(c.id));
      window.confirm = q => {
        question = q;
        return false;
      };
      press('Backspace', document.body);
      assert(
        !question && !findEntity(c.id) && !db.relations.some(r => r.from === c.id || r.to === c.id),
        'deletes it and its links without asking',
      );
      eq($('#toast').firstChild.textContent, t('toast.deleted.activity'), 'says so');
      // No dependency arrows are drawn, so a line picked on the map is not deleted here.
      assert(!$('.tl-deps, [data-rel-edit]'), 'no arrows');
      const r = db.relations.find(x => x.type === 'depends' && x.from === b.id);
      ui.mapRel = r.id;
      render();
      press('Delete', document.body);
      assert(
        db.relations.some(x => x.id === r.id),
        'a line not shown is not deleted',
      );
      ui.mapRel = null;
      // Typing or another view: left alone.
      clickEl(bar(a.id));
      const field = document.createElement('input');
      viewEl.append(field);
      field.focus();
      press('Delete', field);
      assert(findEntity(a.id), 'nothing deleted while typing');
      field.remove();
      setView('goals');
      press('Delete', document.body);
      assert(findEntity(a.id), 'other views ignore it');
    } finally {
      window.confirm = realConfirm;
    }
    deletePlan(plans.current);
    return question;
  });
  await step('timeline: help mentions the keys, in both languages', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const key of ['help.view.timeline'])
        [/Delete/, /Enter/, /Esc/].forEach(w => assert(w.test(t(key)), `${code} ${key} mentions ${w}`));
    }
    changeLanguage('en');
    return t('tl.hint');
  });
  await step('timeline: a routine on set days marks each one done, missed or to come; a flexible one none', () => {
    fresh('Routine days');
    const g = mk('goal', { startDate: d(-20), deadline: d(30) });
    // Every day from 6 days ago to 3 days ahead: two done, today not yet.
    const a = mk('activity', {
      title: 'Stretch',
      repeat: { every: 1, unit: 'day' },
      startDate: d(-6),
      dueDate: d(3),
      checkins: { [d(-6)]: 1, [d(-2)]: 1 },
    });
    const open = mk('activity', { title: 'Weigh in', repeat: { every: 1, unit: 'week' }, startDate: d(-14) });
    const flex = mk('activity', { title: 'Run', repeat: { times: 3, per: 'week' }, startDate: d(-6), dueDate: d(3) });
    [a, open, flex].forEach(x => rel(x, g, 'contributes'));
    save();
    setView('timeline');
    ui.tlPx = TL.ZOOM.week;
    render();
    const marks = id => [...$(`[data-tl-node="${id}"]`).querySelectorAll('.tl-day')];
    const kinds = id => marks(id).map(m => m.classList[1]);
    eq(
      kinds(a.id),
      ['done', 'missed', 'missed', 'missed', 'done', 'missed', 'due', 'due', 'due', 'due'],
      'each day in order',
    );
    const from = Number($('.tl-scroll').dataset.from),
      x0 = Number(marks(a.id)[0].style.left.slice(0, -2));
    assert(Math.abs(x0 - ((dayNum(d(-6)) - from) * TL.ZOOM.week + 1)) < 0.01, `on its own day: ${x0}`);
    eq(marks(flex.id).length, 0, 'a flexible routine has no set days');
    const ends = Number($('.tl-scroll').dataset.to),
      weeks = kinds(open.id);
    assert(
      weeks.length === Math.floor((ends - dayNum(d(-14))) / 7) + 1 && weeks.slice(0, 2).join() === 'missed,missed',
      `without an end: every week to the timeline's end (${weeks.length})`,
    );
    // Narrow days merge into a band.
    ui.tlPx = TL.MIN;
    render();
    const w = marks(a.id).map(m => m.style.width);
    assert(
      w.every(x => x === `${TL.MIN}px`),
      `merged: ${w[0]}`,
    );
    assert(!$('.tl-legend'), 'no legend');
    ui.tlPx = TL.ZOOM.month;
    return weeks.length + ' weeks';
  });
  await step(
    'timeline: no arrows, rounded tree lines, flat bars, titles kept in view; menus, dialogs and fields are clear glass',
    () => {
      loadSample();
      setView('timeline');
      const css = el => getComputedStyle(el);
      assert(!$('.tl-deps, .tl-dep, [data-tl-deps]'), 'no dependency arrows or their button');
      // Tree lines in the labels: the map's colours and widths, rounded corners.
      const elbow = $('.tl-elbow');
      assert(
        elbow.style.getPropertyValue('--rel').includes('color-mix') &&
          css(elbow).borderBottomLeftRadius === '8px' &&
          parseFloat(css(elbow).borderLeftWidth) <= 1.6,
        `thin muted elbows with rounded corners: ${css(elbow).borderBottomLeftRadius}`,
      );
      // Bars are flat, goals too: a thin edge, no slab.
      const goalBar = $('.tl-bar.goal');
      assert(!/ 2px 2px 0px/.test(css(goalBar).boxShadow), `flat goal bar: ${css(goalBar).boxShadow}`);
      // The left column holds only fold arrows, lines and dots; every title is in its row.
      assert(!$('.tl-label .tl-title, .tl-dates'), 'no titles or dates in the left column');
      assert(
        [...$$('.tl-row[data-tl-node]')].every(r => r.querySelector('.tl-track .tl-bar-label .tl-title')),
        'each row has its title in the chart',
      );
      assert($('.tl-corner').offsetWidth < 150, 'a narrow left column: ' + $('.tl-corner').offsetWidth);
      // A bar that starts left of the view keeps its title just right of the labels.
      // No scrollbars of its own: the main pane scrolls; toolbar, labels and the date scale stay in view.
      const main = $('.main'),
        wide = [...$$('.tl-bar')].sort((p, q) => q.offsetWidth - p.offsetWidth)[0],
        label = wide.closest('.tl-row').querySelector('.tl-bar-label');
      assert(css($('.tl-scroll')).overflowX === 'visible' && css(main).overflowX === 'auto', 'main scrolls');
      main.scrollLeft = wide.offsetLeft + wide.offsetWidth / 2;
      const pane = main.getBoundingClientRect(),
        labelsEdge = $('.tl-corner').getBoundingClientRect().right;
      assert(main.scrollLeft > 0, 'scrolled sideways');
      assert(
        Math.abs($('.toolbar').getBoundingClientRect().left - pane.left) < 2,
        `toolbar stays at the left: ${$('.toolbar').getBoundingClientRect().left} vs ${pane.left}`,
      );
      assert(
        css(label).position === 'sticky' && Math.abs(label.getBoundingClientRect().left - labelsEdge) < 10,
        `title in view: ${label.getBoundingClientRect().left} vs ${labelsEdge}`,
      );
      // Bars wholly off screen keep their title at that side: left of the view at the left, right of it at the right.
      const bars = [...$$('.tl-row[data-tl-node] .tl-bar')].sort((p, q) => p.offsetLeft - q.offsetLeft),
        first = bars[0],
        last = bars.at(-1),
        lblOf = b => b.closest('.tl-row').querySelector('.tl-bar-label').getBoundingClientRect();
      main.scrollLeft = first.offsetLeft + first.offsetWidth + 400;
      assert(first.getBoundingClientRect().right < labelsEdge, 'the first bar is off to the left');
      assert(
        Math.abs(lblOf(first).left - labelsEdge) < 10,
        `left title at the left edge: ${lblOf(first).left} vs ${labelsEdge}`,
      );
      main.scrollLeft = 0;
      const right = main.getBoundingClientRect().right;
      assert(last.getBoundingClientRect().left > right, 'the last bar is off to the right');
      assert(
        lblOf(last).right <= right + 1 && right - lblOf(last).right < 24,
        `right title at the right edge: ${lblOf(last).right} vs ${right}`,
      );
      main.scrollLeft = wide.offsetLeft + wide.offsetWidth / 2;
      main.scrollTop = main.scrollHeight;
      const head = $('.tl-head').getBoundingClientRect().top,
        barBottom = $('.topbar').getBoundingClientRect().bottom;
      assert(main.scrollTop > 0 && Math.abs(head - Math.max(pane.top, barBottom)) < 2, `date scale on top: ${head}`);
      main.scrollLeft = main.scrollTop = 0;
      // Menus, dialogs, the calendar and fields: what is behind shows faintly through.
      const alpha = el => +(css(el).backgroundColor.match(/[\d.]+/g)[3] ?? 1);
      openCtxMenu(db.goals[0].id, 10, 10);
      assert(
        alpha(ctxMenu) > 0.8 && alpha(ctxMenu) < 0.95 && css(ctxMenu).backgroundImage.includes('radial-gradient'),
        `menu see-through: ${alpha(ctxMenu)}`,
      );
      closeCtxMenu();
      setView('goals');
      $('#view .card').click();
      const dlg = $('dialog.modal[open]'),
        field = dlg.querySelector('input[type=text]');
      assert(
        alpha(dlg) > 0.8 && alpha(dlg) < 0.95 && alpha(field) < alpha(dlg),
        `dialog ${alpha(dlg)}, field ${alpha(field)}`,
      );
      // One scrollbar: the body scrolls, the dialog never does; thin, on a clear track.
      const body = dlg.querySelector('.modal-body');
      assert(
        css(dlg).overflowY === 'hidden' &&
          dlg.scrollHeight <= dlg.clientHeight + 1 &&
          css(body).overflowY === 'auto' &&
          css(body).scrollbarWidth === 'thin' &&
          ['transparent', 'rgba(0, 0, 0, 0)'].some(c => css(body).scrollbarColor.endsWith(c)),
        `one thin scrollbar: ${dlg.scrollHeight}/${dlg.clientHeight} ${css(body).scrollbarColor}`,
      );
      dlg.close();
      // A select's open list is solid, not the see-through colour of its field.
      setView('map');
      const opt = $('#view select option'),
        surface = css(document.body).getPropertyValue('--surface').trim();
      const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
      assert(
        opt && css(opt).backgroundColor === rgb(surface) && alpha($('#view select')) < 1,
        `option list ${css(opt).backgroundColor}`,
      );
      setView('dashboard');
    },
  );

  await step('timeline: starts 160 px before the earliest date at every zoom, not on the 1st of a month', () => {
    fresh('Timeline start');
    mk('goal', { title: 'Early', startDate: d(-40), deadline: d(10) });
    save();
    setView('timeline');
    const seen = [TL.ZOOM.week, TL.ZOOM.month, TL.ZOOM.quarter, TL.MIN].map(px => {
      ui.tlPx = px;
      render();
      const days = dayNum(d(-40)) - Number($('.tl-scroll').dataset.from);
      eq(days, Math.ceil(160 / px), `days before the first bar at ${px} px a day`);
      return days;
    });
    setView('dashboard');
    return seen.join(' ');
  });
});
