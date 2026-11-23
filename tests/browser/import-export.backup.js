/** Page tests: export and import round trips, Slovenian, old "is related to" links, the full backup. */
suite(async () => {
  loadSample(); // the first step exports and imports the sample plan
  await step('export / import JSON', async () => {
    let blob;
    const orig = URL.createObjectURL;
    URL.createObjectURL = b => {
      blob = b;
      return 'blob:x';
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    exportJson();
    URL.createObjectURL = orig;
    HTMLAnchorElement.prototype.click = click;
    const text = await blob.text();
    const n0 = plans.list.length;
    await importJson(new File([text], 'backup.json'));
    if ($('#planImport').open) $('#importKeepBtn').click();
    await new Promise(r => setTimeout(r, 50));
    assert(plans.list.length === n0 + 1 && db.goals.length === JSON.parse(text).goals.length);
    importJson(new File(['not json'], 'bad.json'));
    await new Promise(r => setTimeout(r, 50));
    return `${currentPlan().name} toast="${$('#toast').textContent}"`;
  });

  await step('"is related to" links are gone: dropped from saved plans, files and synced copies', () => {
    assert(
      !REL_TYPES.related && !('rel.related' in I18N.en.strings) && !('rel.related' in I18N.sl.strings),
      'no such type or label',
    );
    const old = {
      goals: [
        { id: 'g1', title: 'G' },
        { id: 'g2', title: 'H' },
      ],
      states: [],
      activities: [{ id: 'a1', title: 'A' }],
      relations: [
        { id: 'r1', from: 'a1', to: 'g1', type: 'contributes' },
        { id: 'r2', from: 'g1', to: 'g2', type: 'related' },
        { id: 'r3', from: 'a1', to: 'g2', type: 'related' },
      ],
    };
    eq(
      normalize(old).relations.map(r => r.id),
      ['r1'],
      'normalize keeps the rest',
    );
    // A saved plan from before: opened, it has no such links and the map draws and counts none.
    fresh('Old related');
    const id = plans.current;
    localStorage.setItem(planKey(id), JSON.stringify(old));
    eq(
      readPlan(id).relations.map(r => r.id),
      ['r1'],
      'saved plan',
    );
    openPlan(id);
    eq(
      db.relations.map(r => r.id),
      ['r1'],
      'opened plan',
    );
    ui.mapHidden = new Set(['related']);
    setView('map');
    assert(
      !$('[data-rel-toggle="related"]') && document.querySelectorAll('[data-rel-edit]').length === 1,
      'no toggle or line on the map',
    );
    ui.mapHidden = new Set();
    // Goal → goal and activity → goal: only the remaining types are offered.
    openForm('relation', null, { from: 'g1' });
    const pick = (f, v) => {
      $(f).value = v;
      $(f).dispatchEvent(new Event('change', { bubbles: true }));
    };
    pick('#f-to', 'g2');
    const types = [...$('#f-type').options].map(o => o.value);
    assert(types.length && !types.some(k => k.endsWith('related')), 'form: ' + types);
    modal.close();
    assert(canRelate('a1', 'g2', 'related') === t('err.unknown'), 'canRelate refuses it');
    // A plan file and an older synced copy carrying them: dropped, and the merge does not bring them back.
    eq(
      parsePlanFile(JSON.stringify({ name: 'F', ...old }), 'f.json').data.relations.map(r => r.id),
      ['r1'],
      'plan file',
    );
    const remote = parseStore(
      JSON.stringify({
        format: SYNC_FORMAT,
        version: 1,
        plans: { list: [{ id, name: 'Old related' }], deleted: {} },
        data: { [id]: old },
      }),
    );
    eq(
      remote.data[id].relations.map(r => r.id),
      ['r1'],
      'sync file',
    );
    eq(
      mergeStores(localStore(), remote).data[id].relations.map(r => r.id),
      ['r1'],
      'merged',
    );
    deletePlan(id);
    return 'ok';
  });
  await step('import: round trip, plan buttons and the file picker', async () => {
    const src = addPlan(progressPlan());
    const original = clone(db);
    const [full] = await capture(() => exportJson());
    await importJson(fileOf(full.json, full.name));
    $('#importKeepBtn').click();
    await tick();
    assert(plans.current !== src.id && currentPlan().name === `${src.name} 2`, 'imported beside the original');
    for (const k of ['goals', 'states', 'activities', 'relations'])
      eq(db[k], original[k], `${k} identical after a full round trip`);

    openPlan(src.id);
    const [tpl] = await capture(() => {
      $('[data-plan="export"]').click();
      exp.querySelector('input[name="exportKind"][value="template"]').click();
      $('#exportDownloadBtn').click();
    });
    await importJson(fileOf(tpl.json, tpl.name));
    assert(!imp.open && currentPlan().name === `${src.name} 3`, 'a template round trip needs no question');
    eq(
      db.goals.map(g => g.title),
      original.goals.map(g => g.title),
      'template keeps the goals',
    );

    // The plan's Import button opens the file picker; it accepts .json files (Android greys out some otherwise).
    const input = $('#importInput');
    let picked = 0;
    const origClick = input.click;
    input.click = () => picked++;
    $('[data-plan="import"]').click();
    input.click = origClick;
    eq(picked, 1, 'Import opens the file picker');
    assert(
      input.accept
        .split(',')
        .map(s => s.trim())
        .includes('.json') && input.accept.includes('application/json'),
      `accept="${input.accept}"`,
    );

    // Choosing a file in the picker imports it.
    const dt = new DataTransfer();
    dt.items.add(fileOf({ format: 'actionplan-plan', version: 1, kind: 'template', name: 'Picked', goals: [] }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // Reading the file takes real time, which the test's virtual clock does not wait for: poll.
    for (let i = 0; i < 100 && currentPlan().name !== 'Picked'; i++) await new Promise(r => setTimeout(r, 20));
    assert(currentPlan().name === 'Picked' && input.value === '', 'picked file imported, picker reset');

    const plansNow = plans.list
      .filter(p => [src.name, `${src.name} 2`, `${src.name} 3`, 'Picked'].includes(p.name))
      .map(p => p.id);
    plansNow.forEach(deletePlan);
    return 'round trips identical';
  });
  await step('sharing plans in Slovenian', async () => {
    changeLanguage('sl');
    const plan = addPlan(progressPlan());
    $('[data-plan="export"]').click();
    assert(exp.querySelector('h2').textContent === I18N.sl.strings['export.title'], 'export dialog in Slovenian');
    assert($('[data-plan="export"]').title === I18N.sl.strings['plan.export'], 'button title in Slovenian');
    const [tpl] = await capture(() => {
      exp.querySelector('input[name="exportKind"][value="template"]').click();
      $('#exportDownloadBtn').click();
    });
    assert(
      tpl.name.includes(`-${I18N.sl.strings['export.templateFile']}-`),
      `Slovenian template file name ${tpl.name}`,
    );
    await importJson(
      fileOf({ format: 'actionplan-plan', version: 1, kind: 'full', name: 'Tek', ...progressPlan().data }),
    );
    const text = imp.textContent;
    assert(
      text.includes(tp('import.checkins', 2)) &&
        tp('import.checkins', 2) !== I18N.en.strings['import.checkins'].other.replace('{n}', 2),
      'progress listed in Slovenian',
    );
    assert(text.includes(tp('import.measurements', 4)), 'Slovenian plural for four');
    imp.close();
    deletePlan(plan.id);
    changeLanguage('en');
    return text.replace(/\s+/g, ' ').trim().slice(0, 120);
  });
  await step(
    'full backup: every plan and the visions in one file; restoring adds copies and missing visions',
    async () => {
      const startId = plans.current,
        n0 = plans.list.length,
        v0 = clone(visions);
      const src = addPlan(progressPlan());
      const kept = { id: uid(), title: 'Kept vision', parents: [] },
        lost = { id: uid(), title: 'Lost vision', parents: [kept.id] };
      visions.list.push(kept, lost);
      db.goals[0].visions = [lost.id];
      save();
      saveVisions();
      const original = clone(db);

      // The Settings button downloads one file in the sync file's format.
      const [file] = await capture(() => $('#backupAllBtn').click());
      const count = file.json.plans.list.length;
      assert(
        file.name === `${t('backup.file')} ${today()}.json` && file.blob.type === 'application/json',
        `file name ${file.name}`,
      );
      eq(
        [file.json.format, file.json.kind, file.json.version],
        ['actionplan-sync', 'backup', 1],
        'sync format, marked as a backup',
      );
      assert(!isNaN(new Date(file.json.exportedAt)), 'dated');
      eq(
        file.json.plans.list.map(p => p.id),
        plans.list.map(p => p.id),
        'every plan listed',
      );
      eq(file.json.data[src.id], original, 'the open plan, with its progress');
      eq(file.json.data[startId], clone(readPlan(startId)), 'a plan that is not open');
      eq(file.json.visions.list, clone(visions.list), 'the visions');
      eq(parseStore(JSON.stringify(file.json)).visions.list, clone(visions.list), 'the sync parser reads it');

      // Lose a plan and a vision, change the kept vision, then restore.
      deletePlan(src.id);
      openPlan(startId);
      visions.list = visions.list.filter(v => v.id !== lost.id);
      findVision(kept.id).title = 'Kept vision, renamed since';
      saveVisions();
      const others = clone(plans.list),
        othersData = clone(plans.list.map(p => readPlan(p.id)));
      await restoreFromFile(fileOf(file.json));
      const date = fmtDate(isoDate(new Date(file.json.exportedAt)));
      eq(plans.list.length, n0 + count, 'every plan in the file added');
      eq(
        plans.list.slice(0, n0).map(p => [p.id, p.name]),
        others.map(p => [p.id, p.name]),
        'plans that were here keep id and name',
      );
      eq(clone(plans.list.slice(0, n0).map(p => readPlan(p.id))), othersData, 'and their content');
      eq(plans.current, startId, 'the open plan stays open');
      const copy = plans.list.find(p => p.name === `${src.name} (${date})`);
      assert(copy && copy.id !== src.id, "the lost plan is back as a copy named with the backup's date");
      const back = readPlan(copy.id);
      for (const k of SYNC_COLLS) eq(back[k], original[k], `${k} identical`);
      eq(back.deleted, {}, 'no deletions carried over');
      assert(findVision(lost.id)?.title === 'Lost vision', 'the missing vision is back');
      eq(visionParents(findVision(lost.id)), [kept.id], 'under its parent');
      eq(findVision(kept.id).title, 'Kept vision, renamed since', 'a vision that is here is left alone');
      eq(visions.list.filter(v => v.id === kept.id).length, 1, 'and not doubled');
      assert(!visions.deleted[lost.id], 'its deletion is forgotten, so sync keeps it');
      eq(
        JSON.parse(userStorage.getItem(VISIONS_KEY)).list.map(v => v.id),
        visions.list.map(v => v.id),
        'visions stored',
      );
      eq($('#toast').textContent, `${tp('backup.done', count)}. ${tp('backup.visions', 1)}`, 'toast counts both');
      assert(
        servingGoals(lost.id).some(s => s.plan.id === copy.id),
        'the copied goal serves the vision again',
      );

      // Restoring the same file again: copies get a number, no vision is added twice.
      const vn = visions.list.length;
      restoreText(JSON.stringify(file.json));
      assert(
        plans.list.some(p => p.name === `${src.name} (${date}) 2`),
        'a second copy gets a number',
      );
      eq(visions.list.length, vn, 'no vision added twice');
      eq($('#toast').textContent, tp('backup.done', count), 'toast without visions');
      eq(new Set(plans.list.map(p => p.id)).size, plans.list.length, 'plan ids unique');

      // What sync uploads (no kind, no date) restores too, under the plain names.
      const n2 = plans.list.length;
      restoreText(
        JSON.stringify(
          toFile({
            plans: { list: [{ id: 'x1', name: 'From Drive' }], deleted: {} },
            data: { x1: progressPlan().data },
            visions: { list: [], deleted: {} },
          }),
        ),
      );
      assert(plans.list.length === n2 + 1 && plans.list.at(-1).name === 'From Drive', 'a sync file without a date');

      // Files that are not backups change nothing and say why.
      const n3 = plans.list.length,
        vis = clone(visions);
      const refused = (f, key, m) => {
        restoreText(typeof f === 'string' ? f : JSON.stringify(f));
        assert(plans.list.length === n3 && $('#toast').textContent === t(key), m);
        eq(visions, vis, m + ': visions untouched');
      };
      refused('not json', 'err.import', 'not JSON');
      refused('null', 'err.import', 'null');
      refused({ format: 'something-else', plans: { list: [] } }, 'err.import', 'another format');
      refused({ format: 'actionplan-sync', version: 1 }, 'err.import', 'no plan list');
      refused(planFile('full'), 'backup.isPlan', "a single plan's export");
      refused({ name: 'Legacy', goals: [] }, 'backup.isPlan', 'an old plan export without a header');
      refused({ ...file.json, version: SYNC_VERSION + 1 }, 'backup.newer', 'from a newer version');

      // Unsafe ids and markup in a file do not reach the page.
      restoreText(
        JSON.stringify({
          format: 'actionplan-sync',
          version: 1,
          kind: 'backup',
          exportedAt: 'never',
          plans: {
            list: [
              { id: 'ok', name: '<img src=x onerror=alert(1)>' },
              { id: '"><b>', name: 'bad id' },
            ],
          },
          data: {
            ok: {
              goals: [
                { id: 'g1', title: 'G' },
                { id: '<i>', title: 'bad' },
              ],
            },
          },
          visions: {
            list: [
              { id: '<u>', title: 'bad' },
              { id: 'vok', title: '<b>bold</b>', parents: [] },
              { id: 'vok', title: 'twice', parents: [] },
            ],
          },
        }),
      );
      const odd = plans.list.at(-1);
      assert(
        plans.list.length === n3 + 1 && odd.name === '<img src=x onerror=alert(1)>',
        'only the plan with a plain id; no date when the file has none',
      );
      eq(
        readPlan(odd.id).goals.map(g => g.id),
        ['g1'],
        'items with unsafe ids dropped',
      );
      eq(
        visions.list.filter(v => v.id === 'vok' || v.id === '<u>').map(v => v.title),
        ['<b>bold</b>'],
        'visions with unsafe ids dropped, a repeated id added once',
      );
      assert(!document.querySelector('img[src="x"]'), 'the name is not markup in the plan switcher');

      // The Settings file picker restores, resets itself and closes Settings.
      $('#settingsBtn').click();
      const input = $('#backupInput'),
        n4 = plans.list.length;
      assert(
        settings.open &&
          settings.contains(input) &&
          settings.contains($('#backupAllBtn')) &&
          input.accept.includes('.json'),
        'both in Settings',
      );
      const dt = new DataTransfer();
      dt.items.add(fileOf(file.json));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // Reading the file takes real time, which the test's virtual clock does not wait for: poll.
      for (let i = 0; i < 100 && !$('#restoreDlg').open; i++) await new Promise(r => setTimeout(r, 20));
      assert(
        $('#restoreDlg').open && input.value === '' && !settings.open,
        'the chooser opens, picker reset, Settings closed',
      );
      $('#restoreOk').click(); // Add as copies, every plan ticked
      assert(plans.list.length === n4 + count, 'picked file restored');

      // Storage full: the plan written before it filled up stays, the other is not listed, the message says so.
      const n5 = plans.list.length,
        set = Storage.prototype.setItem;
      let newPlans = 0;
      Storage.prototype.setItem = function (k, v) {
        if (k.includes('actionplan.plan.') && !plans.list.some(p => k.endsWith('.' + p.id)) && ++newPlans > 1)
          throw new Error('full');
        return set.call(this, k, v);
      };
      try {
        restoreText(
          JSON.stringify(
            toFile({
              plans: {
                list: [
                  { id: 'a', name: 'Fits' },
                  { id: 'b', name: 'Does not fit' },
                ],
                deleted: {},
              },
              data: {},
              visions: { list: [], deleted: {} },
            }),
          ),
        );
      } finally {
        Storage.prototype.setItem = set;
      }
      assert(
        plans.list.length === n5 + 1 && plans.list.at(-1).name === 'Fits',
        'only the plan that was stored is listed',
      );
      eq($('#toast').textContent, t('err.storage'), 'storage message');

      // Slovenian wording.
      changeLanguage('sl');
      assert(
        $('#backupAllBtn b').textContent === I18N.sl.strings['backup.all'] &&
          input.closest('label').querySelector('b').textContent === I18N.sl.strings['backup.restore'],
        'buttons in Slovenian',
      );
      assert(
        tp('backup.done', 2) === 'Dodana 2 načrta kot kopiji' &&
          tp('backup.visions', 3) === 'Vrnjene 3 manjkajoče vizije',
        'Slovenian plurals',
      );
      const [slFile] = await capture(() => backupAll());
      assert(slFile.name.startsWith(I18N.sl.strings['backup.file'] + ' '), `Slovenian file name ${slFile.name}`);
      changeLanguage('en');

      plans.list
        .slice(n0)
        .map(p => p.id)
        .forEach(deletePlan);
      openPlan(startId);
      visions = v0;
      saveVisions();
      render();
      eq(plans.list.length, n0, 'cleaned up');
      return `${count} plans, ${file.json.visions.list.length} visions`;
    },
  );
});
