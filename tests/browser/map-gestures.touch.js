/** Page tests: line menus by long-press, right-click or menu key, and one-finger tap-tap-drag zoom. */
suite(async () => {
  await step('lines: a long-press, right-click or menu key opens Edit, Remove and Deselect', async () => {
    fresh('Line menu');
    const g = mk('goal', { title: 'Goal' }),
      a = mk('activity', { title: 'Act' }),
      b = mk('activity', { title: 'Other' });
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    save();
    setView('map');
    const r = () => db.relations.find(x => x.from === a.id);
    const line = () => $(`[data-rel-edit="${r().id}"]`);
    const touch = (type, el) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 9,
          clientX: 60,
          clientY: 60,
        }),
      );
    const longPress = async el => {
      touch('pointerdown', el);
      await new Promise(res => setTimeout(res, LONG_PRESS_MS + 80));
      touch('pointerup', el);
    };
    const tapMenu = act => {
      const btn = ctxMenu.querySelector(`[data-ctx="${act}"]`);
      touch('pointerdown', btn);
      touch('pointerup', btn);
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    };
    const items = () => [...ctxMenu.querySelectorAll('[data-ctx]')].map(x => x.textContent);

    await longPress(line());
    assert(!ctxMenu.hidden, 'long-press opens a menu');
    eq(items(), [t('btn.edit'), t('btn.remove'), t('btn.deselect')], 'the three options');
    // Opened by a finger, the menu takes focus but marks no item; the arrow keys still reach them.
    const btns = () => [...ctxMenu.querySelectorAll('[data-ctx]')];
    assert(document.activeElement === ctxMenu, 'the menu itself focused');
    eq(
      btns().map(b => getComputedStyle(b).backgroundColor),
      btns().map(() => 'rgba(0, 0, 0, 0)'),
      'no item marked',
    );
    press('ArrowUp', ctxMenu);
    assert(document.activeElement === btns().at(-1), 'Up from the menu: last item');
    ctxMenu.focus();
    press('ArrowDown', ctxMenu);
    assert(document.activeElement === btns()[0], 'Down from the menu: first item');
    assert(
      ctxMenu.textContent.includes('Act') &&
        ctxMenu.textContent.includes('Goal') &&
        ctxMenu.textContent.includes(t('kind.relation')),
      'names the relationship',
    );
    eq(ui.mapRel, r().id, 'the line is selected too');
    assert(line().classList.contains('sel'), 'drawn as selected');
    // Selecting redraws the map, which puts its scroll back; that must not close the menu.
    await new Promise(res => setTimeout(res, 300));
    assert(!ctxMenu.hidden, 'still open a moment later');
    await new Promise(res => setTimeout(res, 300));
    $('.map-wrap').dispatchEvent(new Event('scroll'));
    assert(ctxMenu.hidden, 'a real scroll later still closes it');
    await longPress(line());
    tapMenu('rel-edit');
    assert(
      ctxMenu.hidden && modal.open && formCtx.kind === 'relation' && formCtx.id === r().id,
      'one tap on Edit opens it',
    );
    modal.close();

    await longPress(line());
    tapMenu('rel-deselect');
    assert(ctxMenu.hidden && ui.mapRel === null && !line().classList.contains('sel'), 'Deselect');
    eq(db.relations.length, 2, 'nothing removed');

    // Right-click (desktop, and Android's long-press) opens the same menu.
    line().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 80 }));
    assert(!ctxMenu.hidden && ui.mapRel === r().id, 'right-click opens it and selects');
    eq(items().length, 3, 'same options');
    press('Escape', ctxMenu);
    assert(ctxMenu.hidden, 'Escape closes the menu');
    // The menu key on a focused line.
    line().focus();
    press('ContextMenu', line());
    assert(!ctxMenu.hidden && items().length === 3, 'the menu key opens it');
    assert(
      document.activeElement === ctxMenu.querySelector('[data-ctx]'),
      'from the keyboard, the first item is focused',
    );
    closeCtxMenu();

    await longPress(line());
    const id = r().id;
    tapMenu('rel-remove');
    assert(ctxMenu.hidden && !db.relations.some(x => x.id === id), 'Remove removes it');
    eq($('#toast').firstChild.textContent, t('toast.relRemoved'), 'says so');
    assert(findEntity(a.id) && findEntity(g.id) && db.relations.length === 1, 'the items and the other line stay');

    // Boxes keep their own menu.
    const box = $(`[data-map-node="${a.id}"]`);
    await longPress(box);
    assert(
      !ctxMenu.hidden && ctxMenu.querySelector('[data-ctx="edit"]') && !ctxMenu.querySelector('[data-ctx="rel-edit"]'),
      'a box still opens the item menu',
    );
    closeCtxMenu();

    // Timeline dependency arrows have the same menu.
    rel(b, a, 'depends');
    a.startDate = d(-3);
    a.dueDate = d(3);
    b.startDate = d(4);
    b.dueDate = d(9);
    g.startDate = d(-5);
    g.deadline = d(30);
    save();
    ui.tlDeps = true;
    setView('timeline');
    const dep = $('.tl-deps [data-rel-edit]');
    await longPress(dep);
    assert(!ctxMenu.hidden && items().length === 3, 'timeline arrow: menu');
    eq(
      ctxMenu.querySelector('.ctx-head strong').title,
      relText(db.relations.find(x => x.type === 'depends')),
      'a line menu heading shows the whole text on hover',
    );
    tapMenu('rel-remove');
    assert(!db.relations.some(x => x.type === 'depends'), 'timeline arrow removed');
    deletePlan(plans.current);
    return items().join(', ');
  });
  await step('tap-tap-drag: one-finger zoom on the map and the timeline', async () => {
    const plan0 = plans.current;
    // A map larger than the view, so it can scroll to keep the tapped point in place.
    loadSample();
    const g = mk('goal', { title: 'Goal', startDate: d(-40), deadline: d(60) });
    const a = mk('activity', { title: 'First', startDate: d(-2), dueDate: d(10) }),
      b = mk('activity', { title: 'Second', startDate: d(1), dueDate: d(20) });
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    save();
    const wait = ms => new Promise(res => setTimeout(res, ms));
    // One finger: touch events, with the pointer events a browser sends alongside.
    const touch = (type, el, x, y) => {
      const f = new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
      const ev = new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [f],
        changedTouches: [f],
      });
      el.dispatchEvent(ev);
      return ev;
    };
    const ptr = (type, el, x, y) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 7,
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      );
    const clickAt = (el, x, y) => {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: x, clientY: y });
      el.dispatchEvent(ev);
      return ev;
    };
    const tap = (el, x, y) => {
      ptr('pointerdown', el, x, y);
      touch('touchstart', el, x, y);
      ptr('pointerup', el, x, y);
      touch('touchend', el, x, y);
      clickAt(el, x, y);
    };
    // Tap, then touch again and drag by dy in steps. `get` finds the element under the finger; touch
    // events keep going to the one first touched, even once a redraw has detached it, as in a browser.
    const tapDrag = async (get, x, y, dy, { gap = 50, second = [x, y] } = {}) => {
      tap(get(), x, y);
      await wait(gap);
      const el = get(),
        [x2, y2] = second;
      ptr('pointerdown', el, x2, y2);
      touch('touchstart', el, x2, y2);
      let prevented = true;
      for (let i = 1; i <= 5; i++) {
        prevented = touch('touchmove', el, x2, y2 + (dy * i) / 5).defaultPrevented && prevented;
        await wait(20);
      }
      touch('touchend', el, x2, y2 + dy);
      ptr('pointerup', el, x2, y2 + dy);
      const click = clickAt(el, x2, y2 + dy);
      await wait(20);
      return { prevented, clickSwallowed: click.defaultPrevented };
    };
    const out = [];

    // Map: down zooms in around the tapped point, up zooms out.
    setView('map');
    ui.mapScale = 1;
    ui.mapSelected = null;
    render();
    const wrap = () => $('.map-wrap');
    // A point on the drawing (it is centred in the view while smaller than it).
    const sr = $('.map-wrap svg').getBoundingClientRect(),
      wr = wrap().getBoundingClientRect();
    const x = Math.max(sr.left, wr.left) + 60,
      y = Math.max(sr.top, wr.top) + 60;
    const svgPoint = () => {
      const bx = $('.map-wrap svg').getBoundingClientRect();
      return [(x - bx.left) / ui.mapScale, (y - bx.top) / ui.mapScale];
    };
    const p0 = svgPoint();
    let res = await tapDrag(wrap, x, y, 100);
    assert(ui.mapScale > 1.5, `zoomed in: ${ui.mapScale}`);
    assert(res.prevented, 'the drag does not scroll the map');
    const p1 = svgPoint();
    assert(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 2, `the tapped point stays put: ${p0} → ${p1}`);
    const zoomedIn = ui.mapScale;
    await wait(400);
    await tapDrag(wrap, x, y, -60);
    assert(ui.mapScale < zoomedIn, `up zooms out: ${zoomedIn} → ${ui.mapScale}`);
    out.push(`map ${zoomedIn.toFixed(2)} → ${ui.mapScale.toFixed(2)}`);
    deletePlan(plans.current);
    openPlan(plan0);
    fresh('Tap zoom');
    // The same three items on their own, for the rest.
    collection('goal').push(g);
    collection('activity').push(a, b);
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    save();

    // Started on a box: the second touch neither toggles nor opens it, nor brings up its menu.
    await wait(400);
    const node = () => $(`[data-map-node="${a.id}"]`);
    ui.mapScale = 1;
    ui.mapSelected = null;
    render();
    let nr = node().getBoundingClientRect();
    const nx = nr.left + 20,
      ny = nr.top + 10,
      before = ui.mapScale;
    tap(node(), nx, ny);
    const selectedByFirst = ui.mapSelected;
    await wait(50);
    const n2 = node();
    ptr('pointerdown', n2, nx, ny);
    touch('touchstart', n2, nx, ny);
    touch('touchmove', n2, nx, ny + 40);
    await wait(LONG_PRESS_MS + 80);
    touch('touchend', n2, nx, ny + 40);
    ptr('pointerup', n2, nx, ny + 40);
    const click = clickAt(n2, nx, ny + 40);
    await wait(20);
    assert(ui.mapScale > before, 'zoomed from a box');
    assert(ctxMenu.hidden, 'no long-press menu while zooming');
    assert(
      click.defaultPrevented && ui.mapSelected === selectedByFirst && !modal.open,
      'the lifted finger neither toggles nor opens the box',
    );

    // A plain double-tap on a box still opens it.
    await wait(400);
    ui.mapSelected = null;
    render();
    nr = node().getBoundingClientRect();
    tap(node(), nr.left + 20, nr.top + 10);
    await wait(50);
    tap(node(), nr.left + 20, nr.top + 10);
    assert(modal.open, 'double-tap edits');
    modal.close();

    // Not a tap-and-drag: a second touch too late, too far away, or after a swipe.
    for (const [why, opts] of [
      ['too late', { gap: 400 }],
      ['too far', { second: [x + 80, y] }],
    ]) {
      await wait(400);
      const s0 = ui.mapScale;
      res = await tapDrag(wrap, x, y, 100, opts);
      assert(ui.mapScale === s0 && !res.prevented && !res.clickSwallowed, `${why}: scrolls, no zoom`);
    }
    await wait(400);
    let s0 = ui.mapScale;
    ptr('pointerdown', wrap(), x, y);
    touch('touchstart', wrap(), x, y);
    touch('touchmove', wrap(), x, y + 40);
    touch('touchend', wrap(), x, y + 40);
    await wait(50);
    touch('touchstart', wrap(), x, y + 40);
    const swipe = touch('touchmove', wrap(), x, y + 120);
    touch('touchend', wrap(), x, y + 120);
    await wait(50);
    assert(ui.mapScale === s0 && !swipe.defaultPrevented, 'after a swipe: scrolls, no zoom');

    // Timeline: the days stretch around the tapped one; the rows are redrawn during the drag.
    await wait(400);
    setView('timeline');
    ui.tlPx = 8;
    ui.mapSelected = null;
    render();
    const sc = () => $('.tl-scroll');
    const tx = $('.tl-corner').getBoundingClientRect().right + 120,
      ty = $(`[data-tl-node="${b.id}"]`).getBoundingClientRect().top + 10;
    const dayAt = () => (tx - $('.tl-scale').getBoundingClientRect().left) / ui.tlPx + Number(sc().dataset.from);
    const under = () => document.elementFromPoint(tx, ty) || sc();
    const day0 = dayAt();
    res = await tapDrag(under, tx, ty, 80);
    assert(ui.tlPx > 8 && res.prevented, `timeline zoomed in: ${ui.tlPx}`);
    assert(Math.abs(dayAt() - day0) < 1, `the tapped day stays put: ${day0.toFixed(1)} → ${dayAt().toFixed(1)}`);
    const wide = ui.tlPx;
    await wait(400);
    await tapDrag(under, tx, ty, -80);
    assert(ui.tlPx < wide, `and out: ${wide} → ${ui.tlPx}`);
    out.push(`timeline 8 → ${wide.toFixed(1)} → ${ui.tlPx.toFixed(1)} px/day`);

    // Elsewhere nothing changes.
    await wait(400);
    setView('activities');
    const card = () => $(`.card[data-open="${a.id}"]`);
    const cr = card().getBoundingClientRect();
    s0 = ui.mapScale;
    modal.close();
    res = await tapDrag(card, cr.left + 10, cr.top + 10, 80);
    assert(!res.prevented && ui.mapScale === s0, 'activities: scrolls as usual');
    modal.close();
    deletePlan(plans.current);
    return out.join(', ');
  });
});
