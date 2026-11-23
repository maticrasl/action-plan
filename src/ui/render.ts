/** Redrawing the open view from the screen parts below the views; main.ts connects it to render. */
import { actInPlan } from '../store/plans';

let draw = () => {};

export function setRenderer(fn: () => void) {
  draw = fn;
}

export const requestRender = () => draw();

// While a screen action works on a plan that is not open, the view waits and draws once after it.
let wanted = false;
export const wantRender = () => {
  wanted = true;
};
// Runs a screen action (it reads the open plan, saves and draws) on plan `id`, as Today does.
export function inPlan(id: string, fn: () => void) {
  actInPlan(id, fn);
  if (!wanted) return;
  wanted = false;
  draw();
}
