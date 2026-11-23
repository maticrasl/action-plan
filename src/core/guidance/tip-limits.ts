/** Every threshold the tips use, in one place, so the owner can tune them. */

// History
export const COOLDOWN_A = 14; // days before a class A tip may come back for the same item
export const COOLDOWN_B = 30; // the same for class B
export const MAX_SHOWINGS = 3; // a class A or B tip comes back at most this many times in all
export const SNOOZE_DAYS = 7; // Not now
export const HINT_SHOWINGS = 3; // the first tips a user sees say that tips can be turned off
export const QUIET_START_DAYS = 2; // no tips until this many days after the first item

// Class A
export const BACK_DAYS = 10; // back: days since the last activity
export const OVERDUE_PILE = 3; // overdue-pile: overdue steps
export const ROUTINE_MISSED = 2; // routine-missed: last due days or periods missed in a row
export const ROUTINE_LOW_DAYS = 21; // routine-low: running at least this long
export const ROUTINE_LOW_SHARE = 0.5; // routine-low: kept under this share
export const BEHIND_DAYS = 14; // goal-behind: deadline within this many days
export const BEHIND_POINTS = 30; // goal-behind: "Behind pace" by more than this many points of the whole way
export const STUCK_DAYS = 21; // stuck-step: In progress this long
export const WRONG_WAY_MOVES = 3; // wrong-way: moves away from the target in a row
export const TOO_MANY_GOALS = 5; // too-many-goals: active goals
export const TOO_MANY_GOALS_PROGRESS = 25; // too-many-goals: average progress under this (%)
export const TOO_MANY_ROUTINES = 6; // too-many-routines: running routines
export const TOO_MANY_ROUTINES_SHARE = 0.6; // too-many-routines: kept under this share on average

// Class B
export const NO_STEPS_AGE = 2; // no-steps: goal older than this many days
export const NO_DATES = 3; // no-dates: To do steps without a date
export const ONLY_RESULT_AGE = 7; // only-result: goal older than this many days
export const STALE_STATE_DAYS = 14; // stale-state: last measured this many days ago
export const NO_MEASURE_AGE = 7; // no-measure: goal older than this many days
export const FAR_GOAL_MONTHS = 6; // far-goal: deadline more than this many months away
export const WAITING_DAYS = 14; // waiting: waited this many days for a step still To do
export const MANY_DOING = 6; // many-doing: steps In progress
export const NO_VISION_GOALS = 2; // no-vision: active goals
export const NO_VISION_DAYS = 14; // no-vision: days since the first item
export const WEEK_REVIEW_DAYS = 6; // week: last weekly review at least this many days ago
export const NEW_YEAR_LAST_DAY = 14; // new-year: shown 1 to this day of January
export const UNFINISHED_AGE = 7; // goal-unfinished: goal older than this many days

// Class C
export const HOLDS_PERIODS = 4; // routine-holds: weeks or months met in a row
export const HALFWAY = 50; // halfway: progress passed (%)
export const HALFWAY_FROM = 40; // halfway: the goal was seen under this (%)
export const ACHIEVED_DAYS = 7; // achieved: marked Achieved within this many days
export const FIRST_MONTH_DAYS = 30; // first-month: days since the first item
export const FIRST_MONTH_OPENED = 8; // first-month: days opened in the last 30

// Class D
export const DISCOVER_AFTER = 5; // every class D tip: days since the first item
export const TRY_MAP_ITEMS = 6; // try-map: items in the plan
export const TRY_TIMELINE_ITEMS = 4; // try-timeline: items with dates
export const MAKE_UP_DAYS = 14; // make-up: a set day missed within this many days
export const ADDS_UP_VALUES = 3; // adds-up: values that only grow
export const USE_LIST_PARTS = 3; // use-list: lines, or commas, in the details
export const ROUTINE_LIST = 3; // routine-list: daily routines
export const BACKUP_ITEMS = 10; // backup: items in the plan
export const BACKUP_DAYS = 7; // backup: days since the first item
export const INSTALL_DAYS = 5; // install: days opened
export const MENU_ITEMS = 10; // menu and ctrl-enter: items in the plan
export const SHARE_DAYS = 30; // share: days since the first item
