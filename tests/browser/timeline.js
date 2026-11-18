/** Page tests: timeline. */
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
    ui.tlDeps = true;
    setView('timeline');
    return { g, a, b, c };
  };
  const bar = id => $(`[data-tl-node="${id}"]`);
  const dep = id => $(`.tl-deps [data-rel-edit="${id}"]`);
  await step('timeline: double-click or Enter on the selected bar edits it; Esc deselects', () => {
    const { g, a } = tlFixture();
    clickEl(bar(a.id), 1);
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
  await step('timeline: Delete on a bar asks first; dependency arrows select, open and delete like map lines', () => {
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
      press('Delete', document.body);
      assert(question === t('confirm.delete', { name: 'Paint' }) && findEntity(c.id), 'asks; cancel keeps it');
      window.confirm = () => true;
      press('Backspace', document.body);
      assert(
        !findEntity(c.id) && !db.relations.some(r => r.from === c.id || r.to === c.id),
        'confirm deletes it and its links',
      );
      eq($('#toast').textContent, t('toast.deleted.activity'), 'says so');
      // Dependency arrows: clickable, with a wide hit area, and reachable with Tab.
      const r = db.relations.find(x => x.type === 'depends' && x.from === b.id);
      assert(dep(r.id), 'the arrow is a target');
      eq(getComputedStyle(dep(r.id).querySelector('.tl-dep-hit')).pointerEvents, 'stroke', 'its hit area takes clicks');
      eq(dep(r.id).getAttribute('tabindex'), '0', 'focusable');
      clickEl(dep(r.id));
      eq([ui.mapRel, ui.mapSelected], [r.id, null], 'a click selects it');
      assert(dep(r.id).classList.contains('sel'), 'drawn as selected');
      assert(
        !bar(a.id).classList.contains('dim') &&
          !bar(b.id).classList.contains('dim') &&
          bar(g.id).classList.contains('dim'),
        'its two bars lit, the rest dimmed',
      );
      assert(
        $('.map-rel-selection') && $('.map-rel-selection').textContent.includes('Build'),
        'the selection row names it',
      );
      clickEl(dep(r.id), 2);
      assert(modal.open && formCtx.kind === 'relation' && formCtx.id === r.id, 'a second click opens it');
      modal.close();
      press('Escape', document.body);
      eq(ui.mapRel, null, 'Esc deselects it');
      clickEl(dep(r.id));
      press('Delete', document.body);
      assert(
        !db.relations.some(x => x.id === r.id) && findEntity(a.id) && findEntity(b.id),
        'Delete removes the dependency, not the bars',
      );
      eq($('#toast').textContent, t('toast.relRemoved'), 'says so');
      eq(
        readPlan(plans.current).relations.some(x => x.id === r.id),
        false,
        'saved',
      );
      // With dependencies hidden there is nothing to select or delete there.
      rel(b, a, 'depends');
      save();
      const r2 = db.relations.find(x => x.type === 'depends');
      ui.mapRel = r2.id;
      ui.tlDeps = false;
      render();
      press('Delete', document.body);
      assert(
        db.relations.some(x => x.id === r2.id),
        'a hidden arrow is not deleted',
      );
      ui.tlDeps = true;
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
    // Narrow days merge into a band; the legend names the colours.
    ui.tlPx = TL.MIN;
    render();
    const w = marks(a.id).map(m => m.style.width);
    assert(
      w.every(x => x === `${TL.MIN}px`),
      `merged: ${w[0]}`,
    );
    eq(
      [...$$('.tl-legend .swatch.tl-day')].map(s => s.classList[2]),
      ['done', 'missed', 'due'],
      'legend',
    );
    a.repeat = { times: 3, per: 'week' };
    open.repeat = { times: 1, per: 'week' };
    save();
    render();
    assert(!$('.tl-legend .tl-day'), 'no legend without routines on set days');
    ui.tlPx = TL.ZOOM.month;
    return weeks.length + ' weeks';
  });
  await step(
    'timeline lines are drawn like on the map, with square corners; menus, dialogs and fields are clear glass',
    () => {
      loadSample();
      ui.tlDeps = true;
      setView('timeline');
      const css = el => getComputedStyle(el),
        dep = REL_TYPES.depends;
      const lines = [...document.querySelectorAll('.tl-deps .tl-dep')];
      assert(lines.length > 3, `${lines.length} dependency arrows`);
      // The map's muted colour, width and finer dash; only straight runs, each ending with a straight stretch into the head.
      assert(
        lines.every(
          l =>
            l.style.stroke === mapLineColour(dep.color) &&
            parseFloat(l.style.strokeWidth) === (dep.width || 1.1) &&
            l.getAttribute('stroke-dasharray') === '4 3',
        ),
        'map line style',
      );
      const runs = lines.map(l => l.getAttribute('d'));
      assert(
        runs.every(d => /^M[\d.-]+,[\d.-]+( (h|H|V)[\d.-]+)+$/.test(d)),
        'only horizontal and vertical runs',
      );
      const tail = d => {
        const v = d.match(/V([\d.-]+) H([\d.-]+)$/),
          h = d.match(/H([\d.-]+) V[\d.-]+ H[\d.-]+$/);
        return +v[2] - +h[1];
      };
      assert(
        runs.every(d => Math.abs(tail(d) - (MAP.LEAD - MAP.TIP)) < 0.01),
        `each ends with a straight stretch: ${runs.map(tail)}`,
      );
      // The map's arrowhead, one size whatever the line width, its tip TIP beyond the line's end.
      const head = $('#tl-arrow'),
        mapHead = 'M1,1.5 L10,5 L1,8.5 L3,5 z';
      assert(
        head.getAttribute('markerUnits') === 'userSpaceOnUse' &&
          +head.getAttribute('refX') === 10 - MAP.TIP &&
          head.querySelector('path').getAttribute('d') === mapHead,
        'map arrowhead',
      );
      // Tree lines in the labels: the map's colours and widths, square corners.
      const elbow = $('.tl-elbow');
      assert(
        elbow.style.getPropertyValue('--rel').includes('color-mix') &&
          css(elbow).borderBottomLeftRadius === '0px' &&
          parseFloat(css(elbow).borderLeftWidth) <= 1.6,
        'thin muted elbows with square corners',
      );
      assert(
        [...document.querySelectorAll('.tl-legend .line-key')].every(k =>
          k.style.getPropertyValue('--rel').includes('color-mix'),
        ),
        'line keys in the map colours',
      );
      // A selected arrow glows, like a selected map line.
      ui.mapRel = null;
      const g = $('.tl-deps [data-rel-edit]');
      g.classList.add('sel');
      assert(
        css(g.querySelector('.tl-dep')).filter.includes('line-glow') && $('.tl-deps #line-glow'),
        'a selected arrow glows',
      );
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
});
