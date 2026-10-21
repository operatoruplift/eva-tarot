import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadingAttemptStore } from '../src/lib/reading-attempts.ts';
import { getReading, ReadingServiceError } from '../src/lib/readings.ts';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const request = { question: 'I can only spend fifteen minutes painting after work.', focus: 'Career', cards: [], language: 'en' };
function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function browser(t) {
  const local = storage(); const session = storage();
  const originals = { local: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), fetch: globalThis.fetch };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
  t.after(() => {
    if (originals.local) Object.defineProperty(globalThis, 'localStorage', originals.local); else delete globalThis.localStorage;
    if (originals.session) Object.defineProperty(globalThis, 'sessionStorage', originals.session); else delete globalThis.sessionStorage;
    globalThis.fetch = originals.fetch;
  });
  return { local, session };
}

test('retry reference survives a page reload without storing the intent or chat text', async () => {
  const saved = storage();
  const first = createReadingAttemptStore(() => saved);
  const attempt = await first.acquire('private-message-id', request.question);
  assert.match(attempt.id, uuid);
  const afterReload = createReadingAttemptStore(() => saved);
  assert.deepEqual(await afterReload.acquire('private-message-id', request.question), attempt);
  assert.notEqual((await afterReload.acquire('private-message-id', 'A corrected question')).id, attempt.id);
  assert.notEqual((await afterReload.acquire('another-message', request.question)).id, attempt.id);
  const serialized = JSON.stringify([...saved.values]);
  assert.ok(!serialized.includes(request.question));
  assert.ok(!serialized.includes('private-message-id'));
  afterReload.clear(attempt);
  assert.notEqual((await afterReload.acquire('private-message-id', request.question)).id, attempt.id);
});

test('corrupt or expired references are replaced, and blocked storage still permits stable in-tab retries', async () => {
  const saved = storage();
  const store = createReadingAttemptStore(() => saved);
  const first = await store.acquire('expired', 'body');
  saved.values.set(first.storageKey, JSON.stringify({ id: first.id, createdAt: Date.now() - 25 * 60 * 60 * 1_000 }));
  assert.notEqual((await createReadingAttemptStore(() => saved).acquire('expired', 'body')).id, first.id);
  saved.values.set(first.storageKey, '{broken');
  assert.match((await createReadingAttemptStore(() => saved).acquire('expired', 'body')).id, uuid);
  const blocked = createReadingAttemptStore(() => { throw new Error('Denied'); });
  const attempt = await blocked.acquire('stable-in-this-tab', 'body');
  assert.deepEqual(await blocked.acquire('stable-in-this-tab', 'body'), attempt);
  blocked.clear(attempt);
  assert.notEqual((await blocked.acquire('stable-in-this-tab', 'body')).id, attempt.id);
});

test('unknown network failure retries with the same wallet and reading references, and preserves completed answers for recovery before journal save', async t => {
  const { local } = browser(t);
  const headers = [];
  globalThis.fetch = async (_url, options) => {
    headers.push(options.headers);
    assert.ok(!('requestKey' in JSON.parse(options.body)));
    if (headers.length === 1) throw new TypeError('Failed to fetch');
    return Response.json({ mode: 'ai', text: 'Use the materials you already have for one fifteen-minute sketch.' });
  };
  const input = { ...request, requestKey: 'network-unknown-message' };
  await assert.rejects(getReading(input), /could not connect/);
  await getReading(input);
  assert.equal(headers[0]['X-Eva-Request'], headers[1]['X-Eva-Request']);
  assert.match(headers[0]['X-Eva-Request'], uuid);
  assert.equal(headers[0]['X-Eva-Device'], local.getItem('eva-commerce-device'));
  assert.match(headers[0]['X-Eva-Device'], /^[a-f0-9]{64}$/);
  await getReading(input);
  assert.equal(headers[1]['X-Eva-Request'], headers[2]['X-Eva-Request']);
  await getReading({ ...input, requestKey: 'next-message' });
  assert.notEqual(headers[2]['X-Eva-Request'], headers[3]['X-Eva-Request']);
});

test('only confirmed refund or a terminal request retires a failed attempt', async t => {
  browser(t);
  for (const failure of [
    { error: 'Still preparing', code: 'reading_in_progress', status: 409, shouldChange: false },
    { error: 'Recovery pending', creditStatus: 'pending', status: 503, shouldChange: false },
    { error: 'Failed, credit returned', creditStatus: 'refunded', status: 503, shouldChange: true },
    { error: 'This request ended', code: 'reading_ended', status: 409, shouldChange: true },
    { error: 'Response expired', code: 'reading_expired', status: 409, shouldChange: true },
  ]) {
    const ids = [];
    globalThis.fetch = async (_url, options) => {
      ids.push(options.headers['X-Eva-Request']);
      return ids.length === 1 ? Response.json(failure, { status: failure.status }) : Response.json({ mode: 'ai', text: 'A completed answer.' });
    };
    const input = { ...request, requestKey: `failure-${failure.error}` };
    await assert.rejects(getReading(input), error => error instanceof ReadingServiceError && error.status === failure.status && error.code === failure.code && error.creditStatus === failure.creditStatus);
    await getReading(input);
    assert.equal(ids[0] !== ids[1], failure.shouldChange, failure.error);
  }
});

test('storage restrictions do not block free AI and paid wallet requirements remain actionable', async t => {
  browser(t);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Denied'); } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('Denied'); } });
  const ids = [];
  globalThis.fetch = async (_url, options) => {
    ids.push(options.headers['X-Eva-Request']);
    assert.equal(options.headers['X-Eva-Device'], undefined);
    return ids.length === 1
      ? Response.json({ error: 'Open your wallet on this device to begin a reading.', code: 'wallet_required' }, { status: 401 })
      : Response.json({ mode: 'ai', text: 'A free answer still works.' });
  };
  const input = { ...request, requestKey: 'storage-blocked' };
  await assert.rejects(getReading(input), error => error instanceof ReadingServiceError && error.code === 'wallet_required');
  assert.equal((await getReading(input)).text, 'A free answer still works.');
  assert.equal(ids[0], ids[1]);
});
