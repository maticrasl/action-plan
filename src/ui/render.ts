/** Redrawing the open view from the screen parts below the views; main.ts connects it to render. */
let draw = () => {};

export function setRenderer(fn: () => void) {
  draw = fn;
}

export const requestRender = () => draw();
