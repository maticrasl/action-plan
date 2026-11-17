/** Ready-made plan templates, as data. */
import { HEALTH } from '../core/templates/health';
import { MONEY } from '../core/templates/money';
import { LEARNING } from '../core/templates/learning';
import { CAREER } from '../core/templates/career';
import { HOME } from '../core/templates/home';
import { WELLBEING } from '../core/templates/wellbeing';
import { FAITH } from '../core/templates/faith';

/* =========================================================
   Plan templates
   ---------------------------------------------------------
   Ready-made plans to start from (Settings → Start from a template).
   Each template is data only; templateData() in app.js turns one into a plan.
   - Text is a pair [English, Slovene] (TPL_LANGS); a unit may also be a plain
     string such as 'km' or '€'.
   - Dates are days from the day the template is used: `start` and `end`.
   - Items are named by `k`; links point to those names:
     goal `sub` (its parent goal) and `deps` (goals it waits for);
     state `measures` (goals); activity `goals` (contributes to), `improves`
     (states), `parent` (its parent activity) and `deps` (activities it waits for).
   - `repeat` makes an activity a routine (see the routine notes in app.js); `repeat.makeUp` lets
     another day of the period make up a missed set day. Nothing may depend on a routine.
   - `list` gives an activity checklist items (text pairs); a routine's items are ticked each day.
   - Goals without `progress` are measured from `baseline` to `target`; a goal measured by a state
     that adds up (`cumulative`, its graph's `scale`) counts it per `period` or in total.
   ========================================================= */

export const TPL_LANGS = ['en', 'sl'];
export const TPL_AREAS = ['health', 'money', 'learning', 'career', 'home', 'wellbeing', 'faith'];

export const TEMPLATES = [

  ...HEALTH,

  ...MONEY,

  ...LEARNING,

  ...CAREER,

  ...HOME,

  ...WELLBEING,
  ...FAITH,
];
