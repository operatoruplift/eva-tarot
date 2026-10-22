import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCustomerAccountHandler, encryptCapabilities, decryptCapabilities, hashCapability } from '../supabase/functions/customer-account/index.ts';

const userA = 'a149c6b5-7a58-4814-9b7f-43a139942bb7';
const userB = 'a149c6b5-7a58-4814-9b7f-43a139942bb8';
const capabilities = { commerceToken: 'a'.repeat(64), backupToken: 'b'.repeat(64) };
const otherCapabilities = { commerceToken: 'c'.repeat(64), backupToken: 'd'.repeat(64) };
const vaultKey = 'e'.repeat(64);
const timestamp = '2026-10-22T00:00:00Z';
const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-service-secret', SUPABASE_PUBLISHABLE_KEY: 'public-test', EVA_ACCOUNT_VAULT_KEY: vaultKey, EVA_ACCOUNT_ENABLED: 'true' };
const request = (body, headers = {}) => new Request('https://project.supabase.co/functions/v1/customer-account', { method: 'POST', headers: { origin: 'https://evatarot.xyz', apikey: 'public-test', authorization: 'Bearer verified-user-a', 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.7', ...headers }, body: JSON.stringify(body) });

async function backend({ verified = true, anonymous = false, authStatus = 200, ipQuota = true, userQuota = true, throwDatabase = false, environment = {} } = {}) {
  const calls = [], rows = new Map();
  const wallets = new Set([await hashCapability(capabilities.commerceToken), await hashCapability(otherCapabilities.commerceToken)]);
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) {
      if (authStatus !== 200 || init.headers.Authorization === 'Bearer forged-user-token') return Response.json({ message: 'Auth unavailable' }, { status: authStatus !== 200 ? authStatus : 401 });
      return Response.json({ id: init.headers.Authorization === 'Bearer verified-user-b' ? userB : userA, email: 'Verified@Example.com', email_confirmed_at: verified ? timestamp : null, is_anonymous: anonymous, user_metadata: { email_confirmed: true, admin: true, user_id: userB } });
    }
    if (throwDatabase) throw new Error('private-service-secret database internals');
    const path = new URL(url), name = path.pathname.split('/').at(-1), body = init.body ? JSON.parse(init.body) : {};
    if (name === 'customer_account_take_quota') return Response.json(body.p_user_id ? userQuota : ipQuota);
    if (name === 'customer_account_link') {
      const previous = rows.get(body.p_user_id);
      if (previous?.commerce_hash === body.p_commerce_hash && previous?.backup_hash === body.p_backup_hash) return Response.json({ status: 'already_linked', updated_at: previous.updated_at });
      if (!wallets.has(body.p_commerce_hash) || previous || [...rows.values()].some(row => row.commerce_hash === body.p_commerce_hash || row.backup_hash === body.p_backup_hash)) return Response.json({ code: '22023', message: 'Recovery connection already linked' }, { status: 400 });
      rows.set(body.p_user_id, { commerce_hash: body.p_commerce_hash, backup_hash: body.p_backup_hash, envelope: body.p_envelope, updated_at: timestamp });
      return Response.json({ status: 'linked', updated_at: timestamp });
    }
    if (name === 'eva_customer_accounts') {
      const row = rows.get(path.searchParams.get('user_id')?.replace(/^eq\./, ''));
      if (!row) return Response.json([]);
      const fields = path.searchParams.get('select').split(',');
      return Response.json([Object.fromEntries(fields.map(field => [field, row[field]]))]);
    }
    throw new Error(`Unexpected fixture route: ${name}`);
  };
  return { handler: createCustomerAccountHandler({ get: name => ({ ...env, ...environment })[name] }, fetcher), calls, rows, wallets };
}

test('account encryption is randomized, authenticates the owner and contains only two private connections', async () => {
  const first = await encryptCapabilities(capabilities, userA, vaultKey);
  const second = await encryptCapabilities(capabilities, userA, vaultKey);
  assert.notEqual(first.iv, second.iv); assert.notEqual(first.ciphertext, second.ciphertext);
  assert.doesNotMatch(JSON.stringify(first), new RegExp(`${capabilities.commerceToken}|${capabilities.backupToken}`));
  assert.deepEqual(await decryptCapabilities(first, userA, vaultKey), capabilities);
  await assert.rejects(decryptCapabilities(first, userB, vaultKey));
  await assert.rejects(decryptCapabilities(first, userA, 'f'.repeat(64)));
  await assert.rejects(encryptCapabilities({ ...capabilities, messages: ['private chat'] }, userA, vaultKey));
  await assert.rejects(decryptCapabilities({ ...first, ciphertext: first.ciphertext.slice(0, -4) + 'AAAA' }, userA, vaultKey));
  await assert.rejects(decryptCapabilities({ ...first, version: 2 }, userA, vaultKey));
});

test('status and link never return capabilities, and status cannot create a wallet or trial', async () => {
  const b = await backend();
  const initial = await b.handler(request({ action: 'status' }));
  assert.equal(initial.status, 200); assert.deepEqual(await initial.json(), { linked: false, email: 'verified@example.com', updatedAt: null });
  const linked = await b.handler(request({ action: 'link', ...capabilities }));
  assert.equal(linked.status, 200); assert.deepEqual(await linked.json(), { linked: true, email: 'verified@example.com', updatedAt: timestamp });
  const status = await (await b.handler(request({ action: 'status' }))).json();
  assert.deepEqual(status, { linked: true, email: 'verified@example.com', updatedAt: timestamp });
  assert.ok(b.calls.filter(call => call.url.includes('/eva_customer_accounts?')).every(call => new URL(call.url).searchParams.get('select') === 'updated_at'));
  assert.ok(b.calls.every(call => !/commerce_wallet|credit_ledger|eva_orders|journal_documents/.test(call.url)));
  for (const call of b.calls.filter(call => call.url.includes('/rest/'))) {
    assert.ok(!JSON.stringify(call).includes(capabilities.commerceToken)); assert.ok(!JSON.stringify(call).includes(capabilities.backupToken));
  }
});

test('a verified account restores the exact wallet and backup tokens through a private no-store response', async () => {
  const b = await backend(); await b.handler(request({ action: 'link', ...capabilities }));
  const response = await b.handler(request({ action: 'restore' }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store, private');
  assert.equal(response.headers.get('pragma'), 'no-cache'); assert.equal(response.headers.get('access-control-allow-origin'), 'https://evatarot.xyz');
  assert.deepEqual(await response.json(), { linked: true, email: 'verified@example.com', updatedAt: timestamp, ...capabilities });
  assert.ok(b.calls.filter(call => call.url.endsWith('/auth/v1/user')).every(call => call.init.headers.Authorization === 'Bearer verified-user-a'));
});

test('a forged, missing or expired bearer cannot read any recovery row', async () => {
  const b = await backend();
  assert.equal((await b.handler(request({ action: 'restore' }, { authorization: '' }))).status, 401);
  assert.equal(b.calls.length, 0);
  assert.equal((await b.handler(request({ action: 'restore' }, { authorization: 'Bearer forged-user-token' }))).status, 401);
  const expired = await backend({ authStatus: 401 });
  assert.equal((await expired.handler(request({ action: 'status' }))).status, 401);
  assert.ok([...b.calls, ...expired.calls].every(call => !call.url.includes('/eva_customer_accounts?')));
});

test('unverified and anonymous users cannot link even when editable metadata claims verification', async () => {
  for (const setup of [{ verified: false }, { anonymous: true }, { anonymous: null }]) {
    const b = await backend(setup);
    assert.equal((await b.handler(request({ action: 'link', ...capabilities }))).status, 403);
    assert.ok(b.calls.every(call => !call.url.includes('/rpc/customer_account_link'))); assert.equal(b.rows.size, 0);
  }
});

test('account identity comes only from Auth and cannot be chosen in JSON or metadata', async () => {
  const b = await backend();
  assert.equal((await b.handler(request({ action: 'status', userId: userB }))).status, 400);
  assert.equal((await b.handler(request({ action: 'link', ...capabilities, email: 'victim@example.com' }))).status, 400);
  await b.handler(request({ action: 'link', ...capabilities }));
  assert.equal(b.rows.has(userA), true); assert.equal(b.rows.has(userB), false);
  const other = await b.handler(request({ action: 'restore' }, { authorization: 'Bearer verified-user-b' }));
  assert.deepEqual(await other.json(), { linked: false, email: 'verified@example.com', updatedAt: null });
});

test('link requires a real existing wallet capability and both complete connection tokens', async () => {
  const b = await backend();
  for (const value of [{ commerceToken: capabilities.commerceToken }, { ...capabilities, backupToken: 'short' }, { ...capabilities, commerceToken: ['a'.repeat(64)] }]) assert.equal((await b.handler(request({ action: 'link', ...value }))).status, 400);
  assert.equal((await b.handler(request({ action: 'link', ...capabilities, commerceToken: '9'.repeat(64) }))).status, 409);
  assert.equal(b.rows.size, 0); assert.ok(b.calls.every(call => !call.url.includes('/rpc/commerce_wallet')));
});

test('duplicate and concurrent linking is idempotent and never replaces a saved connection', async () => {
  const b = await backend();
  const responses = await Promise.all([b.handler(request({ action: 'link', ...capabilities })), b.handler(request({ action: 'link', ...capabilities }))]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]); assert.equal(b.rows.size, 1);
  const before = JSON.stringify(b.rows.get(userA));
  assert.equal((await b.handler(request({ action: 'link', ...otherCapabilities }))).status, 409);
  assert.equal(JSON.stringify(b.rows.get(userA)), before);
  assert.deepEqual((await (await b.handler(request({ action: 'restore' }))).json()).commerceToken, capabilities.commerceToken);
});

test('two accounts cannot claim the same wallet or private journal connection', async () => {
  const b = await backend(); await b.handler(request({ action: 'link', ...capabilities }));
  assert.equal((await b.handler(request({ action: 'link', ...capabilities }, { authorization: 'Bearer verified-user-b' }))).status, 409);
  assert.equal((await b.handler(request({ action: 'link', ...otherCapabilities, backupToken: capabilities.backupToken }, { authorization: 'Bearer verified-user-b' }))).status, 409);
  assert.equal(b.rows.size, 1);
});

test('corrupted, swapped or mismatched stored vaults fail closed without returning tokens or internals', async () => {
  for (const mutate of [row => { row.envelope.ciphertext = 'AAAA'; }, async row => { row.envelope = await encryptCapabilities(capabilities, userB, vaultKey); }, row => { row.commerce_hash = '0'.repeat(64); }, row => { row.backup_hash = '0'.repeat(64); }]) {
    const b = await backend(); await b.handler(request({ action: 'link', ...capabilities }));
    await mutate(b.rows.get(userA));
    const response = await b.handler(request({ action: 'restore' })); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), new RegExp(`${capabilities.commerceToken}|${capabilities.backupToken}|${vaultKey}|private-service-secret|ciphertext|integrity`));
  }
});

