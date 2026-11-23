/** Page tests: plan files (header, full copy, template, reading), the export dialog, importing with progress. */
suite(async () => {
  await step('plan files: progress is counted for the import question', () => {
    // The counting itself is tested in src/core/normalize.test.ts.
    eq(progressCounts(normalize(sampleData())).checkins > 0, true, 'the sample plan has check-ins');
  });
  await step('plan files: header, full copy and template', () => {
    const plan = addPlan(progressPlan());
    const full = planFile('full'),
      tpl = planFile('template');
    eq([full.format, full.version, full.kind, full.name], ['actionplan-plan', 1, 'full', plan.name], 'full header');
    eq([tpl.format, tpl.version, tpl.kind, tpl.name], ['actionplan-plan', 1, 'template', plan.name], 'template header');
    assert(!isNaN(Date.parse(full.exportedAt)), 'export time recorded');
    eq(full.goals, db.goals, 'full copy keeps everything');
    eq(full.activities, db.activities, 'full copy keeps check-ins');
    eq(progressCounts(tpl), { checkins: 0, measurements: 0, done: 0, started: 0, notes: 0 }, 'template has no progress');
    assert(datesOf(tpl).sort()[0] >= today(), 'template dates moved to now');
    assert(
      db.goals[1].status === 'achieved' && db.activities[3].checkins,
      'exporting a template leaves the plan alone',
    );
    deletePlan(plan.id);
    return `${full.goals.length} goals`;
  });
  await step('plan files: reading checks the format', async () => {
    const { name, data } = progressPlan();
    const ok = parsePlanFile(
      JSON.stringify({ format: 'actionplan-plan', version: 1, kind: 'template', name, ...data }),
      'x.json',
    );
    eq([ok.name, ok.kind, ok.data.goals.length, ok.data.relations.length], [name, 'template', 3, 1], 'new format');
    const old = parsePlanFile(JSON.stringify({ name: 'Old export', ...data }), 'old.json');
    eq(
      [old.name, old.kind, old.data.activities.length],
      ['Old export', 'full', 4],
      'files exported before the header still import as full copies',
    );
    eq(
      parsePlanFile(JSON.stringify({ goals: [] }), 'My backup.JSON').name,
      'My backup',
      'name from the file when missing',
    );
    eq(
      parsePlanFile(JSON.stringify({ name: '   ', goals: [] }), 'blank.json').name,
      'blank',
      'blank name falls back to the file name',
    );
    eq(
      parsePlanFile(
        JSON.stringify({ format: 'actionplan-plan', version: 1, kind: 'weird', name: 'k', goals: [] }),
        'k.json',
      ).kind,
      'full',
      'unknown kind read as full',
    );
    const reason = (text, msg) => {
      try {
        parsePlanFile(text, 'f.json');
      } catch (e) {
        return e.code;
      }
      assert(false, `${msg}: accepted`);
    };
    eq(reason('not json', 'text'), 'invalid', 'not JSON');
    eq(reason('[1,2]', 'array'), 'invalid', 'an array');
    eq(reason('null', 'null'), 'invalid', 'null');
    eq(reason('{}', 'empty'), 'invalid', 'an empty object');
    eq(reason('{"foo":1,"name":"x"}', 'other'), 'invalid', 'unrelated JSON');
    eq(reason('{"goals":"many"}', 'wrong type'), 'invalid', 'collections that are not lists');
    eq(reason(JSON.stringify({ format: 'something-else', goals: [] }), 'format'), 'invalid', 'another format');
    eq(
      reason(JSON.stringify({ format: 'actionplan-sync', version: 1, plans: { list: [] }, data: {} }), 'sync'),
      'invalid',
      'the Drive sync file',
    );
    eq(
      reason(JSON.stringify({ format: 'actionplan-plan', version: 2, name: 'n', goals: [] }), 'newer'),
      'version',
      'a file from a newer version',
    );
    const junk = parsePlanFile(
      JSON.stringify({ name: 'J', goals: [{ id: 'g', title: 'ok', status: 'active' }], extra: 'x', states: 7 }),
      'j.json',
    );
    assert(
      !('extra' in junk.data) && Array.isArray(junk.data.states) && junk.data.states.length === 0,
      'unknown fields dropped, bad collections emptied',
    );

    // Ids go into the page unescaped: items with markup in their id, broken items and links to them are dropped.
    const evil = 'x"><img src=x onerror="window.__pwned=1">';
    const bad = parsePlanFile(
      JSON.stringify({
        name: 'Bad',
        goals: [{ id: 'g1', title: 'Fine' }, { id: evil, title: 'Evil' }, null, 7, { title: 'No id' }],
        activities: [{ id: 'a1', title: 'Act' }],
        relations: [
          { id: 'r1', from: 'a1', to: 'g1', type: 'contributes' },
          { id: 'r2', from: 'a1', to: evil, type: 'contributes' },
          { id: evil, from: 'a1', to: 'g1', type: 'contributes' },
          null,
        ],
      }),
      'b.json',
    );
    eq(
      [bad.data.goals.map(g => g.id), bad.data.relations.map(r => r.id)],
      [['g1'], ['r1']],
      'unsafe and broken items dropped',
    );
    addImported(bad.name, bad.data);
    ['dashboard', 'goals', 'activities', 'map', 'timeline'].forEach(v => setView(v));
    await tick();
    assert(!window.__pwned && !$('#view img'), 'no markup from the file reaches the page');
    deletePlan(plans.current);
    return 'ok';
  });
  await step('export dialog: full copy or template, download or share', async () => {
    const plan = addPlan(progressPlan());
    const nav = { canShare: navigator.canShare, share: navigator.share };
    navigator.canShare = undefined;
    assert(
      document.querySelectorAll('[data-plan="export"]').length >= 1 &&
        document.querySelectorAll('[data-plan="import"]').length >= 1,
      'export and import beside the plan actions',
    );
    $('[data-plan="export"]').click();
    assert(exp.open, 'export dialog opens');
    assert(exp.querySelector('input[name="exportKind"][value="full"]').checked, 'full copy chosen at first');
    assert(exp.textContent.includes(plan.name), 'names the plan');
    assert($('#exportShareBtn').hidden, 'no Share where the browser cannot share files');
    let got = await capture(() => $('#exportDownloadBtn').click());
    await tick();
    assert(!exp.open, 'closes after downloading');
    eq([got.length, got[0].json.kind], [1, 'full'], 'one full file');
    eq(got[0].json.activities, db.activities, 'full file has the progress');
    assert(got[0].name === `${plan.name}-${today()}.json`, `file name ${got[0].name}`);
    assert(got[0].blob.type === 'application/json', 'JSON type');

    $('[data-plan="export"]').click();
    exp.querySelector('input[name="exportKind"][value="template"]').click();
    got = await capture(() => $('#exportDownloadBtn').click());
    eq(got[0].json.kind, 'template', 'template file');
    eq(
      progressCounts(got[0].json),
      { checkins: 0, measurements: 0, done: 0, started: 0, notes: 0 },
      'template file has no progress',
    );
    assert(
      got[0].name === `${plan.name}-${t('export.templateFile')}-${today()}.json`,
      `template file name ${got[0].name}`,
    );
    $('[data-plan="export"]').click();
    assert(exp.querySelector('input[name="exportKind"][value="full"]').checked, 'full copy chosen again next time');
    exp.querySelector('[data-plan-export-close]').click();
    assert(!exp.open, 'Cancel closes');

    // Where files can be shared (phones), Share hands the file to the system share sheet.
    const shared = [];
    let fail = null;
    navigator.canShare = o => !!o?.files?.length;
    navigator.share = async o => {
      shared.push(o);
      if (fail) throw fail;
    };
    try {
      $('[data-plan="export"]').click();
      assert(!$('#exportShareBtn').hidden, 'Share offered');
      exp.querySelector('input[name="exportKind"][value="template"]').click();
      got = await capture(async () => {
        $('#exportShareBtn').click();
        await tick();
        await tick();
      });
      eq(shared.length, 1, 'shared once');
      const f = shared[0].files[0];
      assert(
        f instanceof File &&
          f.name === `${plan.name}-${t('export.templateFile')}-${today()}.json` &&
          f.type === 'application/json',
        `shared file ${f.name}`,
      );
      eq(JSON.parse(await f.text()).kind, 'template', 'shared the template');
      assert(shared[0].title === plan.name, 'share title is the plan name');
      eq(got.length, 0, 'nothing downloaded');
      assert(!exp.open, 'closes after sharing');

      fail = new DOMException('cancelled', 'AbortError');
      $('[data-plan="export"]').click();
      got = await capture(async () => {
        $('#exportShareBtn').click();
        await tick();
        await tick();
      });
      eq(got.length, 0, 'cancelling the share sheet downloads nothing');

      fail = new Error('share broke');
      $('[data-plan="export"]').click();
      got = await capture(async () => {
        $('#exportShareBtn').click();
        await tick();
        await tick();
      });
      eq([got.length, got[0]?.json.kind], [1, 'full'], 'a failed share falls back to a download');

      navigator.canShare = () => false;
      $('[data-plan="export"]').click();
      assert($('#exportShareBtn').hidden, 'no Share when files cannot be shared');
      exp.close();
    } finally {
      navigator.canShare = nav.canShare;
      navigator.share = nav.share;
    }

    // The Settings button opens the same dialog; the delete dialog's backup still downloads a full copy at once.
    $('#exportBtn').click();
    assert(exp.open, 'Settings → Export opens the dialog');
    exp.close();
    settings.close();
    openPlanDelete(plan);
    got = await capture(() => $('[data-plan-backup]').click());
    eq(
      [got.length, got[0].json.kind, exp.open],
      [1, 'full', false],
      'backup before deleting is a full copy, no dialog',
    );
    planDel.close();
    deletePlan(plan.id);
    return 'download, template, share, fallback';
  });
  await step('import: templates and plans without progress come straight in', async () => {
    const n0 = plans.list.length;
    const { name, data } = progressPlan();
    await importJson(
      fileOf({
        format: 'actionplan-plan',
        version: 1,
        kind: 'template',
        name,
        ...resetProgress(data, { shift: true }),
      }),
    );
    assert(!imp.open && plans.list.length === n0 + 1 && currentPlan().name === name, 'template imported as a new plan');
    assert(db.goals.length === 3 && db.relations.length === 1, 'with its content');
    assert($('#toast').textContent === t('toast.imported'), 'toast');
    await importJson(fileOf({ format: 'actionplan-plan', version: 1, kind: 'template', name, ...resetProgress(data) }));
    assert(currentPlan().name === `${name} 2` && plans.list.length === n0 + 2, 'same name gets a number');
    await importJson(
      fileOf({ format: 'actionplan-plan', version: 1, kind: 'full', name: 'Fresh', ...resetProgress(data) }),
    );
    assert(!imp.open && currentPlan().name === 'Fresh', 'a full copy without progress does not ask');
    const ids = plans.list.slice(n0).map(p => p.id);
    ids.forEach(deletePlan);
    eq(plans.list.length, n0, 'cleaned up');
    return 'ok';
  });
  await step('import: a full copy with progress asks to keep it or start fresh', async () => {
    const n0 = plans.list.length,
      startId = plans.current;
    const { name, data } = progressPlan();
    const file = { format: 'actionplan-plan', version: 1, kind: 'full', name, ...data };

    await importJson(fileOf(file));
    assert(imp.open && plans.list.length === n0, 'asks before adding anything');
    const text = imp.textContent;
    for (const s of [
      tp('import.checkins', 2),
      tp('import.measurements', 4),
      tp('import.done', 2),
      tp('import.started', 1),
    ])
      assert(text.includes(s), `mentions “${s}”`);
    assert(text.includes(name), 'names the plan');
    $('#importKeepBtn').click();
    await tick();
    assert(!imp.open && plans.list.length === n0 + 1 && currentPlan().name === name, 'Keep progress adds the plan');
    eq(progressCounts(db), progressCounts(data), 'with its progress');
    eq(db.activities.find(a => a.repeat).checkins, data.activities[3].checkins, 'check-ins intact');
    assert($('#toast').textContent === t('toast.imported'), 'toast');
    const kept = plans.current;

    await importJson(fileOf(file));
    assert(imp.open, 'asks again');
    $('#importFreshBtn').click();
    await tick();
    assert(
      !imp.open && plans.list.length === n0 + 2 && currentPlan().name === `${name} 2`,
      'Start fresh adds the plan',
    );
    eq(progressCounts(db), { checkins: 0, measurements: 0, done: 0, started: 0, notes: 0 }, 'without progress');
    eq(datesOf(db), datesOf(data), 'dates left as they were');
    eq(
      [db.goals.length, db.states.length, db.activities.length, db.relations.length],
      [3, 2, 4, 1],
      'structure intact',
    );
    assert($('#toast').textContent === t('toast.importedFresh'), 'fresh toast');

    const before = plans.current;
    await importJson(fileOf(file));
    imp.querySelector('[data-plan-import-close]').click();
    await tick();
    assert(!imp.open && plans.list.length === n0 + 2 && plans.current === before, 'Cancel adds nothing');
    await importJson(fileOf(file));
    imp.dispatchEvent(new Event('cancel'));
    imp.close();
    await tick();
    eq(plans.list.length, n0 + 2, 'Escape adds nothing');
    $('#importKeepBtn').click();
    eq(plans.list.length, n0 + 2, 'a stale Keep click after closing adds nothing');

    // Files exported before the header count as full copies, so they are checked too.
    await importJson(fileOf({ name: 'Legacy', ...data }, 'legacy.json'));
    assert(imp.open, 'an old export with progress asks too');
    $('#importKeepBtn').click();
    await tick();
    assert(currentPlan().name === 'Legacy' && progressCounts(db).checkins === 2, 'legacy kept');

    // Bad files change nothing.
    const n1 = plans.list.length,
      cur = plans.current;
    await importJson(fileOf('not json', 'bad.json'));
    assert(
      !imp.open && plans.list.length === n1 && plans.current === cur && $('#toast').textContent === t('err.import'),
      'invalid file',
    );
    await importJson(fileOf({ format: 'actionplan-plan', version: 9, name: 'n', goals: [] }));
    assert(plans.list.length === n1 && $('#toast').textContent === t('err.importVersion'), 'newer version explained');

    plans.list
      .slice(n0)
      .map(p => p.id)
      .forEach(deletePlan);
    openPlan(startId);
    eq(plans.list.length, n0, 'cleaned up');
    return text.replace(/\s+/g, ' ').trim().slice(0, 140);
  });
});
