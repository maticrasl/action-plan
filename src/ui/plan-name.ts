/** The plan name dialog: a free name and an emoji (common ones first; all, by group, or found by name), both required. */
import { COMMON_EMOJIS, parseEmojis, searchEmojis, type EmojiEntry } from '../core/emoji';
import { lang, t, type Lang, type TextKey } from '../i18n/index';
import { nameTaken } from '../store/plans';
import { $, esc } from './dom';

const dlg = $<HTMLDialogElement>('#planNameDlg');
let pick = '',
  showAll = false,
  exceptId: string | undefined,
  done: (name: string, emoji: string) => void = () => {};

// The full list with names is large: it loads on first use, once per language.
const lists: Partial<Record<Lang, Promise<EmojiEntry[]>>> = {};
export const emojiList = () =>
  (lists[lang] ??= (lang === 'sl' ? import('../core/emoji-names.sl') : import('../core/emoji-names.en')).then(m =>
    parseEmojis(m.EMOJI_NAMES),
  ));

const input = () => $<HTMLInputElement>('#planNameInput');
const search = () => $<HTMLInputElement>('#planEmojiSearch');
const emojiBtn = (e: string) =>
  `<button type="button" class="emoji-pick" role="radio" aria-checked="${e === pick}" data-emoji="${esc(e)}">${esc(e)}</button>`;

// Draws the common emojis, the search results, or every emoji under its group's name.
let drawing = 0;
async function drawEmojis() {
  const n = ++drawing,
    q = search().value.trim();
  let html: string,
    none = '';
  if (!q && !showAll) {
    // The chosen emoji stays in view even when it is not a common one.
    html = (pick && !COMMON_EMOJIS.includes(pick) ? [pick, ...COMMON_EMOJIS] : COMMON_EMOJIS).map(emojiBtn).join('');
  } else {
    const list = await emojiList();
    if (n !== drawing) return; // typed on meanwhile
    if (q) {
      const found = searchEmojis(list, q);
      html = found.map(emojiBtn).join('');
      if (!found.length) none = t('plan.emojiNone', { q });
    } else {
      html = list
        .map(
          (x, k) =>
            (x.group !== list[k - 1]?.group
              ? `<div class="emoji-group" role="presentation">${esc(t(('emoji.group.' + x.group) as TextKey))}</div>`
              : '') + emojiBtn(x.e),
        )
        .join('');
    }
  }
  $('#planEmojis').innerHTML = html;
  $('#planEmojis').classList.toggle('all', !!q || showAll);
  $('#planEmojiNone').textContent = none;
  $('#planEmojiMore').hidden = showAll;
  $('#planEmojiMore').setAttribute('aria-expanded', String(showAll));
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
  showAll = false;
  exceptId = except;
  done = then;
  $('#planNameTitle').textContent = title;
  input().value = name;
  search().value = '';
  search().placeholder = t('plan.emojiSearch');
  void drawEmojis();
  update();
  dlg.showModal();
  input().select();
}

dlg.addEventListener('input', e => (e.target === search() ? void drawEmojis() : update()));
// Enter in the search field searches; it does not save.
search().addEventListener('keydown', e => e.key === 'Enter' && e.preventDefault());
dlg.addEventListener('click', e => {
  const el = e.target as HTMLElement;
  if (e.target === dlg || el.closest('[data-plan-name-close]')) return dlg.close();
  if (el.closest('#planEmojiMore')) {
    showAll = true;
    return void drawEmojis();
  }
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
