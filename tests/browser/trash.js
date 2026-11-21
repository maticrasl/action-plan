/** Page tests: Undo after deleting, Recently deleted (restore, for good, empty), plans, full storage, sync. */
suite(async () => {
  const toastText = () => $('#toast').firstChild?.textContent;
  const undoBtn = () => $('#toast .toast-action');
  const rows = () => [...$('#trashBody').querySelectorAll('li')].map(li => li.querySelector('b').textContent);
  const rowBtn = (title, act) =>
    [...$('#trashBody').querySelectorAll('li')]
      .find(li => li.querySelector('b').textContent === title)
      .querySelector(`[data-trash="${act}"]`);
  const clearTrash = () => saveTrash({ items: [], gone: {} });

  await step('trash: the form deletes without asking; Undo puts it back where it was, links included', () => {
    fresh('Undo plan');
    clearTrash();
    const g = mk('goal', { title: 'Run' });
    const a = mk('activity', { title: 'First' });
    const b = mk('activity', { title: 'Shoes' });
    mk('activity', { title: 'Last' });
    rel(b, g, 'contributes');
    save();
    const order = db.activities.map(x => x.id);
    let asked = false;
    const realConfirm = window.confirm;
    window.confirm = () => (asked = true);
    try {
      openForm('activity', b.id);
      $('#deleteBtn').click();
    } finally {
      window.confirm = realConfirm;
    }
    assert(!asked && !modal.open && !findEntity(b.id), 'deleted at once, form closed');
    eq([toastText(), undoBtn()?.textContent], [t('toast.deleted.activity'), t('undo')], 'toast with Undo');
    eq(
      getTrash().items.map(e => [e.kind, e.title, e.planName]),
      [['activity', 'Shoes', 'Undo plan']],
      'kept',
    );
    undoBtn().click();
    eq(
      db.activities.map(x => x.id),
      order,
      'back in its place',
    );
    assert(
      db.relations.some(r => r.from === b.id && r.to === g.id),
      'with its link',
    );
    eq(getTrash().items.length, 0, 'out of Recently deleted');
    assert(Object.keys(getTrash().gone).length === 1, 'remembered as gone, so other devices drop it');
    assert(!readPlan(plans.current).deleted[b.id], 'no tombstone left: sync carries it back');
    assert(readPlan(plans.current).activities.find(x => x.id === b.id).updatedAt, 'stamped as changed');
    eq(toastText(), t('toast.undone'), 'says so');
    // Relationships and the context menu go through it too.
    openForm('relation', db.relations[0].id);
    $('#deleteBtn').click();
    assert(!db.relations.length && undoBtn(), 'relationship removed with Undo');
    undoBtn().click();
    assert(db.relations.length === 1, 'relationship back');
    runCtxAction('delete', a.id);
    assert(!findEntity(a.id) && undoBtn(), 'context menu: deleted with Undo');
    undoBtn().click();
    assert(findEntity(a.id), 'context menu: back');
  });

  await step('trash: Ctrl+Z (or Cmd+Z) undoes the last delete; not while typing, not when nothing is offered', () => {
    fresh('Keys plan');
    clearTrash();
    const a = mk('activity', { title: 'Keyed' });
    save();
    const ctrlZ = (target, mods = { ctrlKey: true }) => {
      const ev = new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true, ...mods });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    deleteItem('activity', a.id);
    const input = document.createElement('input');
    document.body.append(input);
    try {
      assert(!ctrlZ(input) && !findEntity(a.id), 'typing in a field: the field keeps its own undo');
    } finally {
      input.remove();
    }
    assert(!ctrlZ(document.body, { ctrlKey: true, shiftKey: true }) && !findEntity(a.id), 'Ctrl+Shift+Z is not undo');
    assert(ctrlZ(document.body) && findEntity(a.id), 'Ctrl+Z puts it back');
    eq(toastText(), t('toast.undone'), 'says so');
    assert(!ctrlZ(document.body) && findEntity(a.id), 'nothing more to undo: the key is left alone');
    deleteItem('activity', a.id);
    assert(ctrlZ(document.body, { metaKey: true }) && findEntity(a.id), 'Cmd+Z on a Mac');
  });

  await step('trash: any later save drops the Undo; Restore brings it back from Recently deleted', () => {
    fresh('Later plan');
    clearTrash();
    const g = mk('goal', { title: 'Garden' });
    const a = mk('activity', { title: 'Dig' });
    const c = mk('activity', { title: 'Water' });
    rel(a, g, 'contributes');
    save();
    deleteItem('activity', a.id);
    assert(undoBtn(), 'Undo offered');
    c.status = 'done';
    save();
    assert(!undoBtn() && !$('#toast').classList.contains('show'), 'a later save hides it');
    openTrash();
    eq(rows(), ['Dig'], 'listed');
    assert($('#trashBody small').textContent.includes('Later plan'), 'with its plan');
    rowBtn('Dig', 'restore').click();
    assert(!$('#trash').open && findEntity(a.id), 'restored, dialog closed');
    assert(
      db.relations.some(r => r.from === a.id && r.to === g.id),
      'with its link',
    );
    eq(toastText(), t('trash.restored', { name: 'Dig' }), 'says so');
    eq(getTrash().items.length, 0, 'out of the list');
  });

  await step('trash: restoring into a plan that is not open; a plan that is gone asks; lost links counted', () => {
    fresh('Home');
    clearTrash();
    const home = plans.current;
    const g = mk('goal', { title: 'Tidy' });
    const a = mk('activity', { title: 'Sort books' });
    rel(a, g, 'contributes');
    save();
    deleteItem('activity', a.id);
    fresh('Work');
    const work = plans.current;
    openTrash();
    rowBtn('Sort books', 'restore').click();
    eq(plans.current, work, 'stays on the open plan');
    assert(!findEntity(a.id), 'not put into the open plan');
    const stored = readPlan(home);
    assert(
      stored.activities.some(x => x.id === a.id && x.updatedAt),
      'in its own plan, stamped',
    );
    assert(
      stored.relations.some(r => r.from === a.id),
      'with its link',
    );
    eq(undoBtn()?.textContent, t('trash.show'), 'the message offers Show');
    undoBtn().click();
    assert(
      plans.current === home && modal.open && $('#f-title').value === 'Sort books',
      'Show opens its plan at the item',
    );
    modal.close();
    openPlan(work);
    // An item whose plan is gone: asks, then goes into the open plan; a link to a missing end is counted.
    const b = mk('activity', { title: 'Call' });
    const g2 = mk('goal', { title: 'Clients' });
    rel(b, g2, 'contributes');
    save();
    deleteItem('activity', b.id);
    deleteItem('goal', g2.id);
    saveTrash({ ...getTrash(), items: getTrash().items.map(e => (e.title === 'Call' ? { ...e, plan: 'gone' } : e)) });
    let question = '';
    const realConfirm = window.confirm;
    window.confirm = q => ((question = q), true);
    try {
      openTrash();
      rowBtn('Call', 'restore').click();
    } finally {
      window.confirm = realConfirm;
    }
    eq(question, t('trash.planGone', { plan: 'Work' }), 'asks');
    assert(findEntity(b.id), 'restored into the open plan');
    eq(toastText(), tp('trash.restoredLinks', 1), 'one link could not come back');
  });

  await step('trash: visions; Delete for good and Empty; expired entries are not listed', () => {
    fresh('Visions plan');
    clearTrash();
    const top = mkV('Healthy life');
    const v = mkV('Fit', [top]);
    saveVisions();
    deleteItem('vision', v.id);
    assert(!findVision(v.id), 'vision deleted');
    eq(toastText(), t('toast.deleted.vision'), 'says so');
    dropUndo();
    openTrash();
    rowBtn('Fit', 'restore').click();
    eq(findVision(v.id)?.parents, [top.id], 'vision back under its parent');
    // Delete for good, then Empty.
    const x = mk('goal', { title: 'One' });
    const y = mk('goal', { title: 'Two' });
    save();
    deleteItem('goal', x.id);
    deleteItem('goal', y.id);
    const old = {
      ...getTrash().items[0],
      id: 'old',
      title: 'Old',
      deletedAt: new Date(Date.now() - 31 * 86400000).toISOString(),
    };
    saveTrash({ ...getTrash(), items: [...getTrash().items, old] });
    openTrash();
    eq(rows(), ['Two', 'One'], 'newest first; older than 30 days not listed');
    rowBtn('Two', 'forever').click();
    eq(rows(), ['One'], 'deleted for good');
    $('#trashEmpty').click();
    eq(getTrash().items.length, 0, 'emptied');
    assert($('#trashEmpty').hidden && $('#trashBody').textContent === t('trash.none'), 'says it is empty');
    renderTrashCount();
    eq($('#trashCount').textContent, '', 'no count');
    $('#trash [data-trash-close]').click();
    assert(!$('#trash').open, 'closes');
  });

  await step('trash: deleting a plan keeps it; Undo or Restore brings it back, renamed when the name is taken', () => {
    fresh('Garage');
    clearTrash();
    mk('goal', { title: 'Clean' });
    save();
    const id = plans.current;
    openPlanDelete(currentPlan());
    assert($('#planDeleteBody .strong').textContent === t('planDel.restorable'), 'the dialog says it can be restored');
    $('#planDeleteName').value = 'Garage';
    $('#planDeleteName').dispatchEvent(new Event('input', { bubbles: true }));
    $('#planDeleteBtn').click();
    assert(!plans.list.some(p => p.id === id), 'plan deleted');
    eq(
      getTrash().items.map(e => [e.kind, e.title]),
      [['plan', 'Garage']],
      'kept',
    );
    undoBtn().click();
    assert(plans.current === id && db.goals[0].title === 'Clean', 'Undo reopens it as it was');
    assert(!plans.deleted?.[id], 'no tombstone left');
    eq(getTrash().items.length, 0, 'out of the list');
    // Delete again, make a new plan with the same name, restore from the list.
    openPlanDelete(currentPlan());
    $('#planDeleteName').value = 'Garage';
    $('#planDeleteName').dispatchEvent(new Event('input', { bubbles: true }));
    $('#planDeleteBtn').click();
    fresh('Garage');
    openTrash();
    rowBtn('Garage', 'restore').click();
    eq(currentPlan().name, 'Garage 2', 'numbered');
    assert(currentPlan().id !== id && db.goals[0].title === 'Clean', 'a new plan with its content');
  });

  await step('trash: storage full still deletes; Remove sample keeps nothing', () => {
    fresh('Full');
    clearTrash();
    const a = mk('activity', { title: 'Too much' });
    save();
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.endsWith('.trash')) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
    try {
      deleteItem('activity', a.id);
    } finally {
      Storage.prototype.setItem = set;
    }
    assert(!findEntity(a.id), 'deleted anyway');
    eq(toastText(), t('trash.notKept'), 'says it was not kept');
    eq(getTrash().items.length, 0, 'nothing kept');
    loadSample();
    assert(isDemo(), 'sample open');
    leaveDemo(true);
    eq(getTrash().items.length, 0, 'the sample is not kept');
  });

  await step('trash: syncs both ways; restored on one device is gone on the other', async () => {
    fresh('Synced');
    clearTrash();
    const a = mk('activity', { title: 'Here' });
    save();
    deleteItem('activity', a.id);
    dropUndo();
    const mine = getTrash().items[0];
    const theirs = { ...mine, id: 'from-b', title: 'There' };
    let file = toFile(localStore());
    file.trash = { items: [theirs], gone: {} };
    currentUser().account = { id: 'acct-test', email: 'test@example.com' };
    drive.getToken = async () => 'tok';
    drive.read = async () => ({ id: 'f', content: parseStore(JSON.stringify(file)), extra: [] });
    drive.write = async (tok, id, content) => ((file = content), 'f');
    try {
      await syncNow(true);
      eq(
        getTrash()
          .items.map(e => e.title)
          .sort(),
        ['Here', 'There'],
        'both devices’ entries here',
      );
      eq(file.trash.items.length, 2, 'and in the file');
      // The other device restored "There".
      file.trash = { items: [mine], gone: { 'from-b': new Date().toISOString() } };
      await syncNow(true);
      eq(
        getTrash().items.map(e => e.title),
        ['Here'],
        'restored elsewhere: gone here',
      );
      assert(file.trash.gone['from-b'], 'still remembered as gone');
      assert(file.version === SYNC_VERSION, 'the file says its version');
      eq(backupFile().version, 1, 'a backup stays readable by older versions');
      assert(!('trash' in backupFile()), 'and holds no Recently deleted');
    } finally {
      currentUser().account = null;
      renderSync();
    }
  });
});
