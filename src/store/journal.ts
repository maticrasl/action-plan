/** The journal as stored (per user, synced): load, save, reviews, sessions and this week's focus. */
import { itemContent, stampList } from '../core/merge';
import { normalizeJournal, type Journal, type Review, type Session } from '../core/journal';
import { today } from '../core/dates';
import { addDays, weekday } from '../core/routines/schedule';
import { uid } from '../core/util';
import type { ISODate } from '../core/model';
import { userStorage } from './users';
import { emit } from './events';

/* Rules: docs/features/00-foundation.md part 1. No screen yet; features 01, 09 and 14 bring them.
   Nothing is stored until the first save, so a device without a journal syncs none. */

export const JOURNAL_KEY = 'actionplan.journal';
export let journal: Journal = normalizeJournal(null);
let reviewSnapshot = new Map<string, string>(),
  sessionSnapshot = new Map<string, string>();

const snap = (list: { id: string; updatedAt?: string }[]) => new Map(list.map(x => [x.id, itemContent(x)] as const));
function take() {
  reviewSnapshot = snap(journal.reviews);
  sessionSnapshot = snap(journal.sessions);
}
function store() {
  try {
    userStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  } catch (e) {
    emit('storageError');
  }
  emit('saved');
}

// Also after another user takes over, or another tab saved it.
export function loadJournal() {
  try {
    journal = normalizeJournal(JSON.parse(userStorage.getItem(JOURNAL_KEY) as string));
  } catch (e) {
    journal = normalizeJournal(null);
  }
  take();
}

export function hasJournal() {
  try {
    return userStorage.getItem(JOURNAL_KEY) !== null;
  } catch (e) {
    return false;
  }
}

// Stamps what changed since the last save and remembers deleted ids, as visions do.
export function saveJournal() {
  const now = new Date().toISOString();
  stampList(journal.reviews, reviewSnapshot, journal.deleted, now);
  stampList(journal.sessions, sessionSnapshot, journal.deleted, now);
  take();
  store();
}

// A merged journal from sync: stored as it is, its stamps kept.
export function applyJournal(j: Journal) {
  journal = normalizeJournal(j);
  take();
  try {
    userStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  } catch (e) {
    emit('storageError');
  }
}

/* ---------- Reviews and sessions ---------- */

export function addReview(r: Omit<Review, 'id'>): Review {
  const review = { id: uid(), ...r };
  journal.reviews.push(review);
  saveJournal();
  return review;
}
export function updateReview(id: string, patch: Partial<Omit<Review, 'id'>>) {
  const r = journal.reviews.find(x => x.id === id);
  if (!r) return;
  Object.assign(r, patch);
  saveJournal();
}
export function deleteReview(id: string) {
  journal.reviews = journal.reviews.filter(x => x.id !== id);
  saveJournal();
}

export function addSession(s: Omit<Session, 'id'>): Session {
  const session = { id: uid(), ...s };
  journal.sessions.push(session);
  saveJournal();
  return session;
}
export function updateSession(id: string, patch: Partial<Omit<Session, 'id'>>) {
  const s = journal.sessions.find(x => x.id === id);
  if (!s) return;
  Object.assign(s, patch);
  saveJournal();
}
export function deleteSession(id: string) {
  journal.sessions = journal.sessions.filter(x => x.id !== id);
  saveJournal();
}

/* ---------- This week's one thing ---------- */

// `week` (a Monday) is this week unless given: a review done Friday to Sunday chooses for the coming week.
export function setFocus(plan: string, item: string, week?: ISODate) {
  const day = today();
  journal.focus = { week: week || addDays(day, -weekday(day)), plan, item, at: new Date().toISOString() };
  saveJournal();
}
// Leaves an empty focus with its time, so another device's older choice does not come back on sync.
export const clearFocus = () => setFocus('', '');
