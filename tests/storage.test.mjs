import test from 'node:test';
import assert from 'node:assert/strict';
import { trimSessions, validPersonalData, validProfile, validSessions } from '../src/lib/storage.ts';
import { createDataExport, parseDataImport, mergePersonalData, readLegacyData, reconcileFallbackData } from '../src/lib/persistence.ts';

const session = (id, saved = false, note = '') => ({ id, saved, note, title: `Reflection ${id}`, focus: 'Personal growth', date: '2026-10-06T08:00:00.000Z', messages: [] });
const data = (sessions = []) => ({ profile: { name: 'Ava', onboarded: true }, sessions, practiceDays: [], dayNotes: {} });

test('all conversations remain available beyond the old forty-reading limit', () => {
  const history = Array.from({ length: 850 }, (_, index) => session(`reading-${index}`, index % 2 === 0, `Note ${index}`));
  assert.equal(trimSessions(history), history);
  assert.equal(trimSessions(history).length, 850);
});

test('legacy localStorage migrates profile, every conversation, and normalized practice dates', () => {
  const previous = globalThis.localStorage;
  const values = new Map([
    ['evara-profile', JSON.stringify({ name: 'Linh', onboarded: true })],
    ['evara-sessions', JSON.stringify(Array.from({ length: 75 }, (_, index) => session(`${index}`)))],
    ['evara-practice-days', JSON.stringify(['2026-10-6'])],
  ]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null };
  try {
    const restored = readLegacyData();
    assert.equal(restored.profile.name, 'Linh'); assert.equal(restored.sessions.length, 75);
    assert.deepEqual(restored.practiceDays, ['2026-10-06']); assert.deepEqual(restored.dayNotes, {});
  } finally { globalThis.localStorage = previous; }
});

test('backup roundtrip includes photo, all conversations, calendar, practice, and language', () => {
  const original = { ...data([session('chat')]), profile: { name: 'Linh', onboarded: true, avatar: 'data:image/jpeg;base64,YWJj' }, practiceDays: ['2026-10-06'], dayNotes: { '2026-10-07': 'Rest and reflect.' } };
  assert.deepEqual(parseDataImport(createDataExport(original, 'vi')), { ...original, language: 'vi' });
  const output = createDataExport(original, 'en');
  assert.doesNotMatch(output, /backup-token|device-token|owner_hash/);
});

test('imports accept old journal exports and reject malformed records before applying anything', () => {
  assert.deepEqual(parseDataImport(JSON.stringify({ profile: data().profile, sessions: [session('old')] })), data([session('old')]));
  assert.throws(() => parseDataImport('{broken'), /not a readable/);
  assert.throws(() => parseDataImport(JSON.stringify({ ...data(), dayNotes: { '2026-02-30': 'Not a real day' } })), /invalid/);
  assert.throws(() => parseDataImport(JSON.stringify({ ...data(), sessions: [session('duplicate'), session('duplicate')] })), /invalid/);
  assert.throws(() => parseDataImport(JSON.stringify({ ...data(), profile: { ...data().profile, avatar: 'https://tracking.example/photo.jpg' } })), /invalid/);
});

test('an older tab cannot remove another tab’s conversation, new message, photo, or calendar note', () => {
  const baseChat = { ...session('shared'), messages: [{ id: 'first', role: 'user', text: 'Hello' }] };
  const baseline = data([baseChat]);
  const local = { ...baseline, sessions: [{ ...baseChat, note: 'My local note', messages: [...baseChat.messages, { id: 'local-message', role: 'user', text: 'A question' }] }, session('local-only')], dayNotes: { '2026-10-07': 'Local plan' } };
  const remote = { ...baseline, profile: { ...baseline.profile, avatar: 'data:image/jpeg;base64,YWJj' }, sessions: [{ ...baseChat, messages: [...baseChat.messages, { id: 'remote-message', role: 'assistant', text: 'Another tab’s answer' }] }, session('remote-only')], practiceDays: ['2026-10-05'], dayNotes: { '2026-10-08': 'Other plan' } };
  const merged = mergePersonalData(baseline, local, remote);
  assert.equal(merged.sessions.length, 3);
  const chat = merged.sessions.find(item => item.id === 'shared');
  assert.equal(chat.note, 'My local note');
  assert.deepEqual(new Set(chat.messages.map(message => message.id)), new Set(['first', 'local-message', 'remote-message']));
  assert.equal(merged.profile.avatar, remote.profile.avatar);
  assert.deepEqual(merged.dayNotes, { '2026-10-07': 'Local plan', '2026-10-08': 'Other plan' });
  assert.deepEqual(merged.practiceDays, ['2026-10-05']);
});

