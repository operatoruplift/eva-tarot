import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { IDBFactory } from 'fake-indexeddb';
import { seedPersistentScope, usePersistentData } from '../src/lib/persistence.ts';

const A = 'account-11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const databaseName = scope => `evara-personal-data${scope ? `:${scope}` : ''}`;
const empty = () => ({ profile: { name: '', onboarded: false }, sessions: [], practiceDays: [], dayNotes: {} });
const chat = id => ({ id, title: id, focus: '', date: '2026-10-22T08:00:00.000Z', saved: true, note: '', messages: [{ id: `${id}-question`, role: 'user', text: `Private question ${id}` }] });
const journal = (name, id) => ({ profile: { name, onboarded: true }, sessions: [chat(id)], practiceDays: ['2026-10-22'], dayNotes: { '2026-10-22': `Private note ${id}` } });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await act(async () => { await tick(); });
  }
  assert.fail('The expected scoped storage state did not arrive.');
}
async function snapshot(factory, scope, data) {
  const database = await new Promise((resolve, reject) => {
    const request = factory.open(databaseName(scope), 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('snapshots', data ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('snapshots');
      const request = data ? store.put({ version: 2, revision: 1, data }, 'main') : store.get('main');
      transaction.oncomplete = () => resolve(data ?? request.result?.data);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
async function harness(t, { factory = new IDBFactory(), values = new Map() } = {}) {
  const original = { indexedDB: globalThis.indexedDB, localStorage: globalThis.localStorage, window: globalThis.window, actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.indexedDB = factory;
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  globalThis.window = new EventTarget();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const instances = new Set();
  async function mount(scope) {
    let current; let root;
    function Probe({ scope: nextScope }) { current = usePersistentData(nextScope); return null; }
    await act(async () => { root = create(createElement(Probe, { scope })); });
    const instance = {
      get current() { return current; },
      update: nextScope => act(async () => root.update(createElement(Probe, { scope: nextScope }))),
      unmount: async () => { if (instances.delete(instance)) await act(async () => root.unmount()); },
    };
    instances.add(instance);
    return instance;
  }
  t.after(async () => {
    for (const instance of [...instances]) await instance.unmount();
    globalThis.indexedDB = original.indexedDB; globalThis.localStorage = original.localStorage;
    globalThis.window = original.window; globalThis.IS_REACT_ACT_ENVIRONMENT = original.actEnvironment;
  });
  return { factory, values, mount, changed: async key => { const event = new Event('storage'); Object.assign(event, { key }); await act(async () => window.dispatchEvent(event)); } };
}

test('the default mount retains legacy database and fallback migration without renaming old keys', async t => {
  const legacy = journal('Legacy guest', 'legacy');
  const fallback = { ...legacy, dayNotes: { '2026-10-22': 'Guest edit during storage outage' } };
  const values = new Map([['evara-data-v2', JSON.stringify(fallback)], ['evara-data-v2-baseline', JSON.stringify(legacy)], ['evara-profile', JSON.stringify(legacy.profile)]]);
  const app = await harness(t, { values });
  await snapshot(app.factory, undefined, legacy);
  const guest = await app.mount(); await until(() => guest.current.isCurrentDataSaved);
  assert.equal(guest.current.profile.name, 'Legacy guest');
  assert.deepEqual(await snapshot(app.factory), fallback);
  assert.equal(values.has('evara-data-v2'), false);
  assert.equal(values.get('evara-data-v2-baseline'), JSON.stringify(legacy));
  assert.equal(values.get('evara-profile'), JSON.stringify(legacy.profile));
  assert.deepEqual((await app.factory.databases()).map(item => item.name), ['evara-personal-data']);
});

test('a new account scope starts empty and never imports legacy IndexedDB or localStorage', async t => {
  const legacy = journal('Guest secret', 'guest-secret');
  const values = new Map([['evara-data-v2', JSON.stringify(legacy)], ['evara-data-v2-baseline', JSON.stringify(legacy)], ['evara-profile', JSON.stringify(legacy.profile)], ['evara-data-changed', 'unchanged']]);
  const before = new Map(values);
  const app = await harness(t, { values });
  await snapshot(app.factory, undefined, legacy);
  const account = await app.mount(A); await until(() => account.current.isCurrentDataSaved);
  assert.deepEqual(await snapshot(app.factory, A), empty());
  assert.deepEqual(account.current.profile, empty().profile);
  assert.deepEqual(account.current.sessions, []);
  assert.deepEqual(account.current.dayNotes, {});
  assert.deepEqual(await snapshot(app.factory), legacy);
  for (const [key, value] of before) assert.equal(values.get(key), value);
  assert.equal(values.has(`evara-data-changed:${A}`), true);
});

test('account round trips and storage events cannot merge another account or guest history', async t => {
  const app = await harness(t);
  await snapshot(app.factory, undefined, journal('Guest', 'guest'));
  const first = await app.mount(A); const second = await app.mount(B);
  await until(() => first.current.isCurrentDataSaved && second.current.isCurrentDataSaved);
  await act(async () => { first.current.setProfile({ name: 'First', onboarded: true }); first.current.setSessions([chat('first')]); second.current.setProfile({ name: 'Second', onboarded: true }); second.current.setSessions([chat('second')]); });
  await until(() => first.current.isCurrentDataSaved && second.current.isCurrentDataSaved);
  const remote = { ...await snapshot(app.factory, A), sessions: [chat('first'), chat('same-account-other-tab')] };
  await snapshot(app.factory, A, remote);
  await app.changed(`evara-data-changed:${B}`);
  await app.changed('evara-data-changed');
  for (let count = 0; count < 3; count++) await act(async () => { await tick(); });
  assert.deepEqual(first.current.sessions.map(item => item.id), ['first']);
  await app.changed(`evara-data-changed:${A}`);
  await until(() => first.current.sessions.length === 2);
  assert.deepEqual(second.current.sessions.map(item => item.id), ['second']);
  await first.unmount(); await second.unmount();
  const restored = await app.mount(A); await until(() => restored.current.isCurrentDataSaved);
  assert.equal(restored.current.profile.name, 'First');
  assert.deepEqual(new Set(restored.current.sessions.map(item => item.id)), new Set(['first', 'same-account-other-tab']));
  assert.deepEqual((await snapshot(app.factory, B)).sessions.map(item => item.id), ['second']);
  assert.equal((await snapshot(app.factory)).sessions[0].id, 'guest');
});

test('changing the scope prop cannot redirect an existing mount or its queued writes', async t => {
  const app = await harness(t);
  const first = await app.mount(A); await until(() => first.current.isCurrentDataSaved);
  await first.update(B);
  await act(async () => first.current.setSessions([chat('still-first')]));
  await until(() => first.current.isCurrentDataSaved);
  assert.equal((await snapshot(app.factory, A)).sessions[0].id, 'still-first');
  const second = await app.mount(B); await until(() => second.current.isCurrentDataSaved);
  assert.deepEqual(second.current.sessions, []);
});

test('fallback snapshots, outage baselines, notifications and promotion remain scoped', async t => {
  const legacy = journal('Guest fallback', 'guest-fallback');
  const values = new Map([['evara-data-v2', JSON.stringify(legacy)], ['evara-data-v2-baseline', JSON.stringify(legacy)], ['evara-data-changed', 'guest-notification']]);
  const app = await harness(t, { values }); globalThis.indexedDB = undefined;
  const first = await app.mount(A); await until(() => first.current.isCurrentDataSaved);
  assert.deepEqual(first.current.sessions, []);
  await act(async () => first.current.setSessions([chat('account-fallback')]));
  await until(() => first.current.isCurrentDataSaved);
  assert.equal(first.current.limitedStorage, true);
  assert.deepEqual(JSON.parse(values.get(`evara-data-v2-baseline:${A}`)), empty());
  assert.equal(JSON.parse(values.get(`evara-data-v2:${A}`)).sessions[0].id, 'account-fallback');
  const second = await app.mount(B); await until(() => second.current.isCurrentDataSaved);
  assert.deepEqual(second.current.sessions, []);
  await first.unmount(); await second.unmount();
  globalThis.indexedDB = app.factory;
  const restored = await app.mount(A); await until(() => restored.current.isCurrentDataSaved);
  assert.equal(restored.current.sessions[0].id, 'account-fallback');
  assert.equal(values.has(`evara-data-v2:${A}`), false);
  assert.equal(values.has(`evara-data-v2:${B}`), true);
  assert.equal(values.get('evara-data-v2'), JSON.stringify(legacy));
  assert.equal(values.get('evara-data-v2-baseline'), JSON.stringify(legacy));
  assert.equal(values.get('evara-data-changed'), 'guest-notification');
});

test('only explicit seeding imports a guest copy, retains newer account data and rejects unsafe scopes', async t => {
  const app = await harness(t);
  const legacy = journal('Guest copy', 'guest-copy');
  const accountData = journal('Account name', 'account-existing');
  await snapshot(app.factory, undefined, legacy);
  await snapshot(app.factory, A, accountData);
  await seedPersistentScope(A, legacy);
  const seeded = await snapshot(app.factory, A);
  assert.equal(seeded.profile.name, 'Account name');
  assert.deepEqual(new Set(seeded.sessions.map(item => item.id)), new Set(['guest-copy', 'account-existing']));
  assert.deepEqual(await snapshot(app.factory), legacy);
  await seedPersistentScope(A, legacy);
  assert.deepEqual(await snapshot(app.factory, A), seeded);
  for (const scope of [undefined, '', 'default', '../guest', 'account-user', `${A}:other`, 'x'.repeat(500)]) await assert.rejects(seedPersistentScope(scope, legacy), /scope is invalid|account import is invalid/);
  await assert.rejects(seedPersistentScope(B, { ...legacy, sessions: 'invalid' }), /account import is invalid/);
  assert.deepEqual((await app.factory.databases()).map(item => item.name).sort(), [databaseName(), databaseName(A)].sort());
});
