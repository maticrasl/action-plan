/** Asks the browser to keep this site's storage, so it is not cleared under storage pressure or after a week away (Safari). */

let asked = false;

// Called on each save, so it asks only once a plan has something in it; Firefox may show a question then.
export function keepStorage() {
  if (asked) return;
  asked = true;
  navigator.storage?.persist?.().catch(() => {});
}
