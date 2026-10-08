import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournalHandler, validDocument, hashKey } from '../supabase/functions/journal/index.ts';
import { makeDeviceToken, mergeCloudDocument, restoreCloudDocument, hasCloudConflict } from '../src/lib/cloud.ts';

const session = (id, note = '') => ({ id, note, title: 'A moment', focus: 'Daily reflection', date: '2026-10-06T08:00:00.000Z', messages: [], saved: true });
const document = (sessions = []) => ({ profile: { name: 'Ava', onboarded: true }, sessions });
const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64);
const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service', SUPABASE_PUBLISHABLE_KEY: 'test-public', EVARA_ALLOWED_ORIGINS: 'https://evara.example' };
function backend() {
  const rows = new Map(); const calls = []; let permitted = true;
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/rpc/journal_take_quota')) return Response.json(permitted);
    if (url.endsWith('/rpc/journal_write')) {
      const { p_owner_hash: key, p_document: doc, p_expected_revision: expected } = JSON.parse(init.body);
      const previous = rows.get(key);
      if ((previous?.revision ?? 0) !== expected) return Response.json(null);
      const next = { document: doc, revision: expected + 1, updated_at: '2026-10-06T09:00:00.000Z' }; rows.set(key, next);
      return Response.json({ revision: next.revision, updated_at: next.updated_at });
    }
    const key = new URL(url).searchParams.get('owner_hash')?.slice(3);
    return Response.json(rows.has(key) ? [rows.get(key)] : []);
  };
  return { handler: createJournalHandler({ get: (key) => env[key] }, fetcher), rows, calls, throttle: () => { permitted = false; } };
}
function request(token = tokenA, body, headers = {}) {
  return new Request('https://project.supabase.co/functions/v1/journal', {
    method: body === undefined ? 'GET' : 'PUT',
    headers: { apikey: 'test-public', origin: 'https://evara.example', 'x-evara-device': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('device capabilities contain 256 bits of randomness and store only a hash server-side', async () => {
  const tokens = Array.from({ length: 100 }, makeDeviceToken);
  assert.equal(new Set(tokens).size, 100); assert.ok(tokens.every((value) => /^[a-f0-9]{64}$/.test(value)));
  const hash = await hashKey(tokenA); assert.match(hash, /^[a-f0-9]{64}$/); assert.notEqual(hash, tokenA);
});
test('hydration preserves local unique readings and restores cloud versions of shared IDs', () => {
  const merged = mergeCloudDocument(document([session('same', 'old'), session('local')]), document([session('same', 'cloud'), session('remote')]));
  assert.equal(merged.sessions.length, 3); assert.equal(merged.sessions.find((entry) => entry.id === 'same').note, 'cloud');
});
test('editing while backup restores cannot replace a newly typed note or name', () => {
  const original = document([session('same', 'old')]);
  const current = { profile: { name: 'New name', onboarded: true }, sessions: [session('same', 'just typed'), session('new')] };
  const restored = restoreCloudDocument(original, current, document([session('same', 'remote'), session('remote-only')]));
  assert.equal(restored.profile.name, 'New name'); assert.equal(restored.sessions.find((entry) => entry.id === 'same').note, 'just typed'); assert.equal(restored.sessions.length, 3);
});
test('durable sync baseline preserves a note and name edited offline before reload', () => {
  const baseline = document([session('same', 'original')]);
  const local = { profile: { name: 'New name', onboarded: true }, sessions: [session('same', 'offline edit')] };
  assert.equal(hasCloudConflict(local, baseline, baseline), false);
  const restored = restoreCloudDocument(baseline, local, baseline);
  assert.equal(restored.profile.name, 'New name'); assert.equal(restored.sessions[0].note, 'offline edit');
});
test('independent changes to a shared reading pause for explicit conflict resolution', () => {
  const baseline = document([session('same', 'original')]);
  const local = document([session('same', 'offline edit')]);
  const remote = document([session('same', 'another tab edit')]);
  assert.equal(hasCloudConflict(local, remote, baseline), true);
  assert.equal(hasCloudConflict(local, remote, null), true);
  assert.equal(hasCloudConflict(baseline, remote, baseline), false);
  assert.equal(hasCloudConflict(local, local, null), false);
});
test('full validation rejects unexpected ownership fields, duplicates, oversized text, and tracking card images', () => {
  assert.equal(validDocument(document([session('one')])), true);
  assert.equal(validDocument({ ...document(), owner_hash: tokenA }), false);
  assert.equal(validDocument(document([session('one'), session('one')])), false);
  assert.equal(validDocument(document([session('one', 'x'.repeat(1201))])), false);
  const entry = session('one'); entry.messages = [{ id: 'm', role: 'assistant', text: '', cards: [{ id: 0, name: 'Fool', roman: '0', keywords: [], meaning: '', reflection: '', image: 'https://tracking.example/image.jpg' }] }];
  assert.equal(validDocument(document([entry])), false);
});
test('different device capabilities cannot read or replace another device document', async () => {
  const server = backend();
  const first = await server.handler(request(tokenA, { document: document([session('private', 'secret')]), expectedRevision: 0 })); assert.equal(first.status, 200);
  const own = await (await server.handler(request(tokenA))).json(); assert.equal(own.document.sessions[0].note, 'secret');
  const other = await (await server.handler(request(tokenB))).json(); assert.equal(other.document, null); assert.equal(other.revision, 0);
  const bWrite = await server.handler(request(tokenB, { document: document([session('b')]), expectedRevision: own.revision })); assert.equal(bWrite.status, 409);
  assert.equal(server.rows.size, 1);
  assert.ok(server.calls.every((call) => !call.url.includes(tokenA) && !String(call.init.body).includes(tokenA)));
});
test('conditional writes reject stale tabs and allow the next correct revision', async () => {
  const { handler } = backend();
  assert.equal((await handler(request(tokenA, { document: document(), expectedRevision: 0 }))).status, 200);
  assert.equal((await handler(request(tokenA, { document: document(), expectedRevision: 0 }))).status, 409);
  const result = await (await handler(request(tokenA, { document: document([session('next')]), expectedRevision: 1 }))).json(); assert.equal(result.revision, 2);
});
test('invalid origins, capabilities, keys and query parameters are denied before database access', async () => {
  const server = backend();
  assert.equal((await server.handler(request(tokenA, undefined, { origin: 'https://untrusted.example' }))).status, 403);
  assert.equal((await server.handler(request('short'))).status, 401);
  assert.equal((await server.handler(request(tokenA, undefined, { apikey: 'wrong' }))).status, 401);
  assert.equal((await server.handler(new Request('https://project.supabase.co/functions/v1/journal?owner_hash=anything'))).status, 400);
  assert.equal(server.calls.length, 0);
});
test('quota denial stops all document operations and returns a retry hint', async () => {
  const server = backend(); server.throttle();
  const response = await server.handler(request()); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60'); assert.equal(server.calls.length, 1);
});
test('a failed database call never claims the backup was saved or leaks secrets', async () => {
  const handler = createJournalHandler({ get: (key) => env[key] }, async () => { throw new Error('secret database details'); });
  const response = await handler(request()); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret database details|test-service/);
});
test('oversized and malformed requests fail before any document write', async () => {
  const server = backend();
  assert.equal((await server.handler(request(tokenA, { document: document([session('one', 'x'.repeat(1_049_600))]), expectedRevision: 0 }))).status, 413);
  assert.equal((await server.handler(request(tokenA, { document: document(), expectedRevision: 0, owner_hash: tokenB }))).status, 400);
  assert.equal(server.rows.size, 0);
});

test('private backup accepts profile photos, chat-only and ten-card sessions, practices and calendar notes', async () => {
  const { cards } = await import('../src/data/tarot.ts');
  const expanded = {
    profile: { name: 'Linh', onboarded: true, avatar: 'data:image/jpeg;base64,YWJj' },
    sessions: [{ ...session('chat'), drawCount: 0 }, { ...session('deep'), drawCount: 10, messages: [{ id: 'draw', role: 'assistant', text: 'An in-depth reflection', cards: cards.slice(0, 10) }] }],
    practiceDays: ['2026-10-06'], dayNotes: { '2026-10-09': 'A future intention.' }, language: 'vi',
  };
  assert.equal(validDocument(expanded), true);
  const server = backend();
  assert.equal((await server.handler(request(tokenA, { document: expanded, expectedRevision: 0 }))).status, 200);
  assert.deepEqual((await (await server.handler(request(tokenA))).json()).document, expanded);
  assert.equal(validDocument({ ...expanded, profile: { ...expanded.profile, avatar: 'data:image/svg+xml;base64,YWJj' } }), false);
  assert.equal(validDocument({ ...expanded, dayNotes: { '2026-02-30': 'Impossible date' } }), false);
});

test('restoration preserves offline calendar edits and combines practice days', () => {
  const baseline = { ...document(), practiceDays: ['2026-10-01'], dayNotes: { '2026-10-06': 'Original note' }, language: 'en' };
  const local = { ...baseline, practiceDays: [...baseline.practiceDays, '2026-10-06'], dayNotes: { '2026-10-06': 'Offline note' }, language: 'vi' };
  const remote = { ...baseline, practiceDays: [...baseline.practiceDays, '2026-10-05'], dayNotes: { ...baseline.dayNotes, '2026-10-08': 'Remote plan' } };
  assert.equal(hasCloudConflict(local, remote, baseline), false);
  const restored = restoreCloudDocument(baseline, local, remote);
  assert.equal(restored.dayNotes['2026-10-06'], 'Offline note');
  assert.equal(restored.dayNotes['2026-10-08'], 'Remote plan');
  assert.equal(restored.language, 'vi');
  assert.deepEqual(new Set(restored.practiceDays), new Set(['2026-10-01', '2026-10-05', '2026-10-06']));
  assert.equal(hasCloudConflict(local, { ...remote, dayNotes: { '2026-10-06': 'Conflicting note' } }, baseline), true);
});

test('message creation dates are accepted without breaking older conversations', () => {
  const entry = { ...session('continued-chat'), messages: [{ id: 'new', role: 'user', text: 'A new day.', createdAt: '2026-10-07T08:30:00.000Z' }] };
  assert.equal(validDocument(document([entry])), true);
  assert.equal(validDocument(document([{ ...entry, messages: [{ ...entry.messages[0], createdAt: 'yesterday' }] }])), false);
});
