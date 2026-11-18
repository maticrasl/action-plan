/** Full backup and restore of every plan and the visions. */
import { download, render, renderPlanSwitch, settings, toast } from './app.js';
import { t, tp } from '../i18n/index';
import { uid } from '../core/util';
import { fmtDate, isoDate, today } from '../core/dates';
import { visions } from '../core/state';
import { SYNC_COLLS } from '../core/merge';
import { PLAN_FORMAT } from '../core/normalize';
import { userStorage } from '../store/users';
import { plans } from '../store/state';
import { planKey, save, uniqueName } from '../store/plans';
import { saveVisions } from '../store/visions';
import { SYNC_FORMAT, parseStore, toFile } from '../sync/drive';
import { localStore } from '../sync/sync';

/* =========================================================
   Full backup: every plan and the visions in one file
   ---------------------------------------------------------
   The file is the sync file's own format with `kind: 'backup'` and `exportedAt` added, so the sync
   parser reads it. Restoring adds each plan as a new plan and the visions that are missing here;
   nothing that exists is changed.
   Loaded after drive.js and before app.js; uses their helpers only when called.
   ========================================================= */

export const backupFile = () => ({ ...toFile(localStore()), kind: 'backup', exportedAt: new Date().toISOString() });

export function backupAll() {
  const blob = new Blob([JSON.stringify(backupFile(), null, 2)], { type: 'application/json' });
  download(blob, `${t('backup.file')} ${today()}.json`);
}

// Reads a backup file; throws an error with code 'invalid', 'plan' (a single plan's export) or
// 'version' (from a newer app).
export function parseBackup(text) {
  const fail = code => Object.assign(new Error(code), { code });
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw fail('invalid'); }
  if (raw?.format === SYNC_FORMAT && raw.version > toFile({}).version) throw fail('version');
  try {
    return { store: parseStore(text), exportedAt: raw.exportedAt };
  } catch (e) {
    const isPlan = raw?.format === PLAN_FORMAT || (raw && raw.format === undefined && SYNC_COLLS.some(k => Array.isArray(raw[k])));
    throw fail(isPlan ? 'plan' : 'invalid');
  }
}

// Adds every plan in the backup as a new plan named "{name} ({date of the backup})" and the visions
// whose id is not here. The open plan stays open. Returns how many of each were added.
export function restoreBackup({ store, exportedAt }) {
  const at = new Date(exportedAt);
  const date = isNaN(at) ? '' : ` (${fmtDate(isoDate(at))})`;
  let added = 0;
  for (const p of store.plans.list) {
    const id = uid(), data = store.data[p.id];
    data.deleted = {}; // a new plan has no deletions to remember
    try { userStorage.setItem(planKey(id), JSON.stringify(data)); } catch (e) { toast(t('err.storage')); break; }
    plans.list.push({ id, name: uniqueName(p.name + date) });
    added++;
  }
  const have = new Set(visions.list.map(v => v.id));
  const missing = store.visions.list.filter(v => !have.has(v.id) && have.add(v.id));
  visions.list.push(...missing);
  save();
  saveVisions();
  renderPlanSwitch();
  render();
  return { plans: added, visions: missing.length };
}

export const restoreFromFile = async file => restoreText(await file.text());

export function restoreText(text) {
  let backup;
  try {
    backup = parseBackup(text);
  } catch (e) {
    return toast(t({ plan: 'backup.isPlan', version: 'backup.newer' }[e.code] || 'err.import'));
  }
  const n = restoreBackup(backup);
  if (n.plans < backup.store.plans.list.length) return; // storage ran out: that message stays
  toast(tp('backup.done', n.plans) + (n.visions ? '. ' + tp('backup.visions', n.visions) : ''));
}

document.addEventListener('click', e => { if (e.target.closest('#backupAllBtn')) backupAll(); });
document.addEventListener('change', e => {
  if (e.target.id !== 'backupInput') return;
  if (e.target.files[0]) { restoreFromFile(e.target.files[0]); settings.close(); }
  e.target.value = '';
});
