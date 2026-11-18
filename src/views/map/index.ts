/** The map's listeners: one call registers them all, in the order they had in app.js. */
import { listenFonts } from './render';
import { listenMenu, listenMenuKeys } from './menu';
import { listenZoom } from './zoom';
import { listenLink } from './link';

// Gestures depend on this order: a pinch cancels a long-press, a drag's last click is swallowed first.
export function listenMap() {
  listenFonts();
  listenMenu();
  listenZoom();
  listenLink();
  listenMenuKeys();
}
