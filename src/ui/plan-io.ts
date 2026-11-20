/** Plans in and out: export and share one, import one, back up and restore all of them. */
import {
  PLAN_FORMAT,
  PLAN_VERSION,
  hasProgress,
  parsePlanFile,
  progressCounts,
  resetProgress,
  type PlanFileRead,
} from '../core/normalize';
import { db, visions } from '../core/state';
import { planCsv } from '../core/csv';
import { currentPlan, plans } from '../store/state';
import { t, tp, type PluralKey, type TextKey } from '../i18n/index';
import { fmtDate, isoDate, today } from '../core/dates';
import { $, esc, settings } from './dom';
import { closeCtxMenu } from './menu';
import { createPlan, planKey, save, uniqueName } from '../store/plans';
import { toast } from './toast';
import { uid } from '../core/util';
import { SYNC_FORMAT, parseStore, toFile } from '../sync/drive';
import { localStore } from '../sync/sync';
import type { FullStore, Store } from '../core/merge';
import { Db, SYNC_COLLS } from '../core/model';
import { userStorage } from '../store/users';
import { saveVisions } from '../store/visions';
import { markSeen } from '../store/seen';
import { renderPlanSwitch } from './plan-switcher';
import { requestRender } from './render';

/* ---------- Import / export / sample ---------- */

export function planFile(kind: string) {
  const data = kind === 'template' ? resetProgress(db, { shift: true }) : db;
  const { goals, states, activities, relations } = data;
  return {
    format: PLAN_FORMAT,
    version: PLAN_VERSION,
    kind,
    name: currentPlan()!.name,
    exportedAt: new Date().toISOString(),
    goals,
    states,
    activities,
    relations,
  };
}

// A name without the characters a file name cannot hold, and today's date.
export const fileName = (name: string, ext: string, suffix = '') =>
  `${name.replace(/[\\/:*?"<>|]+/g, '').trim() || t('app.file')}${suffix}-${today()}.${ext}`;
export const planFileName = (kind: string) =>
  kind === 'template'
    ? fileName(currentPlan()!.name, 'json', '-' + t('export.templateFile'))
    : fileName(currentPlan()!.name, kind === 'csv' ? 'csv' : 'json');

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Downloads the plan, or hands it to the system share sheet where files can be shared (phones).
// A cancelled share does nothing; a failed one falls back to a download.
export async function exportPlan(kind: string, share = false) {
  const type = kind === 'csv' ? 'text/csv' : 'application/json';
  const blob = new Blob([kind === 'csv' ? planCsv(db.states) : JSON.stringify(planFile(kind), null, 2)], { type });
  const name = planFileName(kind);
  if (share) {
    try {
      await navigator.share({
        files: [new File([blob], name, { type })],
        title: currentPlan()!.name,
      });
      if (kind === 'full') markSeen({ exported: true });
      return;
    } catch (e) {
      if ((e as Error | null)?.name === 'AbortError') return;
    }
  }
  download(blob, name);
  if (kind === 'full') markSeen({ exported: true });
}
export const exportJson = () => exportPlan('full');
export const canShareFiles = () => {
  try {
    return !!navigator.canShare?.({ files: [new File(['{}'], 'plan.json', { type: 'application/json' })] });
  } catch (e) {
    return false;
  }
};

export const planExp = $<HTMLDialogElement>('#planExport');

export function openExport() {
  closeCtxMenu();
  $('#planExportName').textContent = currentPlan()!.name;
  planExp.querySelector<HTMLInputElement>('input[name="exportKind"][value="full"]')!.checked = true;
  $('#exportShareBtn').hidden = !canShareFiles();
  planExp.showModal();
}
planExp.addEventListener('click', e => {
  if (e.target === planExp || (e.target as HTMLElement).closest('[data-plan-export-close]')) return planExp.close();
  const share = (e.target as HTMLElement).closest('#exportShareBtn');
  if (!share && !(e.target as HTMLElement).closest('#exportDownloadBtn')) return;
  const kind = planExp.querySelector<HTMLInputElement>('input[name="exportKind"]:checked')!.value;
  planExp.close();
  exportPlan(kind, !!share);
});

// Imports always become a new plan, so nothing is overwritten. A full copy that holds progress asks
// first whether to keep it or start fresh (someone may have shared their own plan).
export const planImp = $<HTMLDialogElement>('#planImport');
export let pendingImport: PlanFileRead | null = null;

export function addImported(name: string, data: Db, msg: TextKey = 'toast.imported') {
  createPlan(uniqueName(name), data);
  toast(t(msg));
}