test('IP quotas run before Auth, and verified-user quotas run before vault access', async () => {
  const ip = await backend({ ipQuota: false });
  const rejected = await ip.handler(request({ action: 'restore' })); assert.equal(rejected.status, 429); assert.equal(rejected.headers.get('retry-after'), '60');
  assert.equal(ip.calls.length, 1); assert.ok(ip.calls[0].url.endsWith('/rpc/customer_account_take_quota'));
  assert.ok(!String(ip.calls[0].init.body).includes('192.0.2.7'));
  const user = await backend({ userQuota: false }); assert.equal((await user.handler(request({ action: 'restore' }))).status, 429);
  assert.ok(user.calls.some(call => call.url.endsWith('/auth/v1/user'))); assert.ok(user.calls.every(call => !call.url.includes('/eva_customer_accounts?')));
});

test('foreign origins, invalid methods, query parameters and oversized bodies cannot reach storage', async () => {
  const b = await backend();
  assert.equal((await b.handler(request({ action: 'status' }, { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await b.handler(new Request('https://project.supabase.co/functions/v1/customer-account'))).status, 405);
  assert.equal((await b.handler(new Request('https://project.supabase.co/functions/v1/customer-account?token=private', { method: 'POST' }))).status, 400);
  assert.equal((await b.handler(request({ action: 'status', padding: 'x'.repeat(3000) }))).status, 413);
  assert.equal((await b.handler(request({ action: 'status' }, { 'content-type': 'text/plain' }))).status, 415);
  for (const action of ['delete', ['restore'], { restore: true }]) assert.equal((await b.handler(request({ action }))).status, 400);
  assert.equal(b.calls.length, 0);
});

test('disabled or unconfigured recovery and database outages preserve current connections', async () => {
  for (const environment of [{ EVA_ACCOUNT_ENABLED: 'false' }, { EVA_ACCOUNT_ENABLED: '' }, { EVA_ACCOUNT_VAULT_KEY: undefined }, { EVA_ACCOUNT_VAULT_KEY: 'invalid' }]) {
    const b = await backend({ environment }); assert.equal((await b.handler(request({ action: 'restore' }))).status, 503); assert.equal(b.calls.length, 0);
  }
  const b = await backend({ throwDatabase: true }); const failed = await b.handler(request({ action: 'restore' })); assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private-service-secret|database internals/); assert.equal(b.rows.size, 0);
  const authOutage = await backend({ authStatus: 503 }); assert.equal((await authOutage.handler(request({ action: 'status' }))).status, 503);
  assert.ok(authOutage.calls.every(call => !call.url.includes('/eva_customer_accounts?')));
  const badKey = await backend(); assert.equal((await badKey.handler(request({ action: 'status' }, { apikey: 'incorrect' }))).status, 401); assert.equal(badKey.calls.length, 0);
});

test('migration exposes no browser grants and links atomically without changing credits or journals', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261022071813_customer_recovery_vault.sql', import.meta.url), 'utf8');
  assert.match(sql, /user_id uuid primary key references auth\.users\(id\) on delete cascade/i);
  assert.match(sql, /commerce_hash text not null unique references public\.eva_wallets\(device_hash\)/i);
  assert.match(sql, /backup_hash text not null unique/i);
  for (const table of ['eva_customer_accounts', 'eva_account_quota']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  for (const name of ['customer_account_take_quota', 'customer_account_link']) assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon, authenticated`, 'i'));
  assert.doesNotMatch(sql, /security definer|grant[^;]+to (?:anon|authenticated)|update public\.eva_wallets|insert into public\.eva_credit_ledger|insert into public\.journal_documents|perform public\.commerce_wallet/i);
  assert.match(sql, /exception when unique_violation[\s\S]+v_row\.commerce_hash=p_commerce_hash and v_row\.backup_hash=p_backup_hash/i);
});
