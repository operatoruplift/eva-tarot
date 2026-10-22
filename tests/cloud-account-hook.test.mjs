import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
import { CONNECTION_KEY, persistConnection } from '../src/lib/account-connection.ts';
import { createJournalHandler, validDocument } from '../supabase/functions/journal/index.ts';

// Exercise the product hook, changing only Vite's build-time public coordinates.
// No Supabase service, customer account, email or AI provider is contacted.
const source = await readFile(new URL('../src/lib/cloud.ts', import.meta.url), 'utf8');
assert.match(source, /const env = import\.meta\.env \?\? \{\};/);
const configuredSource = source.replace('const env = import.meta.env ?? {};', 'const env = { VITE_SUPABASE_URL: "https://cloud-hook-test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "test-public" };');
const compiled = ts.transpileModule(configuredSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const rewritten = compiled.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from ${JSON.stringify(specifier.startsWith('./') ? new URL(`../src/lib/${specifier.slice(2)}`, import.meta.url).href : import.meta.resolve(specifier))}`);
const { useCloudJournal } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
const ACCOUNT_TOKEN = 'a'.repeat(64), GUEST_TOKEN = 'b'.repeat(64), LEGACY_TOKEN = 'c'.repeat(64);
const userId = '11111111-1111-4111-8111-111111111111';
const connection = enabled => ({ version: 1, guest: { scope: '22222222-2222-4222-8222-222222222222', commerceToken: GUEST_TOKEN, backupToken: GUEST_TOKEN, backupEnabled: true }, account: { userId, email: 'reader@example.test', commerceToken: ACCOUNT_TOKEN, backupToken: ACCOUNT_TOKEN, backupEnabled: enabled } });
const session = (id = 'same', note = '') => ({ id, title: 'A private reading', focus: 'Reflection', date: '2026-10-22T08:00:00.000Z', messages: [{ id: `${id}-question`, role: 'user', text: 'Help me choose a small next step.' }], saved: true, note, privateReader: true });
const document = (name = 'Linh', note = '') => ({ profile: { name, onboarded: true }, sessions: [session('same', note)], practiceDays: ['2026-10-22'], dayNotes: {}, language: 'vi' });
const empty = () => ({ profile: { name: '', onboarded: false }, sessions: [], practiceDays: [], dayNotes: {}, language: 'en' });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await act(async () => { await tick(); });
  }
  assert.fail('The cloud hook did not reach the expected state.');
}

async function harness(t, { local = document(), remote = local, enabled = true } = {}) {
  const originals = { fetch: globalThis.fetch, window: globalThis.window, localStorage: globalThis.localStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), act: globalThis.IS_REACT_ACT_ENVIRONMENT, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const values = new Map([[CONNECTION_KEY, JSON.stringify(connection(enabled))], ['evara-private-backup-enabled', 'true'], ['evara-private-backup-token', LEGACY_TOKEN]]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  globalThis.window = new EventTarget();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const uploads = new Map(); let timerId = 0;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay !== 900) return originals.setTimeout(callback, delay, ...args);
    const timer = { uploadTimer: ++timerId }; uploads.set(timer, () => callback(...args)); return timer;
  };
  globalThis.clearTimeout = timer => { if (!uploads.delete(timer)) originals.clearTimeout(timer); };
  let cloud = remote; let revision = remote ? 1 : 0; let holdNextUpload = false;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://cloud-hook-test.supabase.co/functions/v1/journal');
    const call = { method: init.method, token: init.headers['X-Evara-Device'], signal: init.signal, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    if (init.method === 'PUT') {
      if (holdNextUpload) {
        holdNextUpload = false;
        await new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }); });
      }
      assert.equal(call.body.expectedRevision, revision);
      cloud = call.body.document; revision++;
    }
    return Response.json({ document: cloud, revision, updatedAt: '2026-10-22T09:00:00.000Z' });
  };
  let current; let setDocument; let root; const restores = [];
  function Probe() {
    const [data, setData] = useState(local); setDocument = setData;
    const backup = useCloudJournal({ ...data, onRestore: next => { restores.push(next); setData(next); } });
    current = { ...backup, document: data }; return null;
  }
  await act(async () => { root = create(createElement(Probe)); });
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originals.fetch; globalThis.window = originals.window; globalThis.localStorage = originals.localStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originals.act; globalThis.setTimeout = originals.setTimeout; globalThis.clearTimeout = originals.clearTimeout;
    if (originals.navigator) Object.defineProperty(globalThis, 'navigator', originals.navigator); else delete globalThis.navigator;
  });
  return {
    get current() { return current; }, calls, restores, values,
    holdUpload: () => { holdNextUpload = true; },
    edit: next => act(async () => setDocument(next)),
    fireUploads: () => act(async () => { const pending = [...uploads.values()]; uploads.clear(); for (const callback of pending) callback(); }),
    get pendingUploads() { return uploads.size; },
    changeInOtherTab: async next => { values.set(CONNECTION_KEY, JSON.stringify(next)); const event = new Event('storage'); Object.assign(event, { key: CONNECTION_KEY }); await act(async () => window.dispatchEvent(event)); },
    changeInThisTab: next => act(async () => persistConnection(next)),
  };
}

test('another tab can pause account backup, abort an upload and resume through the connection record', async t => {
  const app = await harness(t); await until(() => app.current.status === 'synced');
  assert.equal(app.current.available, true);
  assert.equal(app.calls[0].method, 'GET');
  assert.equal(app.calls[0].token, ACCOUNT_TOKEN);
  app.holdUpload();
  await app.edit(document('Edited on this device', 'Unsynced private note'));
  assert.equal(app.pendingUploads, 1);
  await app.fireUploads(); await until(() => app.current.status === 'syncing');
  const pending = app.calls.at(-1); assert.equal(pending.method, 'PUT');
  await app.changeInOtherTab(connection(false));
  await until(() => app.current.status === 'disabled');
  assert.equal(pending.signal.aborted, true);
  assert.equal(app.current.enabled, false);
  await app.edit(document('Edited while paused', 'Keep this local edit'));
  await app.fireUploads();
  assert.equal(app.calls.filter(call => call.method === 'PUT').length, 1);
  await app.changeInOtherTab(connection(true));
  await until(() => app.calls.filter(call => call.method === 'GET').length === 2 && app.current.status === 'synced');
  assert.equal(app.current.conflict, false);
  assert.equal(app.current.document.profile.name, 'Edited while paused');
  assert.equal(app.current.document.sessions[0].note, 'Keep this local edit');
  await app.fireUploads(); await until(() => app.calls.filter(call => call.method === 'PUT').length === 2 && app.current.status === 'synced');
  assert.ok(app.calls.every(call => call.token === ACCOUNT_TOKEN));
});

test('same-tab connection events also pause and resume without changing the account scope', async t => {
  const app = await harness(t); await until(() => app.current.status === 'synced');
  await app.changeInThisTab(connection(false)); await until(() => app.current.status === 'disabled');
  assert.equal(app.current.enabled, false);
  await app.changeInThisTab(connection(true));
  await until(() => app.calls.filter(call => call.method === 'GET').length === 2 && app.current.status === 'synced');
  assert.equal(app.current.enabled, true);
  assert.equal(JSON.parse(app.values.get(CONNECTION_KEY)).account.userId, userId);
  assert.equal(app.current.document.sessions[0].privateReader, true);
});

test('selecting another account disables the old hook before it can use new capabilities with the old journal', async t => {
  const app = await harness(t); await until(() => app.current.status === 'synced');
  app.holdUpload();
  await app.edit(document('Account A reader', 'Account A private edit'));
  await app.fireUploads(); await until(() => app.current.status === 'syncing');
  const pending = app.calls.at(-1);
  assert.equal(pending.method, 'PUT');
  const accountBToken = 'd'.repeat(64);
  const accountB = { ...connection(true), account: { ...connection(true).account, userId: '33333333-3333-4333-8333-333333333333', email: 'other-reader@example.test', commerceToken: accountBToken, backupToken: accountBToken } };
  await app.changeInOtherTab(accountB);
  await until(() => app.current.status === 'disabled');
  assert.equal(app.current.enabled, false);
  assert.equal(pending.signal.aborted, true);
  const requestCount = app.calls.length;
  await app.edit(document('Old mounted account A', 'Keep the old private edit isolated'));
  await act(async () => window.dispatchEvent(new Event('online')));
  await app.fireUploads();
  for (let count = 0; count < 3; count++) await act(async () => { await tick(); });
  assert.equal(app.calls.length, requestCount, 'the parent must remount before another account can perform backup requests');
  assert.ok(app.calls.every(call => call.token === ACCOUNT_TOKEN));
  assert.equal(app.current.document.sessions[0].note, 'Keep the old private edit isolated');
  assert.equal(app.current.status, 'disabled');
});

test('an empty recovered account restores its remote profile and readings without a false guest conflict', async t => {
  const remote = document('Recovered reader', 'The saved private reading');
  const app = await harness(t, { local: empty(), remote });
  await until(() => app.current.status === 'synced');
  assert.equal(app.current.conflict, false);
  assert.deepEqual(app.current.document, remote);
  assert.equal(app.restores.length, 1);
  await app.fireUploads();
  assert.equal(app.calls.filter(call => call.method === 'PUT').length, 0);
  assert.ok(app.calls.every(call => call.token === ACCOUNT_TOKEN));
});

test('a nonempty account with independent edits still pauses rather than overwriting either version', async t => {
  const local = document('Local reader', 'My local change');
  const remote = document('Remote reader', 'Another device change');
  const app = await harness(t, { local, remote });
  await until(() => app.current.conflict);
  assert.equal(app.current.status, 'error');
  assert.match(app.current.error, /different edits/);
  assert.deepEqual(app.current.document, local);
  assert.equal(app.restores.length, 0);
  await app.fireUploads();
  assert.equal(app.calls.filter(call => call.method === 'PUT').length, 0);
});

test('the journal server round-trips explicit private-reader intent and rejects nonboolean intent', async () => {
  const rows = new Map();
  const env = { SUPABASE_URL: 'https://journal-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service', SUPABASE_PUBLISHABLE_KEY: 'test-public', EVARA_ALLOWED_ORIGINS: 'https://eva.example.test' };
  const handler = createJournalHandler({ get: key => env[key] }, async (url, init) => {
    if (url.endsWith('/rpc/journal_take_quota')) return Response.json(true);
    if (url.endsWith('/rpc/journal_write')) {
      const body = JSON.parse(init.body);
      const previous = rows.get(body.p_owner_hash);
      if ((previous?.revision ?? 0) !== body.p_expected_revision) return Response.json(null);
      const next = { document: body.p_document, revision: body.p_expected_revision + 1, updated_at: '2026-10-22T09:00:00.000Z' };
      rows.set(body.p_owner_hash, next); return Response.json({ revision: next.revision, updated_at: next.updated_at });
    }
    const key = new URL(url).searchParams.get('owner_hash')?.slice(3);
    return Response.json(rows.has(key) ? [rows.get(key)] : []);
  });
  const request = body => new Request('https://journal-test.supabase.co/functions/v1/journal', { method: body ? 'PUT' : 'GET', headers: { apikey: 'test-public', origin: 'https://eva.example.test', 'X-Evara-Device': ACCOUNT_TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const saved = { ...document(), sessions: [session('private'), { ...session('shared'), privateReader: false }] };
  assert.equal(validDocument(saved), true);
  assert.equal((await handler(request({ document: saved, expectedRevision: 0 }))).status, 200);
  assert.deepEqual((await (await handler(request())).json()).document, saved);
  const invalid = { ...saved, sessions: [{ ...session(), privateReader: 'true' }] };
  assert.equal(validDocument(invalid), false);
  assert.equal((await handler(request({ document: invalid, expectedRevision: 1 }))).status, 400);
  assert.deepEqual((await (await handler(request())).json()).document, saved);
});
