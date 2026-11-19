/** Page tests: dragging to link, zoom limits, long-press taps, two-finger pinches, no tap highlight. */
suite(async () => {
  await step('map: drag from one box to another to link them; touch picks by tapping', async () => {
    fresh('Linking');
    const g = mk('goal', { title: 'Big goal' }),
      g2 = mk('goal', { title: 'Other goal' });
    const a = mk('activity', { title: 'Do it' }),
      s = mk('state', { title: 'Now' });
    rel(s, g, 'measures');
    save();
    setView('map');
    const node = id => $(`[data-map-node="${id}"]`);
    const mid = id => {
      const r = node(id).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const ev = (type, el, p) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'mouse',
          button: 0,
          clientX: p.x,
          clientY: p.y,
        }),
      );
    const drag = (fromId, end, hover) => {
      const p0 = mid(fromId);
      ev('pointerdown', node(fromId), p0);
      ev('pointermove', document, { x: p0.x + 20, y: p0.y + 20 });
      if (hover) ev('pointermove', document, hover);
      ev('pointerup', document, end);
    };
    node(a.id).scrollIntoView({ block: 'center' });
    // Drag activity → goal: the form offers only what fits (contributes).
    const p0 = mid(a.id),
      pg = mid(g.id);
    ev('pointerdown', node(a.id), p0);
    ev('pointermove', document, { x: p0.x + 30, y: p0.y - 30 });
    assert(
      $('.link-line') && node(a.id).classList.contains('link-source') && $('.map-wrap').classList.contains('linking'),
      'line drawn while dragging',
    );
    assert(!$('.map-wrap').classList.contains('panning'), 'dragging a box does not pan');
    ev('pointermove', document, pg);
    assert(node(g.id).classList.contains('link-target'), 'target box marked');
    ev('pointerup', document, pg);
    assert(!$('.link-line') && !$('.link-source, .link-target'), 'line removed');
    await tick();
    assert(
      modal.open && $('#f-from').value === a.id && $('#f-to').value === g.id,
      'relationship form opened for the two items',
    );
    eq(
      [...$('#f-type').options].map(o => o.value),
      ['contributes'],
      'only fitting types',
    );
    submitForm();
    assert(
      relsFrom(a.id, 'contributes').some(r => r.to === g.id),
      'link saved',
    );

    // Goal dragged onto an activity: offered in the other direction, saved the right way round.
    const before = db.relations.length;
    drag(g2.id, mid(a.id));
    await tick();
    eq(
      [...$('#f-type').options].map(o => o.value),
      ['rev:contributes'],
      'offered the other way round',
    );
    $('#f-type').value = 'rev:contributes';
    submitForm();
    assert(
      db.relations.length === before + 1 && relsFrom(a.id, 'contributes').some(r => r.to === g2.id),
      'reverse type saved activity → goal',
    );

    // Released outside a box, on itself, or on the background: nothing happens.
    const n = db.relations.length;
    const wrap = $('.map-wrap').getBoundingClientRect();
    drag(a.id, { x: wrap.left + 3, y: wrap.top + 3 });
    await tick();
    drag(a.id, mid(a.id));
    await tick();
    assert(!modal.open && db.relations.length === n && !$('.link-line'), 'dropped outside: no link');
    // A click on a box without dragging still highlights it.
    ev('pointerdown', node(s.id), mid(s.id));
    ev('pointerup', document, mid(s.id));
    await tick();
    node(s.id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(ui.mapSelected === s.id && !modal.open, 'plain click highlights');
    ui.mapSelected = null;
    render();
    // Escape drops a link in progress.
    const ps = mid(s.id);
    ev('pointerdown', node(s.id), ps);
    ev('pointermove', document, { x: ps.x + 40, y: ps.y });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!$('.link-line'), 'Escape removes the line');
    ev('pointerup', document, mid(g.id));
    await tick();
    assert(!modal.open, 'released after Escape: no form');
    // Nothing fits (state → goal "measures" exists): a message instead of the form.
    render();
    drag(s.id, mid(g.id));
    await tick();
    assert(!modal.open && $('#toast').textContent.includes('can’t be linked'), 'no possible link: message');

    // Touch: "Link to…" from the long-press menu, then tap the other box.
    openCtxMenu(g2.id, 10, 10);
    ctxMenu.querySelector('[data-ctx="link"]').click();
    assert(
      ui.mapLinkFrom === g2.id && $('.link-bar') && node(g2.id).classList.contains('link-source'),
      'pick mode with a banner',
    );
    node(g.id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(
      !ui.mapLinkFrom && modal.open && $('#f-from').value === g2.id && $('#f-to').value === g.id,
      'tap on the other box opens the form',
    );
    eq(
      [...$('#f-type').options].map(o => o.value),
      ['subgoal', 'depends', 'rev:subgoal', 'rev:depends'],
      'goal ↔ goal types',
    );
    modal.close();
    startMapLink(g2.id);
    $('.map-legend').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(!ui.mapLinkFrom && !$('.link-bar') && !modal.open, 'tapping elsewhere cancels');
    startMapLink(g2.id);
    $('[data-map-link-cancel]').click();
    assert(!ui.mapLinkFrom && !modal.open, 'Cancel button');
    startMapLink(g2.id);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!ui.mapLinkFrom, 'Escape cancels');
    // The timeline's "Link to…" still opens the form.
    setView('timeline');
    runCtxAction('link', a.id);
    assert(modal.open && $('#f-from').value === a.id && !ui.mapLinkFrom, 'timeline opens the form');
    modal.close();
  });
  await step('zoom: limits, ctrl+wheel and timeline presets', async () => {
    fresh('Zoom');
    const g = mk('goal', { deadline: d(60), startDate: d(-10) }),
      a = mk('activity', { startDate: d(1), dueDate: d(20) });
    rel(a, g, 'contributes');
    save();
    setView('map');
    const wrap = $('.map-wrap'),
      r = wrap.getBoundingClientRect();
    zoomMap(100, r.left + 10, r.top + 10);
    const max = ui.mapScale;
    zoomMap(0.001, r.left + 10, r.top + 10);
    const min = ui.mapScale;
    assert(
      max === MAP.MAX_SCALE && min === MAP.MIN_SCALE && prefs.get('mapScale') === MAP.MIN_SCALE,
      'map scale clamped and saved',
    );
    assert($('.zoom-pct').textContent === `${Math.round(MAP.MIN_SCALE * 100)} %`, 'zoom label');
    zoomMap(1, r.left, r.top);
    $('.map-wrap').dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -100,
        clientX: r.left + 50,
        clientY: r.top + 50,
      }),
    );
    $('.map-wrap').dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -100,
        clientX: r.left + 50,
        clientY: r.top + 50,
      }),
    );
    await tick();
    await tick();
    const wheel = ui.mapScale;
    assert(Math.abs(wheel - Math.exp(0.5)) < 1e-9, 'two wheel steps coalesced into one zoom: ' + wheel);
    $('.map-wrap').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    await tick();
    await tick();
    assert(ui.mapScale === wheel, 'wheel without ctrl does not zoom');
    zoomMap(1, r.left, r.top);

    setView('timeline');
    const tx = $('.tl-scroll').getBoundingClientRect().right - 20;
    ui.tlPx = 8;
    zoomTimeline(1000, tx);
    const tmax = ui.tlPx;
    zoomTimeline(1e-6, tx);
    const tmin = ui.tlPx;
    assert(tmax === TL.MAX && tmin === TL.MIN, 'timeline zoom clamped');
    $('[data-tl-zoom="quarter"]').click();
    assert(ui.tlPx === TL.ZOOM.quarter);
    $('[data-tl-zoom="month"]').click();
    assert(ui.tlPx === TL.ZOOM.month && prefs.get('tlPx') === TL.ZOOM.month);
    return `map ${min}–${max}, wheel=${wheel.toFixed(3)}, timeline ${tmin}–${tmax}`;
  });
  await step('touch: after a long-press, the first tap on a menu item works (no click ends the press)', async () => {
    fresh('Long press');
    const g = mk('goal', { title: 'Goal' }),
      g2 = mk('goal', { title: 'Other goal' });
    save();
    setView('map');
    const node = id => $(`[data-map-node="${id}"]`);
    const touch = (type, el, x = 50, y = 50) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 7,
          clientX: x,
          clientY: y,
        }),
      );
    const tapMenu = act => {
      const b = ctxMenu.querySelector(`[data-ctx="${act}"]`);
      touch('pointerdown', b);
      touch('pointerup', b);
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    };
    const longPress = async (el, withClick) => {
      touch('pointerdown', el);
      await new Promise(r => setTimeout(r, LONG_PRESS_MS + 80));
      touch('pointerup', el);
      // iOS sends a click when the finger lifts; Android usually does not.
      if (withClick) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    };
    for (const withClick of [false, true]) {
      ui.mapSelected = null;
      ui.mapLinkFrom = null;
      render();
      await longPress(node(g2.id), withClick);
      assert(
        !ctxMenu.hidden && ctxMenu.dataset.id === g2.id,
        `${withClick ? 'with' : 'without'} a lifting click: menu open`,
      );
      eq(ui.mapSelected, null, 'the press itself does not select the box');
      tapMenu('link');
      assert(
        ui.mapLinkFrom === g2.id && ctxMenu.hidden,
        `${withClick ? 'with' : 'without'} a lifting click: one tap on “Link to…” starts linking`,
      );
      ui.mapLinkFrom = null;
      render();
      // Any menu item, not only Link to…
      await longPress(node(g.id), withClick);
      tapMenu('edit');
      assert(
        modal.open && formCtx.id === g.id,
        `${withClick ? 'with' : 'without'} a lifting click: one tap on Edit opens it`,
      );
      modal.close();
    }
    // A scroll that arrives just after the menu opens (one a redraw made before the press, delivered on
    // the next frame) does not close it; a scroll later does.
    ui.mapSelected = null;
    render();
    await longPress(node(g2.id), false);
    document.dispatchEvent(new Event('scroll'));
    $('.map-wrap').dispatchEvent(new Event('scroll'));
    assert(!ctxMenu.hidden, 'a scroll right after opening leaves the item menu open');
    await new Promise(r => setTimeout(r, 450));
    // On a short screen (a phone held sideways) the menu scrolls inside itself, and that keeps it open.
    ctxMenu.style.maxHeight = '120px';
    assert(
      ctxMenu.scrollHeight > ctxMenu.clientHeight && getComputedStyle(ctxMenu).overflowY === 'auto',
      'a menu taller than the screen scrolls',
    );
    assert(ctxMenu.querySelector('button').offsetHeight >= 30, 'its items keep their height');
    ctxMenu.scrollTop = 40;
    ctxMenu.dispatchEvent(new Event('scroll'));
    assert(!ctxMenu.hidden && ctxMenu.scrollTop > 0, 'scrolling the menu leaves it open');
    ctxMenu.style.maxHeight = '';
    $('.map-wrap').dispatchEvent(new Event('scroll'));
    assert(ctxMenu.hidden, 'a scroll later closes it');
    // A short tap still selects as before.
    ui.mapSelected = null;
    render();
    touch('pointerdown', node(g.id));
    touch('pointerup', node(g.id));
    node(g.id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    eq(ui.mapSelected, g.id, 'a short tap selects');
    deletePlan(plans.current);
    return 'ok';
  });
  await step('pinch: zooming the timeline or the map with two fingers opens no menu', async () => {
    fresh('Pinch');
    const g = mk('goal', { title: 'Goal', startDate: d(-5), deadline: d(30) });
    const a = mk('activity', { title: 'First', startDate: d(-2), dueDate: d(10) }),
      b = mk('activity', { title: 'Second', startDate: d(1), dueDate: d(20) });
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    save();
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const ptr = (type, el, id, x, y) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: id,
          isPrimary: id === 31,
          clientX: x,
          clientY: y,
        }),
      );
    const tch = (type, el, fingers) =>
      el.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches:
            type === 'touchend'
              ? []
              : fingers.map(([target, x, y], i) => new Touch({ identifier: i, target, clientX: x, clientY: y })),
        }),
      );
    // Two fingers down (each on its own item, or the second off any item), held, spread, lifted.
    const pinchOn = async (el1, el2) => {
      const r1 = el1.getBoundingClientRect(),
        r2 = el2.getBoundingClientRect();
      const f1 = [el1, r1.left + 20, r1.top + 5],
        f2 = [el2, r2.left + 30, r2.top + 5];
      ptr('pointerdown', el1, 31, f1[1], f1[2]);
      tch('touchstart', el1, [f1]);
      ptr('pointerdown', el2, 32, f2[1], f2[2]);
      tch('touchstart', el2, [f1, f2]);
      await wait(LONG_PRESS_MS + 80);
      // Phones may also report the still finger as a long-press.
      const cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: f1[1], clientY: f1[2] });
      el1.dispatchEvent(cm);
      // Checked while the fingers are still: zooming redraws the view, which would close a menu.
      const menu = !ctxMenu.hidden,
        prevented = cm.defaultPrevented;
      tch('touchmove', el1, [f1, [el2, f2[1] + 60, f2[2]]]);
      await wait(20);
      ptr('pointerup', el2, 32, f2[1], f2[2]);
      tch('touchend', el2, []);
      ptr('pointerup', el1, 31, f1[1], f1[2]);
      tch('touchend', el1, []);
      await wait(LONG_PRESS_MS + 80);
      return { menu: menu || !ctxMenu.hidden, prevented };
    };
    setView('timeline');
    ui.mapSelected = null;
    render();
    const row = id => $(`[data-tl-node="${id}"]`);
    let px = ui.tlPx;
    let res = await pinchOn(row(a.id), row(b.id));
    assert(!res.menu, 'two fingers on two rows: no menu');
    assert(res.prevented, 'the browser menu is held back too');
    assert(ui.tlPx > px, `and the timeline zoomed (${px} → ${ui.tlPx})`);
    res = await pinchOn(row(a.id), $('.tl-scroll .tl-scale') || $('.tl-scroll'));
    assert(!res.menu, 'second finger off any row: no menu');
    // With a bar selected, a pinch that starts on it does not pick it up.
    ui.mapSelected = ui.tlDates = a.id;
    render();
    const start = a.startDate;
    res = await pinchOn(row(a.id).querySelector('.tl-bar'), row(b.id));
    assert(
      !res.menu && !tlDrag && !$('.tl-scroll').classList.contains('tl-dragging'),
      'selected bar: not picked up, no menu',
    );
    eq(a.startDate, start, 'its dates stay');
    // The map, the same.
    setView('map');
    ui.mapSelected = null;
    render();
    px = ui.mapScale;
    res = await pinchOn($(`[data-map-node="${a.id}"]`), $(`[data-map-node="${b.id}"]`));
    assert(!res.menu, 'map: no menu');
    // One finger held still is still a long-press.
    const node = $(`[data-map-node="${a.id}"]`);
    ptr('pointerdown', node, 31, 50, 50);
    await wait(LONG_PRESS_MS + 80);
    ptr('pointerup', node, 31, 50, 50);
    assert(!ctxMenu.hidden && ctxMenu.dataset.id === a.id, 'a one-finger long-press still opens the menu');
    closeCtxMenu();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    deletePlan(plans.current);
    return `map ${px} → ${ui.mapScale}`;
  });
  await step('touch: tapping or long-pressing a line or box shows no tap highlight box', () => {
    loadSample();
    const clear = el => getComputedStyle(el).webkitTapHighlightColor;
    const out = [];
    for (const v of ['map', 'timeline']) {
      setView(v);
      if (v === 'timeline') {
        ui.tlDeps = true;
        render();
      }
      const els = [...viewEl.querySelectorAll('[data-rel-edit], [data-map-node], [data-tl-node]')];
      assert(
        els.some(el => el.matches('[data-rel-edit]')),
        `${v}: has lines`,
      );
      const shown = els.filter(el => clear(el) !== 'rgba(0, 0, 0, 0)');
      assert(!shown.length, `${v}: ${shown.length} with a highlight, e.g. ${shown[0] && clear(shown[0])}`);
      const line = viewEl.querySelector('[data-rel-edit]');
      line.focus();
      const cs = getComputedStyle(line);
      assert(
        document.activeElement === line && cs.outlineStyle === 'none',
        `${v}: a focused line draws no box (${cs.outlineStyle})`,
      );
      out.push(`${v}: ${els.length}`);
    }
    // Elsewhere the browser's highlight is untouched.
    setView('dashboard');
    eq(clear(viewEl.querySelector('.row') || viewEl), clear(document.body), 'other views keep the browser default');
    deletePlan(plans.current);
    return out.join(', ');
  });
});
