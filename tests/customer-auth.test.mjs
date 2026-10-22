import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCustomerAuth, customerEmail, validCustomerCapabilities, CUSTOMER_AUTH_STORAGE_KEY, CUSTOMER_CODE_RESEND_SECONDS } from '../src/lib/customer-auth.ts';

const id = 'b327c953-cde1-4a27-8f46-1b8c53b47ba8';
const bearer = 'fixture.access-token.signature';
const email = 'eva@example.com';
const caps = { commerceToken: 'a'.repeat(64), backupToken: 'b'.repeat(64) };
const timestamp = '2026-10-22T03:00:00.000Z';
const config = { enabled: true, url: 'https://project.supabase.co', publishableKey: 'public-test' };
function fixture({ user = { id, email, email_confirmed_at: timestamp, is_anonymous: false }, authError = null, response = { linked: false, email, updatedAt: null }, responseStatus = 200, session = { access_token: bearer, user: { id } } } = {}) {
  const calls = [];
  const auth = {
    async getSession() { calls.push(['getSession']); return { data: { session }, error: null }; },
    async getUser(token) { calls.push(['getUser', token]); return { data: { user }, error: authError }; },
    async signInWithOtp(input) { calls.push(['sendCode', input]); return { error: authError }; },
    async verifyOtp(input) { calls.push(['verifyCode', input]); return { error: authError }; },
    async signOut(input) { calls.push(['signOut', input]); return { error: authError }; },
  };
  const fetcher = async (url, options) => { calls.push(['fetch', url, options]); return Response.json(response, { status: responseStatus }); };
  return { auth, calls, fetcher, client: createCustomerAuth(config, { auth, fetcher }) };
}

test('customer auth remains disabled until email delivery is explicitly activated', async () => {
  const f = fixture();
  for (const settings of [{ ...config, enabled: false }, { ...config, url: 'http://untrusted.example' }, { ...config, publishableKey: '' }]) {
    const disabled = createCustomerAuth(settings, { auth: f.auth, fetcher: f.fetcher });
    assert.equal(disabled.available, false);
    await assert.rejects(disabled.sendCode(email), error => error.code === 'disabled');
    await assert.rejects(disabled.currentIdentity(), error => error.code === 'disabled');
    await assert.rejects(disabled.status(bearer), error => error.code === 'disabled');
  }
  assert.deepEqual(f.calls, []);
  assert.equal(CUSTOMER_AUTH_STORAGE_KEY, 'eva-customer-auth-v1'); assert.equal(CUSTOMER_CODE_RESEND_SECONDS, 60);
});

test('email OTP is explicit and never starts link or restore automatically', async () => {
  const f = fixture();
  assert.equal(await f.client.sendCode(' EVA@Example.com '), email);
  assert.deepEqual(f.calls, [['sendCode', { email, options: { shouldCreateUser: true } }]]);
  assert.deepEqual(await f.client.verifyCode(email, '123456'), { user: { id, email }, accessToken: bearer });
  assert.deepEqual(f.calls.map(call => call[0]), ['sendCode', 'verifyCode', 'getSession', 'getUser']);
  assert.deepEqual(f.calls[1][1], { email, token: '123456', type: 'email' });
  assert.equal(f.calls[3][1], bearer);
});

test('identity is verified by Auth instead of editable metadata or stored session claims', async () => {
  for (const user of [
    { id, email, email_confirmed_at: null, user_metadata: { email_confirmed: true } },
    { id, email, email_confirmed_at: timestamp, is_anonymous: true },
    { id, email, email_confirmed_at: timestamp },
    { id: 'b327c953-cde1-4a27-8f46-1b8c53b47ba9', email, email_confirmed_at: timestamp },
    { id, email: 'not-an-email', email_confirmed_at: timestamp },
  ]) {
    const f = fixture({ user });
    await assert.rejects(f.client.currentIdentity(), error => error.code === 'auth');
    assert.equal(f.calls.filter(call => call[0] === 'fetch').length, 0);
  }
  const empty = fixture({ session: null }); assert.equal(await empty.client.currentIdentity(), null);
  assert.deepEqual(empty.calls, [['getSession']]);
});

test('bad addresses and non-code passwords never reach Supabase', async () => {
  const f = fixture();
  for (const value of ['nope', 'a@b', 'a b@example.com', 'x'.repeat(255) + '@example.com']) await assert.rejects(f.client.sendCode(value), error => error.code === 'email');
  for (const value of ['password123', '12345', '123456789', '123 456', '']) await assert.rejects(f.client.verifyCode(email, value), error => error.code === 'code');
  assert.deepEqual(f.calls, []);
  assert.equal(customerEmail(' Eva@Example.com '), email);
});

test('expired, rate-limited and failed sends do not report that a code arrived', async () => {
  for (const [code, expected] of [['otp_expired', 'expired'], ['over_email_send_rate_limit', 'rate_limit'], ['unexpected', 'auth']]) {
    const f = fixture({ authError: { code, message: 'private-token must not leak' } });
    await assert.rejects(f.client.sendCode(email), error => error.code === expected && !error.message.includes('private-token'));
    await assert.rejects(f.client.verifyCode(email, '123456'), error => error.code === expected);
  }
});

