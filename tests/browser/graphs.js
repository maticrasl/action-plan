/** Page tests: the graphs: pointer and keys, ticks, pinch and zoom, routine and cumulative graphs, their menu. */
suite(async () => {
  loadSample(); // the first step reads the sample plan's first graph
  await step('graphs pointer + keyboard: a tip only on a dot; a finger taps, does not slide', () => {
    setView('graphs');
    const plot = $('.gr-plot'),
      c = grCharts[plot.closest('[data-gr]').dataset.gr],
      last = c.points.at(-1),
      r = plot.querySelector('svg').getBoundingClientRect();
    const at = (type, dx, dy, pointerType = 'mouse') =>
      plot.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerType,
          clientX: r.left + c.px(last.day) + dx,
          clientY: r.top + c.py(last.value) + dy,
        }),
      );
    const shown = () => !plot.querySelector('.gr-tip').hidden;
    at('pointermove', 40, 0);
    assert(!shown(), 'right of the latest dot: no tip');
    at('pointermove', 0, 60);
    assert(!shown(), 'below the latest dot: no tip');
    at('pointermove', 4, -4);
    assert(shown() && plot.dataset.i === String(c.points.length - 1), 'on the latest dot: its tip');
    at('pointermove', 40, 0);
    assert(!shown(), 'moving off hides it');
    at('pointermove', 0, 0, 'touch');
    assert(!shown(), 'a finger sliding (a pinch, a scroll) shows nothing');
    at('click', 10, 10, 'touch');
    assert(shown(), 'a tap on the dot shows it');
    at('click', 60, 0, 'touch');
    assert(!shown(), 'a tap elsewhere hides it');
    at('pointermove', 0, 0);
    const tip = plot.querySelector('.gr-tip').textContent;
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    const i = plot.dataset.i;
    return `tip="${tip}" i=${i}`;
  });

  await step('graph helpers: ticks, change and signs', () => {
    eq(niceTicks(0, 10), [0, 5, 10], 'ticks 0–10');
    eq(niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100], 'ticks 0–100');
    [
      [3, 3],
      [0, 0],
      [-7, 13],
      [0.01, 0.07],
      [1e6, 1.3e6],
    ].forEach(([lo, hi]) => {
      const tk = niceTicks(lo, hi);
      const step = tk[1] - tk[0];
      assert(tk[0] <= lo && tk[tk.length - 1] >= hi, `ticks cover ${lo}–${hi}: ${tk}`);
      assert(
        tk.every((v, i) => !i || Math.abs(v - tk[i - 1] - step) < step * 1e-6),
        `even steps ${tk}`,
      );
      const m = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
      assert(
        [1, 2, 5].some(x => Math.abs(m - x) < 1e-6),
        `nice step ${step}`,
      );
    });
    const p = (v, day) => ({ value: v, day, date: '2099-01-0' + day });
    const up = stateChange({}, [p(10, 1), p(15, 2)], [{ value: 20 }]);
    assert(up.delta === 5 && up.pct === 50 && up.good === true, 'towards target is good');
    assert(stateChange({}, [p(10, 1), p(15, 2)], [{ value: 5 }]).good === false, 'away from target is bad');
    assert(stateChange({}, [p(10, 1), p(15, 2)], []).good === null, 'no target: neutral');
    assert(stateChange({}, [p(0, 1), p(3, 2)], []).pct === null, 'no percentage from zero');
    assert(stateChange({}, [p(10, 1)], []) === null, 'one point: no change');
    eq([signed(0), signed(2.5), signed(-2.5)], ['±0', '+2.5', '−2.5'], 'signed');
  });
  await step('graphs: a pinch zooms the chart, not the page; a sideways swipe still moves the crosshair', () => {
    loadSample();
    setView('graphs');
    const plots = [...viewEl.querySelectorAll('.gr-plot')];
    assert(plots.length, 'charts drawn');
    const ta = getComputedStyle(plots[0]).touchAction;
    assert(ta === 'pan-y', `up and down scrolls; sideways and pinch are the app's: ${ta}`);
    for (const v of ['map', 'timeline']) {
      setView(v);
      const own = getComputedStyle($(ZOOM_SEL)).touchAction;
      assert(!own.includes('pinch-zoom'), `${v} keeps its own pinch: ${own}`);
    }
    deletePlan(plans.current);
    return ta;
  });
  await step('graphs: zoom stretches the time axis around the pointer, within limits; today is a column', async () => {
    fresh('Graph zoom');
    const s = mk('state', {
      title: 'Weight',
      history: [
        { date: d(-60), value: '1' },
        { date: d(-30), value: '3' },
        { date: d(0), value: '5' },
      ],
    });
    save();
    setView('graphs');
    const plot = () => $(`[data-gr="${s.id}"] .gr-plot`),
      svg = () => plot().querySelector('svg'),
      W = () => Number(svg().getAttribute('width'));
    const c = () => grCharts[s.id],
      el = plot(),
      w0 = W(),
      todayN = dayNum(today());
    assert(!el.classList.contains('scroll'), 'unzoomed it fits the card');
    // Today: a column a day wide around today's measurement, inside the plot.
    const col = svg().querySelector('.gr-today'),
      cw = Number(col.getAttribute('width')),
      cx0 = Number(col.getAttribute('x'));
    const dayW = c().px(todayN + 0.5) - c().px(todayN - 0.5);
    assert(
      Math.abs(cw - Math.max(dayW, 3)) < 0.01 && Math.abs(cx0 + cw / 2 - c().px(todayN)) < 0.01,
      `today column ${cw.toFixed(1)} px for a ${dayW.toFixed(1)} px day`,
    );
    assert(cx0 + cw <= w0 - GR.R + 0.01, 'not cut off at the edge');
    // Limits: never narrower than the card, never more than TL.MAX px a day.
    zoomGraph(el, 1e6, svg().getBoundingClientRect().left + 100);
    const max = W(),
      days = c().points.length && 60.5;
    assert(max === Math.round(GR.L + GR.R + days * TL.MAX), `zoomed all the way in: ${max}`);
    assert(plot() === el && el.classList.contains('scroll'), 'same element, now scrolls');
    zoomGraph(el, 1e-6, svg().getBoundingClientRect().left + 100);
    assert(W() === w0 && !el.classList.contains('scroll'), `zoomed out to the card: ${W()}`);
    // The day under the pointer stays put.
    const at = () => svg().getBoundingClientRect().left + c().px(dayNum(d(-30)));
    const x = at();
    zoomGraph(el, 4, x);
    assert(
      Math.abs(at() - x) < 1.5 && el.scrollLeft > 0,
      `anchored: ${x.toFixed(1)} → ${at().toFixed(1)}, scrolled ${el.scrollLeft}`,
    );
    // Zoomed, the values stay at the left and more dates show; unzoomed, only the ends and today.
    const yax = el.querySelector('.gr-yaxis'),
      dates = el.querySelectorAll(`svg:not(.gr-yaxis) .gr-axis[y="${GR.H - 6}"]`).length;
    assert(
      yax && Math.abs(yax.getBoundingClientRect().left - el.getBoundingClientRect().left) < 2,
      'value axis pinned while scrolled',
    );
    assert(dates > 3, `dates along a zoomed axis: ${dates}`);
    // A redraw keeps the zoom and the scroll; ctrl + wheel and + / − zoom too.
    const zoomed = W(),
      left = el.scrollLeft;
    render();
    assert(
      W() === zoomed && Math.abs(plot().scrollLeft - left) < 1,
      `kept over a redraw: ${plot().scrollLeft} vs ${left}`,
    );
    const r = plot().getBoundingClientRect();
    plot().dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -100,
        clientX: r.left + 200,
        clientY: r.top + 50,
      }),
    );
    await tick();
    await tick();
    assert(W() > zoomed, `ctrl + wheel zooms in: ${zoomed} → ${W()}`);
    const wheeled = W();
    plot().focus();
    plot().dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true, cancelable: true }));
    assert(W() < wheeled && !plot().querySelector('.gr-focus').hidden, `− zooms out, crosshair kept: ${W()}`);
    plot().dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
    assert(W() > wheeled * 0.99, `+ zooms back in: ${W()}`);
    plot().blur();

    // Bars: today's column covers today's day, less the bars' 1 px gap at each side.
    const rt = mk('activity', {
      title: 'Run',
      repeat: { times: 1, per: 'week' },
      checkins: { [d(-8)]: 1, [d(0)]: 1 },
      startDate: d(-20),
    });
    save();
    render();
    const bc = grCharts[rt.id],
      bcol = $(`[data-gr="${rt.id}"] .gr-today`),
      bw = Number(bcol.getAttribute('width'));
    const bday = bc.px(todayN + 1) - bc.px(todayN);
    assert(
      Math.abs(Number(bcol.getAttribute('x')) + bw / 2 - (bc.px(todayN) + bday / 2)) < 0.01 &&
        Math.abs(bw - Math.max(bday - 2, 3)) < 0.01,
      `bar chart today ${bw.toFixed(1)} px`,
    );

    // Timeline: the column is a day wide, at least 3 px, behind the bars.
    const g = mk('goal', { startDate: d(-5), deadline: d(30) });
    save();
    setView('timeline');
    const widths = [30, 8, 1.5].map(p => {
      ui.tlPx = p;
      render();
      return $('.tl-today').getBoundingClientRect().width;
    });
    assert(
      Math.abs(widths[0] - 30) < 0.5 && Math.abs(widths[1] - 8) < 0.5 && Math.abs(widths[2] - 3) < 0.5,
      `timeline today ${widths.join(', ')}`,
    );
    assert(getComputedStyle($('.tl-today')).zIndex === 'auto', 'drawn behind the bars');
    ui.tlPx = TL.ZOOM.month;
    ui.grZoom = {};
    return `card ${w0}, max ${max}, wheel ${wheeled}, today ${cw.toFixed(1)}/${bw.toFixed(1)} px, timeline ${widths.join('/')}`;
  });
  await step('routine graphs: switch to check-ins per day, week, month or year, or in total', () => {
    fresh('Routine scales');
    const a = mk('activity', {
      title: 'Swim',
      repeat: { times: 2, per: 'week' },
      startDate: d(-20),
      checkins: { [d(-15)]: 1, [d(-8)]: 1, [d(-7)]: 1, [d(-6)]: 0, [d(0)]: 1 },
    });
    save();
    setView('graphs');
    const card = () => $(`[data-gr="${a.id}"]`),
      pressed = () => [...card().querySelectorAll('.gr-scale [aria-pressed="true"]')].map(b => b.dataset.grScale);
    const bars = () => [...card().querySelectorAll('.gr-bar')],
      tipOf = i => {
        const p = card().querySelector('.gr-plot');
        showGraphPoint(p, i);
        return p.querySelector('.gr-tip-value').textContent;
      };
    eq(
      [...card().querySelectorAll('.gr-scale button')].map(b => b.dataset.grScale),
      SCALES,
      'five scales, as on a state',
    );
    eq(pressed(), [periodUnit(a)], 'starts on its own period');
    assert(card().querySelectorAll('.gr-goal').length === bars().length, 'which shows what each period asks for');
    a.updatedAt = '2000-01-01T00:00:00.000Z';
    card().querySelector('[data-gr-scale="day"]').click();
    assert(a.scale === 'day' && a.updatedAt !== '2000-01-01T00:00:00.000Z', 'kept on the routine and synced');
    eq(pressed(), ['day'], 'day pressed');
    assert(
      bars().length === 16 && !card().querySelector('.gr-goal'),
      `a bar a day from the first check-in: ${bars().length}`,
    );
    const axis = [...card().querySelectorAll('.gr-axis[text-anchor="end"]')]
      .map(x => x.textContent)
      .filter(x => /^[\d.,]+$/.test(x));
    assert(axis.length >= 2 && axis.every(x => Number.isInteger(Number(x))), `whole numbers on the axis: ${axis}`);
    assert(
      card().querySelectorAll('.gr-bar.now').length === 1 &&
        tipOf(15) === tp('rt.checkins', 1) &&
        tipOf(14) === tp('rt.checkins', 0),
      'today lighter; a day unticked counts nothing',
    );
    eq(
      card().querySelector('.gr-value').textContent,
      t('cu.now.day', { value: tp('rt.checkins', 1) }),
      'today’s count',
    );
    assert(
      !card().querySelector('.gr-table'),
      'no table for a routine',
    );
    card().querySelector('[data-gr-scale="week"]').click();
    assert(card().querySelector('.gr-goal'), 'its own period again: what each week asks for');
    // The bars fill their periods, a thin gap apart; today's strip is drawn inside the week under way.
    const box = el => ['x', 'width'].map(k => Number(el.getAttribute(k))),
      wk = bars().map(box);
    assert(
      wk.slice(1).every(([x], i) => Math.abs(x - (wk[i][0] + wk[i][1])) <= 2.01),
      `bars side by side: ${JSON.stringify(wk)}`,
    );
    const [tx, tw] = box(card().querySelector('.gr-today.over')),
      [nx, nw] = box(card().querySelector('.gr-bar.now'));
    assert(
      tx >= nx - 0.01 &&
        tx + tw <= nx + nw + 0.01 &&
        card().querySelector('.gr-bar.now').compareDocumentPosition(card().querySelector('.gr-today')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      'today inside this week’s bar, over it',
    );
    card().querySelector('[data-gr-scale="month"]').click();
    const sum = bars().reduce((n, b, i) => n + parseInt(tipOf(i), 10), 0);
    assert(sum === 4 && !card().querySelector('.gr-goal'), `monthly bars add up to every check-in: ${sum}`);
    card().querySelector('[data-gr-scale="total"]').click();
    assert(
      card().querySelector('.gr-line').getAttribute('d').includes('H') && !card().querySelector('.gr-bar'),
      'in total: a step line',
    );
    eq(
      card().querySelector('.gr-value').textContent,
      t('cu.inTotal', { value: tp('rt.checkins', 4) }),
      'four in total',
    );
    eq(
      card().querySelector('.gr-scale').getAttribute('aria-label'),
      t('cu.scaleLabelRoutine'),
      'the switch counts check-ins',
    );
    setLanguage('sl');
    render();
    eq(card().querySelector('.gr-value').textContent, '4 izvedbe skupaj', 'in Slovenian');
    setLanguage('en');
    render();
    return `day 16 bars, month ${sum}, total ok`;
  });
  await step('cumulative graphs: bars per period, running total, a graph per routine, Show in', () => {
    loadSample();
    setView('graphs');
    const km = db.states.find(s => s.cumulative === true && s.scale === 'week'),
      run = db.activities.find(a => relsFrom(a.id, 'improves').some(r => r.to === km.id) && isRoutine(a));
    const card = $(`[data-gr="${km.id}"]`);
    assert(
      card.querySelectorAll('.gr-bar').length === periodTotals(km, 'week').length &&
        card.querySelectorAll('.gr-bar.now').length === 1,
      'a bar per week, this one lighter',
    );
    assert(card.querySelector('.gr-value').textContent === scaleText(km, 'week'), 'this week');
    const plot = card.querySelector('.gr-plot');
    plot.focus();
    assert(
      plot.querySelector('.gr-tip-date').textContent.startsWith('Week of') &&
        plot.querySelector('.gr-tip-value').textContent === withUnit(fmtNum(stateTotal(km, 'week')), 'km'),
      plot.querySelector('.gr-tip').textContent,
    );
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert(
      plot.querySelector('.gr-tip-value').textContent === withUnit(fmtNum(periodTotals(km, 'week')[0].total), 'km'),
      'Home: the first week',
    );
    plot.blur();
    // Every routine with check-ins has a graph; its bars show check-ins against the period's target.
    const rc = $(`[data-gr="${run.id}"]`);
    assert(
      rc &&
        rc.querySelectorAll('.gr-bar').length >= 5 &&
        rc.querySelectorAll('.gr-bar.met').length >= 1 &&
        rc.querySelectorAll('.gr-goal').length >= 5,
      'routine graph',
    );
    db.activities.filter(isRoutine).forEach(a => assert($(`[data-gr="${a.id}"]`), `${a.title} has a graph`));
    // Delete an entry from the table.
    const n = km.entries.length,
      del = card.querySelector('[data-del-entry]');
    del.click();
    assert(
      km.entries.length === n - 1 && $(`[data-gr="${km.id}"] .gr-table`).open,
      'deleted from the table, which stays open',
    );
    // A running total: a step line.
    km.scale = 'total';
    render();
    assert(
      $(`[data-gr="${km.id}"] .gr-line`).getAttribute('d').includes('H') &&
        $(`[data-gr="${km.id}"] .gr-value`).textContent.endsWith('in total'),
      'step line of the total',
    );
    km.scale = 'week';
    render();
    // The switch above the graph: per day, week, month or year, or in total; the choice is kept on the state.
    const scaleBtns = () => [...document.querySelectorAll(`[data-gr="${km.id}"] .gr-scale button`)];
    eq(
      scaleBtns().map(b => b.dataset.grScale),
      ['day', 'week', 'month', 'year', 'total'],
      'five scales',
    );
    eq(
      scaleBtns()
        .filter(b => b.getAttribute('aria-pressed') === 'true')
        .map(b => b.dataset.grScale),
      ['week'],
      'the current one pressed',
    );
    eq(
      scaleBtns()
        .filter(b => b.classList.contains('active'))
        .map(b => b.dataset.grScale),
      ['week'],
      'and shown as selected',
    );
    const goal = db.goals.find(g => relsFrom(km.id, 'measures').some(r => r.to === g.id));
    assert(
      goalPeriod(goal) === 'week' && $(`[data-gr="${km.id}"] .gr-target`),
      'a weekly goal’s target on weekly bars',
    );
    const before = (km.updatedAt = '2000-01-01T00:00:00.000Z');
    $(`[data-gr="${km.id}"] [data-gr-scale="month"]`).click();
    assert(km.scale === 'month' && km.updatedAt !== before, 'saved on the state');
    const mc = $(`[data-gr="${km.id}"]`);
    assert(
      mc.querySelectorAll('.gr-bar').length === periodTotals(km, 'month').length &&
        mc.querySelector('.gr-period td').textContent ===
          periodLabel('month', calPeriod('month', today()).from, calPeriod('month', today()).to),
      'monthly bars',
    );
    assert(!mc.querySelector('.gr-target'), 'no weekly target on monthly bars');
    assert(document.activeElement === mc.querySelector('[data-gr-scale="month"]'), 'focus stays on the switch');
    mc.querySelector('[data-gr-scale="total"]').click();
    assert(
      $(`[data-gr="${km.id}"] .gr-line`) && !$(`[data-gr="${km.id}"] .gr-bar`) && !$(`[data-gr="${km.id}"] .gr-target`),
      'in total: a line, the weekly target left out',
    );
    goal.period = 'total';
    render();
    assert($(`[data-gr="${km.id}"] .gr-target`), 'an in-total goal’s target on the running total');
    goal.period = 'week';
    km.scale = 'week';
    render();
    assert(
      $(`[data-gr="${km.id}"] .gr-value`).textContent === scaleText(km, 'week'),
      'the card follows the scale',
    );
    const plain = db.states.find(s => !isCumulative(s) && $(`[data-gr="${s.id}"]`));
    assert(!$(`[data-gr="${plain.id}"] .gr-scale`), 'plain states have no switch');
    // Show in Graphs, for a routine too.
    setView('activities');
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 });
    $(`.card.routine[data-open="${run.id}"]`).dispatchEvent(e);
    $('#ctxMenu [data-ctx="show:graphs"]').click();
    assert(ui.view === 'graphs' && $(`[data-gr="${run.id}"]`), 'shown in Graphs');
    // Long daily histories scroll, starting at the latest days.
    km.scale = 'day';
    km.entries.push(entry(addDays(today(), -200), 3));
    render();
    const daily = $(`[data-gr="${km.id}"] .gr-plot`);
    assert(daily.classList.contains('scroll') && daily.scrollLeft > 0, `daily bars scroll: ${daily.scrollLeft}`);
    deletePlan(plans.current);
    return `${periodTotals(km, 'day').length} days`;
  });
  await step('graphs: right-click anywhere on a graph opens its item menu; tick boxes are flat', () => {
    loadSample();
    setView('graphs');
    const card = $('#view .gr-card'),
      plot = card.querySelector('.gr-plot');
    plot.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    const item = findEntity(card.dataset.gr).item;
    assert(
      !ctxMenu.hidden &&
        ctxMenu.dataset.id === card.dataset.gr &&
        ctxMenu.querySelector('.ctx-head strong').textContent === item.title,
      'menu from the plot',
    );
    const acts = [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
    assert(acts.includes('edit') && acts.includes('delete') && !acts.includes('show:graphs'), `graph menu: ${acts}`);
    closeCtxMenu();
    // A value added from the menu opens by the graph's heading, not round the whole tall card.
    const sc = [...document.querySelectorAll('#view .gr-card')].find(c => findEntity(c.dataset.gr).kind === 'state');
    sc.querySelector('.gr-plot').dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }),
    );
    ctxMenu.querySelector('[data-ctx="value"]').click();
    assert($('.amount-pop') && amountPop.anchor === sc.querySelector('.card-head'), 'value popup by the heading');
    closeAmountPop();
    assert(t('help.view.graphs').includes('right-click'), 'the help says so');
    // By night a graph is a dark pane cut from the surface, not a light slab of the items' milk.
    const was = theme;
    $('#themeSeg [data-theme-set="dark"]').click();
    const lum = c =>
      c
        .match(/[\d.]+/g)
        .slice(0, 3)
        .reduce((x, y) => x + +y, 0);
    const pane = $('#view .gr-card'),
      surface = getComputedStyle(document.body).getPropertyValue('--surface').trim();
    assert(
      getComputedStyle(pane).getPropertyValue('--glass-base').trim() === surface &&
        lum(getComputedStyle(pane).backgroundColor) < lum(getComputedStyle($('#view select')).backgroundColor) + 40,
      `dark graph pane ${getComputedStyle(pane).backgroundColor}`,
    );
    $(`#themeSeg [data-theme-set="${was}"]`).click();
    // Tick boxes are flat: the page's colour inside an outline in the card's edge colour. Done, they fill green.
    setView('activities');
    const css = el => getComputedStyle(el),
      open = $('#view .acts .card .check:not(.done):not(.doing)'),
      doing = $('#view .acts .card .check.doing'),
      done = $('#view .acts .card .check.done');
    const bg = css(document.body).backgroundColor,
      sh = css(open).boxShadow,
      ring = sh.match(/(rgba?\([^)]*\)|color\([^)]*\)) 0px 0px 0px 1.5px inset/),
      edge = css(open.closest('.glass')).boxShadow.match(/(rgba?\([^)]*\)|color\([^)]*\)) 0px 0px 0px 1px/);
    assert(
      open && css(open).backgroundColor === bg && ring && edge && ring[1] === edge[1],
      `an empty box is flat: ${sh}`,
    );
    assert(doing && css(doing).backgroundColor === bg, 'in progress: no amber floor');
    // The checklist in a routine card is clear, part of the card's glass.
    const list = $('#view .card.routine .li-ticks');
    assert(!list || css(list).backgroundColor === 'rgba(0, 0, 0, 0)', 'routine checklist is clear glass');
    assert(css(done).boxShadow === 'none', 'done: a flat green box');
    assert(
      css(done).backgroundColor ===
        css(document.documentElement)
          .getPropertyValue('--ok')
          .trim()
          .replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${[r, g, b].map(h => parseInt(h, 16)).join(', ')})`),
      'done tile is green',
    );
    setView('dashboard');
  });
  await step('phone: the on-screen keyboard (a resize, same width) keeps the value popup open', async () => {
    setView('graphs');
    const sc = [...document.querySelectorAll('#view .gr-card')].find(c => findEntity(c.dataset.gr).kind === 'state');
    sc.querySelector('.gr-plot').dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }),
    );
    ctxMenu.querySelector('[data-ctx="value"]').click();
    window.dispatchEvent(new Event('resize'));
    await new Promise(r => setTimeout(r, 250));
    assert($('.amount-pop') && amountPop, 'popup still open');
    closeAmountPop();
    setView('dashboard');
  });
  await step('measurement table: change since the last one, green toward the goal, red away', () => {
    fresh('Since last');
    const s = mk('state', { title: 'Weight', unit: 'kg', history: [] });
    [
      [-30, '90'],
      [-20, '88'],
      [-10, '89'],
      [0, '89'],
    ].forEach(([n, v]) => recordMeasurement(s, d(n), v));
    const g = mk('goal', { title: 'Lose weight', metric: 'kg', target: '80', deadline: d(100) });
    rel(s, g, 'measures');
    save();
    setView('graphs');
    const th = $(`[data-gr="${s.id}"] .gr-table th:nth-child(3)`).textContent;
    eq(th, t('gr.col.change'), 'header');
    eq(th, 'Change since last', 'English header');
    const cells = [...$(`[data-gr="${s.id}"] .gr-table tbody`).rows].map(r => r.cells[2]);
    eq(cells.map(c => c.textContent).join(), '±0 kg,+1 kg,−2 kg,—', 'newest first, each against the one before');
    eq(cells.map(c => c.className).join(), ',gr-bad,gr-ok,', 'no colour unchanged or first');
    g.target = '';
    save();
    render();
    const plain = [...$(`[data-gr="${s.id}"] .gr-table tbody`).rows].map(r => r.cells[2].className);
    eq(plain.join(), ',,,', 'no colour without a target');
  });
});
