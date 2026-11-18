/** Dialogs: a press that starts inside one and ends on its backdrop does not close it. */
// A press that starts inside a dialog (selecting text) and ends on its backdrop
// fires a click on the dialog itself; swallow it so the dialog stays open.
export let pressTarget: EventTarget | null = null;
document.addEventListener(
  'pointerdown',
  e => {
    pressTarget = e.target;
  },
  true,
);
document.addEventListener(
  'click',
  e => {
    if (e.target instanceof HTMLDialogElement && pressTarget && pressTarget !== e.target) e.stopImmediatePropagation();
  },
  true,
);
