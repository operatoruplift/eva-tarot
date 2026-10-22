import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTION_KEY } from '../src/lib/account-connection.ts';
import { getReading } from '../src/lib/readings.ts';

const guest = { scope: null, commerceToken: 'e'.repeat(64), backupToken: null, backupEnabled: false };
const account = (id, commerceToken) => ({
  version: 1, guest,
  account: { userId: id, email: 'verified@example.test', commerceToken, backupToken: 'c'.repeat(64), backupEnabled: true },
});
const first = account('11111111-1111-4111-8111-111111111111', 'a'.repeat(64));
const second = account('22222222-2222-4222-8222-222222222222', 'b'.repeat(64));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(t) {
  const original = Object.fromEntries(['crypto', 'localStorage', 'sessionStorage', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const realCrypto = globalThis.crypto;
  const storage = new Map([[CONNECTION_KEY, JSON.stringify(first)]]);
  const session = new Map();
  const digestStarted = deferred();
  const releaseDigest = deferred();
  const calls = [];
  const memory = values => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory(storage) });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: memory(session) });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    randomUUID: realCrypto.randomUUID.bind(realCrypto),
    subtle: { async digest(...args) { digestStarted.resolve(); await releaseDigest.promise; return realCrypto.subtle.digest(...args); } },
  } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ mode: 'ai', text: 'Synthetic reply for request isolation testing.' });
  } });
  t.after(() => {
    releaseDigest.resolve();
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { calls, digestStarted, releaseDigest, switchAccount: () => storage.set(CONNECTION_KEY, JSON.stringify(second)) };
}

test('a reading stays bound to its starting wallet when another account activates during request hashing', async t => {
  const f = harness(t);
  const pending = getReading({ question: 'Private context from the first account.', focus: '', cards: [], requestKey: 'switch-during-hash' });
  await f.digestStarted.promise;
  f.switchAccount();
  f.releaseDigest.resolve();
  assert.equal((await pending).mode, 'ai');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.headers['X-Eva-Device'], first.account.commerceToken);
  assert.notEqual(f.calls[0].options.headers['X-Eva-Device'], second.account.commerceToken);
  assert.equal(JSON.parse(f.calls[0].options.body).question, 'Private context from the first account.');
});

test('aborting the old reader during an account switch prevents any reading request after hashing resumes', async t => {
  const f = harness(t);
  const controller = new AbortController();
  const pending = getReading({ question: 'Do not send this after switching accounts.', focus: '', cards: [], requestKey: 'abort-during-account-switch', signal: controller.signal });
  const rejected = assert.rejects(pending, error => error instanceof DOMException && error.name === 'AbortError');
  await f.digestStarted.promise;
  f.switchAccount();
  controller.abort();
  f.releaseDigest.resolve();
  await rejected;
  assert.deepEqual(f.calls, []);
});
