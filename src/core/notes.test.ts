import { describe, expect, test } from 'vitest';
import type { Goal, WithNotes } from './model';
import { addNote, deleteNote, editNote, mergeNotes, normalizeNotes, notesOf } from './notes';

const T1 = '2026-11-01T10:00:00.000Z',
  T2 = '2026-11-02T10:00:00.000Z',
  T3 = '2026-11-03T10:00:00.000Z';
const note = (id: string, date: string, text: string, at = T1) => ({ id, date, text, at });

describe('addNote, editNote, deleteNote, notesOf', () => {
  test('text is trimmed; empty text is not added', () => {
    const x: WithNotes = {};
    expect(addNote(x, { date: '2026-11-05', text: '   ' })).toBeNull();
    expect(x.notes).toBeUndefined();
    const n = addNote(x, { date: '2026-11-05', text: '  Knees fine.  ' }, T1)!;
    expect(n).toMatchObject({ date: '2026-11-05', text: 'Knees fine.', at: T1 });
    expect(n.kind).toBeUndefined();
    expect(x.notes).toEqual([n]);
  });
  test('kept by date, then time written; notesOf gives the newest first', () => {
    const x: WithNotes = {};
    addNote(x, { date: '2026-11-05', text: 'b' }, T2);
    addNote(x, { date: '2026-11-01', text: 'a' }, T3);
    addNote(x, { date: '2026-11-05', text: 'c' }, T3);
    expect(x.notes!.map(n => n.text)).toEqual(['a', 'b', 'c']);
    expect(notesOf(x).map(n => n.text)).toEqual(['c', 'b', 'a']);
    expect(notesOf({})).toEqual([]);
  });
  test('a closing note keeps its kind', () => {
    const x: WithNotes = {};
    expect(addNote(x, { date: '2026-11-05', text: 'Sleep', kind: 'closing' })!.kind).toBe('closing');
  });
  test('edit changes text, date and time; edit to empty deletes', () => {
    const x: WithNotes = { notes: [note('n1', '2026-11-01', 'a'), note('n2', '2026-11-02', 'b')] };
    editNote(x, 'n1', ' new ', '2026-11-09', T2);
    expect(x.notes!.map(n => [n.id, n.text, n.date, n.at])).toEqual([
      ['n2', 'b', '2026-11-02', T1],
      ['n1', 'new', '2026-11-09', T2],
    ]);
    editNote(x, 'n2', '  ');
    expect(x.notes!.map(n => n.id)).toEqual(['n1']);
    expect(x.droppedNotes).toEqual({ n2: 1 });
  });
  test('delete records the id; the last one leaves no empty list', () => {
    const x: WithNotes = { notes: [note('n1', '2026-11-01', 'a')] };
    deleteNote(x, 'n1');
    expect(x.notes).toBeUndefined();
    expect(x.droppedNotes).toEqual({ n1: 1 });
    deleteNote(x, 'gone');
    expect(x.droppedNotes).toEqual({ n1: 1 });
  });
});

describe('mergeNotes', () => {
  const merge = (newer: WithNotes, older: WithNotes) => {
    const m: WithNotes = { ...newer };
    mergeNotes(m, newer, older);
    return m;
  };
  test('a note added on each side gives both', () => {
    const a = { notes: [note('n1', '2026-11-01', 'a')] },
      b = { notes: [note('n2', '2026-11-02', 'b')] };
    expect(merge(a, b).notes!.map(n => n.id)).toEqual(['n1', 'n2']);
    expect(merge(b, a)).toEqual(merge(a, b));
  });
  test('the same note edited on both sides keeps the later edit', () => {
    const a = { notes: [note('n1', '2026-11-01', 'mine', T3)] },
      b = { notes: [note('n1', '2026-11-01', 'theirs', T2)] };
    expect(merge(a, b).notes![0].text).toBe('mine');
    expect(merge(b, a).notes![0].text).toBe('mine');
  });
  test('deleted on one side and edited on the other stays deleted', () => {
    const a: WithNotes = { droppedNotes: { n1: 1 } },
      b = { notes: [note('n1', '2026-11-01', 'edited', T3)] };
    expect(merge(a, b)).toEqual({ droppedNotes: { n1: 1 } });
    expect(merge(b, a)).toEqual({ droppedNotes: { n1: 1 } });
  });
  test('items without notes get no empty list', () => {
    const m = merge({}, {});
    expect('notes' in m || 'droppedNotes' in m).toBe(false);
  });
});

describe('normalizeNotes', () => {
  test('drops bad notes and wrong types, keeps good ones', () => {
    const good = note('n1', '2026-11-01', 'ok');
    const g = {
      notes: [good, { id: '<b>', date: '2026-11-01', text: 'x' }, { id: 'n2', date: '2026-11-01', text: 5 }, null],
      droppedNotes: ['n3'],
    } as unknown as Goal;
    normalizeNotes(g);
    expect(g.notes).toEqual([good]);
    expect(g.droppedNotes).toBeUndefined();
    const h = { notes: 'x', droppedNotes: { n4: 1 } } as unknown as Goal;
    normalizeNotes(h);
    expect(h).toEqual({ droppedNotes: { n4: 1 } });
  });
});
