/** The plan name dialog: a free name and an emoji (common ones first, all on request), both required. */
import { allEmojis, COMMON_EMOJIS } from '../core/emoji';
import { t } from '../i18n/index';
import { nameTaken } from '../store/plans';
import { $, esc } from './dom';

const dlg = $<HTMLDialogElement>('#planNameDlg');
let pick = '',
  exceptId: string | undefined,
  done: (name: string, emoji: string) => void = () => {};

const input = () => $<HTMLInputElement>('#planNameInput');
const emojiBtn = (e: string) =>
  `<button type="button" class="emoji-pick" role="radio" aria-checked="${e === pick}" data-emoji="${e}">${esc(e)}</button>`;

function drawEmojis(all: boolean) {
  // The chosen emoji stays in view even when it is not a common one.
  const shown = all ? allEmojis() : pick && !COMMON_EMOJIS.includes(pick) ? [pick, ...COMMON_EMOJIS] : COMMON_EMOJIS;
  $('#planEmojis').innerHTML = shown.map(emojiBtn).join('');
  $('#planEmojis').classList.toggle('all', all);
  $('#planEmojiMore').hidden = all;
  $('#planEmojiMore').setAttribute('aria-expanded', String(all));
}

const update = () => {
  $('#planNameErr').textContent = '';
  $<HTMLButtonElement>('#planNameSave').disabled = !input().value.trim() || !pick;
};

// Opens the dialog; `then` gets the name and emoji on Save (never on Cancel). `except` is the plan renamed.
export function askPlan(
  title: string,
  name: string,
  emoji: string | undefined,
  then: (name: string, emoji: string) => void,
  except?: string,
) {
  pick = emoji || '';
  exceptId = except;
  done = then;
  $('#planNameTitle').textContent = title;
  input().value = name;
  drawEmojis(false);
  update();
  dlg.showModal();
  input().select();
}

dlg.addEventListener('input', update);
dlg.addEventListener('click', e => {
  const el = e.target as HTMLElement;
  if (e.target === dlg || el.closest('[data-plan-name-close]')) return dlg.close();
  if (el.closest('#planEmojiMore')) return drawEmojis(true);
  const b = el.closest<HTMLElement>('[data-emoji]');
  if (!b) return;
  pick = b.dataset.emoji!;
  $('#planEmojis')
    .querySelectorAll('[data-emoji]')
    .forEach(x => x.setAttribute('aria-checked', String(x === b)));
  update();
});
$('#planNameForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = input().value.trim();
  if (!name || !pick) return;
  if (nameTaken(name, exceptId)) {
    $('#planNameErr').textContent = t('plan.nameTaken', { name });
    return input().focus();
  }
  dlg.close();
  done(name, pick);
});
