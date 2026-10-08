import test from 'node:test';
import assert from 'node:assert/strict';
import { trimSessions, validPersonalData, validProfile, validSessions } from '../src/lib/storage.ts';
import { createDataExport, parseDataImport, mergePersonalData, readLegacyData, reconcileFallbackData, MAX_BACKUP_BYTES } from '../src/lib/persistence.ts';
import { mergeImportedData } from '../src/lib/import-merge.ts';

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

test('an older backup cannot overwrite an edited profile or conversation and keeps unique incoming records', () => {
  const older = {
    ...data([session('shared', false, 'Old note'), session('backup-only')]),
    profile: { name: 'Old name', onboarded: false, avatar: 'data:image/jpeg;base64,b2xk' },
    practiceDays: ['2026-10-5'], dayNotes: { '2026-10-08': 'Old calendar note', '2026-10-09': 'Backup plan' },
  };
  const current = {
    ...data([{ ...session('shared', true, 'New note'), messages: [{ id: 'same-id', role: 'user', text: 'My updated question' }] }, session('current-only')]),
    profile: { name: 'Current name', onboarded: true, avatar: 'data:image/jpeg;base64,bmV3' },
    practiceDays: ['2026-10-06'], dayNotes: { '2026-10-08': 'New calendar note' },
  };
  const before = structuredClone(current);
  const restored = mergeImportedData(current, older);
  assert.deepEqual(current, before, 'the original snapshot is never mutated');
  assert.deepEqual(restored.profile, current.profile);
  assert.deepEqual(restored.sessions.find(item => item.id === 'shared'), current.sessions[0]);
  const copy = restored.sessions.find(item => item.id.startsWith('import-'));
  assert.equal(copy.note, 'Old note');
  assert.deepEqual(copy.messages, []);
  assert.match(copy.title, /imported copy/);
  assert.equal(restored.sessions.length, 4);
  assert.match(restored.dayNotes['2026-10-08'], /^New calendar note/);
  assert.match(restored.dayNotes['2026-10-08'], /Old calendar note$/);
  assert.equal(restored.dayNotes['2026-10-09'], 'Backup plan');
  assert.deepEqual(new Set(restored.practiceDays), new Set(['2026-10-05', '2026-10-06']));
  assert.equal(validPersonalData(restored), true);
  assert.deepEqual(mergeImportedData(restored, older), restored, 'repeating an import is idempotent');
});

test('identical backups with reordered object keys do not create conversation copies', () => {
  const original = data([session('same')]);
  const reordered = { ...original, sessions: original.sessions.map(item => Object.fromEntries(Object.entries(item).reverse())) };
  assert.deepEqual(mergeImportedData(original, reordered), original);
  const current = { ...original, sessions: [session('same', true)] };
  assert.deepEqual(mergeImportedData(mergeImportedData(current, original), reordered), mergeImportedData(current, original));
});

test('calendar note conflicts are rejected atomically when preserving both would exceed the note limit', () => {
  const original = { ...data([session('current')]), dayNotes: { '2026-10-08': 'a'.repeat(20_000) } };
  const incoming = { ...data([session('new-from-backup')]), dayNotes: { '2026-10-08': 'Different note' } };
  const before = structuredClone(original);
  assert.throws(() => mergeImportedData(original, incoming), /Some calendar notes are too long to combine safely.*Nothing was imported/);
  assert.deepEqual(original, before);
  assert.deepEqual(mergeImportedData(original, original), original, 'an identical full-length note is accepted without adding a separator');
  assert.equal(MAX_BACKUP_BYTES, 50 * 1024 * 1024);
});

