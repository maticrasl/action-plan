/** Find your visions on screen: the HTML of each exercise's steps, its ending and its buttons. */
import { t, tp, type TextKey } from '../i18n/index';
import {
  lastRung,
  LADDER_MAX,
  lowAreas,
  prevStep,
  ratedAreas,
  SENTENCES,
  stepsOf,
  TEXT_MAX,
  toMake,
  type DiscAnswers,
  type ExerciseId,
} from '../core/discovery';
import type { Vision } from '../core/model';
import { esc } from './dom';

export interface PickGoal {
  plan: string;
  id: string;
  title: string;
  label: string; // with its plan's name when there are several plans
}
export interface StepCtx {
  goals: PickGoal[]; // active first
  areas: string[]; // to rate, and suggested in Area fields
  visions: Vision[];
  made: boolean; // visions this run added still exist
}

const q = (key: TextKey, params?: Record<string, string>) => `<p class="disc-q">${esc(t(key, params))}</p>`;
const box = (attr: string, value = '', rows = 8) =>
  `<textarea class="disc-text" ${attr} rows="${rows}" maxlength="${TEXT_MAX}">${esc(value)}</textarea>`;
const areaInput = (attr: string, value = '') =>
  `<input type="text" class="disc-area" ${attr} list="discAreas" maxlength="80" value="${esc(value)}" placeholder="${esc(t('f.visionArea'))}" aria-label="${esc(t('f.visionArea'))}">`;
const areaList = (ctx: StepCtx) =>
  `<datalist id="discAreas">${ctx.areas.map(a => `<option value="${esc(a)}">`).join('')}</datalist>`;
const radio = (name: string, value: string, label: string, on: boolean) =>
  `<label class="disc-choice"><input type="radio" name="${name}" value="${esc(value)}"${on ? ' checked' : ''}> <span>${esc(label)}</span></label>`;
const rung = (at: string) => Number(at.slice(1));

// The dots above the question: where the run stands.
export function dots(ex: ExerciseId, a: DiscAnswers, at: string) {
  const steps = stepsOf(ex, a, at),
    i = at === 'end' ? steps.length : steps.indexOf(at);
  return `<ol class="disc-dots" aria-label="${esc(t('disc.stepOf', { n: String(Math.min(i + 1, steps.length)), m: String(steps.length) }))}">${steps
    .map((_, k) => `<li class="${k < i ? 'past' : k === i ? 'now' : ''}"></li>`)
    .join('')}</ol>`;
}

export function stepHtml(ex: ExerciseId, a: DiscAnswers, at: string, ctx: StepCtx): string {
  if (at === 'end') return endHtml(ex, a, ctx);
  if (ex === 'good-day') {
    if (at !== 's5') return `${q(`disc.good-day.${at}` as TextKey)}${box(`data-a="${at}"`, a[at as 's1'])}`;
    const lines = a.s5 ?? [];
    return `${q('disc.good-day.s5')}<div class="disc-lines">${Array.from({ length: SENTENCES }, (_, i) => {
      const l = lines[i] ?? { text: '', area: '' };
      return `<div class="disc-line"><input type="text" class="disc-sentence" data-s5="${i}" data-part="text" maxlength="200" value="${esc(l.text)}" aria-label="${esc(t('disc.sentence', { n: String(i + 1) }))}">${areaInput(`data-s5="${i}" data-part="area"`, l.area)}</div>`;
    }).join('')}</div>${areaList(ctx)}`;
  }
  if (ex === 'what-for') {
    if (at === 'goal') {
      const on = a.goal ? `${a.goal.plan}|${a.goal.id}` : ctx.goals[0] && `${ctx.goals[0].plan}|${ctx.goals[0].id}`;
      return `${q('disc.what-for.goal')}<div class="disc-choices" role="radiogroup">${ctx.goals
        .map(g => radio('disc-goal', `${g.plan}|${g.id}`, g.label, on === `${g.plan}|${g.id}`))
        .join('')}</div>`;
    }
    const i = rung(at),
      ladder = a.ladder ?? [];
    const head =
      i === 0
        ? q('disc.what-for.l0', { goal: a.goal?.title ?? '' })
        : `<p class="hint">${esc(t('disc.ladderLead'))}</p>${q('disc.what-for.ln', { prev: ladder[i - 1] ?? '' })}`;
    return `${head}${box(`data-ladder="${i}"`, ladder[i], 3)}`;
  }
  if (at === 'rate')
    return `${q('disc.areas.rate')}<div class="disc-rates">${ctx.areas.map(area => rateRow(area, a.ratings?.[area])).join('')}</div>
      <button type="button" class="btn ghost" data-disc-do="add-area">${esc(t('disc.addArea'))}</button>`;
  if (at === 'better')
    return `${q('disc.areas.better')}<div class="disc-lines">${lowAreas(a)
      .map(
        area =>
          `<label class="disc-better"><span>${esc(area)} · ${a.ratings![area]}</span><input type="text" data-better="${esc(area)}" maxlength="${TEXT_MAX}" value="${esc(a.better?.[area] ?? '')}"></label>`,
      )
      .join('')}</div>`;
  return `${q('disc.areas.pick')}<div class="disc-choices" role="radiogroup">${ratedAreas(a)
    .map(area => radio('disc-pick', area, `${area} · ${a.ratings![area]}`, a.pick === area))
    .join('')}</div>`;
}

