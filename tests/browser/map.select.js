/** Page tests: map lines around rows; selecting, opening and deleting lines and items; right-click to add. */
suite(async () => {
  const mapFixture = () => {
    fresh('Map keys');
    const g = mk('goal', { title: 'Run a marathon' });
    const a = mk('activity', { title: 'Train' });
    const b = mk('activity', { title: 'Buy shoes' });
    const s = mk('state', { title: 'Distance' });
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    rel(s, g, 'measures');
    save();
    setView('map');
    return { g, a, b, s };
  };
  const edge = id => $(`[data-rel-edit="${id}"]`);
  const nodeEl = id => $(`[data-map-node="${id}"]`);
  const relOf = (from, to) => db.relations.find(r => r.from === from.id && r.to === to.id);
  await step('map: lines go straight past rows with nothing in the way, and never through a box', () => {
    loadSample();
    setView('map');
    const boxes = [...document.querySelectorAll('[data-map-node]')].map(g => ({
      id: g.dataset.mapNode,
      r: g.getBoundingClientRect(),
    }));
    let crossed = 0;
    for (const g of document.querySelectorAll('.edge-g')) {
      const r = db.relations.find(x => x.id === g.dataset.relEdit),
        path = g.querySelector('.edge');
      const m = path.getScreenCTM(),
        len = path.getTotalLength();
      for (let k = 1; k < 40; k++) {
        const p = new DOMPoint(...Object.values(path.getPointAtLength((len * k) / 40)).slice(0, 2)).matrixTransform(m);
        if (
          boxes.some(
            b =>
              b.id !== r.from &&
              b.id !== r.to &&
              p.x > b.r.left + 2 &&
              p.x < b.r.right - 2 &&
              p.y > b.r.top + 2 &&
              p.y < b.r.bottom - 2,
          )
        ) {
          crossed++;
          break;
        }
      }
    }
    eq(crossed, 0, 'no line crosses another box');
    // Lines never pass so close that they seem to touch, away from where they start and end. And laying
    // the sample out stays quick.
    const lines = [...document.querySelectorAll('.edge-g')]
      .map(g => {
        const path = g.querySelector('.edge'),
          len = path.getTotalLength();
        const pts = Array.from({ length: 121 }, (_, k) => {
          const p = path.getPointAtLength((len * k) / 120);
          return [p.x, p.y];
        }).sort((p, q) => p[1] - q[1]);
        return { r: db.relations.find(x => x.id === g.dataset.relEdit), pts };
      })
      .filter(l => l.pts.at(-1)[1] - l.pts[0][1] > MAP.NH);
    const xAt = (l, y) => {
      for (let i = 1; i < l.length; i++)
        if (y >= l[i - 1][1] && y <= l[i][1])
          return l[i - 1][0] + (l[i][0] - l[i - 1][0]) * ((y - l[i - 1][1]) / (l[i][1] - l[i - 1][1] || 1));
      return null;
    };
    const grazes = [];
    lines.forEach((c, i) =>
      lines.slice(i + 1).forEach(o => {
        const a = c.pts,
          b = o.pts,
          signs = new Set();
        let min = Infinity;
        for (let y = Math.max(a[0][1], b[0][1]) + 24; y <= Math.min(a.at(-1)[1], b.at(-1)[1]) - 24; y += 3) {
          const xa = xAt(a, y),
            xb = xAt(b, y);
          if (xa === null || xb === null) continue;
          if (Math.abs(xa - xb) > 1) signs.add(Math.sign(xa - xb));
          min = Math.min(min, Math.abs(xa - xb));
        }
        if (min < 6 && signs.size === 1) grazes.push(`${relText(c.r)} | ${relText(o.r)}`);
      }),
    );
    eq(grazes, [], 'no lines grazing each other');
    // (Its draw time is checked in perf.js: the clock stands still here.)
    deletePlan(plans.current);

    // A state measuring a goal crosses three rows of activities; nothing is in its way, so one curve.
    fresh('Straight lines');
    const g = mk('goal', { title: 'G' }),
      s = mk('state', { title: 'S' });
    const a = mk('activity', { title: 'A' }),
      b = mk('activity', { title: 'B' }),
      c = mk('activity', { title: 'C' });
    rel(a, g, 'contributes');
    rel(b, a, 'subactivity');
    rel(c, b, 'subactivity');
    rel(s, g, 'measures');
    save();
    setView('map');
    const d = $(`[data-rel-edit="${db.relations.find(x => x.from === s.id).id}"] .edge`).getAttribute('d');
    const xs = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => +m[1]);
    assert(
      xs.every((x, i) => !i || (x - xs[i - 1]) * (xs.at(-1) - xs[0]) >= -0.5),
      'no zigzag, it bends one way only: ' + d,
    );
    assert((d.match(/C/g) || []).length <= 2, 'straight down its column, curving only at the ends: ' + d);
    deletePlan(plans.current);

    // Goals sit as low as they can, next to the activities; parents still above their sub-goals.
    fresh('Low goals');
    const top = mk('goal', { title: 'Parent' }),
      sub = mk('goal', { title: 'Sub' }),
      lone = mk('goal', { title: 'Lone' });
    const mid = mk('goal', { title: 'Mid' }),
      deep = mk('goal', { title: 'Deep' });
    rel(sub, top, 'subgoal');
    rel(mid, top, 'subgoal');
    rel(deep, mid, 'subgoal');
    save();
    setView('map');
    const y = it => Math.round($(`[data-map-node="${it.id}"]`).getBoundingClientRect().top);
    assert(y(top) < y(mid) && y(mid) < y(deep), 'a chain of sub-goals keeps its order');
    eq([y(lone), y(sub)], [y(deep), y(deep)], 'a goal with nothing below it sits in the lowest goal row');
    deletePlan(plans.current);
    return 'ok';
  });
  await step('map: right-clicking empty space opens the Add menu there; elsewhere the browser keeps its own', () => {
    const { g } = mapFixture();
    const rc = (el, x, y) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
      el.dispatchEvent(e);
      return e;
    };
    const ev = rc($('.map-wrap svg'), 300, 200);
    assert(ev.defaultPrevented && !ctxMenu.hidden, 'the menu opens instead of the browser menu');
    eq(
      [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx),
      ['new:vision', 'new:goal', 'new:activity', 'new:state'],
      'what the Add button offers',
    );
    ctxMenu.style.animation = 'none';
    const m = ctxMenu.getBoundingClientRect();
    assert(Math.abs(m.left - 300) < 1 && Math.abs(m.top - 200) < 1, `at the pointer: ${m.left},${m.top}`);
    ctxMenu.querySelector('[data-ctx="new:vision"]').click();
    assert(ctxMenu.hidden && modal.open && formCtx.kind === 'vision' && !formCtx.id, 'picking one opens its new form');
    modal.close();
    // Near the bottom right corner it stays on screen.
    rc($('.map-wrap svg'), innerWidth - 2, innerHeight - 2);
    const c = ctxMenu.getBoundingClientRect();
    assert(c.right <= innerWidth - 7 && c.bottom <= innerHeight - 7, 'kept on screen');
    closeCtxMenu();
    // A box still gets its own menu.
    rc(nodeEl(g.id), 100, 100);
    assert(!ctxMenu.hidden && !ctxMenu.dataset.add && ctxMenu.dataset.id === g.id, 'a box: its item menu');
    closeCtxMenu();
    // Outside the map's drawing, and in other views, nothing changes.
    assert(!rc($('#view'), 10, 10).defaultPrevented && ctxMenu.hidden, 'not on the controls around the map');
    setView('goals');
    assert(!rc($('#view'), 10, 10).defaultPrevented && ctxMenu.hidden, 'not in other views');
    setView('map');
  });
  await step('map: clicking a line selects it; clicking it again or double-clicking opens it', () => {
    const { g, a, b, s } = mapFixture();
    const r = relOf(a, g);
    clickEl(edge(r.id));
    assert(!modal.open, 'a click does not open the form');
    eq([ui.mapRel, ui.mapSelected], [r.id, null], 'the line is selected');
    assert(
      edge(r.id).classList.contains('sel') &&
        getComputedStyle(edge(r.id).querySelector('.edge')).filter.includes('line-glow') &&
        $('#line-glow') &&
        [...document.querySelectorAll('.map-wrap .edge-g:not(.sel) .edge')].every(
          e => getComputedStyle(e).filter === 'none',
        ),
      'drawn as selected, glowing, under the boxes',
    );
    assert(
      [...document.querySelectorAll('[data-rel-edit]')]
        .filter(e => e.dataset.relEdit !== r.id)
        .every(e => e.classList.contains('dim')),
      'other lines dimmed',
    );
    assert(
      !nodeEl(a.id).classList.contains('dim') && !nodeEl(g.id).classList.contains('dim'),
      'its two items stay lit',
    );
    assert(nodeEl(b.id).classList.contains('dim') && nodeEl(s.id).classList.contains('dim'), 'the rest dims');
    const row = $('.map-rel-selection');
    assert(
      row && row.textContent.includes('Train') && row.textContent.includes('Run a marathon'),
      'a row names the relationship',
    );
    assert(
      row.querySelector('[data-rel-open]') &&
        row.querySelector('[data-rel-remove]') &&
        row.querySelector('[data-map-clear]'),
      'with Edit, Remove and Clear (for touch screens)',
    );
    // Selecting an item clears the line, and the other way round.
    clickEl(nodeEl(s.id));
    eq([ui.mapRel, ui.mapSelected], [null, s.id], 'an item click selects the item instead');
    clickEl(edge(r.id));
    eq([ui.mapRel, ui.mapSelected], [r.id, null], 'a line click selects the line instead');
    // A second click on the selected line opens it, so a double-click does too.
    clickEl(edge(r.id), 2);
    assert(modal.open && formCtx.kind === 'relation' && formCtx.id === r.id, 'second click opens the relationship');
    modal.close();
    clickEl(edge(relOf(b, g).id));
    clickEl(edge(relOf(b, g).id));
    assert(modal.open && formCtx.id === relOf(b, g).id, 'clicking a selected line opens it');
    modal.close();
    // Enter or Space on a focused line opens it as before.
    edge(r.id).focus();
    press('Enter', edge(r.id));
    assert(modal.open && formCtx.id === r.id, 'Enter opens');
    modal.close();
    edge(r.id).focus();
    press(' ', edge(r.id));
    assert(modal.open && formCtx.id === r.id, 'Space opens');
    modal.close();
    // The row's buttons.
    clickEl(edge(r.id));
    $('.map-rel-selection [data-rel-open]').click();
    assert(modal.open && formCtx.id === r.id, 'Edit opens it');
    modal.close();
    eq($('.map-rel-selection [data-map-clear]').textContent, 'Deselect', 'the button says Deselect');
    $('.map-rel-selection [data-map-clear]').click();
    eq(ui.mapRel, null, 'Deselect deselects it');
    ui.mapSelected = a.id;
    render();
    eq($('[data-map-clear]').textContent, 'Deselect', 'an item’s row says Deselect too');
    changeLanguage('sl');
    eq($('[data-map-clear]').textContent, 'Prekliči izbiro', 'in Slovenian');
    changeLanguage('en');
    $('[data-map-clear]').click();
    eq(ui.mapSelected, null, 'and deselects the item');
    clickEl(edge(r.id));
    press('Escape', document.body);
    eq(ui.mapRel, null, 'Escape clears it');
    clickEl(nodeEl(a.id));
    eq(ui.mapSelected, a.id, 'item selected');
    press('Escape', nodeEl(a.id));
    eq(ui.mapSelected, null, 'Escape deselects an item too');
    assert(
      !nodeEl(g.id).classList.contains('dim') && !nodeEl(s.id).classList.contains('dim'),
      'nothing dimmed after Escape',
    );
    clickEl(nodeEl(a.id));
    openForm('goal', g.id);
    press('Escape', document.body);
    eq(ui.mapSelected, a.id, 'Escape in an open form leaves the map selection alone');
    modal.close();
    press('Escape', document.body);
    clickEl(edge(r.id));
    clickEl($('.map-wrap svg') || $('.map-wrap'));
    eq(ui.mapRel, null, 'clicking empty space clears it');
    return 'ok';
  });
  await step('map: selecting an item lights up its whole chain, not only its neighbours', () => {
    fresh('Map chain');
    const v = mk('goal', { title: 'Be fit' });
    const g = mk('goal', { title: 'Run a marathon' });
    const a = mk('activity', { title: 'Train' });
    const b = mk('activity', { title: 'Warm up' });
    const x = mk('activity', { title: 'Stretch' });
    const o = mk('activity', { title: 'Unrelated' });
    rel(g, v, 'subgoal');
    rel(a, g, 'contributes');
    rel(b, a, 'subactivity');
    rel(x, g, 'contributes');
    save();
    setView('map');
    clickEl(nodeEl(a.id));
    const dim = it => nodeEl(it.id).classList.contains('dim');
    eq([v, g, a, b].map(dim), [false, false, false, false], 'what leads to it and what it leads to, step by step');
    eq([x, o].map(dim), [true, true], 'a side branch and an unrelated item fade');
    eq(edge(relOf(g, v).id).classList.contains('dim'), false, 'a line further along the chain stays lit');
    eq(edge(relOf(x, g).id).classList.contains('dim'), true, 'a side line fades');
    return 'ok';
  });
  await step('map: the selection bar shows the item description, when it has one', () => {
    const { g, a, b } = mapFixture();
    g.specific = 'Finish under <4h>';
    a.description = 'Three runs a week';
    save();
    clickEl(nodeEl(g.id));
    eq($('.map-bars .sel-desc')?.textContent, 'Finish under <4h>', "a goal's Specific text, as plain text");
    clickEl(nodeEl(a.id));
    eq($('.map-bars .sel-desc')?.textContent, 'Three runs a week', "an activity's description");
    clickEl(nodeEl(b.id));
    assert(!$('.map-bars .sel-desc'), 'none without a description');
    deletePlan(plans.current);
  });
  await step('map: Delete or Backspace removes the selected line at once', () => {
    const { g, a, b, s } = mapFixture();
    const n0 = db.relations.length,
      r = relOf(a, g),
      keep = clone(db.relations.filter(x => x.id !== r.id));
    clickEl(edge(r.id));
    let asked = 0;
    const realConfirm = window.confirm;
    window.confirm = () => {
      asked++;
      return true;
    };
    try {
      assert(press('Delete', document.body), 'Delete is handled');
      eq(asked, 0, 'no question for a line');
      eq(db.relations.length, n0 - 1, 'one relationship fewer');
      assert(!relOf(a, g), 'the selected one is gone');
      eq(db.relations, keep, 'the others untouched');
      assert(findEntity(a.id) && findEntity(g.id), 'its items stay');
      eq(readPlan(plans.current).relations.length, n0 - 1, 'saved');
      eq($('#toast').firstChild.textContent, t('toast.relRemoved'), 'says so');
      eq(ui.mapRel, null, 'selection cleared');
      assert(!edge(r.id), 'no longer drawn');
      // Backspace (the delete key on a Mac) works the same; so does a focused, unselected line.
      clickEl(edge(relOf(b, g).id));
      press('Backspace', document.body);
      assert(!relOf(b, g), 'Backspace removes it');
      const last = relOf(s, g);
      edge(last.id).focus();
      press('Delete', edge(last.id));
      assert(!relOf(s, g), 'Delete on a focused line removes it');
      eq(db.relations.length, 0, 'all gone');
    } finally {
      window.confirm = realConfirm;
    }
    return `${n0} → 0`;
  });
  await step('map: Delete on a selected item deletes it with its links at once; Undo puts it back', () => {
    const { g, a, b, s } = mapFixture();
    const realConfirm = window.confirm;
    let question = '';
    try {
      clickEl(nodeEl(a.id));
      eq(ui.mapSelected, a.id, 'item selected');
      window.confirm = q => {
        question = q;
        return false;
      };
      assert(press('Delete', document.body), 'Delete is handled');
      eq(question, '', 'no question');
      assert(!findEntity(a.id) && !relOf(a, g), 'deleted with its links');
      assert(getTrash().items[0]?.title === 'Train', 'kept in Recently deleted');
      $('#toast .toast-action').click();
      assert(findEntity(a.id) && relOf(a, g), 'Undo puts it back with its links');
      assert(!getTrash().items.some(e => e.title === 'Train'), 'and takes it out of Recently deleted');
      eq($('#toast').textContent, t('toast.undone'), 'says so');
      nodeEl(a.id).focus();
      press('Backspace', nodeEl(a.id));
      assert(!findEntity(a.id) && !relOf(a, g), 'confirm deletes it and its links');
      assert(findEntity(g.id) && relOf(b, g), 'everything else stays');
      eq(
        readPlan(plans.current).activities.map(x => x.id),
        [b.id],
        'saved',
      );
      eq($('#toast').firstChild.textContent, t('toast.deleted.activity'), 'says so');
      eq($('#toast .toast-action').textContent, t('undo'), 'with Undo');
      eq(ui.mapSelected, null, 'selection cleared');
      // A focused item works without clicking it first; each kind gets its own message.
      question = '';
      nodeEl(s.id).focus();
      press('Delete', nodeEl(s.id));
      assert(!findEntity(s.id), 'focused state deleted');
      eq($('#toast').firstChild.textContent, t('toast.deleted.state'), 'state message');
      clickEl(nodeEl(g.id));
      press('Delete', document.body);
      // Its activity B hangs off it: Delete asks first, as the form does.
      assert($('#deleteDlg').open && findEntity(g.id), 'a goal with an activity asks first');
      $('#deleteOk').click();
      assert(!findEntity(g.id) && !findEntity(b.id), 'goal deleted, with its activity');
      eq($('#toast').firstChild.textContent, tp('toast.deletedWith.goal', 1), 'goal message');
    } finally {
      window.confirm = realConfirm;
    }
    return question;
  });
  await step('map: Delete does nothing without a selection, while typing, with a dialog open or elsewhere', () => {
    const { g, a } = mapFixture();
    const realConfirm = window.confirm;
    let asked = 0;
    window.confirm = () => {
      asked++;
      return true;
    };
    const count = () => db.goals.length + db.activities.length + db.states.length + db.relations.length;
    const n0 = count();
    try {
      press('Delete', document.body);
      eq([count(), asked], [n0, 0], 'nothing selected: nothing happens');
      // Typing in a field: the key edits the text.
      clickEl(nodeEl(a.id));
      const search = document.createElement('input');
      search.type = 'search';
      viewEl.append(search);
      {
        search.focus();
        assert(!press('Delete', search) && !press('Backspace', search), 'keys left to the field');
        eq([count(), asked], [n0, 0], 'nothing deleted while typing');
        search.remove();
      }
      // A dialog or menu open.
      openForm('goal', g.id);
      press('Delete', modal);
      eq([count(), asked, modal.open], [n0, 0, true], 'nothing deleted with the form open');
      modal.close();
      clickEl(nodeEl(a.id));
      settings.showModal();
      press('Delete', document.body);
      eq([count(), asked], [n0, 0], 'nothing deleted with settings open');
      settings.close();
      openCtxMenu(a.id, 10, 10);
      press('Delete', document.body);
      eq([count(), asked], [n0, 0], 'nothing deleted with the menu open');
      closeCtxMenu();
      // Other views ignore it, even with a map selection kept.
      ui.mapSelected = a.id;
      setView('activities');
      press('Delete', document.body);
      eq([count(), asked], [n0, 0], 'other views ignore it');
      setView('map');
    } finally {
      window.confirm = realConfirm;
    }
    return 'ok';
  });
  await step('map: double-clicking an item opens its edit form; keyboard presses never count as a double-click', () => {
    const { g, a, s } = mapFixture();
    clickEl(nodeEl(a.id), 1);
    clickEl(nodeEl(a.id), 2);
    assert(modal.open && formCtx.kind === 'activity' && formCtx.id === a.id, 'double-click opens the activity');
    eq(ui.mapSelected, a.id, 'and leaves it selected');
    modal.close();
    for (const [x, kind] of [
      [g, 'goal'],
      [s, 'state'],
    ]) {
      clickEl(nodeEl(x.id), 1);
      clickEl(nodeEl(x.id), 2);
      assert(modal.open && formCtx.kind === kind && formCtx.id === x.id, `double-click opens the ${kind}`);
      modal.close();
    }
    // Two clicks on different items, or slow clicks, just select.
    ui.mapSelected = null;
    render();
    clickEl(nodeEl(a.id));
    clickEl(nodeEl(g.id));
    assert(!modal.open && ui.mapSelected === g.id, 'two items: just selects the second');
    ui.mapSelected = null;
    render();
    const realNow = performance.now.bind(performance);
    let shift = 0;
    performance.now = () => realNow() + shift;
    try {
      clickEl(nodeEl(a.id));
      shift = 2000;
      clickEl(nodeEl(a.id));
      assert(!modal.open && ui.mapSelected === null, 'a slow second click deselects as before');
    } finally {
      performance.now = realNow;
    }
    // Enter or Space on an item selects it; on the selected item they open it. Neither counts toward a double-click.
    for (const [first, second] of [
      ['Enter', 'Enter'],
      [' ', ' '],
      ['Enter', ' '],
    ]) {
      ui.mapSelected = null;
      render();
      nodeEl(a.id).focus();
      press(first, nodeEl(a.id));
      assert(!modal.open && ui.mapSelected === a.id, `“${first}” selects`);
      nodeEl(a.id).focus();
      press(second, nodeEl(a.id));
      assert(modal.open && formCtx.id === a.id && ui.mapSelected === a.id, `then “${second}” opens it`);
      modal.close();
    }
    // With an item selected by a click and the focus elsewhere in the map, Enter or Space opens it too.
    for (const key of ['Enter', ' ']) {
      ui.mapSelected = g.id;
      ui.mapRel = null;
      render();
      document.activeElement?.blur();
      assert(press(key, document.body), `“${key}” handled`);
      assert(modal.open && formCtx.kind === 'goal' && formCtx.id === g.id, `“${key}” opens the selected item`);
      modal.close();
    }
    // The same for a selected line.
    const line = db.relations[0];
    clickEl(edge(line.id));
    document.activeElement?.blur();
    press('Enter', document.body);
    assert(modal.open && formCtx.kind === 'relation' && formCtx.id === line.id, 'Enter opens the selected line');
    modal.close();
    // Nothing selected, typing, or another view: Enter and Space are left alone.
    ui.mapSelected = null;
    ui.mapRel = null;
    render();
    assert(!press('Enter', document.body) && !modal.open, 'nothing selected: Enter does nothing');
    ui.mapSelected = a.id;
    render();
    const field = document.createElement('input');
    viewEl.append(field);
    field.focus();
    assert(!press(' ', field) && !modal.open, 'Space in a text field types a space');
    field.remove();
    setView('activities');
    assert(!press('Enter', document.body) && !modal.open, 'other views ignore it');
    setView('map');
    // While linking by tapping, a double tap does not open anything.
    ui.mapLinkFrom = a.id;
    render();
    clickEl(nodeEl(s.id), 1);
    assert(
      !(modal.open && formCtx.kind === 'state'),
      'a tap while linking finishes the link instead of opening the item',
    );
    if (modal.open) modal.close();
    ui.mapLinkFrom = null;
    render();
    deletePlan(plans.current);
    return 'ok';
  });
  await step('map: help and labels mention the new keys, in both languages', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      const words = { en: [/Delete/, /double-click/i, /Enter/], sl: [/Delete/, /dvojnim klik/i, /Enter/] }[code];
      for (const key of ['help.view.map']) words.forEach(w => assert(w.test(t(key)), `${code} ${key} mentions ${w}`));
      assert(t('map.relLabel', { rel: 'x' }).includes('x'), `${code} line label`);
    }
    changeLanguage('en');
    return t('map.relLabel', { rel: 'A contributes to B' });
  });
});
