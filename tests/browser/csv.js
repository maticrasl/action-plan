/** Page tests: measurements in and out as CSV (Export as CSV, the plan's Measurements (CSV), Import from CSV…). */
suite(async () => {
  const dlg = () => $('#csvImport');
  const preview = () => $('#csvPreview').textContent.replace(/\s+/g, ' ').trim();
  const btn = () => $('#csvDoBtn');
  const toastText = () => $('#toast').firstChild?.textContent;
  const undoBtn = () => $('#toast .toast-action');
  const bytes = async blob => new Uint8Array(await blob.arrayBuffer());
  const text = async blob => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await bytes(blob));
  const paste = csv => {
    $('#csvPaste').value = csv;
    $('#csvPaste').dispatchEvent(new Event('input', { bubbles: true }));
  };
  const pick = (csv, name = 'weight.csv') => readCsvFile(new File([csv], name, { type: 'text/csv' }));
  const choose = (sel, value) => {
    const el = dlg().querySelector(sel);
    if (el.type === 'radio') el.checked = true;
    else el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const weight = (history = []) => {
    fresh('CSV plan');
    const s = mk('state', { title: 'Body weight', unit: 'kg', value: '', history });
    save();
    return s;
  };
  // 124 data rows, a week apart from 2 Jan 2025: five on days that have a value, line 17 is not a number.
  const file124 = () => {
    const days = Array.from({ length: 124 }, (_, i) => addDays('2023-01-02', i * 7));
    const lines = days.map(
      (d, i) =>
        `${d.split('-').reverse().join('/')};${i === 15 ? 'n/a' : (82.4 - i / 10).toFixed(1).replace('.', ',')}`,
    );
    return { days, csv: ['Datum;Teža'].concat(lines).join('\r\n') };
  };

  await step('csv: the state menu and the state form offer Import from CSV… and Export as CSV', () => {
    const s = weight();
    const acts = ctxOptions('state', s).map(o => o.act);
    assert(acts.includes('csv-import') && acts.includes('csv-export'), 'in the menu');
    openForm('state', s.id);
    assert($(`#modal [data-csv-import="${s.id}"]`) && $(`#modal [data-csv-export="${s.id}"]`), 'in the form');
    modal.close();
    openForm('state');
    assert(!$('#modal [data-csv-import]'), 'not in the form for a new state');
    modal.close();
  });

  await step('csv: Export as CSV writes the state’s file as specified', async () => {
    const s = weight([
      { date: '2025-01-09', value: '82.1' },
      { date: '2025-01-02', value: '82.4' },
    ]);
    s.title = 'Body/weight';
    const got = await capture(() => runCtxAction('csv-export', s.id));
    eq(got.length, 1, 'one file');
    eq(got[0].name, `Bodyweight-${today()}.csv`, 'named by the state, characters a file cannot hold removed');
    eq([...(await bytes(got[0].blob)).slice(0, 3)], [0xef, 0xbb, 0xbf], 'byte-order mark');
    eq(await text(got[0].blob), '\ufeffdate,value,note\r\n2025-01-02,82.4,\r\n2025-01-09,82.1,\r\n', 'the text');
  });

  await step('csv: Export plan › Measurements (CSV) holds every state', async () => {
    fresh('Two states');
    mk('state', { title: 'Weight', unit: 'kg', value: '80', history: [{ date: d(-1), value: '80' }] });
    mk('state', {
      title: '=Pages',
      unit: 'pages',
      cumulative: true,
      history: [],
      entries: [{ id: 'e1', date: d(-2), amount: '12' }],
    });
    save();
    openExport();
    const exp = $('#planExport');
    exp.querySelector('input[name="exportKind"][value="csv"]').checked = true;
    const got = await capture(() => $('#exportDownloadBtn').click());
    eq(got[0].name, `Two states-${today()}.csv`, 'file name');
    eq(
      (await text(got[0].blob)).split('\r\n'),
      ['\ufeffstate,unit,date,value,note', `Weight,kg,${d(-1)},80,`, `'=Pages,pages,${d(-2)},12,`, ''],
      'every state, formula text guarded',
    );
  });

  await step('csv: import 124 rows: the preview, Import, the graph, and Undo puts replaced values back', async () => {
    const { days, csv } = file124();
    const mine = days.slice(10, 15).map(d => ({ date: d, value: '99' }));
    const s = weight(mine);
    runCtxAction('csv-import', s.id);
    try {
      assert(dlg().open, 'opens');
      eq($('#csvTitle').textContent, t('csv.title', { name: 'Body weight' }), 'title');
      eq(btn().disabled, true, 'nothing to import yet');
      await pick(csv);
      const how = t('csv.how', { d: 1, order: t('csv.order.dmy'), v: 2 });
      assert(preview().includes(tp('csv.read', 124, { how })), 'says what it read: ' + preview());
      eq(dlg().querySelectorAll('.csv-rows tr').length, 3, 'first rows shown');
      assert(preview().includes(fmtDate('2023-01-02')) && preview().includes('82.4 kg'), 'the first row');
      assert(preview().includes(t('csv.more', { n: 120 })), 'and the rest counted');
      eq($('#csvSummary').textContent, t('csv.summary', { new: 118, clash: 5, skipped: 1 }), 'counts');
      assert(
        preview().includes(t('csv.line', { n: 17, reason: t('csv.reason.noNumber', { text: 'n/a' }) })),
        'skipped line listed',
      );
      assert(!$('#csvChoice').hidden, 'asks about days that have a value');
      eq(btn().textContent, tp('csv.do', 118), 'keep mine');
      choose('input[name="csvTake"][value="1"]');
      eq(btn().textContent, tp('csv.do', 123), 'take the file’s');
      btn().click();
      assert(!dlg().open, 'closes');
      eq(toastText(), tp('csv.done', 123), 'toast');
      eq(s.history.length, 123, 'all in');
      eq(s.history.find(h => h.date === days[10]).value, '81.4', 'replaced');
      eq([s.date, s.value], [days[123], String((82.4 - 12.3).toFixed(1))], 'value follows the latest');
      setView('graphs');
      assert($(`[data-gr="${s.id}"]`), 'the graph shows them');
      undoBtn().click();
      const back = db.states.find(x => x.id === s.id);
      eq(back.history, mine, 'Undo removes them and restores replaced values');
    } finally {
      if (dlg().open) dlg().close();
    }
  });

  await step('csv: paste gives the same preview; changing the date order changes it and the result', async () => {
    const s = weight();
    runCtxAction('csv-import', s.id);
    try {
      await pick('05/06/2025,80\n07/06/2025,81');
      const fromFile = preview();
      dlg().close();
      runCtxAction('csv-import', s.id);
      paste('05/06/2025,80\n07/06/2025,81');
      eq(preview(), fromFile, 'same preview');
      eq(dlg().querySelector('#csvOrder').value, 'dmy', 'day first by default');
      assert(preview().includes(fmtDate('2025-06-05')), 'read day first');
      choose('#csvOrder', 'mdy');
      assert(preview().includes(fmtDate('2025-05-06')), 'read month first');
      assert(preview().includes(t('csv.order.mdy')), 'says so');
      btn().click();
      eq(
        s.history.map(h => h.date),
        ['2025-05-06', '2025-07-06'],
        'imported as previewed',
      );
    } finally {
      if (dlg().open) dlg().close();
    }
  });

  await step('csv: an empty file, a plan file and 20,001 rows give their messages; 5,000 rows import', async () => {
    const s = weight();
    runCtxAction('csv-import', s.id);
    try {
      await pick('');
      paste('   \n\n');
      eq(preview(), '', 'nothing pasted, nothing said');
      paste(JSON.stringify(planFile('full'), null, 2));
      eq(preview(), t('csv.none'), 'a plan file');
      assert(btn().disabled, 'nothing to import');
      paste('date,value\n' + Array.from({ length: 20001 }, () => '2025-01-02,1').join('\n'));
      eq(preview(), t('csv.tooMany'), 'too many rows');
      assert(btn().disabled, 'refused');
      paste(Array.from({ length: 5000 }, (_, i) => `${addDays('2010-01-01', i)},${i}`).join('\n'));
      eq(btn().textContent, tp('csv.do', 5000), '5,000 values');
      btn().click();
      eq(s.history.length, 5000, 'imported');
    } finally {
      if (dlg().open) dlg().close();
    }
  });

  await step('csv: a day whose measurement was deleted comes back; Undo leaves the deletion remembered', () => {
    const s = weight([{ date: d(-3), value: '80' }]);
    deleteMeasurement(s, d(-3));
    save();
    runCtxAction('csv-import', s.id);
    paste(`${d(-3)},79.5\n${d(1)},70`);
    try {
      eq($('#csvSummary').textContent, t('csv.summary', { new: 1, clash: 0, skipped: 1 }), 'the future day skipped');
      assert(preview().includes(t('csv.reason.future')), 'and why');
      btn().click();
      eq(s.history, [{ date: d(-3), value: '79.5' }], 'back');
      assert(!s.dropped, 'the remembered deletion is cleared');
    } finally {
      if (dlg().open) dlg().close();
    }
  });

  await step('csv: adds up: a second import adds nothing; add again adds them', () => {
    fresh('Adds up');
    const s = mk('state', { title: 'Pages', unit: 'pages', cumulative: true, history: [], entries: [], value: '' });
    save();
    const csv = `date,amount\n${d(-2)},10\n${d(-2)},10\n${d(-1)},5`;
    runCtxAction('csv-import', s.id);
    paste(csv);
    eq(btn().textContent, tp('csv.do', 3), 'three amounts');
    assert($('#csvChoice').hidden, 'nothing already there');
    btn().click();
    eq(stateTotal(s), 25, 'added');
    runCtxAction('csv-import', s.id);
    paste(csv);
    try {
      eq($('#csvSummary').textContent, t('csv.summaryAdds', { new: 0, clash: 3, skipped: 0 }), 'already there');
      assert(btn().disabled, 'nothing to add');
      eq($('#csvChoiceLabel').textContent, t('csv.dupes'), 'asks');
      choose('input[name="csvTake"][value="1"]');
      btn().click();
      eq(stateTotal(s), 50, 'added again');
    } finally {
      if (dlg().open) dlg().close();
    }
  });

  await step('csv: in Slovenian the preview shows decimal commas', () => {
    const s = weight();
    setLang('sl');
    try {
      runCtxAction('csv-import', s.id);
      paste('datum;vrednost\n2.1.2025;82,4');
      assert(preview().includes('82,4 kg'), 'decimal comma: ' + preview());
      assert(
        preview().includes(tp('csv.read', 1, { how: t('csv.how', { d: 1, order: t('csv.order.dmy'), v: 2 }) })),
        'in Slovenian',
      );
      eq(btn().textContent, tp('csv.do', 1), 'button in Slovenian');
    } finally {
      if (dlg().open) dlg().close();
      setLang('en');
    }
  });
});
