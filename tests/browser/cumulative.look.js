/** Page tests: cumulative.look. */
suite(async () => {
  await step('cumulative: the scale switch and Counts in Slovenian', () => {
    fresh('Slovenian scales');
    const km = mk('state', {
      title: 'Km',
      unit: 'km',
      cumulative: true,
      scale: 'week',
      entries: [{ id: 'a', date: today(), amount: '5' }],
    });
    const g = mk('goal', { title: 'Teči' });
    rel(km, g, 'measures');
    save();
    changeLanguage('sl');
    setView('graphs');
    eq(
      [...document.querySelectorAll(`[data-gr="${km.id}"] .gr-scale button`)].map(b => b.textContent),
      ['Dan', 'Teden', 'Mesec', 'Leto', 'Skupaj'],
      'switch',
    );
    eq($(`[data-gr="${km.id}"] .gr-scale`).getAttribute('aria-label'), 'Prikaži vsote po', 'its label');
    eq($(`[data-gr="${km.id}"] .gr-value`).textContent, '5 km ta teden', 'this week');
    setView('states');
    eq($(`.card.state[data-open="${km.id}"] .cu-total`).textContent, '5 km skupaj', 'card total');
    openForm('goal', g.id);
    eq(
      [$('[data-field="period"] label').textContent, $('#f-period').selectedOptions[0].textContent],
      ['Šteje', 'Skupno'],
      'Counts',
    );
    modal.close();
    openForm('state', km.id);
    eq(
      [...$('#f-addsUp').options].map(o => o.textContent),
      ['Ne – vsaka vrednost nadomesti prejšnjo', 'Da – količine se seštevajo'],
      'adds up',
    );
    modal.close();
    changeLanguage('en');
    deletePlan(plans.current);
  });
  await step('cumulative: the scale switch fits a phone on one row, in both languages', async () => {
    const km = { id: 'k', cumulative: true, scale: 'week' };
    const out = [];
    for (const lang of ['en', 'sl']) {
      changeLanguage(lang);
      const frame = document.createElement('iframe');
      Object.assign(frame.style, {
        width: '390px',
        height: '300px',
        position: 'fixed',
        left: '-9999px',
        top: '0',
        border: '0',
      });
      frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0 16px"><article class="card gr-card">${scaleSwitch(km)}</article></body>`;
      await new Promise(res => {
        frame.onload = res;
        document.body.append(frame);
      });
      const doc = frame.contentDocument,
        card = doc.querySelector('.gr-card').getBoundingClientRect();
      const btns = [...doc.querySelectorAll('.gr-scale button')].map(b => b.getBoundingClientRect());
      assert(
        btns.length === 5 && btns.every(r => r.left >= card.left - 1 && r.right <= card.right + 1),
        `${lang}: every chip inside the card`,
      );
      assert(
        doc.documentElement.scrollWidth <= 390,
        `${lang}: no sideways scroll (${doc.documentElement.scrollWidth})`,
      );
      assert(
        btns.every(r => r.height >= 24),
        `${lang}: chips big enough to tap (${Math.min(...btns.map(r => r.height))} px)`,
      );
      const rows = new Set(btns.map(r => Math.round(r.top))).size;
      assert(rows === 1, `${lang}: one row (${rows})`);
      out.push(`${lang} ${rows} row`);
      frame.remove();
    }
    changeLanguage('en');
    return out.join(', ');
  });
  await step(
    'cumulative: a state card with both sums keeps its title on one line and everything inside the card',
    async () => {
      loadSample();
      setView('states');
      const km = db.states.find(s => s.cumulative && s.scale === 'week');
      const html = $(`.card.state[data-open="${km.id}"]`).outerHTML,
        out = [];
      // A phone, and the narrowest column of the desktop grid (320 px).
      for (const [name, width, pad] of [
        ['phone', 390, 16],
        ['desktop column', 352, 16],
      ]) {
        const frame = document.createElement('iframe');
        Object.assign(frame.style, {
          width: `${width}px`,
          height: '400px',
          position: 'fixed',
          left: '-9999px',
          top: '0',
          border: '0',
        });
        frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0 ${pad}px">${html}</body>`;
        await new Promise(res => {
          frame.onload = res;
          document.body.append(frame);
        });
        const doc = frame.contentDocument,
          card = doc.querySelector('.card').getBoundingClientRect();
        const title = doc.querySelector('.card-head h3'),
          head = doc.querySelector('.cu-head').getBoundingClientRect();
        const lineH = parseFloat(frame.contentWindow.getComputedStyle(title).lineHeight) || 24;
        assert(
          head.right <= card.right + 1 && head.left >= card.left - 1,
          `${name}: the sums and + inside the card (${Math.round(head.right)} > ${Math.round(card.right)})`,
        );
        assert(
          title.getBoundingClientRect().height < lineH * 1.5,
          `${name}: title on one line (${Math.round(title.getBoundingClientRect().height)} px)`,
        );
        out.push(`${name} ok`);
        frame.remove();
      }
      deletePlan(plans.current);
      return out.join(', ');
    },
  );
  await step('cumulative: Counts in the goal form has room like the fields around it', () => {
    loadSample();
    const km = db.states.find(s => s.cumulative),
      g = db.goals.find(x => relsFrom(km.id, 'measures').some(r => r.to === x.id));
    openForm('goal', g.id);
    const field = $('[data-field="period"]').getBoundingClientRect();
    const above = $('[data-field="unit"]').closest('.row2').getBoundingClientRect(),
      below = $('[data-field="baseline"]').closest('.row3').getBoundingClientRect();
    const gaps = [Math.round(field.top - above.bottom), Math.round(below.top - field.bottom)];
    assert(
      gaps.every(px => px >= 10),
      `gaps above and below Counts: ${gaps}`,
    );
    modal.close();
    deletePlan(plans.current);
    return gaps.join(', ') + ' px';
  });
  await step('cumulative: three years of daily amounts draw on every scale', () => {
    // Draw time is not checked here: the test browser runs on virtual time, where the clock stands
    // still during a script (measured outside it: about 0.3 s a render, nearly all of it the table).
    fresh('Long history');
    const entries = Array.from({ length: 1100 }, (_, i) => ({
      id: 'e' + i,
      date: addDays(today(), -i),
      amount: String(i % 7),
    }));
    const km = mk('state', { title: 'Km', unit: 'km', cumulative: true, scale: 'day', entries });
    save();
    const bars = {};
    for (const scale of SCALES) {
      km.scale = scale;
      setView('graphs');
      bars[scale] = document.querySelectorAll(`[data-gr="${km.id}"] .gr-bar`).length;
    }
    eq(
      bars,
      {
        day: 1100,
        week: periodTotals(km, 'week').length,
        month: periodTotals(km, 'month').length,
        year: periodTotals(km, 'year').length,
        total: 0,
      },
      'a bar per period',
    );
    assert(
      $(`[data-gr="${km.id}"] .gr-line`) && $(`[data-gr="${km.id}"] .gr-value`).textContent === totalText(km),
      'in total: the line',
    );
    deletePlan(plans.current);
    return JSON.stringify(bars);
  });
  await step('cumulative: wording in both languages', () => {
    const keys = Object.keys(I18N.en.strings).filter(
      k => k.startsWith('cu.') || k.startsWith('reached.') || k === 'help.tip.addAmount',
    );
    const missing = keys.filter(k => !(k in I18N.sl.strings));
    assert(keys.length > 50 && !missing.length, `missing in Slovenian: ${missing}`);
    changeLanguage('sl');
    const s = { cumulative: true, unit: 'km', entries: [entry(today(), 3)] };
    const text = scaleText(s, 'week');
    changeLanguage('en');
    assert(text === '3 km ta teden', text);
    const added = [
      'cu.opt.yes',
      'cu.inTotal',
      'cu.now.day',
      'cu.now.week',
      'cu.now.month',
      'cu.now.year',
      'cu.scaleLabel',
      ...SCALES.map(k => 'cu.scale.' + k),
      'cu.counts',
      'cu.countsHint',
      ...['total', ...PERIODS].map(k => 'cu.count.' + k),
      'cu.legend.total',
    ];
    const gone = [
      'cu.opt.day',
      'cu.opt.week',
      'cu.opt.month',
      'cu.opt.year',
      'cu.opt.none',
      'cu.total.week',
      'cu.total.none',
      'cu.legend.none',
    ];
    added.forEach(k =>
      assert(
        I18N.en.strings[k] && I18N.sl.strings[k] && I18N.en.strings[k] !== I18N.sl.strings[k],
        `${k} in both languages`,
      ),
    );
    gone.forEach(k => assert(!(k in I18N.en.strings) && !(k in I18N.sl.strings), `${k} removed`));
    // Help and tour no longer speak of a state adding up per period; they tell of the switch and of goals.
    const en = I18N.en.strings,
      sl = I18N.sl.strings;
    assert(
      !/per day, week, month or year, or in total/.test(en['help.view.states']) &&
        !/po dnevih, tednih, mesecih ali letih ali skupno:/.test(sl['help.view.states']),
      'help.view.states',
    );
    assert(
      en['help.view.graphs'].includes('switch above the graph') &&
        sl['help.view.graphs'].includes('preklopite nad grafom'),
      'help.view.graphs',
    );
    assert(
      !en['help.tip.addAmount'].includes('the better of this period') &&
        !sl['help.tip.addAmount'].includes('boljše od tekočega'),
      'help.tip.addAmount',
    );
    assert(
      en['tour.goals.text'].includes('picks how it counts') && sl['tour.goals.text'].includes('izbere, kako šteje'),
      'tour.goals.text',
    );
    assert(
      en['tour.graphs.text'].includes('per day, week, month or year, or in total') &&
        sl['tour.graphs.text'].includes('po dnevih, tednih, mesecih ali letih ali skupno'),
      'tour.graphs.text',
    );
    // Sample plan and the Marathon template are in the new form.
    const sample = sampleData(),
      dist = sample.states.find(s => s.cumulative);
    const wk = sample.goals.find(g =>
      sample.relations.some(r => r.type === 'measures' && r.from === dist.id && r.to === g.id),
    );
    eq([dist.cumulative, dist.scale, wk.period], [true, 'week', 'week'], 'sample');
    const weekly = templateData(TEMPLATES.find(x => x.id === 'marathon')).states.find(s => s.cumulative);
    eq([weekly.cumulative, weekly.scale], [true, 'week'], 'Marathon template');
    return text;
  });
});
