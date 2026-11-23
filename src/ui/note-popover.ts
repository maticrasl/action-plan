/** Add a note from an item's menu (feature 15): a small popover at the item that saves at once. */
import { openAmountPop } from './amount-popover';
import { findEntity } from '../core/relations';
import { addNote, NOTE_MAX } from '../core/notes';
import { t } from '../i18n/index';
import { save } from '../store/plans';
import { requestRender as render } from './render';
import { toast } from './toast';
import type { WithNotes } from '../core/model';

export function openNotePop(id: string, anchor: HTMLElement) {
  const ent = findEntity(id);
  if (!ent || ent.kind === 'vision') return;
  openAmountPop(
    anchor,
    {
      title: t('ctx.addNote'),
      hint: ent.item.title,
      fields: [],
      note: { label: t('notes.title'), placeholder: t('notes.add'), max: NOTE_MAX },
      withDate: true,
      pastOnly: true,
      okLabel: t('notes.addBtn'),
    },
    (_, date, text) => {
      if (!addNote(ent.item as WithNotes, { date, text })) return anchor.focus();
      save();
      render();
      toast(t('toast.noteAdded'));
    },
  );
}
