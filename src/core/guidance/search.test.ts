import { describe, expect, test } from 'vitest';
import { foldText, liveBody, matchesQuery, plainText, withRefs } from './search';

describe('foldText', () => {
  test('lower case without diacritics', () => {
    expect(foldText('Čšž ĆĐ Über')).toBe('csz cđ uber');
  });
});

describe('matchesQuery', () => {
  const text = 'Kako merim napredek? Število korakov.';
  test('every word must occur, in any order, ignoring case and diacritics', () => {
    expect(matchesQuery(text, 'stevilo')).toBe(true);
    expect(matchesQuery(text, 'KORAKOV merim')).toBe(true);
    expect(matchesQuery(text, 'merim teža')).toBe(false);
  });
  test('an empty or blank query matches everything', () => {
    expect(matchesQuery(text, '')).toBe(true);
    expect(matchesQuery(text, '   ')).toBe(true);
  });
  test('a part of a word is enough', () => {
    expect(matchesQuery(text, 'napre')).toBe(true);
  });
});

describe('plainText', () => {
  test('tags become spaces, runs of space one', () => {
    expect(plainText('<p>One <strong>two</strong></p>\n<ul><li>three</li></ul>')).toBe('One two three');
  });
});

describe('withRefs', () => {
  test('[[id]] becomes what the function draws for it', () => {
    expect(withRefs('See [[a]] and [[b-c]].', id => `<${id}>`)).toBe('See <a> and <b-c>.');
  });
});

describe('liveBody', () => {
  const body = '<p>Always</p>\n<p data-only="noSync">Not set up</p>\n<ul data-only="multiUser"><li>x</li></ul>';
  test('keeps what holds, drops what does not', () => {
    expect(liveBody(body, { noSync: true, multiUser: false })).toBe('<p>Always</p>\n<p data-only="noSync">Not set up</p>\n');
    expect(liveBody(body, { noSync: false, multiUser: true })).toBe(
      '<p>Always</p>\n\n<ul data-only="multiUser"><li>x</li></ul>',
    );
  });
  test('a fact not given counts as not holding', () => {
    expect(liveBody(body, {})).toBe('<p>Always</p>\n\n');
  });
});