test('a note typed during a pending save survives merging the committed snapshot', () => {
  const original = data([session('one', false, 'Before')]);
  const pending = { ...original, sessions: [session('one', false, 'Typed while saving')] };
  const committed = { ...original, sessions: [...original.sessions, session('other-tab')] };
  const merged = mergePersonalData(original, pending, committed);
  assert.equal(merged.sessions.find(item => item.id === 'one').note, 'Typed while saving');
  assert.equal(merged.sessions.length, 2);
});

test('removing a photo or clearing a calendar note is preserved across saves', () => {
  const baseline = { ...data(), profile: { name: 'Ava', onboarded: true, avatar: 'data:image/jpeg;base64,YWJj' }, dayNotes: { '2026-10-08': 'Old plan' } };
  const local = { ...baseline, profile: { name: 'Ava', onboarded: true }, dayNotes: { '2026-10-08': '' } };
  const merged = mergePersonalData(baseline, local, baseline);
  assert.equal(merged.profile.avatar, undefined); assert.equal(merged.dayNotes['2026-10-08'], '');
});

test('validation supports conversation-only and in-depth readings without unsafe images', () => {
  assert.equal(validSessions([{ ...session('chat'), drawCount: 0 }, { ...session('deep'), drawCount: 10 }]), true);
  assert.equal(validProfile({ name: 'Ava', onboarded: true, avatar: 'data:image/svg+xml;base64,YWJj' }), false);
  assert.equal(validPersonalData({ ...data(), practiceDays: ['2026-02-30'] }), false);
});

test('message timestamps survive backup and concurrent merges; invalid dates are rejected', () => {
  const message = { id: 'today', role: 'user', text: 'Continuing yesterday’s chat.', createdAt: '2026-10-07T08:30:00.000Z' };
  const original = data([{ ...session('older-chat'), messages: [message] }]);
  assert.equal(validSessions(original.sessions), true);
  assert.deepEqual(parseDataImport(createDataExport(original)).sessions[0].messages[0], message);
  assert.deepEqual(mergePersonalData(data(), original, data()).sessions[0].messages[0], message);
  assert.equal(validSessions([{ ...original.sessions[0], messages: [{ ...message, createdAt: 'not a date' }] }]), false);
});

test('IndexedDB recovery promotes conversations, photo, and calendar edits saved during an outage', () => {
  const beforeOutage = data([session('shared', false, 'Before')]);
  const fallback = {
    ...beforeOutage,
    profile: { ...beforeOutage.profile, avatar: 'data:image/jpeg;base64,YWJj' },
    sessions: [session('shared', false, 'Edited during outage'), session('fallback-chat')],
    dayNotes: { '2026-10-09': 'Offline plan' }, practiceDays: ['2026-10-06'],
  };
  const indexedDb = {
    ...beforeOutage, profile: { ...beforeOutage.profile, name: 'Updated elsewhere' },
    sessions: [...beforeOutage.sessions, session('another-tab-chat')], dayNotes: { '2026-10-08': 'Existing plan' },
  };
  const restored = reconcileFallbackData(indexedDb, fallback, beforeOutage);
  assert.equal(restored.profile.name, 'Updated elsewhere');
  assert.equal(restored.profile.avatar, fallback.profile.avatar);
  assert.equal(restored.sessions.length, 3);
  assert.equal(restored.sessions.find(item => item.id === 'shared').note, 'Edited during outage');
  assert.deepEqual(restored.dayNotes, { '2026-10-08': 'Existing plan', '2026-10-09': 'Offline plan' });
  assert.deepEqual(restored.practiceDays, ['2026-10-06']);
});

test('old fallback snapshots without baseline metadata retain their data when promoted', () => {
  const fallback = { ...data([session('fallback')]), profile: { name: 'Offline name', onboarded: true } };
  const restored = reconcileFallbackData(data([session('indexed-db')]), fallback, null);
  assert.equal(restored.profile.name, 'Offline name');
  assert.equal(restored.sessions.length, 2);
});