// Ten small buttons and skip: usable by touch and keys, not a slider.
function rateRow(area: string, v: number | undefined) {
  return `<div class="disc-rate" role="group" aria-label="${esc(area)}"><span class="disc-rate-name">${esc(area)}</span>
    <span class="disc-scale">${Array.from(
      { length: 10 },
      (_, i) =>
        `<button type="button" data-rate="${esc(area)}" data-v="${i + 1}" aria-pressed="${v === i + 1}" aria-label="${esc(`${area}: ${i + 1}`)}">${i + 1}</button>`,
    ).join('')}</span>
    <button type="button" class="disc-skip" data-rate="${esc(area)}" data-v="0" aria-pressed="${v === undefined}">${esc(t('disc.skip'))}</button></div>`;
}

function endHtml(ex: ExerciseId, a: DiscAnswers, ctx: StepCtx) {
  if (ex === 'areas') {
    if (!a.pick) return `<p class="disc-q">${esc(t('disc.nothingPicked'))}</p>`;
    const line = a.better?.[a.pick]?.trim();
    return `<h3 class="disc-pick">${esc(a.pick)}</h3>${line ? `<p class="disc-said">${esc(line)}</p>` : ''}`;
  }
  if (ex === 'what-for') {
    const v = a.vision ?? { text: lastRung(a), area: '' };
    const goal = a.goal && ctx.goals.some(g => g.plan === a.goal!.plan && g.id === a.goal!.id);
    return `<p class="disc-q">${esc(t('disc.whatForEnd'))}</p>
      <div class="disc-line"><input type="text" class="disc-sentence" data-vision="text" maxlength="200" value="${esc(v.text)}" aria-label="${esc(t('f.vision'))}">${areaInput('data-vision="area"', v.area)}</div>${areaList(ctx)}
      ${goal ? `<label class="rep-check"><input type="checkbox" data-serves${a.serves === false ? '' : ' checked'}> ${esc(t('disc.serves', { goal: a.goal!.title }))}</label>` : ''}`;
  }
  const list = toMake(ex, a, ctx.visions);
  if (!list.length) return `<p class="disc-q">${esc(t('disc.kept'))}</p>`;
  return `<ul class="disc-made">${list.map(m => `<li>◇ ${esc(m.title)}${m.area ? ` <span class="tag area">${esc(m.area)}</span>` : ''}</li>`).join('')}</ul>
    ${list.length > 1 ? `<p class="hint">${esc(t('disc.describeEach'))}</p>` : ''}`;
}

const btn = (do_: string, label: string, primary = false) =>
  `<button type="${primary ? 'submit' : 'button'}" class="btn${primary ? ' primary' : ' ghost'}" data-disc-do="${do_}">${esc(label)}</button>`;

export function footHtml(ex: ExerciseId, a: DiscAnswers, at: string, ctx: StepCtx) {
  const back = prevStep(ex, a, at) ? btn('back', t('disc.back')) : '';
  let main: string;
  if (at !== 'end')
    main =
      ex === 'what-for' && at !== 'goal' && rung(at) >= 1
        ? `${rung(at) + 1 < LADDER_MAX ? btn('again', t('disc.again')) : ''}${btn('next', t('disc.enough'), true)}`
        : btn('next', t('disc.next'), true);
  else if (ex === 'areas')
    main = a.pick
      ? `${btn('finish', t('disc.finish'))}${btn('goal', t('disc.addGoalFor', { area: a.pick }))}${btn('vision', t('disc.addVisionFor', { area: a.pick }), true)}`
      : btn('finish', t('disc.finish'), true);
  else {
    const list = ctx.made ? [] : toMake(ex, a, ctx.visions),
      fresh = list.filter(m => !m.existing).length;
    main =
      ex === 'what-for' && list[0]?.existing
        ? btn('add', t('disc.linkTo', { title: list[0].existing.title }), true)
        : fresh
          ? btn('add', tp('disc.addVisions', fresh), true)
          : btn('finish', t('disc.finish'), true);
  }
  return `${back}<span class="spacer"></span>${main}`;
}
