/** A plan in and out: export and share, import, and the sample plan. */
import { PLAN_FORMAT, PLAN_VERSION, hasProgress, parsePlanFile, progressCounts, resetProgress } from '../core/normalize';
import { db, visions } from '../core/state';
import { currentPlan, plans } from '../store/state';
import { I18N, lang, t, tp } from '../i18n/index';
import { fmtDate, isoDate, today } from '../core/dates';
import { $, esc } from './dom';
import { closeCtxMenu } from './menu';
import { createPlan, planKey, save, uniqueName } from '../store/plans';
import { toast } from './toast';
import { uid } from '../core/util';
import { weekday } from '../core/routines/schedule';
import { dayNum } from '../core/days';
import { refreshTotal } from '../core/cumulative';
import { SYNC_FORMAT, parseStore, toFile } from '../sync/drive';
import { localStore } from '../sync/sync';
import { SYNC_COLLS } from '../core/merge';
import { userStorage } from '../store/users';
import { saveVisions } from '../store/visions';
import { renderPlanSwitch } from './plan-switcher';
import { requestRender } from './render';
import { settings } from './settings';

/* ---------- Import / export / sample ---------- */

export function planFile(kind) {
  const data = kind === 'template' ? resetProgress(db, { shift: true }) : db;
  const { goals, states, activities, relations } = data;
  return { format: PLAN_FORMAT, version: PLAN_VERSION, kind, name: currentPlan().name, exportedAt: new Date().toISOString(), goals, states, activities, relations };
}

