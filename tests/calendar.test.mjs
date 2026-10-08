import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, normalizeDayKey, getCalendarRecords } from '../src/lib/calendar.ts';
import { vi } from '../src/lib/locales/vi.ts';
import { additionalLocales } from '../src/lib/locales/additional.ts';
import { tarotVi } from '../src/data/tarot-vi.ts';

process.env.TZ = 'Asia/Ho_Chi_Minh';
const session = (date, messages = []) => ({ id: 'conversation', title: 'My reflection', focus: 'Growth', date, messages, saved: false, note: '' });

test('calendar date keys use the local day and migrate legacy unpadded keys', () => {
  assert.equal(dateKey(new Date('2026-10-06T20:00:00Z')), '2026-10-07');
  assert.equal(normalizeDayKey('2026-2-9'), '2026-02-09');
  assert.equal(normalizeDayKey('2024-2-29'), '2024-02-29');
  assert.equal(normalizeDayKey('2026-2-29'), '');
  assert.equal(normalizeDayKey('2026-13-1'), '');
});

test('a continued conversation appears once on each activity day with its latest time', () => {
  const original = session('2026-10-05T09:00:00Z', [
    { id: '1', role: 'user', text: 'Yesterday', createdAt: '2026-10-05T09:01:00Z' },
    { id: '2', role: 'user', text: 'Today', createdAt: '2026-10-06T08:00:00Z' },
    { id: '3', role: 'assistant', text: 'Welcome back', createdAt: '2026-10-06T08:01:00Z' },
  ]);
  const records = getCalendarRecords([original]);
  assert.deepEqual(Object.keys(records), ['2026-10-05', '2026-10-06']);
  assert.equal(records['2026-10-06'].length, 1);
  assert.equal(records['2026-10-06'][0].session, original);
  assert.equal(records['2026-10-06'][0].lastActivity.toISOString(), '2026-10-06T08:01:00.000Z');
  assert.equal(records['2026-10-07'], undefined);
});

test('legacy conversations without message timestamps retain their original date', () => {
  const records = getCalendarRecords([session('2026-10-06T09:00:00Z', [{ id: '1', role: 'user', text: 'A legacy question' }])]);
  assert.deepEqual(Object.keys(records), ['2026-10-06']);
  assert.equal(records['2026-10-06'].length, 1);
});

test('calendar records ignore invalid dates and sort real activity newest first', () => {
  const older = { ...session('2026-10-06T05:00:00Z'), id: 'older' };
  const recent = { ...session('2026-10-06T09:00:00Z'), id: 'recent' };
  const records = getCalendarRecords([older, recent, session('invalid')]);
  assert.deepEqual(records['2026-10-06'].map(record => record.session.id), ['recent', 'older']);
  assert.equal(Object.keys(records).length, 1);
});

test('all translated controls preserve dynamic placeholders', () => {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [language, dictionary] of Object.entries({ vi, ...additionalLocales })) {
    for (const [source, translated] of Object.entries(dictionary)) {
      assert.ok(translated.trim(), `${language}: ${source} is not empty`);
      assert.deepEqual(placeholders(translated), placeholders(source), `${language}: ${source}`);
    }
  }
});

test('Vietnamese provides full meaning and reflection for all 78 cards', () => {
  assert.equal(Object.keys(tarotVi).length, 78);
  for (let id = 0; id < 78; id++) {
    assert.equal(tarotVi[id].keywords.length, 3);
    assert.ok(tarotVi[id].name.length > 1);
    assert.ok(tarotVi[id].meaning.length > 100);
    assert.ok(tarotVi[id].reflection.endsWith('?'));
  }
});
