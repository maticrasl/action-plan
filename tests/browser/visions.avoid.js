/** Page tests: the future to avoid on a vision (feature 21): the field, the fold on the card, the menu entry. */
suite(async () => {
  await step('visions: the future to avoid saves, shows folded, and an empty one shows no fold', () => {
    clearVisions();
    fresh('Avoid');
    setView('visions');
    const v = mkV('To be fit');
    saveVisions();
    openForm('vision', v.id);
    eq($('#f-avoid').maxLength, 2000, 'at most 2,000 characters');
    $('#f-avoid').value = '  Tired <b>every</b> evening\nand short of breath  ';
    submitForm();
    eq(v.avoid, 'Tired <b>every</b> evening\nand short of breath', 'trimmed, line breaks kept');
    render();
    const fold = $(`#view [data-ctx-item="${v.id}"] details.vis-avoid`);
    assert(fold && !fold.open, 'folded on the card');
    assert(fold.textContent.includes('Tired <b>every</b> evening'), 'markup shown as typed');
    clickEl(fold.querySelector('summary'));
    assert(!modal.open, 'opening the fold does not open the form');
    openForm('vision', v.id);
    $('#f-avoid').value = '   ';
    submitForm();
    assert(!('avoid' in v), 'emptied: no field');
    render();
    assert(!$(`#view [data-ctx-item="${v.id}"] details.vis-avoid`), 'no fold');
  });

  await step('visions: Add what to avoid is in the menu only while it is empty, and focuses the field', () => {
    const v = visions.list[0];
    openCtxMenu(v.id, 10, 10);
    $('#ctxMenu [data-ctx="edit:avoid"]').click();
    assert(modal.open && document.activeElement === $('#f-avoid'), 'the form opens at the field');
    $('#f-avoid').value = 'Out of breath';
    submitForm();
    openCtxMenu(v.id, 10, 10);
    assert(!$('#ctxMenu [data-ctx="edit:avoid"]'), 'gone once filled');
    closeCtxMenu();
  });
});
