/** Page tests: the item menu's Show in: another view with the item selected, and in place. */
suite(async () => {
  await step('item menu: show in another view, selected there', () => {
    fresh('Show in');
    changeLanguage('en');
    const g = mk('goal', { startDate: d(-5), deadline: d(30) });
    const a = mk('activity', { startDate: d(-2), dueDate: d(4) });
    const done = mk('activity', { dueDate: d(-1), status: 'done' });
    const s = mk('state', {
      value: 4,
      date: d(-1),
      history: [
        { date: d(-9), value: 2 },
        { date: d(-1), value: 4 },
      ],
    });
    const bare = mk('state');
    rel(a, g, 'contributes');
    rel(done, g, 'contributes');
    rel(s, g, 'measures');
    const rightClick = el => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 });
      el.dispatchEvent(e);
      assert(e.defaultPrevented && !ctxMenu.hidden, `menu on ${el.className || el.tagName}`);
      return [...ctxMenu.querySelectorAll('[data-ctx^="show:"]')].map(b => b.dataset.ctx.slice(5));
    };
    const pick = view => ctxMenu.querySelector(`[data-ctx="show:${view}"]`).click();
    // Goals view → map: the box is selected and focused, its neighbours stay lit.
    setView('goals');
    eq(rightClick($(`.card[data-open="${g.id}"]`)), ['map', 'timeline'], 'goal card');
    const showMap = ctxMenu.querySelector('[data-ctx="show:map"]');
    assert(
      showMap.textContent === t('nav.map') &&
        showMap.querySelector('svg').outerHTML === $('.nav-item[data-view="map"] svg').outerHTML,
      'the map icon and name',
    );
    assert(
      showMap.getAttribute('aria-label') === t('ctx.showInView', { view: t('nav.map') }) &&
        showMap.title === 'Show in Map view',
      'named in full',
    );
    ctxMenu.querySelector('[data-ctx-sub]').click();
    const box = showMap.querySelector('svg').getBoundingClientRect();
    assert(
      box.width === 18 && box.height === 18 && getComputedStyle(showMap.querySelector('svg')).fill === 'none',
      'icon drawn like in the navigation',
    );
    const all = () => [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
    eq(
      all(),
      [
        'edit',
        'note',
        'status:achieved',
        'add:goal:subgoal',
        'add:activity:contributes',
        'show:map',
        'show:timeline',
        'link',
        'delete',
      ],
      'goal options: no highlight or focus outside the map and timeline',
    );
    pick('map');
    const node = $(`[data-map-node="${g.id}"]`);
    assert(ui.view === 'map' && ui.mapSelected === g.id && ctxMenu.hidden, 'map, goal selected');
    assert(
      node.querySelector('rect').style.strokeWidth === '' && document.activeElement === node,
      'box drawn selected and focused',
    );
    assert(
      node.classList.contains('sel') &&
        [...document.querySelectorAll('.map-wrap .node.sel')].length === 1 &&
        (() => {
          const lift = getComputedStyle(node.querySelector('.node-lift')),
            other = getComputedStyle($('.map-wrap .node:not(.sel) .node-lift'));
          return (
            lift.stroke === 'none' &&
            lift.filter.includes('node-glow') &&
            lift.fill ===
              getComputedStyle(node)
                .getPropertyValue('--tint')
                .trim()
                .replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${[r, g, b].map(h => parseInt(h, 16)).join(', ')})`) &&
            other.filter === 'none'
          );
        })() &&
        $('#node-glow feComposite[operator="out"]'),
      'only the selected box glows, in its own colour, outside its face, with no outline',
    );
    assert(
      [...document.querySelectorAll('.map-wrap .node')].every(n => n.querySelector('.node-lift')) &&
        [...document.querySelectorAll('.map-wrap marker')].every(
          m => m.getAttribute('markerUnits') === 'userSpaceOnUse',
        ),
      'every box can glow; arrowheads keep one size whatever the line width',
    );
    // Under each box's face, its glass slab: one drawing per colour and thickness, defined once.
    const boxes = [...document.querySelectorAll('.map-wrap .node')],
      uses = boxes.map(n => n.querySelector('use'));
    assert(
      uses.every(
        (u, i) =>
          u &&
          u.nextElementSibling === boxes[i].querySelector('rect') &&
          document.querySelector(u.getAttribute('href')),
      ),
      'every box has its slab, right under its face',
    );
    const slabs = [...document.querySelectorAll('.map-wrap defs > g[id^="glass-"]')];
    eq(slabs.length, new Set(uses.map(u => u.getAttribute('href'))).size, 'one slab per colour and thickness used');
    assert(
      [...document.querySelectorAll('.map-wrap filter')].map(f => f.id).join() === 'node-glow,line-glow' &&
        [...document.querySelectorAll('.map-wrap .node:not(.sel) *')].every(
          x => getComputedStyle(x).filter === 'none',
        ) &&
        getComputedStyle(node.querySelector('rect')).stroke === 'none',
      'no edge; the only blur is the glow of what is selected',
    );
    // Goals are cut from thick glass: the slab reaches down and to the right of the face, and casts no shadow.
    // Activities and states are flat: only an edge round the face.
    const reach = n => {
      const b = n.querySelector('use').getBBox();
      return [b.x + b.width, b.y + b.height];
    };
    const goalBox = boxes.find(n => n.classList.contains('goal')),
      actBox = boxes.find(n => n.classList.contains('activity'));
    assert(
      Math.round(reach(actBox)[0]) === MAP.NW &&
        Math.round(reach(actBox)[1]) === MAP.NH &&
        reach(goalBox)[0] > MAP.NW &&
        reach(goalBox)[1] > MAP.NH,
      `goals thick, activities flat: ${reach(goalBox)} vs ${reach(actBox)}`,
    );
    assert(
      slabs.every(g => !g.querySelector('[opacity]')) &&
        reach(goalBox)[1] <= MAP.NH + GLASS.DEPTH.goal + 0.5 &&
        reach(actBox)[0] <= MAP.NW + GLASS.DEPTH.other + 0.5,
      `no cast shadow: ${reach(goalBox)} vs ${reach(actBox)}`,
    );
    eq(
      [actBox, goalBox].map(n => getComputedStyle(n.querySelector('text')).fontWeight),
      ['400', '500'],
      'box titles in lighter type',
    );
    // The side is lit from the left: the bottom (shaded from the corner to its left end) gets more light toward its
    // left end, and the right side less still. Each is one strip with a gradient; the corners are small pieces.
    const light = run =>
      glassLighting()
        .side.goal.filter(x => x.run === run)
        .map(x => x.light);
    assert(
      light('b').at(-1) > light('b')[0] && Math.max(...light('r')) < light('b').at(-1),
      `lit from the left: bottom ${light('b')[0].toFixed(2)} → ${light('b').at(-1).toFixed(2)}, right ${Math.max(...light('r')).toFixed(2)}`,
    );
    // In colour, by day and by night, the bottom is lighter at its left end. By night the right side is darker
    // still; by day the white glass reflects more sky on the right side, which faces sideways, than on the bottom.
    // The slab's defs are drawn for each theme apart (glassDefs reads the theme's colours); the map stays as it is.
    const slab = goalBox.querySelector('use').getAttribute('href'),
      cut = slab.lastIndexOf('-'),
      key = `--${slab.slice('#glass-'.length, cut)}|${slab.slice(cut + 1)}`;
    assert($(slab).querySelectorAll('path').length < 20, 'the side in few pieces');
    const shaded = theme => {
      const was = document.documentElement.dataset.theme,
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      document.documentElement.dataset.theme = theme;
      defs.innerHTML = glassDefs(new Set([key]));
      if (was) document.documentElement.dataset.theme = was;
      else delete document.documentElement.dataset.theme;
      const lums = run =>
        [...defs.querySelectorAll(`[id="${slab.slice(1)}-${run}"] stop`)].map(x =>
          x
            .getAttribute('stop-color')
            .match(/\d+/g)
            .reduce((sum, v) => sum + +v, 0),
        );
      const bottom = lums('b'),
        right = lums('r');
      assert(
        bottom.length > 10 &&
          right.length > 5 &&
          bottom.at(-1) > bottom[0] &&
          (theme === 'light' || Math.max(...right) < bottom.at(-1)),
        `${theme}: side shaded by the light: bottom ${bottom[0]} → ${bottom.at(-1)}, right ${Math.max(...right)}`,
      );
      return bottom[0];
    };
    assert(shaded('light') > shaded('dark'), 'day glass is lighter than night glass');
    // Lines meet a box's bottom below its glass, so no arrowhead hides under the slab.
    const at = b =>
      b
        .getAttribute('transform')
        .match(/[-\d.]+/g)
        .map(Number);
    const ends = [...document.querySelectorAll('.map-wrap .edge')].flatMap(e => {
      const v = e
        .getAttribute('d')
        .match(/[-\d.]+/g)
        .map(Number);
      return [v.slice(0, 2), v.slice(-2)];
    });
    const hidden = ends.filter(([x, y]) =>
      boxes.some(b => {
        const [bx, by] = at(b),
          d = b.classList.contains('goal') ? GLASS.DEPTH.goal : GLASS.DEPTH.other;
        return x > bx && x < bx + MAP.NW && y > by + MAP.NH - 0.5 && y < by + MAP.NH + d - 0.5;
      }),
    );
    eq(hidden, [], 'no line ends under a slab');
    // Every line ends with a straight stretch, so its arrowhead sits in line with it; the line stops inside the
    // arrowhead's wide back (TIP short of where it points), so even a thick line never shows past the head's tip.
    const bent = [...document.querySelectorAll('.map-wrap .edge')]
      .map(e => e.getAttribute('d'))
      .filter(d => {
        const v = d.match(/[-\d.]+/g).map(Number),
          [x1, y1, x2, y2] = v.slice(-4);
        return !/L[-\d.]+,[-\d.]+$/.test(d) || Math.hypot(x2 - x1, y2 - y1) < MAP.LEAD - MAP.TIP - 0.5;
      });
    eq(bent, [], 'lines end straight into their arrowheads');
    assert(
      [...document.querySelectorAll('.map-wrap marker')].every(m => +m.getAttribute('refX') === 10 - MAP.TIP),
      'arrowheads reach the rest of the way',
    );
    // Down the layers a line stops exactly TIP short of the box (or slab) it points at, so the head's tip just touches it.
    const tipGaps = [...document.querySelectorAll('.map-wrap .edge')]
      .map(e =>
        e
          .getAttribute('d')
          .match(/[-\d.]+/g)
          .map(Number)
          .slice(-4),
      )
      .filter(([x1, , x2]) => x1 === x2)
      .map(([, , x, y]) =>
        Math.min(
          ...boxes
            .filter(b => x > at(b)[0] && x < at(b)[0] + MAP.NW)
            .flatMap(b => {
              const by = at(b)[1],
                d = b.classList.contains('goal') ? GLASS.DEPTH.goal : GLASS.DEPTH.other;
              return [Math.abs(y - by), Math.abs(y - (by + MAP.NH + d))];
            }),
        ),
      );
    assert(tipGaps.length && tipGaps.every(g => Math.abs(g - MAP.TIP) < 0.01), `lines stop TIP short: ${tipGaps}`);
    // Lines are fine and their colours muted toward grey, arrowheads and the legend's keys alike.
    const lines = [...document.querySelectorAll('.map-wrap .edge')];
    assert(
      lines.every(e => parseFloat(e.style.strokeWidth) <= 1.6 && e.style.stroke.includes('color-mix')) &&
        [...document.querySelectorAll('.map-wrap marker path, .rel-toggle i')].every(x =>
          x.getAttribute('style').includes('color-mix'),
        ),
      'fine, muted lines',
    );
    assert(
      [...document.querySelectorAll('.map-wrap .col-label')].every(l => l.closest('.band-labels')),
      'band labels drawn over the lines',
    );
    assert(!$(`[data-map-node="${a.id}"]`).classList.contains('dim'), 'neighbours not dimmed');
    // Map → timeline: the same item stays selected; a different one replaces the selection.
    rightClick(node);
    eq(
      all(),
      [
        'edit',
        'note',
        'highlight',
        'focus',
        'status:achieved',
        'add:goal:subgoal',
        'add:activity:contributes',
        'show:goals',
        'show:timeline',
        'link',
        'delete',
      ],
      'goal options on the map',
    );
    closeCtxMenu();
    eq(rightClick($(`[data-map-node="${a.id}"]`)), ['activities', 'timeline'], 'activity box');
    pick('timeline');
    const row = $(`[data-tl-node="${a.id}"]`);
    assert(
      ui.view === 'timeline' &&
        ui.mapSelected === a.id &&
        row.classList.contains('selected') &&
        document.activeElement === row,
      'timeline row selected',
    );
    assert(!row.querySelector('.tl-drag'), 'its dates are not offered for dragging yet');
    // Timeline → activities: the card is brought into view and glows.
    eq(rightClick(row), ['activities', 'map'], 'timeline row');
    pick('activities');
    const card = $(`.card[data-open="${a.id}"]`);
    assert(ui.view === 'activities' && card.classList.contains('flash'), 'card flashes');
    card.dispatchEvent(new Event('animationend'));
    assert(!card.classList.contains('flash'), 'and stops');
    // States: every state has a card in Graphs, with data or without.
    setView('graphs');
    eq(rightClick($(`[data-gr="${s.id}"] .card-head`)), ['map'], 'graph heading');
    closeCtxMenu();
    eq(rightClick($(`[data-gr="${bare.id}"]`)), ['map'], 'a card without data');
    closeCtxMenu();
    setView('map');
    eq(rightClick($(`[data-map-node="${bare.id}"]`)), ['graphs'], 'Graphs offered for a state without data');
    pick('graphs');
    assert(ui.view === 'graphs' && $(`[data-gr="${bare.id}"]`).classList.contains('flash'), 'its card flashes');
    const plot = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    setView('graphs');
    $(`[data-gr="${s.id}"] .gr-plot`).dispatchEvent(plot);
    assert(
      plot.defaultPrevented && !ctxMenu.hidden && ctxMenu.dataset.id === s.id,
      'the chart itself opens the menu too',
    );
    closeCtxMenu();
    // Overview rows have the menu too (the activity is in progress, not due yet: listed once expanded).
    ui.nextAll = true;
    setView('dashboard');
    eq(rightClick($(`.row[data-open="${a.id}"]`)), ['activities', 'map', 'timeline'], 'next action row');
    pick('map');
    assert(ui.view === 'map' && ui.mapSelected === a.id, 'from the overview to the map');
    ui.nextAll = false;
    // A done item hidden with the done ones: they are shown again, and it is selected.
    setToggle('hideDone', true);
    setView('activities');
    openCtxMenu(done.id, 10, 10);
    pick('map');
    assert(
      ui.view === 'map' &&
        !ui.hideDone &&
        prefs.get('hideDone') === false &&
        $(`[data-map-node="${done.id}"]`) === document.activeElement,
      'done shown again, box focused',
    );
    setToggle('hideDone', false);
    changeLanguage('sl');
    setView('goals');
    rightClick($(`.card[data-open="${g.id}"]`));
    assert(
      ctxMenu.querySelector('[data-ctx-sub]').textContent === 'Prikaži v …' &&
        ctxMenu.querySelector('[data-ctx="show:map"]').textContent === 'Zemljevid' &&
        ctxMenu.querySelector('[data-ctx="show:map"]').getAttribute('aria-label') === 'Prikaži v pogledu Zemljevid',
      'Slovenian',
    );
    closeCtxMenu();
    changeLanguage('en');
    deletePlan(plans.current);
  });
  await step('item menu: "Show in…" opens its views in place', async () => {
    fresh('Show in place');
    changeLanguage('en');
    const g = mk('goal', { startDate: d(-5), deadline: d(30) });
    const bare = mk('state');
    save();
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = '.ctx-menu { animation: none }';
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const touch = (type, el) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 12,
          clientX: 60,
          clientY: 60,
        }),
      );
    const tap = el => {
      touch('pointerdown', el);
      touch('pointerup', el);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    };
    const key = k => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const parent = () => ctxMenu.querySelector('[data-ctx-sub]'),
      sub = () => $('#ctxSub');
    const seen = () =>
      [...ctxMenu.querySelectorAll('button')].filter(b => b.offsetHeight).map(b => b.dataset.ctx || 'parent');
    const inView = () => {
      const r = ctxMenu.getBoundingClientRect();
      return r.top >= 8 && r.bottom <= innerHeight - 8;
    };
    setView('goals');
    // Closed: one "Show in…" entry with a chevron, its views hidden.
    openCtxMenu(g.id, 60, 60);
    eq(
      seen(),
      ['edit', 'note', 'status:achieved', 'add:goal:subgoal', 'add:activity:contributes', 'parent', 'link', 'delete'],
      'one entry for the views',
    );
    assert(
      parent().textContent === 'Show in…' &&
        parent().querySelector('.ctx-chev') &&
        parent().getAttribute('aria-expanded') === 'false' &&
        parent().getAttribute('aria-controls') === 'ctxSub' &&
        sub().hidden,
      'closed, with a chevron',
    );
    // A tap opens it in place and keeps the menu open (also after the scroll guard has run out).
    tap(parent());
    assert(!ctxMenu.hidden && parent().getAttribute('aria-expanded') === 'true' && !sub().hidden, 'opened by a tap');
    eq(
      seen(),
      [
        'edit',
        'note',
        'status:achieved',
        'add:goal:subgoal',
        'add:activity:contributes',
        'parent',
        'show:map',
        'show:timeline',
        'link',
        'delete',
      ],
      'views below it',
    );
    eq(
      [...sub().querySelectorAll('button')].map(b => b.textContent),
      ['Map', 'Timeline'],
      'named like the navigation',
    );
    assert(
      sub().querySelector('button').getBoundingClientRect().left > parent().getBoundingClientRect().left + 20 &&
        getComputedStyle(parent().querySelector('.ctx-chev')).transform !== 'none',
      'indented; the chevron turned',
    );
    await wait(450);
    ctxMenu.dispatchEvent(new Event('scroll'));
    assert(!ctxMenu.hidden, 'still open');
    tap(parent());
    assert(
      !ctxMenu.hidden && sub().hidden && parent().getAttribute('aria-expanded') === 'false',
      'a second tap closes it, not the menu',
    );
    // A sub-item picked: the view, with the item shown there.
    tap(parent());
    tap(ctxMenu.querySelector('[data-ctx="show:map"]'));
    assert(
      ctxMenu.hidden &&
        ui.view === 'map' &&
        ui.mapSelected === g.id &&
        document.activeElement === $(`[data-map-node="${g.id}"]`),
      'shown in the map',
    );
    // Keyboard: hidden views are skipped; Right opens onto the first, Left and Escape go back.
    setView('goals');
    openCtxMenu(g.id, 60, 60, true);
    while (document.activeElement !== parent()) key('ArrowDown');
    key('ArrowDown');
    eq(document.activeElement.dataset.ctx, 'link', 'Down skips the closed views');
    key('ArrowUp');
    key('ArrowRight');
    assert(
      parent().getAttribute('aria-expanded') === 'true' && document.activeElement.dataset.ctx === 'show:map',
      'Right opens onto the first view',
    );
    key('ArrowDown');
    eq(document.activeElement.dataset.ctx, 'show:timeline', 'Down moves through them');
    key('ArrowDown');
    eq(document.activeElement.dataset.ctx, 'link', 'and on past them');
    key('ArrowUp');
    key('ArrowLeft');
    assert(sub().hidden && document.activeElement === parent() && !ctxMenu.hidden, 'Left closes back onto the parent');
    key('ArrowRight');
    key('Escape');
    assert(
      sub().hidden && document.activeElement === parent() && !ctxMenu.hidden,
      'Escape on a view closes them, not the menu',
    );
    parent().click();
    assert(!sub().hidden && document.activeElement === parent(), 'Enter or Space (a click) opens it, focus stays');
    key('ArrowLeft');
    assert(sub().hidden && document.activeElement === parent(), 'Left on the open parent closes it');
    key('Escape');
    assert(ctxMenu.hidden, 'Escape on the parent closes the menu');
    // Near the bottom of the screen, opening it moves the menu up to stay on screen.
    openCtxMenu(g.id, 60, innerHeight - 4);
    const top = ctxMenu.getBoundingClientRect().top;
    assert(inView(), 'on screen');
    tap(parent());
    assert(
      inView() && ctxMenu.getBoundingClientRect().top < top,
      `moved up: ${top} → ${ctxMenu.getBoundingClientRect().top}`,
    );
    closeCtxMenu();
    // Taller than the screen: the menu scrolls to show the opened views, and stays open.
    openCtxMenu(g.id, 60, 60);
    ctxMenu.style.maxHeight = '200px';
    tap(parent());
    ctxMenu.dispatchEvent(new Event('scroll'));
    const last = sub().lastElementChild.getBoundingClientRect(),
      box = ctxMenu.getBoundingClientRect();
    assert(
      !ctxMenu.hidden && ctxMenu.scrollTop > 0 && last.bottom <= box.bottom && last.top >= box.top,
      'scrolled to the views',
    );
    ctxMenu.style.maxHeight = '';
    closeCtxMenu();
    // Only one other view: offered directly.
    setView('graphs');
    openCtxMenu(bare.id, 60, 60);
    const one = ctxMenu.querySelector('[data-ctx="show:map"]');
    assert(
      !parent() && one.offsetHeight && one.textContent === 'Show in Map view' && one.querySelector('svg'),
      'one view: a direct item',
    );
    tap(one);
    assert(ui.view === 'map' && ui.mapSelected === bare.id, 'and it shows the item there');
    // Slovenian.
    changeLanguage('sl');
    setView('goals');
    openCtxMenu(g.id, 60, 60);
    assert(
      parent().textContent === 'Prikaži v …' && $('#ctxSub').getAttribute('aria-label') === 'Prikaži v …',
      'Slovenian',
    );
    closeCtxMenu();
    changeLanguage('en');
    style.remove();
    deletePlan(plans.current);
  });
});