test('recovery requests send private credentials only in HTTPS headers or POST body', async () => {
  const f = fixture({ response: { linked: true, email, updatedAt: timestamp } });
  assert.deepEqual(await f.client.link(bearer, caps), { linked: true, email, updatedAt: timestamp });
  const [, url, request] = f.calls[0];
  assert.equal(url, 'https://project.supabase.co/functions/v1/customer-account');
  assert.ok(!url.includes(caps.commerceToken)); assert.equal(request.cache, 'no-store'); assert.equal(request.credentials, 'omit');
  assert.deepEqual(request.headers, { apikey: 'public-test', Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(request.body), { action: 'link', ...caps });
  const before = f.calls.length;
  await assert.rejects(f.client.status('not-a-token'), error => error.code === 'auth');
  await assert.rejects(f.client.link(bearer, { ...caps, backupToken: 'short' }), error => error.code === 'response');
  assert.equal(f.calls.length, before);
});

test('only complete server-confirmed connections can restore and extra data is rejected', async () => {
  const valid = fixture({ response: { linked: true, email, updatedAt: timestamp, ...caps } });
  assert.deepEqual(await valid.client.restore(bearer), { linked: true, email, updatedAt: timestamp, ...caps });
  assert.equal(await fixture().client.restore(bearer), null);
  for (const response of [
    { linked: true, email, updatedAt: timestamp, ...caps, backupToken: 'short' },
    { linked: true, email, updatedAt: timestamp, ...caps, userId: id },
    { linked: true, email, updatedAt: null, ...caps },
    { linked: false, email, updatedAt: null, ...caps },
    { linked: true, email: 'not-an-email', updatedAt: timestamp, ...caps },
    { linked: true, email, updatedAt: 'invalid', ...caps },
  ]) await assert.rejects(fixture({ response }).client.restore(bearer), error => error.code === 'response');
  assert.equal(validCustomerCapabilities(caps), true);
  assert.equal(validCustomerCapabilities({ ...caps, profile: 'must not upload' }), false);
});

test('status cannot leak capabilities and server failures remain actionable without internal details', async () => {
  await assert.rejects(fixture({ response: { linked: true, email, updatedAt: timestamp, ...caps } }).client.status(bearer), error => error.code === 'response');
  for (const [responseStatus, expected] of [[401, 'auth'], [403, 'auth'], [409, 'conflict'], [429, 'rate_limit'], [503, 'unavailable']]) {
    await assert.rejects(fixture({ responseStatus, response: { error: 'server secret ' + caps.commerceToken } }).client.status(bearer), error => error.code === expected && !error.message.includes(caps.commerceToken));
  }
});

test('slow auth and Edge requests stop waiting and never invent a successful result', async () => {
  const f = fixture();
  const auth = { ...f.auth, signInWithOtp: () => new Promise(() => {}) };
  await assert.rejects(createCustomerAuth(config, { auth, timeoutMs: 5 }).sendCode(email), error => error.code === 'network');
  const fetcher = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('private provider details'))));
  await assert.rejects(createCustomerAuth(config, { auth: f.auth, fetcher, timeoutMs: 5 }).status(bearer), error => error.code === 'network' && !error.message.includes('private provider'));
});

test('sign out is restricted to this customer session and reports failure', async () => {
  const f = fixture(); await f.client.signOut(); assert.deepEqual(f.calls, [['signOut', { scope: 'local' }]]);
  await assert.rejects(fixture({ authError: { message: 'failed' } }).client.signOut(), error => error.code === 'signout');
});

test('sign out cannot remove a different identity that signed in while disconnect was pending', async () => {
  const f = fixture();
  await assert.rejects(f.client.signOut('b327c953-cde1-4a27-8f46-1b8c53b47ba9'), error => error.code === 'changed');
  assert.equal(f.calls.some(call => call[0] === 'signOut'), false);
  const switched = fixture(); let reads = 0;
  const auth = { ...switched.auth, async getSession() { reads++; return { data: { session: { access_token: bearer, user: { id: reads === 1 ? id : 'b327c953-cde1-4a27-8f46-1b8c53b47ba9' } } }, error: null }; } };
  await assert.rejects(createCustomerAuth(config, { auth }).signOut(id), error => error.code === 'changed');
  assert.equal(switched.calls.some(call => call[0] === 'signOut'), false);
  const signedOut = fixture({ session: null }); await signedOut.client.signOut(id);
  assert.deepEqual(signedOut.calls.at(-1), ['signOut', { scope: 'local' }]);
});

test('customer UI gates saving behind consent and switches safely before local sign-out', async () => {
  const source = await readFile(new URL('../src/components/CustomerAccount.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!consent \|\| \(connectedEmail && connectedEmail !== identity\?\.user\.email\)\) return/);
  assert.match(source, /await beforeSwitch\(operation\.controller\.signal\); assertCurrent\(operation\);[\s\S]+await onDisconnect\(\);[\s\S]+await customerAuth\.signOut\(expectedUserId\)/);
  assert.match(source, /disabled=\{busy \|\| !consent\}/);
  assert.match(source, /Khôi phục tài khoản đã lưu/);
  assert.match(source, /Only successfully synced readings/);
  assert.match(source, /Balances are not added together/);
});
