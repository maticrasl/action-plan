/** Install as an app: the browser's prompt, or how to add the app on each kind of device. */
import { $ } from './dom';
import { t } from '../i18n/index';
import { toast } from './toast';

/* ---------- Install as an app ----------
   Browsers that can install it (Chrome, Edge, Samsung Internet) offer it through `beforeinstallprompt`;
   on iPhone and iPad it is Safari's Share → Add to Home Screen; Firefox on Android adds it from its
   menu, and Firefox on a computer cannot install it at all. */

export let installPrompt = null;
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isFirefox = () => /Firefox\//.test(navigator.userAgent);
export const isAndroid = () => /Android/.test(navigator.userAgent);

// Without an install prompt, the browser's own way to install it, if there is a hint for it.
export function installHintKey() {
  if (installPrompt) return 'install.hint';
  if (isIos()) return 'install.iosHint';
  if (isFirefox()) return isAndroid() ? 'install.firefoxAndroidHint' : 'install.firefoxHint';
  return '';
}

export function renderInstall() {
  const hint = installHintKey();
  $('#installSection').hidden = isInstalled() || !hint;
  $('#installHint').textContent = hint ? t(hint) : '';
  $('#installBtn').hidden = !installPrompt;
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); // offer it in Settings instead of the browser's own banner
  installPrompt = e;
  renderInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  renderInstall();
  toast(t('install.done'));
});
$('#installBtn').addEventListener('click', async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null; // a prompt can only be shown once
  prompt.prompt();
  await prompt.userChoice.catch(() => null);
  renderInstall();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it, just not offline */ });
}

