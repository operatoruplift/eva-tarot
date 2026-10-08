import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { IDBDatabase, IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createDataExport, parseDataImport, usePersistentData } from '../src/lib/persistence.ts';

const journal = (sessions = []) => ({ profile: { name: 'Ava', onboarded: true }, sessions, practiceDays: [], dayNotes: {} });
const chat = (id, note = '') => ({ id, title: `Chat ${id}`, focus: '', date: '2026-10-06T08:00:00.000Z', saved: false, note, messages: [{ id: `${id}-question`, role: 'user', text: 'I need time to rest.' }] });
const tick = () => new Promise(resolve => setImmediate(resolve));

async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await act(async () => { await tick(); });
  }
  assert.fail('The expected hook state did not arrive.');
}

async function snapshot(factory, value) {
  const database = await new Promise((resolve, reject) => {
    const request = factory.open('evara-personal-data', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('snapshots', value ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('snapshots');
      const request = value ? store.put({ version: 2, revision: 1, data: value }, 'main') : store.get('main');
      transaction.oncomplete = () => resolve(value ?? request.result?.data);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

async function harness(t, { factory = new IDBFactory(), initial = journal(), values = new Map() } = {}) {
  const original = { indexedDB: globalThis.indexedDB, localStorage: globalThis.localStorage, window: globalThis.window, actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT };
  if (factory && initial) await snapshot(factory, initial);
  globalThis.indexedDB = factory;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  globalThis.window = new EventTarget();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let current;
  let root;
  function Probe() { current = usePersistentData(); return null; }
  const mount = async () => { await act(async () => { root = create(createElement(Probe)); }); };
  const unmount = async () => { if (root) { await act(async () => root.unmount()); root = undefined; } };
  t.after(async () => {
    await unmount();
    globalThis.indexedDB = original.indexedDB;
    globalThis.localStorage = original.localStorage;
    globalThis.window = original.window;
    globalThis.IS_REACT_ACT_ENVIRONMENT = original.actEnvironment;
  });
  return { get current() { return current; }, factory, values, mount, unmount };
}

function observe(promise) {
  const result = { settled: false, error: undefined };
  result.promise = promise.then(() => { result.settled = true; }, error => { result.settled = true; result.error = error; });
  return result;
}

function holdWriteCompletions(t) {
  const original = IDBDatabase.prototype.transaction;
  const completions = [];
  IDBDatabase.prototype.transaction = function (...args) {
    const transaction = original.apply(this, args);
    if (args[1] === 'readwrite') {
      let handler;
      Object.defineProperty(transaction, 'oncomplete', { configurable: true, get: () => null, set: value => { handler = value; } });
      transaction.addEventListener('complete', event => { completions.push(() => handler?.call(transaction, event)); });
    }
    return transaction;
  };
  t.after(() => { IDBDatabase.prototype.transaction = original; });
  return completions;
}

test('flush waits for same-event edits, commits complete data, and reload hydrates that snapshot', async t => {
  const app = await harness(t);
  await app.mount(); await until(() => app.current.isCurrentDataSaved);
  let flush;
  await act(async () => {
    app.current.setSessions([chat('new')]);
    app.current.setProfile({ name: 'Linh', onboarded: true });
    app.current.setDayNotes({ '2026-10-08': 'Take a quiet break.' });
    flush = observe(app.current.flush());
    assert.equal(flush.settled, false);
  });
  await until(() => flush.settled);
  assert.equal(flush.error, undefined);
  assert.equal(app.current.isCurrentDataSaved, true);
  const committed = await snapshot(app.factory);
  assert.equal(committed.sessions[0].messages[0].text, 'I need time to rest.');
  assert.equal(committed.profile.name, 'Linh');
  assert.equal(committed.dayNotes['2026-10-08'], 'Take a quiet break.');
  await app.unmount(); await app.mount(); await until(() => app.current.isCurrentDataSaved);
  assert.deepEqual(app.current.sessions, committed.sessions);
  assert.deepEqual(app.current.profile, committed.profile);
  assert.deepEqual(app.current.dayNotes, committed.dayNotes);
});

test('an edit arriving during a write is committed before any waiting flush resolves', async t => {
  const app = await harness(t);
  await app.mount(); await until(() => app.current.isCurrentDataSaved);
  const completions = holdWriteCompletions(t);
  let flush;
  await act(async () => { app.current.setSessions([chat('new', 'First edit')]); flush = observe(app.current.flush()); });
  await until(() => completions.length === 1);
  await act(async () => { app.current.setSessions([chat('new', 'Latest edit')]); });
  assert.equal(flush.settled, false);
  await act(async () => completions.shift()());
  assert.equal(flush.settled, false);
  assert.equal(app.current.isCurrentDataSaved, false);
  await until(() => completions.length === 1);
  await act(async () => completions.shift()());
  await until(() => flush.settled);
  assert.equal(flush.error, undefined);
  assert.equal((await snapshot(app.factory)).sessions[0].note, 'Latest edit');
});

test('flush recognizes a merged commit that already includes an edit made during the write', async t => {
  const app = await harness(t);
  await app.mount(); await until(() => app.current.isCurrentDataSaved);
  await snapshot(app.factory, { ...journal(), profile: { name: 'Linh', onboarded: true } });
  const completions = holdWriteCompletions(t);
  let flush;
  await act(async () => { app.current.setSessions([chat('new')]); flush = observe(app.current.flush()); });
  await until(() => completions.length === 1);
  await act(async () => app.current.setProfile({ name: 'Linh', onboarded: true }));
  await act(async () => completions.shift()());
  await until(() => flush.settled);
  assert.equal(flush.error, undefined);
  assert.equal(app.current.isCurrentDataSaved, true);
  assert.equal(app.current.profile.name, 'Linh');
  assert.equal((await snapshot(app.factory)).sessions[0].id, 'new');
});

test('aborted writes reject flush, retain exportable edits, and never claim they are saved', async t => {
  const app = await harness(t);
  await app.mount(); await until(() => app.current.isCurrentDataSaved);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const request = original.apply(this, args);
    queueMicrotask(() => this.transaction.abort());
    return request;
  };
  t.after(() => { IDBObjectStore.prototype.put = original; });
  let flush;
  await act(async () => { app.current.setSessions([chat('unsaved')]); flush = observe(app.current.flush()); });
  await until(() => flush.settled);
  assert.match(flush.error.message, /latest changes could not be saved/);
  assert.equal(app.current.status, 'error');
  assert.equal(app.current.isCurrentDataSaved, false);
  assert.equal(app.current.needsRecovery, false);
  assert.equal(parseDataImport(createDataExport(app.current)).sessions[0].id, 'unsaved');
  assert.deepEqual((await snapshot(app.factory)).sessions, []);
  await assert.rejects(app.current.flush(), /latest changes could not be saved/);
});

test('failed primary open requires recovery and cannot silently replace existing IndexedDB with empty fallback', async t => {
  const app = await harness(t, { initial: journal([chat('existing')]) });
  const realFactory = app.factory;
  globalThis.indexedDB = { open() { throw new Error('Temporarily unavailable'); } };
  await app.mount(); await until(() => app.current.needsRecovery);
  assert.equal(app.current.isCurrentDataSaved, false);
  assert.equal(app.current.limitedStorage, false);
  assert.equal(app.values.has('evara-data-v2'), false);
  await assert.rejects(app.current.flush(), /could not be opened/);
  assert.equal((await snapshot(realFactory)).sessions[0].id, 'existing');
  globalThis.indexedDB = realFactory;
  await act(async () => { app.current.retrySave(); app.current.retrySave(); });
  await until(() => app.current.isCurrentDataSaved);
  assert.equal(app.current.needsRecovery, false);
  assert.equal(app.current.sessions[0].id, 'existing');
});

test('failed primary read preserves the existing snapshot and rejects flush until recovery', async t => {
  const app = await harness(t, { initial: journal([chat('existing')]) });
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    if (args[1] === 'readonly') throw new Error('Read unavailable');
    return original.apply(this, args);
  };
  t.after(() => { IDBDatabase.prototype.transaction = original; });
  await app.mount(); await until(() => app.current.needsRecovery);
  await assert.rejects(app.current.flush(), /could not be opened/);
  IDBDatabase.prototype.transaction = original;
  assert.equal((await snapshot(app.factory)).sessions[0].id, 'existing');
  await act(async () => app.current.retrySave());
  await until(() => app.current.isCurrentDataSaved);
  assert.equal(app.current.sessions[0].id, 'existing');
});

test('unmount rejects pending flush waiters without deleting a committed snapshot', async t => {
  const app = await harness(t);
  await app.mount(); await until(() => app.current.isCurrentDataSaved);
  const completions = holdWriteCompletions(t);
  let flush;
  await act(async () => { app.current.setSessions([chat('latest')]); flush = observe(app.current.flush()); });
  await until(() => completions.length === 1);
  await app.unmount(); await flush.promise;
  assert.match(flush.error.message, /closed before/);
  completions.shift()();
  assert.equal((await snapshot(app.factory)).sessions[0].id, 'latest');
});

test('a flush timeout rejects the reader gate while allowing the journal write to finish', async t => {
  const app = await harness(t);
  await app.mount(); await until(() => app.current.isCurrentDataSaved);
  const completions = holdWriteCompletions(t);
  const original = globalThis.setTimeout;
  let expire;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 15_000) {
      const timer = original(() => {}, 60_000);
      expire = () => { clearTimeout(timer); callback(); };
      return timer;
    }
    return original(callback, delay, ...args);
  };
  t.after(() => { globalThis.setTimeout = original; });
  let flush;
  await act(async () => { app.current.setSessions([chat('pending')]); flush = observe(app.current.flush()); });
  await until(() => completions.length === 1);
  await act(async () => expire()); await flush.promise;
  assert.match(flush.error.message, /taking longer than expected/);
  assert.equal(app.current.isCurrentDataSaved, false);
  await act(async () => completions.shift()());
  await until(() => app.current.isCurrentDataSaved);
  assert.equal((await snapshot(app.factory)).sessions[0].id, 'pending');
});

test('localStorage fallback commits when IndexedDB is absent, but invalid fallback data is preserved for recovery', async t => {
  const app = await harness(t, { factory: undefined, initial: null });
  globalThis.indexedDB = undefined;
  await app.mount(); await until(() => app.current.isCurrentDataSaved);
  let flush;
  await act(async () => { app.current.setSessions([chat('fallback')]); flush = observe(app.current.flush()); });
  await until(() => flush.settled);
  assert.equal(flush.error, undefined);
  assert.equal(app.current.limitedStorage, true);
  assert.equal(JSON.parse(app.values.get('evara-data-v2')).sessions[0].id, 'fallback');
  await app.unmount(); app.values.set('evara-data-v2', '{not valid');
  await app.mount(); await until(() => app.current.needsRecovery);
  await assert.rejects(app.current.flush(), /could not be opened/);
  assert.equal(app.values.get('evara-data-v2'), '{not valid');
});
