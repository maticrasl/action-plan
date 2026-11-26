/** Notes (feature 15): dated notes on goals, activities and states; adding, editing, deleting, merging and checking them. */
import type { ISODate, ISOTime, Note, WithNotes } from './model';
import { safeId } from './normalize';
import { uid } from './util';
import { stampNow } from './merge';

export const NOTE_MAX = 2000;
export const VALUE_NOTE_MAX = 200;

const byDate = (a: Note, b: Note) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at);
const stamp = () => stampNow(); // a call, not the function itself: merge.ts imports this module too

// Keeps the list sorted, and no empty list behind.
function setNotes(x: WithNotes, notes: Note[]): void {
  if (notes.length) x.notes = notes.sort(byDate);
  else delete x.notes;
}

export function addNote(
  x: WithNotes,
  { date, text, kind }: { date: ISODate; text: string; kind?: Note['kind'] },
  at: ISOTime = stamp(),
): Note | null {
  text = text.trim();
  if (!text) return null;
  const n: Note = { id: uid(), date, text, at };
  if (kind) n.kind = kind;
  setNotes(x, [...(x.notes || []), n]);
  return n;
}

export function deleteNote(x: WithNotes, id: string): void {
  if (!x.notes?.some(n => n.id === id)) return;
  setNotes(
    x,
    x.notes.filter(n => n.id !== id),
  );
  x.droppedNotes = { ...x.droppedNotes, [id]: 1 };
}

// An edit to empty text deletes the note.
export function editNote(x: WithNotes, id: string, text: string, date?: ISODate, at: ISOTime = stamp()): void {
  text = text.trim();
  if (!text) return deleteNote(x, id);
  setNotes(
    x,
    (x.notes || []).map(n => (n.id === id ? { ...n, text, date: date || n.date, at } : n)),
  );
}

export const notesOf = (x: WithNotes): Note[] => [...(x.notes || [])].reverse();

// Notes of both copies by id: on a clash the later edit wins; one deleted on either side is gone.
export function mergeNotes(merged: WithNotes, newer: WithNotes, older: WithNotes): void {
  const dropped = { ...older.droppedNotes, ...newer.droppedNotes };
  const byId = new Map<string, Note>();
  for (const n of [...(older.notes || []), ...(newer.notes || [])])
    if (!dropped[n.id] && (byId.get(n.id)?.at || '') <= n.at) byId.set(n.id, n);
  setNotes(merged, [...byId.values()]);
  if (Object.keys(dropped).length) merged.droppedNotes = dropped;
  else delete merged.droppedNotes;
}

const isMap = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);

// Stored notes made safe: a note needs a plain id (ids go into the page), a date and text.
export function normalizeNotes(x: WithNotes): void {
  if (Array.isArray(x.notes))
    setNotes(
      x,
      x.notes
        .filter(n => n && safeId(n.id) && typeof n.text === 'string' && typeof n.date === 'string')
        .map(n => (typeof n.at === 'string' ? n : { ...n, at: '' })),
    );
  else delete x.notes;
  if (!isMap(x.droppedNotes)) delete x.droppedNotes;
}
