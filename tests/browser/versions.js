/** Page tests: dated copies in a fake Drive, Earlier versions, and restoring a backup: which plans, copies or merge. */
suite(async () => {
  const until = async (fn, msg) => {
    for (let i = 0; i < 100 && !fn(); i++) await new Promise(r => setTimeout(r, 20));
    assert(fn(), msg || 'timed out');
  };
  const dlg = $('#restoreDlg');
  const snap = n => snapshotName(d(-n));
  // A fake Drive: the sync file `f`, snapshot files by id, and a log of calls.
  const fake = { files: {}, log: [], failCopy: false };
  const fileText = () =>
    JSON.stringify(
      toFile({ plans: { list: [{ id: 'old', name: 'Old plan' }], deleted: {} }, data: { old: emptyDb() } }),
    );
  drive.getToken = async () => 'tok';
  drive.read = async () => ({ id: 'f', content: parseStore(fileText()), extra: [] });
  drive.write = async (tok, id) => (fake.log.push('write'), id);
  drive.remove = async (tok, id) => (fake.log.push('remove ' + id), delete fake.files[id]);
  drive.snapshots = async () => (
    fake.log.push('list'),
    Object.entries(fake.files).map(([id, f]) => ({ id, name: f.name }))
  );
  drive.copy = async (tok, id, name) => {
    fake.log.push(`copy ${id} ${name}`);
    if (fake.failCopy) throw new SyncError('error');
    fake.files['c' + Object.keys(fake.files).length] = { name, text: fileText() };
  };
  drive.readText = async (tok, id) => fake.files[id].text;
  currentUser().account = { id: 'acct-test', email: 'test@example.com' };
  prefs.set('syncedOnce', true);
  const change = () => {
    mk('goal');
    save();
  };

  await step('the first sync of the day copies the file as it was, before writing', async () => {
    fresh('Daily');
    change();
    await syncNow(true);
    eq(fake.log, ['list', `copy f ${snap(0)}`, 'write'], 'listed, copied, then written');
    fake.log = [];
    change();
    await syncNow(true);
    eq(fake.log, ['write'], 'a second sync that day makes no copy and does not list');
    eq(syncState.status, 'synced');
  });

  await step('old copies are pruned; a failing copy does not fail the sync', async () => {
    fake.files = {};
    for (let n = 1; n <= 30; n++) fake.files['s' + n] = { name: snap(n), text: fileText() };
    fake.files.other = { name: 'notes.json', text: '' };
    prefs.set('snapshotDay', d(-1));
    fake.log = [];
    change();
    await syncNow(true);
    const removed = fake.log.filter(l => l.startsWith('remove')).length;
    eq(removed, 31 - 7 - 4, '7 daily and 4 weeks kept of 31');
    assert(fake.files.other, 'a file that is not a copy stays');
    assert(fake.log.indexOf('write') > fake.log.findIndex(l => l.startsWith('copy')), 'copied before writing');

    prefs.set('snapshotDay', d(-1));
    fake.files = {};
    fake.failCopy = true;
    fake.log = [];
    change();
    await syncNow(true);
    fake.failCopy = false;
    assert(fake.log.some(l => l.startsWith('copy')), 'a copy was tried');
    assert(fake.log.includes('write') && syncState.status === 'synced', 'synced anyway');
    assert(prefs.get('snapshotDay') !== d(0), 'tried again at the next sync');
  });

  await step('Earlier versions: listed newest first, a chosen copy comes back as dated plans', async () => {
    const vLost = { id: 'v-lost', title: 'Lost vision', parents: [] };
    const two = {
      plans: {
        list: [
          { id: 'p1', name: 'Kept' },
          { id: 'p2', name: 'Left out' },
        ],
        deleted: {},
      },
      data: { p1: { ...emptyDb(), goals: [{ id: 'g1', title: 'Old goal', status: 'active' }] }, p2: emptyDb() },
      visions: { list: [vLost], deleted: {} },
    };
    fake.files = { a: { name: snap(3), text: JSON.stringify(toFile(two)) }, b: { name: snap(0), text: fileText() } };
    $('#settingsBtn').click();
    renderSync();
    assert($('#versionsBtn'), 'the row is in Account and sync while connected');
    $('#versionsBtn').click();
    await until(() => dlg.querySelectorAll('[data-version]').length === 2, 'both copies listed');
    eq(
      [...dlg.querySelectorAll('[data-version]')].map(b => b.dataset.version),
      ['b', 'a'],
      'newest first',
    );
    eq(
      dlg.querySelector('[data-version] b').textContent,
      t('day.today').replace(/^./, c => c.toUpperCase()),
    );
    settings.close();
    const before = clone(plans.list),
      beforeData = clone(plans.list.map(p => readPlan(p.id)));
    dlg.querySelector('[data-version="a"]').click();
    await until(() => dlg.querySelectorAll('input[name=plan]').length === 2, 'its plans offered');
    assert(
      [...dlg.querySelectorAll('input[name=plan]')].every(i => i.checked),
      'all ticked',
    );
    assert(!dlg.querySelector('input[name=mode]'), 'no merge for an earlier version');
    dlg.querySelector('input[name=plan][value=p2]').click();
    $('#restoreOk').click();
    assert(!dlg.open, 'closed');
    eq(plans.list.slice(0, before.length), before, 'existing plans unchanged');
    eq(clone(before.map(p => readPlan(p.id))), beforeData, 'and their content');
    eq(
      plans.list.slice(before.length).map(p => p.name),
      [`Kept (${fmtDate(d(-3))})`],
      'only the chosen plan, dated',
    );
    assert(findVision('v-lost'), 'the missing vision is back');

    // Again without the visions box.
    visions.list = visions.list.filter(v => v.id !== 'v-lost');
    saveVisions();
    $('#versionsBtn').click();
    await until(() => dlg.querySelector('[data-version="a"]'));
    dlg.querySelector('[data-version="a"]').click();
    await until(() => dlg.querySelector('input[name=visions]'));
    dlg.querySelector('input[name=visions]').click();
    $('#restoreOk').click();
    assert(!findVision('v-lost'), 'visions left out when unticked');
  });

  await step('a copy from a newer version cannot be opened; offline says so', async () => {
    fake.files = {
      n: {
        name: snap(1),
        text: JSON.stringify({ ...toFile({ plans: { list: [], deleted: {} }, data: {} }), version: 99 }),
      },
    };
    const n0 = plans.list.length;
    openVersions();
    await until(() => dlg.querySelector('[data-version="n"]'));
    dlg.querySelector('[data-version="n"]').click();
    await until(() => dlg.querySelector('[role=alert]'));
    eq(dlg.querySelector('[role=alert]').textContent, t('versions.newer'));
    eq(plans.list.length, n0, 'nothing added');
    dlg.close();

    const list = drive.snapshots;
    drive.snapshots = async () => {
      throw new SyncError('offline');
    };
    openVersions();
    await until(() => dlg.querySelector('[data-restore="connect"]'), 'the connect button');
    assert($('#restoreBody').textContent.includes(t('versions.offline')), 'the message');
    drive.snapshots = list;
    dlg.close();
  });

  await step('restoring a backup: choose plans; Merge keeps later deletions and can be undone', async () => {
    fresh('Merge me');
    const a = mk('activity', { title: 'Deleted later' }),
      b = mk('activity', { title: 'Before' });
    save();
    const planId = plans.current,
      file = backupFile();
    file.data[planId].activities.find(x => x.id === b.id).title = 'From the backup';
    file.data[planId].activities.find(x => x.id === b.id).updatedAt = '2099-01-01T00:00:00.000Z';
    removeEntity('activity', a.id);
    save();
    const beforeAll = clone(plans.list),
      beforeOpen = clone(db.activities.map(x => x.title));

    $('#settingsBtn').click();
    const dt = new DataTransfer();
    dt.items.add(fileOf(file));
    $('#backupInput').files = dt.files;
    $('#backupInput').dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => dlg.open && dlg.querySelector('input[name=mode]'), 'the chooser, with copies or merge');
    assert(!settings.open && $('#backupInput').value === '', 'Settings closed, picker reset');
    assert(dlg.querySelector('input[name=mode][value=copies]').checked, 'copies by default');
    dlg.querySelectorAll('input[name=plan]').forEach(i => (i.checked = i.value === planId));
    dlg.querySelector('input[name=mode][value=merge]').click();
    eq($('#restoreOk').textContent, t('backup.merge'), 'the button says what it does');
    assert(dlg.querySelector('input[name=visions]').closest('label').hidden, 'no visions box for a merge');
    $('#restoreOk').click();
    eq(
      plans.list.map(p => p.id),
      beforeAll.map(p => p.id),
      'no plan added',
    );
    eq(
      db.activities.map(x => x.title),
      ['From the backup'],
      'the newer change won; the later deletion stayed',
    );
    $('#toast .toast-action').click();
    eq(
      db.activities.map(x => x.title),
      beforeOpen,
      'Undo put it back',
    );

    // Copies of one plan only.
    chooseRestore(parseBackup(JSON.stringify(file)), true);
    dlg.querySelectorAll('input[name=plan]').forEach(i => (i.checked = i.value === planId));
    $('#restoreOk').click();
    eq(plans.list.length, beforeAll.length + 1, 'one plan added as a copy');
  });

  await step('Undo of a merge is dropped once Drive has it; other Undo is not', () => {
    const file = backupFile();
    mergeBackup(parseBackup(JSON.stringify(file)), [plans.current]);
    assert($('#toast .toast-action'), 'offered');
    emit('uploaded');
    assert(!$('#toast .toast-action'), 'gone after the upload');
    const x = mk('activity');
    save();
    undoable(() => (removeEntity('activity', x.id), save(), 'deleted'));
    emit('uploaded');
    assert($('#toast .toast-action'), 'a normal Undo stays');
    currentUser().account = null;
    renderSync();
  });
});
