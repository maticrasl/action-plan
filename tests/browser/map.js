/** Page tests: map keys and menus, short hints, + to add, light and dark glass, text inside the boxes. */
suite(async () => {
  await step('keyboard: map nodes, context menu', async () => {
    fresh('Keys');
    const [g1, g2] = [mk('goal', { title: 'Key goal' }), mk('goal')];
    rel(g2, g1, 'subgoal');
    save();
    setView('map');
    const node = () => $(`[data-map-node="${g1.id}"]`);
    node().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert(ui.mapSelected === g1.id, 'Enter selects');
    assert(!modal.open, 'Enter on an unselected item only selects it');
    node().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    assert(
      modal.open && formCtx.kind === 'goal' && formCtx.id === g1.id && ui.mapSelected === g1.id,
      'Space on the selected item opens it',
    );
    modal.close();
    ui.mapSelected = null;
    render();
    node().dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    assert(!ctxMenu.hidden && ctxMenu.dataset.id === g1.id, 'menu key opens the context menu');
    const btns = [...ctxMenu.querySelectorAll('button')];
    const key = k => ctxMenu.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const focus = [btns.indexOf(document.activeElement)];
    key('ArrowDown');
    focus.push(btns.indexOf(document.activeElement));
    key('ArrowUp');
    key('ArrowUp');
    focus.push(btns.indexOf(document.activeElement));
    key('Home');
    focus.push(btns.indexOf(document.activeElement));
    key('End');
    focus.push(btns.indexOf(document.activeElement));
    eq(focus, [0, 1, btns.length - 1, 0, btns.length - 1], 'menu focus moves');
    key('Escape');
    assert(ctxMenu.hidden && document.activeElement === node(), 'Escape closes and returns focus');
    node().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    assert(!ctxMenu.hidden, 'Shift+F10 opens the menu');
    closeCtxMenu();
    node().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    assert(modal.open && $('#f-title').value === 'Key goal', 'double-click opens the form');
    modal.close();
    return `menu=${btns.length} items`;
  });

  await step('bands fold (remembered, synced); no Show/Status rows; the page scrolls the map', () => {
    fresh('Fold');
    const goals = Array.from({ length: 15 }, () => mk('goal'));
    rel(goals[1], goals[0], 'subgoal');
    const a = mk('activity');
    save();
    setView('map');
    assert(!/level|raven|ravni/.test($('.map-wrap svg').textContent), 'no "(n levels)"');
    assert(!$('[data-rel-toggle]') && !$('.map-legend') && !$('.map-wrap + p.meta'), 'no Show, Status or hint');
    const fold = k => $(`[data-map-fold="${k}"]`);
    fold('activity').click();
    assert(!$(`[data-map-node="${a.id}"]`) && fold('activity').getAttribute('aria-expanded') === 'false', 'folded');
    assert($(`[data-map-node="${goals[0].id}"]`) && $('[data-rel-edit]'), 'other bands and their lines stay');
    eq(getMapFold().kinds, ['activity'], 'remembered');
    eq(localStore().mapFold.kinds, ['activity'], 'and in the sync file');
    render();
    assert(!$(`[data-map-node="${a.id}"]`), 'still folded after a redraw');
    applyStore({ ...localStore(), mapFold: { kinds: [], at: '2999-01-01T00:00:00.000Z' } });
    render();
    assert($(`[data-map-node="${a.id}"]`), 'a later synced change unfolds it');
    // Everything folded: only the label strips, no error.
    fold('goal').click();
    fold('activity').click();
    assert(!$('[data-map-node]') && $$('[data-map-fold]').length === 2, 'all folded');
    saveMapFold({ kinds: [], at: new Date().toISOString() });
    render();
    // No scrollbars of its own: the main pane scrolls, the sidebar and toolbar stay in view.
    const main = $('.main'),
      wrap = $('.map-wrap');
    assert(
      getComputedStyle(wrap).overflowX === 'visible' && getComputedStyle(main).overflowX === 'auto',
      'main scrolls',
    );
    assert(main.scrollWidth > main.clientWidth, `wider than the pane: ${main.scrollWidth} > ${main.clientWidth}`);
    main.scrollLeft = 400;
    const nav = $('.nav').getBoundingClientRect(),
      bar = $('.map-toolbar').getBoundingClientRect(),
      pane = main.getBoundingClientRect();
    assert(nav.left === 0 && nav.width > 0, 'sidebar in place');
    assert(Math.abs(bar.left - pane.left) < 2, `toolbar stays at the left: ${bar.left} vs ${pane.left}`);
    const label = fold('goal').getBoundingClientRect();
    assert(label.left > pane.left && label.left < pane.left + 40, `band labels stay at the left: ${label.left}`);
    $(`[data-map-node="${goals[0].id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    assert(getComputedStyle($('.map-bars')).position === 'sticky' && $('.map-bars [data-map-clear]'), 'selection bar');
    ui.mapSelected = null;
    main.scrollLeft = 0;
    render();
  });
  await step('map and timeline hints are short; the details are in the help', () => {
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const k of ['tl.hint']) assert(t(k).length <= 150, `${code} ${k} is ${t(k).length} characters`);
      for (const k of ['help.view.map', 'help.view.timeline'])
        [/Delete/, /Enter/, /Esc/, /Ctrl/].forEach(w => assert(w.test(t(k)), `${code} ${k} mentions ${w}`));
      assert(/collapse|strn/i.test(t('help.view.timeline')), `${code}: folding in the timeline help`);
    }
    changeLanguage('en');
    setView('map');
    return t('tl.hint');
  });
  await step(
    'map and timeline: + asks whether to add a goal, an activity or a current state (on the map also a vision)',
    () => {
      fresh('Map add');
      const g = mk('goal', { title: 'Map goal' });
      save();
      setView('map');
      const btn = $('#addBtn');
      eq(btn.getAttribute('aria-label'), t('add.item'), 'the button just says Add');
      btn.click();
      const acts = () => [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx).join(',');
      // The map draws visions too, so it offers one as well.
      assert(
        !ctxMenu.hidden &&
          acts() === 'new:vision,new:goal,new:activity,new:state' &&
          !ctxMenu.querySelector('.ctx-head'),
        `offers the kinds: ${acts()}`,
      );
      const r = btn.getBoundingClientRect(),
        m = ctxMenu.getBoundingClientRect();
      assert(Math.abs(m.right - r.right) < 2 && m.top >= r.bottom, 'opens below the button, lined up with it');
      ctxMenu.querySelector('[data-ctx="new:activity"]').click();
      assert(
        ctxMenu.hidden &&
          modal.open &&
          formCtx.kind === 'activity' &&
          !formCtx.id &&
          modal.querySelectorAll('[data-act-kind]').length === 4,
        'Activity asks which kind',
      );
      modal.close();
      for (const k of ['goal', 'state']) {
        btn.click();
        ctxMenu.querySelector(`[data-ctx="new:${k}"]`).click();
        assert(modal.open && formCtx.kind === k && !formCtx.id, `${k}: opens its form`);
        modal.close();
      }
      // From the keyboard: the first item focused; Escape returns to the button.
      btn.focus();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
      assert(
        document.activeElement === ctxMenu.querySelector('[data-ctx="new:vision"]'),
        'keyboard: first item focused',
      );
      ctxMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(ctxMenu.hidden && document.activeElement === btn, 'Escape returns to the button');
      // A box's menu afterwards is still the item's own.
      $(`[data-map-node="${g.id}"]`).dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
      $('[data-ctx="edit"]', ctxMenu).click();
      assert(modal.open && formCtx.id === g.id, 'a box menu still works after');
      modal.close();
      // On phones the button floats at the bottom; the menu opens above it.
      const phone = document.head.appendChild(document.createElement('style'));
      phone.textContent =
        '.ctx-menu { animation: none !important } .topbar { backdrop-filter: none !important } .add-btn { position: fixed !important; right: 16px; bottom: 76px; z-index: 21 }';
      btn.click();
      const r2 = btn.getBoundingClientRect(),
        m2 = ctxMenu.getBoundingClientRect();
      assert(
        m2.bottom <= r2.top && m2.right <= innerWidth - 8 + 1,
        `floating button: menu above it (${m2.bottom} ≤ ${r2.top})`,
      );
      closeCtxMenu();
      phone.remove();
      // The timeline asks the same.
      setView('timeline');
      eq(btn.getAttribute('aria-label'), t('add.item'), 'timeline: the button just says Add');
      btn.click();
      assert(
        !ctxMenu.hidden && acts() === 'new:goal,new:activity,new:state',
        `timeline: offers the three kinds: ${acts()}`,
      );
      ctxMenu.querySelector('[data-ctx="new:goal"]').click();
      assert(ctxMenu.hidden && modal.open && formCtx.kind === 'goal' && !formCtx.id, 'timeline: Goal opens a new goal');
      modal.close();
      // The other views add straight away; the empty relationship list still adds a relationship.
      setView('goals');
      btn.click();
      assert(ctxMenu.hidden && modal.open && formCtx.kind === 'goal', 'goals view: + adds a goal directly');
      modal.close();
      changeLanguage('sl');
      const sl = t('add.item');
      changeLanguage('en');
      eq(sl, 'Dodaj', 'Slovenian label');
      deletePlan(plans.current);
      return acts();
    },
  );
  await step('map: switching between light and dark redraws the glass in the new theme', () => {
    loadSample();
    setView('map');
    const slabColours = () =>
      [...document.querySelectorAll('.map-wrap defs > g[id^="glass-"] path, .map-wrap defs linearGradient stop')]
        .map(x => x.getAttribute('fill') || x.getAttribute('stop-color'))
        .join();
    const pick = k => $(`#themeSeg [data-theme-set="${k}"]`).click();
    const was = theme;
    pick('light');
    const light = slabColours();
    pick('dark');
    const dark = slabColours();
    assert(dark !== light, 'slabs redrawn when switching to dark');
    // The same as a map first drawn in dark.
    render();
    eq(slabColours(), dark, 'as if drawn in dark from the start');
    pick('light');
    eq(slabColours(), light, 'and back to light');
    // Following the system: a change of the system theme redraws it too.
    pick('system');
    document.documentElement.dataset.theme = 'dark';
    darkScheme.dispatchEvent(new Event('change'));
    eq(slabColours(), dark, 'system theme change redraws the map');
    // Other views follow the CSS: nothing is redrawn, so an open popup stays.
    setView('dashboard');
    const first = $('#view').firstElementChild;
    pick('light');
    darkScheme.dispatchEvent(new Event('change'));
    assert($('#view').firstElementChild === first, 'other views are not redrawn');
    pick(was);
  });
  await step('map: box text stays inside its box, bands sit close, the light on the faces is defined once', () => {
    const { NW } = MAP;
    // Text that ends within 4 px of the box's right edge (inside its border), with its box's title.
    const overflow = () =>
      [...document.querySelectorAll('.map-wrap .node')].flatMap(n =>
        [...n.querySelectorAll('text')]
          .filter(x => +x.getAttribute('x') + x.getComputedTextLength() > NW - 4)
          .map(x => `${n.getAttribute('aria-label')}: ${x.textContent} (${Math.round(x.getComputedTextLength())})`),
      );
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      loadSample();
      setView('map');
      eq(overflow(), [], `${code} sample plan: nothing overflows`);
      // Bands: one gap between them, smaller than the gap between rows inside a band.
      const bands = [...document.querySelectorAll('.map-wrap .band')].map(b => [
        +b.getAttribute('y'),
        +b.getAttribute('y') + +b.getAttribute('height'),
      ]);
      assert(
        bands.length === 3 &&
          bands.slice(1).every(([top], i) => top - bands[i][1] === MAP.BAND_GAP) &&
          MAP.BAND_GAP <= 16 &&
          MAP.BAND_GAP < MAP.VG,
        `${code}: bands ${MAP.BAND_GAP} px apart`,
      );
      // Each band's label sits below the boxes of the band above, inside its own band.
      const top = $('.map-wrap svg').getBoundingClientRect().top;
      const labels = [...document.querySelectorAll('.map-wrap .col-label')].map(l => l.getBoundingClientRect());
      assert(
        labels.length === bands.length &&
          labels.every((l, i) => l.top - top >= bands[i][0] && l.bottom - top <= bands[i][0] + MAP.HEAD),
        `${code}: labels in their band's head`,
      );
      // The light on the face: its reflection and its shading, defined once, used by every box, over its glass.
      const svg = $('.map-wrap svg');
      assert(
        svg.querySelectorAll('radialGradient').length === 2 &&
          svg.querySelectorAll('#glass-spec').length === 1 &&
          svg.querySelectorAll('#glass-shade').length === 1 &&
          svg.querySelectorAll('filter').length === 2,
        `${code}: face light defined once`,
      );
      assert(
        [...svg.querySelectorAll('.node')].every(n => n.querySelector('rect + .glass-shade + .glass-spec')),
        `${code}: every box has its light, right over its glass`,
      );
      const spec = getComputedStyle(svg.querySelector('.glass-spec'));
      assert(spec.fill.includes('#glass-spec') && spec.pointerEvents === 'none', `${code}: light fill ${spec.fill}`);
      // Milk glass, solid and tinted by status: a done box green, a late one red; to-do boxes take more grey.
      const rectOf = st => getComputedStyle(svg.querySelector(`.node.activity.st-${st} rect`));
      assert(
        +rectOf('done').fillOpacity === 1 && rectOf('done').fill !== rectOf('late').fill,
        `${code}: glass tinted by status`,
      );
      assert(
        getComputedStyle(svg.querySelector('.node.activity.st-todo')).getPropertyValue('--glass-tint').trim() ===
          getComputedStyle(document.documentElement).getPropertyValue('--glass-tint-quiet').trim(),
        `${code}: to-do boxes take more grey`,
      );
      // By night the glass is drawn on a dark base, and states take more colour than the rest.
      const theme = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = 'dark';
      render();
      const rootCss = getComputedStyle(document.documentElement);
      assert(
        parseFloat(rootCss.getPropertyValue('--glass-tint-state')) >
          parseFloat(rootCss.getPropertyValue('--glass-tint')) && $('.map-wrap defs > g[id="glass-state-other"]'),
        `${code}: states take more colour by night`,
      );
      if (theme) document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
      render();
      deletePlan(plans.current);
    }

    // Long routine text: short on the box, cut with "…" if still too wide, in full in the tooltip.
    changeLanguage('sl');
    fresh('Long text');
    // Dates from today, so the streak is there on any day the suite starts: ticked the 10th of the
    // last two months, started a year ago.
    const [y, m] = [+today().slice(0, 4), +today().slice(5, 7) - 1],
      since = isoOf(y - 1, m, 1);
    const monthly = mk('activity', {
      title: 'Mesečni pregled financ',
      startDate: since,
      repeat: { every: 1, unit: 'month', times: 1 },
      checkins: { [isoOf(y, m - 2, 10)]: 1, [isoOf(y, m - 1, 10)]: 1 },
    });
    const weekly = mk('activity', {
      title: 'Tek trikrat na teden',
      startDate: since,
      repeat: { every: 1, unit: 'week', times: 3 },
      checkins: {},
    });
    const long = mk('activity', {
      title: 'Zelo dolg naslov aktivnosti, ki gotovo ne gre v okvir',
      dueDate: d(400),
      status: 'doing',
    });
    const wide = mk('goal', { title: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWW', deadline: d(30) });
    const state = mk('state', {
      title: 'Prihranki',
      value: '1234567890',
      unit: 'kilometrov in še nekaj',
      date: d(-1),
      history: [],
    });
    save();
    setView('map');
    eq(overflow(), [], 'sl long texts: nothing overflows');
    const node = x => $(`[data-map-node="${x.id}"]`);
    const sub = x => node(x).querySelector('.sub').textContent,
      tip = x => node(x).querySelector('title').textContent;
    const p = periodProgress(monthly),
      s = routineStreak(monthly);
    eq(s.n, 2, 'the monthly routine: met the last two months');
    eq(
      sub(monthly),
      `${t('map.rt.month', { done: p.done, target: 1 })}, ${t('map.rt.streak', { n: s.n })}`,
      'monthly: the short form',
    );
    assert(
      tip(monthly).includes(`${periodText(monthly)}, ${streakText(s)}`),
      `monthly: in full in the tooltip: ${tip(monthly)}`,
    );
    eq(sub(weekly), t('map.rt.week', { done: 0, target: 3 }), 'weekly without a streak: just this week');
    assert(
      node(long).querySelector('text').textContent.endsWith('…') && tip(long).startsWith(long.title),
      'long title: cut with … and whole in the tooltip',
    );
    assert(node(wide).querySelector('text').textContent.endsWith('…'), 'wide letters: cut by width, not by count');
    assert(
      sub(state).endsWith('…') && tip(state).includes('kilometrov in še nekaj'),
      `long amount: cut, whole in the tooltip: ${sub(state)}`,
    );
    changeLanguage('en');
    render();
    eq(overflow(), [], 'en long texts: nothing overflows');
    eq(sub(monthly), `${p.done}/1 this month, ${s.n}× in a row`, 'English short form');
    deletePlan(plans.current);
  });
});
