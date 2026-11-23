/** Page tests: life areas (feature 03): the Area field and tag, the Areas side, Nothing here yet, renaming an area. */
suite(async () => {
  const block = name => [...$$('#view .area-block')].find(b => b.dataset.area === name);
  const areas = () => {
    prefs.set('visionsMode', 'areas');
    setView('visions');
  };
  const setup = () => {
    fresh('Areas');
    setAside();
    clearVisions();
    prefs.set('hiddenAreas', []);
    const fit = mkV('To be fit', [], { area: 'Health' });
    const run = mk('goal', { title: 'Run 5 km', visions: [fit.id] });
    const shoes = mk('activity', { title: 'Buy running shoes' });
    rel(shoes, run, 'contributes');
    save();
    saveVisions();
    return { fit, run, shoes };
  };
  const done = () => {
    prefs.set('visionsMode', 'tree');
    putBack();
  };

  await step('areas: the Area field saves trimmed, shows as a tag, and an empty one is not stored', () => {
    clearVisions();
    fresh('Area field');
    setView('visions');
    const v = mkV('To be calm');
    saveVisions();
    openForm('vision', v.id);
    assert($('#areaList option[value="Health"]'), 'suggestions from the language file');
    $('#f-area').value = '  Health  ';
    submitForm();
    eq(v.area, 'Health', 'trimmed');
    render();
    eq($(`#view .card.vision[data-open="${v.id}"] .tag.area`)?.textContent, 'Health', 'the tag on the card');
    openForm('vision', v.id);
    $('#f-area').value = '  ';
    submitForm();
    assert(!('area' in v), 'emptied: no field');
  });

  await step('areas: the switch shows the Areas side and remembers it; a tick changes the count and bar', () => {
    const { shoes } = setup();
    setView('visions');
    $('#view [data-vis-mode="areas"]').click();
    eq(prefs.get('visionsMode'), 'areas', 'remembered');
    const b = block('Health');
    assert(b, 'a block for the area');
    assert(b.textContent.includes('To be fit') && b.textContent.includes(tp('areas.goals', 1)), 'its vision and goal');
    assert(!b.textContent.includes(tp('areas.effort', 1)), 'no effort yet');
    eq($('#view .vis-status')?.textContent, t('areas.quiet'), 'nothing ticked');
    shoes.status = 'done';
    shoes.doneAt = today();
    save();
    render();
    assert(block('Health').textContent.includes(tp('areas.effort', 1)), 'one step counted');
    eq(block('Health').querySelector('.progress i').style.width, '100%', 'all of the effort');
    $('#view [data-vis-mode="tree"]').click();
    assert($('#view .vision-tree'), 'back to the tree');
    done();
  });

  await step('areas: Nothing here yet opens the form filled in; Not for me hides an area and keeps it hidden', () => {
    setup();
    areas();
    const chip = $('#view [data-area-new="Finance"]');
    assert(chip && !$('#view [data-area-new="Health"]'), 'unused suggestions only');
    chip.click();
    assert(modal.open, 'the vision form');
    eq($('#f-area').value, 'Finance', 'with the area filled in');
    modal.close();
    $('#view [data-area-hide="Finance"]').click();
    assert(!$('#view [data-area-new="Finance"]'), 'hidden');
    eq(prefs.get('hiddenAreas'), ['Finance'], 'stored on this device');
    render();
    assert(!$('#view [data-area-new="Finance"]'), 'still hidden when drawn again');
    done();
  });

  await step('areas: an area with a vision and no goal offers What is next?; names are escaped', () => {
    setup();
    const odd = mkV('Odd', [], { area: '<b>"Kids" & co</b>' });
    saveVisions();
    areas();
    const b = block('<b>"Kids" & co</b>');
    assert(b && !b.querySelector('b'), 'shown as text');
    assert(b.querySelector(`[data-los-next="${odd.id}"]`), 'What is next?');
    assert($('#view .vis-status').textContent.includes('"Kids" & co'), 'the sentence names it');
    done();
  });

  await step('areas: Rename changes visions and goal categories in a plan that is not open; Undo reverts both', () => {
    fresh('Other plan');
    const other = mk('goal', { title: 'Check-up', category: 'health' });
    save();
    const otherId = plans.current;
    const { fit, run } = setup();
    putBack(); // the other plan must be in the list for the rename
    const realPrompt = window.prompt;
    window.prompt = () => '  Wellbeing ';
    try {
      areas();
      block('Health').querySelector('[data-area-rename]').click();
    } finally {
      window.prompt = realPrompt;
    }
    eq(fit.area, 'Wellbeing', 'the vision');
    eq(readPlan(otherId).goals.find(g => g.id === other.id).category, 'Wellbeing', 'the goal in the other plan');
    assert(run.visions, 'goals of the open plan keep their visions');
    assert(block('Wellbeing'), 'the block has the new name');
    $('#toast .toast-action').click();
    eq(visions.list.find(v => v.id === fit.id).area, 'Health', 'Undo: the vision');
    eq(readPlan(otherId).goals.find(g => g.id === other.id).category, 'health', 'Undo: the other plan');
    prefs.set('visionsMode', 'tree');
  });
});
