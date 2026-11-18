/** The Add menu on the map and timeline (until it joins menu.ts once both are typed). */
import { ctxMenu, showCtxMenu } from '../../ui/menu';
import { t, type TextKey } from '../../i18n/index';
import { ui } from '../../store/state';

// On the map and the timeline (where links are drawn between kinds), what to add: under the Add button, or at x, y
// for a right-click on the map's empty space.
export function openAddMenu(x: number, y: number, byKey: boolean) {
  Object.assign(ctxMenu.dataset, { id: '', rel: '', add: '1' });
  ctxMenu.setAttribute('aria-label', t('add.item'));
  showCtxMenu(
    '',
    '',
    '',
    ['goal', 'activity', 'state', ...(ui.view === 'map' ? ['vision'] : [])].map(k => ({
      act: 'new:' + k,
      label: t(('add.' + k) as TextKey),
    })),
    x,
    y,
    byKey,
  );
}
