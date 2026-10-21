import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestHandler } from '../server/index.mjs';
import { CommerceError } from '../server/commerce-proxy.mjs';

const deviceToken = 'c'.repeat(64);
const requestId = '1d2e102b-a692-484e-8ab3-c83ef0ea75b1';
const reading = {
  question: 'I cannot work late. How can I explain my workload to my manager?',
  focus: 'Career', cardIds: [1, 8, 17], language: 'en',
};
const answer = { mode: 'ai', text: 'Ask which task should move to tomorrow instead of agreeing to overtime.' };
const gatewayResult = { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: answer.text } }] };

function fixture({ reservation = { required: true, allowed: true, status: 'reserved', configured: true }, ...overrides } = {}) {
  const calls = { reserve: [], finish: [], refund: [], recordCompleted: [], upstream: [] };
  const commerceClient = {
    async reserve(input) { calls.reserve.push(input); return reservation; },
    async finish(input) { calls.finish.push(input); return { ok: true }; },
    async refund(input) { calls.refund.push(input); return { ok: true }; },
    async recordCompleted(input) { calls.recordCompleted.push(input); return { ok: true }; },
    ...overrides.commerceClient,
  };
  const handle = createRequestHandler({
    hostedAIEnabled: true, apiKey: '', gatewayApiKey: 'synthetic-gateway-key', isVercel: false,
    fetchImpl: async (url, options) => { calls.upstream.push({ url, options }); return Response.json(gatewayResult); },
    ...overrides, commerceClient,
  });
  return { handle, calls };
}

async function invoke(handle, overrides = {}) {
  const request = {
    url: '/api/reading', method: 'POST', body: reading,
    headers: {
      host: 'eva.example', origin: 'https://eva.example', 'content-type': 'application/json',
      'x-eva-device': deviceToken, 'x-eva-request': requestId,
    },
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
  const response = {
    statusCode: 200, headers: {}, headersSent: false, rawBody: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) {
      this.statusCode = status;
      for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
      this.headersSent = true;
    },
    end(body) { this.rawBody = body ?? ''; },
  };
  await handle(request, response);
  return { status: response.statusCode, headers: response.headers, body: JSON.parse(response.rawBody) };
}

test('paid reading reserves the validated input and finalizes before returning an answer', async () => {
  const { handle, calls } = fixture();
  const result = await invoke(handle);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, answer);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(calls.reserve.length, 1);
  assert.equal(calls.finish.length, 1);
  assert.equal(calls.upstream.length, 1);
  assert.equal(calls.refund.length, 0);
  assert.equal(calls.recordCompleted.length, 0, 'paid finalization already records completion');
  const reserved = calls.reserve[0];
  assert.equal(reserved.deviceToken, deviceToken);
  assert.equal(reserved.requestId, requestId);
  assert.equal(reserved.clientAddress, '127.0.0.1');
  assert.equal(reserved.input.question, reading.question);
  assert.deepEqual(reserved.input.selectedCards.map(card => card.id), reading.cardIds);
  assert.ok(reserved.signal instanceof AbortSignal);
  assert.deepEqual(calls.finish[0].response, answer);
  assert.equal(calls.finish[0].signal, reserved.signal, 'credit finalization shares the overall deadline');
});

test('an empty wallet returns a useful 402 without calling the model or refunding', async () => {
  const { handle, calls } = fixture({ commerceClient: {
    async reserve(input) { calls.reserve.push(input); throw new CommerceError(402, 'Choose a package to continue.', 'credits_required'); },
  } });
  const result = await invoke(handle);
  assert.equal(result.status, 402);
  assert.equal(result.body.code, 'credits_required');
  assert.equal(result.body.creditStatus, undefined);
  assert.equal(calls.reserve.length, 1);
  assert.equal(calls.upstream.length, 0);
  assert.equal(calls.finish.length, 0);
  assert.equal(calls.refund.length, 0);
});

test('a completed reservation returns its private cached answer without another model call or debit', async () => {
  const cachedAnswer = { mode: 'ai', text: 'This is the answer completed during the earlier attempt.' };
  const { handle, calls } = fixture({ reservation: { required: true, allowed: true, status: 'completed', response: cachedAnswer } });
  const result = await invoke(handle);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, cachedAnswer);
  assert.equal(calls.reserve.length, 1);
  assert.equal(calls.upstream.length, 0);
  assert.equal(calls.finish.length, 0);
  assert.equal(calls.refund.length, 0);
});

test('an invalid cached answer does not trigger a new paid model call', async () => {
  const { handle, calls } = fixture({ reservation: { required: true, allowed: true, status: 'completed', response: { mode: 'ai', text: '   ' } } });
  const result = await invoke(handle);
  assert.equal(result.status, 502);
  assert.equal(result.body.code, 'AI_INCOMPLETE');
  assert.equal(calls.upstream.length, 0);
  assert.equal(calls.finish.length, 0);
  assert.equal(calls.refund.length, 0);
});

