/** Page tests: notes (feature 15): the Notes section in forms, the card tag, search, the item menu, measurement notes, the closing note. */
suite(async () => {
  const noteRows = () => [...$$('#noteList .note')];
  const addInForm = (text, date) => {
    $('#f-noteText').value = text;
    if (date) $('#f-noteDate').value = dateInput(date);
    $('#notesSec [data-note-add]').click();
  };

  await step('form: a note added and saved shows the tag; Cancel adds nothing', () => {
    fresh('Notes');
    const g = mk('goal', { title: 'Run 5 km' });
    save();
    setView('goals');
    openForm('goal', g.id);
    addInForm('  Knees fine after <b>6 km</b> & "rest"\nnext line  ');
    eq(noteRows().length, 1, 'listed before Save');
    modal.close();
    assert(!g.notes, 'closed without Save: nothing added');
    openForm('goal', g.id);
    addInForm('Knees fine after <b>6 km</b> & "rest"\nnext line');
    submitForm();
    eq(g.notes.length, 1, 'saved');
    eq(g.notes[0].text, 'Knees fine after <b>6 km</b> & "rest"\nnext line', 'as typed');
    eq(g.notes[0].date, today(), 'dated today');
    render();
    const tag = $(`#view [data-notes="${g.id}"]`);
    eq(tag.textContent.trim(), '✎ 1', 'the tag');
    tag.click();
    assert(modal.open && $('#notesSec'), 'the tag opens the form');
    eq($('#noteList .note-text').textContent, g.notes[0].text, 'shown as typed, not as markup');
    modal.close();
  });

  await step('form: text left in the box is added on Save; a future date is refused', () => {
    fresh('Notes');
    const a = mk('activity', { title: 'Stretch', startDate: d(-5), dueDate: d(5) });
    save();
    openForm('activity', a.id);
    $('#f-noteText').value = 'Typed, not added';
    $('#f-noteDate').value = dateInput(d(1));
    submitForm();
    assert(modal.open, 'a future day stops the save');
    assert($('#notesSec').classList.contains('invalid'), 'with the message');
    $('#f-noteDate').value = dateInput(d(-40));
    submitForm();
    assert(!modal.open, 'saved');
    eq([a.notes.length, a.notes[0].date], [1, d(-40)], 'a day before the start is allowed');
  });

  await step('form: newest first; edit in place; delete is remembered for sync', () => {
    fresh('Notes');
    const s = mk('state', { title: 'Weight', unit: 'kg', value: '', history: [] });
    save();
    openForm('state', s.id);
    addInForm('older', d(-3));
    addInForm('newer', d(-1));
    eq(
      noteRows().map(r => r.querySelector('.note-text').textContent),
      ['newer', 'older'],
      'newest first',
    );
    noteRows()[1].querySelector('[data-note-edit]').click();
    const box = $('#noteList .note-edit');
    box.value = 'older, edited';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    eq(noteRows()[1].querySelector('.note-text').textContent, 'older, edited', 'Enter keeps the edit');
    noteRows()[0].querySelector('[data-note-edit]').click();
    $('#noteList .note-edit').value = 'thrown away';
    $('#noteList .note-edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(modal.open, 'Esc in an edit does not close the form');
    eq(noteRows()[0].querySelector('.note-text').textContent, 'newer', 'Esc leaves it as it was');
    const gone = s.notes; // not saved yet
    noteRows()[0].querySelector('[data-note-del]').click();
    submitForm();
    eq(gone, undefined, 'nothing stored before Save');
    eq(
      s.notes.map(n => n.text),
      ['older, edited'],
      'one left',
    );
    eq(Object.keys(s.droppedNotes).length, 1, 'the deleted one is remembered');
  });

  await step('form: 2,000 characters fit; the counter and the message show near the end', () => {
    fresh('Notes');
    const g = mk('goal', { title: 'Write' });
    save();
    openForm('goal', g.id);
    const box = $('#f-noteText');
    eq(box.maxLength, 2000, 'at most 2,000');
    box.value = 'x'.repeat(1799);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    eq($('#notesSec .note-count').textContent, '', 'no counter yet');
    box.value = 'x'.repeat(1800);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    eq($('#notesSec .note-count').textContent, '1800 / 2000', 'the counter');
    box.value = 'x'.repeat(2000);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    eq($('#notesSec .note-count').textContent, t('notes.tooLong'), 'the message at the limit');
    submitForm();
    eq(g.notes[0].text.length, 2000, 'kept whole');
  });

  await step('item menu: Add a note opens a popover; Enter adds with a toast, Esc adds nothing', () => {
    fresh('Notes');
    const a = mk('activity', { title: 'Stretch', startDate: d(-5), dueDate: d(5) });
    save();
    setView('activities');
    openCtxMenu(a.id, 10, 10);
    $('#ctxMenu [data-ctx="note"]').click();
    const pop = () => $('.amount-pop');
    assert(pop(), 'the popover');
    eq(document.activeElement, pop().querySelector('[data-amount-note]'), 'the text has focus');
    pop().querySelector('[data-amount-note]').value = 'thrown away';
    pop().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!pop() && !a.notes, 'Esc: gone, nothing added');
    openCtxMenu(a.id, 10, 10);
    $('#ctxMenu [data-ctx="note"]').click();
    pop().querySelector('[data-amount-date]').value = dateInput(d(2));
    pop().querySelector('[data-amount-note]').value = 'Later';
    pop().requestSubmit();
    assert(pop() && pop().querySelector('.amount-err').textContent, 'a future day is refused');
    pop().querySelector('[data-amount-date]').value = dateInput(d(-1));
    pop().querySelector('[data-amount-note]').value = '  Hamstrings tight  ';
    hideToast();
    pop().requestSubmit();
    eq([a.notes.length, a.notes[0].text, a.notes[0].date], [1, 'Hamstrings tight', d(-1)], 'added at once');
    eq($('#toast').textContent, t('toast.noteAdded'), 'the toast');
    eq($(`#view [data-notes="${a.id}"]`).textContent.trim(), '✎ 1', 'the card shows it');
  });

  await step('measurements: a value with a note shows in the table, as a ring and in the tooltip', () => {
    fresh('Notes');
    const s = mk('state', { title: 'Weight', unit: 'kg', value: '', history: [] });
    save();
    setView('graphs');
    openStateValue(s.id, $('#view'));
    const pop = $('.amount-pop');
    eq(pop.querySelector('[data-amount-note]').maxLength, 200, 'at most 200');
    pop.querySelector('[data-amount="0"]').value = '80';
    pop.querySelector('[data-amount-note]').value = ' after two weeks off ';
    pop.requestSubmit();
    eq(s.history[0].note, 'after two weeks off', 'stored, trimmed');
    openForm('state', s.id);
    $('#f-value').value = '79';
    $('#f-date').value = dateInput(d(-3));
    $('#f-valueNote').value = 'new <scale>';
    $('#f-title').value = 'Body weight';
    submitForm();
    eq(
      s.history.map(h => h.note),
      ['new <scale>', 'after two weeks off'],
      'from the form too; a new title keeps both',
    );
    render();
    const card = $(`#view [data-gr="${s.id}"]`);
    eq(card.querySelectorAll('.gr-note-ring').length, 2, 'a ring on each point with a note');
    eq(
      [...card.querySelectorAll('.measure-note')].map(n => n.textContent),
      ['after two weeks off', 'new <scale>'],
      'in the table, newest first, as typed',
    );
    const plot = card.querySelector('.gr-plot');
    showGraphPoint(plot, 0);
    eq(plot.querySelector('.gr-tip-note')?.textContent, 'new <scale>', 'in the tooltip');
    hideGraphPoint(plot);
    openForm('state', s.id);
    submitForm();
    eq(s.history.length, 2, 'saving without a value adds nothing');
  });

  await step('amounts: the amount popover takes a note too', () => {
    fresh('Notes');
    const s = mk('state', { title: 'Distance', unit: 'km', value: '', history: [], cumulative: true, entries: [] });
    save();
    setView('graphs');
    openStateValue(s.id, $('#view'));
    const pop = $('.amount-pop');
    pop.querySelector('[data-amount="0"]').value = '5';
    pop.querySelector('[data-amount-note]').value = 'rain';
    pop.requestSubmit();
    eq(s.entries[0].note, 'rain', 'stored');
    render();
    assert(
      [...$$('#view .measure-note')].some(n => n.textContent === 'rain'),
      'shown under the graph',
    );
  });

  await step('search finds an item by a word in its note', () => {
    fresh('Notes');
    mk('goal', { title: 'Run', notes: [{ id: 'n1', date: d(-1), text: 'flamingo', at: '' }] });
    mk('goal', { title: 'Read' });
    save();
    setView('goals');
    ui.search = 'flamingo';
    render();
    eq($$('#view .card h3').length, 1, 'one goal');
    ui.search = '';
    render();
  });
});