test('consolidated calendar backups merge each note variant once across export and repeated imports', () => {
  const separator = '\n\n— Imported note —\n\n';
  const current = { ...data(), dayNotes: { '2026-10-08': 'Local note' } };
  const firstBackup = { ...data(), dayNotes: { '2026-10-08': 'Backup note' } };
  const consolidated = parseDataImport(createDataExport(mergeImportedData(current, firstBackup)));
  assert.equal(consolidated.dayNotes['2026-10-08'], `Local note${separator}Backup note`);
  const restored = mergeImportedData(current, consolidated);
  assert.deepEqual(restored.dayNotes, consolidated.dayNotes);
  assert.deepEqual(mergeImportedData(restored, consolidated), restored);
  assert.deepEqual(mergeImportedData(restored, parseDataImport(createDataExport(restored))), restored);
  const overlapping = { ...data(), dayNotes: { '2026-10-08': `Backup note${separator}Another note${separator}Local note` } };
  const extended = mergeImportedData(restored, overlapping);
  assert.equal(extended.dayNotes['2026-10-08'], `Local note${separator}Backup note${separator}Another note`);
  assert.deepEqual(mergeImportedData(extended, overlapping), extended);
});

test('deduplicating a consolidated note avoids a false length-limit rejection without truncating content', () => {
  const localNote = 'a'.repeat(10_000);
  const otherNote = 'b'.repeat(9_900);
  const current = { ...data(), dayNotes: { '2026-10-08': localNote } };
  const consolidated = mergeImportedData(current, { ...data(), dayNotes: { '2026-10-08': otherNote } });
  const restored = mergeImportedData(current, parseDataImport(createDataExport(consolidated)));
  assert.deepEqual(restored.dayNotes, consolidated.dayNotes);
  assert.ok(restored.dayNotes['2026-10-08'].length <= 20_000);
  assert.deepEqual(mergeImportedData(restored, consolidated), restored);
});

test('imported revisions link to their copied originals instead of newer local readings and repeat imports deduplicate', () => {
  const original = session('original', false, 'Original from backup');
  const revision = { ...session('revision', false, 'Revision from backup'), revisedFrom: original.id };
  const laterRevision = { ...session('later-revision'), revisedFrom: revision.id };
  const incoming = data([laterRevision, revision, original]);
  const current = data([session('original', true, 'Newer local original'), { ...revision, note: 'Newer local revision' }]);
  const restored = mergeImportedData(current, incoming);
  const importedOriginal = restored.sessions.find(item => item.note === original.note);
  const importedRevision = restored.sessions.find(item => item.note === revision.note);
  assert.notEqual(importedOriginal.id, original.id);
  assert.notEqual(importedRevision.id, revision.id);
  assert.equal(importedRevision.revisedFrom, importedOriginal.id);
  assert.equal(restored.sessions.find(item => item.id === laterRevision.id).revisedFrom, importedRevision.id);
  assert.deepEqual(restored.sessions.find(item => item.id === original.id), current.sessions[0]);
  assert.deepEqual(restored.sessions.find(item => item.id === revision.id), current.sessions[1]);
  assert.equal(restored.sessions.length, 5);
  assert.deepEqual(mergeImportedData(restored, incoming), restored);
  assert.deepEqual(mergeImportedData(restored, { ...incoming, sessions: [...incoming.sessions].reverse() }), restored);
});

test('a matching local revision is kept separate when its imported original needs a copy', () => {
  const original = session('original', false, 'Original from backup');
  const revision = { ...session('revision'), revisedFrom: original.id };
  const current = data([session('original', true, 'Newer original'), revision]);
  const incoming = data([revision, original]);
  const restored = mergeImportedData(current, incoming);
  const importedOriginal = restored.sessions.find(item => item.note === original.note);
  const importedRevision = restored.sessions.find(item => item.revisedFrom === importedOriginal.id);
  assert.notEqual(importedRevision.id, revision.id);
  assert.deepEqual(restored.sessions.find(item => item.id === revision.id), revision);
  assert.deepEqual(mergeImportedData(restored, incoming), restored);
});

test('invalid revision cycles reject atomically without mutating existing readings', () => {
  const current = data([session('current')]);
  const before = structuredClone(current);
  assert.throws(() => mergeImportedData(current, data([
    { ...session('first'), revisedFrom: 'second' },
    { ...session('second'), revisedFrom: 'first' },
  ])), /imported data is invalid/);
  assert.deepEqual(current, before);
});
