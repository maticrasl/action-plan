/** The map's listeners: one call registers them all, in the order they had in app.js. */
import { listenFonts } from './render';
import { listenMenu } from './menu';
import { listenZoom } from './zoom';
import { listenLink } from './link';
import { listenMenuKeys } from './keys';

// Gestures depend on this order: a pinch cancels a long-press, a drag's last click is swallowed first.
export function listenMap() {
  listenFonts();
  listenMenu();
  listenZoom();
  listenLink();
  listenMenuKeys();
}
