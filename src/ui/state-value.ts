/** Asking for a current state's new measured value or amount, at its card, button or map box. */
import { db } from '../core/state';
import { openAmountPop } from './amount-popover';
import { t } from '../i18n/index';
import { addEntry, isCumulative, recordMeasurement } from '../core/cumulative';
import { save } from '../store/plans';
import { requestRender as render } from './render';
import { toast } from './toast';
import { withUnit } from './text';
import { fmtNum, isNum } from '../core/util';
import { $ } from './dom';
import { fmtRel } from '../core/dates';

export function openStateAmount(id: string, anchor: HTMLElement) {
  const s = db.states.find(x => x.id === id);
  if (!s) return;
  openAmountPop(
    anchor,
    {
      title: t('cu.addTo', { name: s.title }),
      fields: [{ label: t('cu.amount'), unit: s.unit }],
      withDate: true,
      okLabel: t('cu.add'),
    },
    ([n], date) => {
      if (n === null) return anchor.focus();
      addEntry(s, date, n);
      save();
      render();
      toast(t('cu.added', { value: withUnit(fmtNum(n), s.unit || ''), name: s.title }));
      $(`[data-add-amount="${id}"]`)?.focus();
    },
  );
}

// A click on a state's card asks for a new measured value, dated today unless changed (one that adds
// up asks for an amount instead); editing the state is in the card's menu.
export function openStateValue(id: string, anchor: HTMLElement) {
  const s = db.states.find(x => x.id === id);
  if (!s) return;
  if (isCumulative(s)) return openStateAmount(id, anchor);
  const hint = isNum(s.value)
    ? t('sv.latest', { value: withUnit(fmtNum(s.value), s.unit || ''), date: fmtRel(s.date) || '—' })
    : '';
  openAmountPop(
    anchor,
    {
      title: t('sv.title', { name: s.title }),
      hint,
      fields: [{ label: t('f.value'), unit: s.unit }],
      withDate: true,
      okLabel: t('btn.save'),
    },
    ([n], date) => {
      if (n === null) return;
      recordMeasurement(s, date, String(n));
      save();
      render();
      toast(t('sv.saved', { value: withUnit(fmtNum(n), s.unit || ''), name: s.title }));
    },
  );
}
