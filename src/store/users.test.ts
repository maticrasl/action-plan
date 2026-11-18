import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { UserList } from '../core/model';
import { LANG_KEY, USERS_KEY, readUsers, setUsers, userKey, userKeys, userStorage } from './users';
import { memoryStorage } from './memory-storage';

const twoUsers = (current: string): UserList => ({
  current,
  list: [
    { id: 'local', ns: '', name: 'Ana', account: { id: 'g1', email: 'ana@example.com' } },
    { id: 'b', ns: 'u.b.', name: 'Bor', account: { id: 'g2', email: 'bor@example.com' } },
  ],
});

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('key prefix', () => {
  test('the first user keeps the plain keys', () => {
    setUsers(twoUsers('local'));
    expect([userKey('actionplan.plans'), userKey('actionplan.plan.p1'), userKey('other.key')]).toEqual([
      'actionplan.plans',
      'actionplan.plan.p1',
      'other.key',
    ]);
  });

  test('a later user gets actionplan.u.<id>. on keys of the app only', () => {
    setUsers(twoUsers('b'));
    expect([userKey('actionplan.plans'), userKey('actionplan.v1.theme'), userKey('other.key')]).toEqual([
      'actionplan.u.b.plans',
      'actionplan.u.b.v1.theme',
      'other.key',
    ]);
    userStorage.setItem('actionplan.visions', '{}');
    expect(storage.getItem('actionplan.u.b.visions')).toBe('{}');
    expect(storage.getItem('actionplan.visions')).toBeNull();
  });

  test("a user's keys: never the user list, the language or another user's", () => {
    setUsers(twoUsers('local'));
    for (const k of ['actionplan.plans', 'actionplan.plan.p1', 'actionplan.u.b.plans', USERS_KEY, LANG_KEY, 'other'])
      storage.setItem(k, '1');
    const [first, later] = twoUsers('local').list;
    setUsers({ current: 'local', list: [first, later] });
    expect(userKeys(first, storage as unknown as Storage).sort()).toEqual(['actionplan.plan.p1', 'actionplan.plans']);
    expect(userKeys(later, storage as unknown as Storage)).toEqual(['actionplan.u.b.plans']);
  });
});

describe('readUsers', () => {
  test('a tampered list: only well-formed users, each on its own prefix', () => {
    storage.setItem(
      USERS_KEY,
      JSON.stringify({
        current: 'x',
        list: [
          { id: 'x', ns: 'u.y.', name: 'bad', account: null },
          { id: 'y"><b', ns: '', account: null },
          { id: 'z', ns: 'u.z.', name: 5, account: { id: 7 } },
        ],
      }),
    );
    const read = readUsers();
    expect(read.list.map(u => [u.id, u.ns, u.name, u.account])).toEqual([['z', 'u.z.', '', null]]);
    expect(read.current).toBe('z');
  });

  test('a list that is not JSON, or none: the first user', () => {
    storage.setItem(USERS_KEY, '{oops');
    expect(readUsers()).toEqual({ current: 'local', list: [{ id: 'local', ns: '', name: '', account: null }] });
    storage.removeItem(USERS_KEY);
    expect(readUsers().list.map(u => u.id)).toEqual(['local']);
  });

  test('a device that synced before users existed is linked to an account the next sync learns', () => {
    storage.setItem('actionplan.v1.syncConnected', 'true');
    expect(readUsers().list[0].account).toEqual({ id: '', email: '' });
    storage.removeItem('actionplan.v1.syncConnected');
    expect(readUsers().list[0].account).toBeNull();
  });

  test('without storage at all: the first user', () => {
    vi.unstubAllGlobals();
    expect(readUsers().list).toEqual([{ id: 'local', ns: '', name: '', account: null }]);
  });
});