export const planFileName = kind => {
  const name = currentPlan().name.replace(/[\\/:*?"<>|]+/g, '').trim() || t('app.file');
  return `${name}${kind === 'template' ? '-' + t('export.templateFile') : ''}-${today()}.json`;
};

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Downloads the plan, or hands it to the system share sheet where files can be shared (phones).
// A cancelled share does nothing; a failed one falls back to a download.
export async function exportPlan(kind, share = false) {
  const blob = new Blob([JSON.stringify(planFile(kind), null, 2)], { type: 'application/json' });
  const name = planFileName(kind);
  if (share) {
    try {
      await navigator.share({ files: [new File([blob], name, { type: 'application/json' })], title: currentPlan().name });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  download(blob, name);
}
export const exportJson = () => exportPlan('full');
export const canShareFiles = () => {
  try { return !!navigator.canShare?.({ files: [new File(['{}'], 'plan.json', { type: 'application/json' })] }); } catch (e) { return false; }
};

export const planExp = $('#planExport');

export function openExport() {
  closeCtxMenu();
  $('#planExportName').textContent = currentPlan().name;
  planExp.querySelector('input[name="exportKind"][value="full"]').checked = true;
  $('#exportShareBtn').hidden = !canShareFiles();
  planExp.showModal();
}
planExp.addEventListener('click', e => {
  if (e.target === planExp || e.target.closest('[data-plan-export-close]')) return planExp.close();
  const share = e.target.closest('#exportShareBtn');
  if (!share && !e.target.closest('#exportDownloadBtn')) return;
  const kind = planExp.querySelector('input[name="exportKind"]:checked').value;
  planExp.close();
  exportPlan(kind, !!share);
});

// Imports always become a new plan, so nothing is overwritten. A full copy that holds progress asks
// first whether to keep it or start fresh (someone may have shared their own plan).
export const planImp = $('#planImport');
export let pendingImport = null;

export function addImported(name, data, msg = 'toast.imported') {
  createPlan(uniqueName(name), data);
  toast(t(msg));
}

export async function importJson(file) {
  let plan;
  try {
    plan = parsePlanFile(await file.text(), file.name);
  } catch (e) {
    return toast(t(e.code === 'version' ? 'err.importVersion' : 'err.import'));
  }
  if (plan.kind === 'template' || !hasProgress(plan.data)) return addImported(plan.name, plan.data);
  pendingImport = plan;
  const counts = progressCounts(plan.data);
  const items = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `<li>${esc(tp('import.' + k, n))}</li>`).join('');
  $('#planImportBody').innerHTML = `
    <p>${t('import.lead', { name: `<strong>${esc(plan.name)}</strong>` })}</p>
    <ul class="import-progress">${items}</ul>
    <p class="hint">${t('import.hint')}</p>`;
  planImp.showModal();
}
planImp.addEventListener('close', () => { pendingImport = null; });
planImp.addEventListener('click', e => {
  const keep = e.target.closest('#importKeepBtn'), fresh = e.target.closest('#importFreshBtn');
  if (e.target === planImp || e.target.closest('[data-plan-import-close]')) return planImp.close();
  if (!(keep || fresh) || !pendingImport || !planImp.open) return;
  const { name, data } = pendingImport;
  planImp.close();
  if (keep) addImported(name, data);
  else addImported(name, resetProgress(data), 'toast.importedFresh');
});

// A plan that exercises every feature: all relationship types, sub-goals, three levels of
// sub-activities, dependency chains, and every status (not started, in progress, late, waiting, done).
// The sample plan's data (also used by the guided tour in tutorial.js).
export function sampleData() {
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoDate(x); };
  const [halfMarathon, fund, tenK, weight, course, spanish, sell, trip, bathroom, heating, exercise, weeklyKm] = Array.from({ length: 12 }, uid);
  const [fitness, savings, spending, bodyWeight, itemsSold, heatingBill, distance] = Array.from({ length: 7 }, uid);
  const a = Array.from({ length: 25 }, uid);
  // Routine check-ins on the past days `from`..yesterday that `keep(daysAgo, weekday)` picks.
  const ticks = (from, keep) => Object.fromEntries(Array.from({ length: -from }, (_, i) => from + i)
    .filter(n => keep(n, weekday(d(n)))).map(n => [d(n), 1]));
  // Strength training on Mondays and Thursdays, one session missed two weeks ago.
  const missed = Array.from({ length: 7 }, (_, i) => -14 + i).find(n => [0, 3].includes(weekday(d(n))));
  // A state's measurements from [days from today, value] pairs, oldest first; the last is its value.
  const readings = list => {
    const history = list.map(([n, v]) => ({ date: d(n), value: String(v) }));
    return { value: history.at(-1).value, date: history.at(-1).date, history };
  };
  // Numbers and dates live here; the wording (and word units) come from the active language (i18n.js → sample).
  const txt = I18N[lang].sample;
  const withText = (list, texts) => list.map((x, i) => ({ ...x, ...texts[i] }));
  const data = {
    goals: withText([
      { id: halfMarathon, unit: 'km', baseline: '5', current: '', target: '21.1', startDate: d(-30), deadline: d(90), status: 'active' },
      { id: fund, unit: '€', baseline: '1000', current: '', target: '6000', startDate: d(-60), deadline: d(240), status: 'active' },
      { id: tenK, unit: 'km', baseline: '5', current: '', target: '10', startDate: d(-30), deadline: d(30), status: 'active' },
      { id: weight, unit: 'kg', baseline: '81', current: '', target: '75', startDate: d(-30), deadline: d(120), status: 'active' },
      { id: course, baseline: '0', current: '8', target: '8', startDate: d(-90), deadline: d(-10), status: 'achieved' },
      { id: spanish, baseline: '0', current: '', target: '1500', startDate: d(30), deadline: d(300), status: 'active' },
      { id: sell, baseline: '0', current: '', target: '10', startDate: d(-40), deadline: d(-3), status: 'active' },
      { id: trip, baseline: '0', current: '', target: '14', startDate: d(60), deadline: d(400), status: 'active' },
      { id: bathroom, progress: 'activities', startDate: d(-25), deadline: d(45), status: 'active' },
      { id: heating, unit: '€', baseline: '180', current: '', target: '120', startDate: d(-60), deadline: d(180), status: 'active' },
      { id: exercise, progress: 'routines', startDate: d(-35), deadline: d(150), status: 'active' },
      { id: weeklyKm, unit: 'km', baseline: '12', current: '', target: '30', period: 'week', startDate: d(-35), deadline: d(150), status: 'active' },
    ], txt.goals),
    // Enough measurements for the graphs to tell a story: each starts before its goal (at the goal's
    // starting value on the goal's start date) and wobbles on its way, as real readings do.
    states: withText([
      { id: fitness, unit: 'km', ...readings([[-58, 4], [-51, 4.5], [-44, 4.5], [-37, 5], [-30, 5], [-23, 6], [-16, 6.5], [-9, 7.5], [-2, 8]]) },
      { id: savings, unit: '€', ...readings([[-120, 550], [-90, 800], [-75, 760], [-60, 1000], [-45, 1080], [-30, 1450], [-20, 1520], [-5, 1900]]) },
      { id: spending, unit: '€', ...readings([[-185, 2450], [-155, 2380], [-125, 2520], [-95, 2300], [-65, 2250], [-35, 2100], [-5, 2000]]) },
      { id: bodyWeight, unit: 'kg', ...readings([[-63, 82.4], [-56, 82.1], [-49, 82.3], [-42, 81.8], [-35, 81.4], [-30, 81], [-23, 80.3], [-16, 79.6], [-9, 78.9], [-1, 78]]) },
      { id: itemsSold, ...readings([[-38, 0], [-33, 1], [-27, 2], [-20, 2], [-15, 3], [-11, 4], [-7, 5], [-4, 6]]) },
      { id: heatingBill, unit: '€', ...readings([[-150, 195], [-120, 188], [-90, 184], [-60, 180], [-30, 172], [-5, 165]]) },
      { id: distance, unit: 'km', cumulative: true, scale: 'week', entries: [], value: '', date: '', history: [] },
    ], txt.states),
    activities: withText([
      { id: a[0], status: 'done', startDate: d(-30), dueDate: d(-20) },   // running shoes
      { id: a[1], status: 'doing', startDate: d(-30), dueDate: d(88) },   // training plan
      { id: a[2], status: 'todo', startDate: d(-3), dueDate: d(5) },     // register for the race
      { id: a[3], status: 'todo', startDate: d(21), dueDate: d(28) },    // 10 km test race
      { id: a[4], status: 'done', startDate: d(-60), dueDate: d(-55) },   // automate savings
      { id: a[5], status: 'todo', startDate: d(-14), dueDate: d(-1) },    // cancel subscriptions (late)
      { id: a[6], status: 'todo', startDate: d(-20), dueDate: d(60), repeat: { every: 1, unit: 'week', times: 5 },   // cook at home (routine)
        checkins: ticks(-20, (n, wd) => wd < 5 && n % 9 !== 0) },
      { id: a[7], status: 'doing', startDate: d(-30), dueDate: d(26) },   // weeks 1–8
      { id: a[8], status: 'todo', startDate: d(27), dueDate: d(88) },    // weeks 9–16
      { id: a[9], status: 'todo', dueDate: d(75) },    // long run
      { id: a[10], status: 'done', startDate: d(-14), dueDate: d(-10) },  // review statements
      { id: a[11], status: 'todo', startDate: d(-9), dueDate: d(-1) },   // cancel streaming (late)
      { id: a[12], status: 'doing', startDate: d(-25), dueDate: d(60) },  // cut evening snacks
      { id: a[13], status: 'doing', startDate: d(-15), dueDate: d(10) },  // list items for sale (a list, the first one done)
      { id: a[14], status: 'done', startDate: d(-90), dueDate: d(-12) },  // finish course modules
      { id: a[15], status: 'todo', startDate: d(30), dueDate: d(35) },   // choose a language app
      { id: a[16], status: 'done', startDate: d(-25), dueDate: d(-15) },  // contractor quotes
      { id: a[17], status: 'done', startDate: d(-12), dueDate: d(-4) },   // remove old tiles
      { id: a[18], status: 'doing', startDate: d(-3), dueDate: d(30) },   // bathroom works
      { id: a[19], status: 'doing', startDate: d(-3), dueDate: d(8) },    // new plumbing
      { id: a[20], status: 'todo', startDate: d(9), dueDate: d(20) },    // tiling
      { id: a[21], status: 'todo', startDate: d(21), dueDate: d(30) },   // fittings
      { id: a[22], status: 'todo', startDate: d(40), dueDate: d(60) },   // insulate the attic
      { id: a[23], status: 'todo', startDate: d(-35), repeat: { every: 1, unit: 'week', times: 3 },   // run 3 times a week (routine)
        checkins: ticks(-35, (n, wd) => (n > -22 && n <= -15 ? wd === 2 : [1, 3, 5].includes(wd))) },   // one lean week
      { id: a[24], status: 'todo', startDate: d(-28), repeat: { every: 1, unit: 'week', days: [0, 3] },   // strength training (routine)
        checkins: ticks(-28, (n, wd) => [0, 3].includes(wd) && n !== missed) },   // a routine list
    ], txt.activities),
    relations: [],
  };
  data.activities[13].list = txt.activities[13].list.map((text, i) => ({ id: uid(), text, done: i === 0 }));
  // Strength training is a routine list: every ticked day has all its exercises ticked.
  const strength = data.activities[24];
  strength.list = txt.activities[24].list.map(text => ({ id: uid(), text, done: false }));
  strength.listDays = Object.fromEntries(Object.keys(strength.checkins).map(day => [day, Object.fromEntries(strength.list.map(i => [i.id, 1]))]));
  // Each run adds its kilometres to the weekly distance, a little longer as the weeks go by.
  const runs = data.activities.find(x => x.id === a[23]), km = data.states.find(x => x.id === distance);
  km.entries = Object.keys(runs.checkins).sort().map((date, i) => ({ id: uid(), date, amount: String(Math.round((4.5 + (dayNum(date) - dayNum(d(-35))) * 0.08 + (i % 3 === 2 ? 2 : 0)) * 2) / 2), routine: a[23] }));
  refreshTotal(km);
  const rel = (from, type, to) => data.relations.push({ id: uid(), from, to, type });
  // Goals: two sub-goals under the half marathon, a late sub-goal under the fund,
  // and a trip that waits for two other goals.
  rel(tenK, 'subgoal', halfMarathon); rel(weight, 'subgoal', halfMarathon); rel(sell, 'subgoal', fund);
  rel(fund, 'depends', course); rel(trip, 'depends', spanish); rel(trip, 'depends', fund);
  // Current states
  rel(fitness, 'measures', halfMarathon); rel(fitness, 'measures', tenK); rel(savings, 'measures', fund);
  rel(bodyWeight, 'measures', weight); rel(itemsSold, 'measures', sell);
  rel(heatingBill, 'measures', heating);
  rel(distance, 'measures', weeklyKm); rel(weeklyKm, 'subgoal', halfMarathon); rel(a[23], 'improves', distance);
  // Activities → goals
  rel(a[0], 'contributes', halfMarathon); rel(a[1], 'contributes', halfMarathon); rel(a[1], 'contributes', tenK);
  rel(a[2], 'contributes', halfMarathon); rel(a[3], 'contributes', tenK); rel(a[4], 'contributes', fund);
  rel(a[5], 'contributes', fund); rel(a[6], 'contributes', fund); rel(a[12], 'contributes', weight);
  rel(a[13], 'contributes', sell); rel(a[14], 'contributes', course); rel(a[15], 'contributes', spanish);
  rel(a[16], 'contributes', bathroom); rel(a[17], 'contributes', bathroom); rel(a[18], 'contributes', bathroom);
  rel(a[22], 'contributes', heating);
  rel(a[23], 'contributes', exercise); rel(a[24], 'contributes', exercise);
  rel(a[23], 'improves', fitness);
  // Activities → current states
  rel(a[1], 'improves', fitness); rel(a[5], 'improves', spending); rel(a[6], 'improves', spending);
  rel(a[12], 'improves', bodyWeight); rel(a[13], 'improves', itemsSold);
  rel(a[22], 'improves', heatingBill);
  // Training plan → two phases → a key session in phase two (three levels deep).
  rel(a[7], 'subactivity', a[1]); rel(a[8], 'subactivity', a[1]); rel(a[9], 'subactivity', a[8]);
  rel(a[10], 'subactivity', a[5]); rel(a[11], 'subactivity', a[5]);
  rel(a[19], 'subactivity', a[18]); rel(a[20], 'subactivity', a[18]); rel(a[21], 'subactivity', a[18]);
  // Dependency chains
  rel(a[1], 'depends', a[0]); rel(a[8], 'depends', a[7]); rel(a[3], 'depends', a[7]); rel(a[11], 'depends', a[10]);
  rel(a[17], 'depends', a[16]); rel(a[18], 'depends', a[16]); rel(a[20], 'depends', a[19]); rel(a[21], 'depends', a[20]);
  return data;
}

export function loadSample() {
  createPlan(uniqueName(t('plan.sampleName')), sampleData());
  toast(t('toast.sample'));
}

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
  requestRender();
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