test('provider connection failure refunds a reserved credit once', async () => {
  const { handle, calls } = fixture({ fetchImpl: async () => { throw new Error('Synthetic connection failure'); } });
  const result = await invoke(handle);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'AI_UNAVAILABLE');
  assert.equal(result.body.creditStatus, 'refunded');
  assert.equal(calls.finish.length, 0);
  assert.equal(calls.refund.length, 1);
  assert.equal(calls.refund[0].deviceToken, deviceToken);
  assert.equal(calls.refund[0].requestId, requestId);
  assert.equal(calls.refund[0].clientAddress, '127.0.0.1');
  assert.ok(calls.refund[0].signal instanceof AbortSignal);
});

test('a truncated model answer never consumes a paid credit', async () => {
  const { handle, calls } = fixture({ fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: 'Unfinished answer' } }] }) });
  const result = await invoke(handle);
  assert.equal(result.status, 502);
  assert.equal(result.body.code, 'AI_INCOMPLETE');
  assert.equal(result.body.creditStatus, 'refunded');
  assert.equal(calls.finish.length, 0);
  assert.equal(calls.refund.length, 1);
  assert.equal(JSON.stringify(result.body).includes('Unfinished answer'), false);
});

test('failed finalization does not return an answer whose credit outcome is unknown', async () => {
  const { handle, calls } = fixture({ commerceClient: {
    async finish(input) { calls.finish.push(input); throw new CommerceError(503, 'Could not save the result.'); },
  } });
  const result = await invoke(handle);
  assert.equal(result.status, 503);
  assert.equal(result.body.mode, undefined);
  assert.equal(result.body.text, undefined);
  assert.equal(result.body.creditStatus, 'refunded');
  assert.equal(calls.finish.length, 1);
  assert.equal(calls.refund.length, 1);
});

test('failed refund is pending, so an ambiguous completion can safely be retried', async () => {
  const { handle, calls } = fixture({ commerceClient: {
    async finish(input) { calls.finish.push(input); throw new CommerceError(503, 'Finalization response was lost.'); },
    async refund(input) { calls.refund.push(input); throw new CommerceError(503, 'Recovery is unavailable.'); },
  } });
  const result = await invoke(handle);
  assert.equal(result.status, 503);
  assert.equal(result.body.creditStatus, 'pending');
  assert.equal(calls.refund.length, 1);
});

test('a refused refund never claims the credit was restored after a possibly completed save', async () => {
  const { handle, calls } = fixture({ commerceClient: {
    async finish(input) { calls.finish.push(input); throw new CommerceError(503, 'Finalization response was lost.'); },
    async refund(input) { calls.refund.push(input); return { ok: false }; },
  } });
  const result = await invoke(handle);
  assert.equal(result.status, 503);
  assert.equal(result.body.creditStatus, 'pending');
  assert.equal(calls.refund.length, 1);
});

test('free configured readings record completion as best effort and share the overall deadline', async () => {
  const { handle, calls } = fixture({ reservation: { required: false, allowed: true, configured: true } });
  const result = await invoke(handle);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, answer);
  assert.equal(calls.recordCompleted.length, 1);
  const analytics = calls.recordCompleted[0];
  assert.equal(analytics.requestId, requestId);
  assert.equal(analytics.deviceToken, deviceToken);
  assert.equal(analytics.clientAddress, '127.0.0.1');
  assert.ok(analytics.signal instanceof AbortSignal, 'best-effort analytics must have a deadline');
  assert.equal(calls.finish.length, 0);
  assert.equal(calls.refund.length, 0);
});

test('free analytics failure preserves a completed reading and cannot trigger a credit refund', async () => {
  const { handle, calls } = fixture({
    reservation: { required: false, allowed: true, configured: true },
    commerceClient: { async recordCompleted(input) { calls.recordCompleted.push(input); throw new Error('Synthetic analytics outage'); } },
  });
  const result = await invoke(handle);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, answer);
  assert.equal(calls.recordCompleted.length, 1);
  assert.equal(calls.refund.length, 0);
});

test('unconfigured free readings skip commerce analytics', async () => {
  const { handle, calls } = fixture({ reservation: { required: false, allowed: true, configured: false } });
  assert.equal((await invoke(handle)).status, 200);
  assert.equal(calls.recordCompleted.length, 0);
});

test('invalid input and missing model credentials cannot reserve a reading credit', async () => {
  const invalid = fixture();
  assert.equal((await invoke(invalid.handle, { body: { ...reading, cardIds: [1, 1, 1] } })).status, 400);
  assert.equal(invalid.calls.reserve.length, 0);
  const disconnected = fixture({ gatewayApiKey: '' });
  assert.equal((await invoke(disconnected.handle)).status, 503);
  assert.equal(disconnected.calls.reserve.length, 0);
});

test('Vercel client address used for quota is forwarded to commerce rather than an untrusted browser header', async () => {
  const { handle, calls } = fixture({ isVercel: true });
  const result = await invoke(handle, { headers: {
    host: 'eva.example', origin: 'https://eva.example', 'content-type': 'application/json',
    'x-eva-device': deviceToken, 'x-eva-request': requestId,
    'x-vercel-forwarded-for': '203.0.113.5, 10.0.0.2', 'x-forwarded-for': '198.51.100.9',
    'x-eva-client-ip': '198.51.100.10',
  } });
  assert.equal(result.status, 200);
  assert.equal(calls.reserve[0].clientAddress, '203.0.113.5');
  assert.equal(calls.finish[0].clientAddress, '203.0.113.5');
});