export async function importJson(file: File) {
  let plan;
  try {
    plan = parsePlanFile(await file.text(), file.name);
  } catch (e) {
    return toast(t((e as { code?: string }).code === 'version' ? 'err.importVersion' : 'err.import'));
  }
  if (plan.kind === 'template' || !hasProgress(plan.data)) return addImported(plan.name, plan.data);
  pendingImport = plan;
  const counts = progressCounts(plan.data);
  const items = Object.entries(counts)
    .filter(([, n]) => n)
    .map(([k, n]) => `<li>${esc(tp(('import.' + k) as PluralKey, n))}</li>`)
    .join('');
  $('#planImportBody').innerHTML = `
    <p>${t('import.lead', { name: `<strong>${esc(plan.name)}</strong>` })}</p>
    <ul class="import-progress">${items}</ul>
    <p class="hint">${t('import.hint')}</p>`;
  planImp.showModal();
}
planImp.addEventListener('close', () => {
  pendingImport = null;
});
planImp.addEventListener('click', e => {
  const keep = (e.target as HTMLElement).closest('#importKeepBtn'),
    fresh = (e.target as HTMLElement).closest('#importFreshBtn');
  if (e.target === planImp || (e.target as HTMLElement).closest('[data-plan-import-close]')) return planImp.close();
  if (!(keep || fresh) || !pendingImport || !planImp.open) return;
  const { name, data } = pendingImport;
  planImp.close();
  if (keep) addImported(name, data);
  else addImported(name, resetProgress(data), 'toast.importedFresh');
});

/* =========================================================
   Full backup: every plan and the visions in one file
   ---------------------------------------------------------
   The file is the sync file's own format with `kind: 'backup'` and `exportedAt` added, so the sync
   parser reads it. Restoring adds each plan as a new plan and the visions that are missing here;
   nothing that exists is changed.
   Loaded after drive.js and before app.js; uses their helpers only when called.
   ========================================================= */

// Without Recently deleted, so it stays version 1 and older versions can still restore it.
export const backupFile = () => ({
  ...toFile({ ...localStore(), trash: undefined }),
  version: 1,
  kind: 'backup',
  exportedAt: new Date().toISOString(),
});

export function backupAll() {
  const blob = new Blob([JSON.stringify(backupFile(), null, 2)], { type: 'application/json' });
  download(blob, `${t('backup.file')} ${today()}.json`);
  markSeen({ exported: true });
}

// Reads a backup file; throws an error with code 'invalid', 'plan' (a single plan's export) or
// 'version' (from a newer app).
export function parseBackup(text: string): { store: FullStore; exportedAt?: string } {
  const fail = (code: string) => Object.assign(new Error(code), { code });
  let raw: { format?: unknown; version?: number; exportedAt?: string; [k: string]: unknown } | null;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw fail('invalid');
  }
  if (raw?.format === SYNC_FORMAT && raw.version! > toFile({} as Store).version) throw fail('version');
  try {
    return { store: parseStore(text), exportedAt: raw!.exportedAt };
  } catch (e) {
    const isPlan =
      raw?.format === PLAN_FORMAT || (raw && raw.format === undefined && SYNC_COLLS.some(k => Array.isArray(raw[k])));
    throw fail(isPlan ? 'plan' : 'invalid');
  }
}

// Adds every plan in the backup as a new plan named "{name} ({date of the backup})" and the visions
// whose id is not here. The open plan stays open. Returns how many of each were added.
export function restoreBackup({ store, exportedAt }: { store: FullStore; exportedAt?: string }) {
  const at = new Date(exportedAt!);
  const date = isNaN(+at) ? '' : ` (${fmtDate(isoDate(at))})`;
  let added = 0;
  for (const p of store.plans.list) {
    const id = uid(),
      data = store.data[p.id];
    data.deleted = {}; // a new plan has no deletions to remember
    try {
      userStorage.setItem(planKey(id), JSON.stringify(data));
    } catch (e) {
      toast(t('err.storage'));
      break;
    }
    plans.list.push({ id, name: uniqueName(p.name + date) });
    added++;
  }
  const have = new Set(visions.list.map(v => v.id));
  const missing = store.visions.list.filter(v => !have.has(v.id) && have.add(v.id));
  visions.list.push(...missing);
  save();
  saveVisions();
  renderPlanSwitch();
  requestRender();
  return { plans: added, visions: missing.length };
}

export const restoreFromFile = async (file: File) => restoreText(await file.text());

export function restoreText(text: string) {
  let backup;
  try {
    backup = parseBackup(text);
  } catch (e) {
    return toast(
      t(
        ({ plan: 'backup.isPlan', version: 'backup.newer' } as Record<string, TextKey>)[(e as { code: string }).code] ||
          'err.import',
      ),
    );
  }
  const n = restoreBackup(backup);
  if (n.plans < backup.store.plans.list.length) return; // storage ran out: that message stays
  toast(tp('backup.done', n.plans) + (n.visions ? '. ' + tp('backup.visions', n.visions) : ''));
}

document.addEventListener('click', e => {
  if ((e.target as HTMLElement).closest('#backupAllBtn')) backupAll();
});
document.addEventListener('change', e => {
  if ((e.target as HTMLInputElement).id !== 'backupInput') return;
  if ((e.target as HTMLInputElement).files![0]) {
    restoreFromFile((e.target as HTMLInputElement).files![0]);
    settings.close();
  }
  (e.target as HTMLInputElement).value = '';
});
