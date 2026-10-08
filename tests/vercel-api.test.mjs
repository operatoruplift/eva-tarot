import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequestHandler } from '../server/index.mjs';

const reading = { question: 'What can help me move forward thoughtfully?', focus: 'Personal growth', cardIds: [1, 8, 17] };
const gatewayResult = { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'A thoughtful, grounded reflection.' } }] };

function handler(options = {}) {
  return createRequestHandler({
    hostedAIEnabled: true, apiKey: '', gatewayApiKey: '', isVercel: false,
    fetchImpl: async () => { throw new Error('Unexpected network request in test'); },
    ...options,
  });
}

async function invoke(handle, overrides = {}) {
  const request = {
    url: '/api/reading', method: 'POST', body: reading,
    headers: { host: 'evara.example', origin: 'https://evara.example', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
  const response = {
    statusCode: 200, headers: {}, headersSent: false, rawBody: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.statusCode = status; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value); this.headersSent = true; },
    end(body) { this.rawBody = body ?? ''; },
  };
  await handle(request, response);
  return { status: response.statusCode, headers: response.headers, body: JSON.parse(response.rawBody) };
}

test('provider credentials and OIDC never activate hosted AI without explicit opt-in', async () => {
  const previous = process.env.HOSTED_AI_ENABLED;
  let upstreamCalls = 0;
  let tokenCalls = 0;
  try {
    for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
      if (flag === undefined) delete process.env.HOSTED_AI_ENABLED;
      else process.env.HOSTED_AI_ENABLED = flag;
      for (const credentials of [{ apiKey: 'test-openai' }, { gatewayApiKey: 'test-gateway' }, {}]) {
        const handle = createRequestHandler({
          apiKey: '', gatewayApiKey: '', ...credentials,
          oidcTokenProvider: async () => { tokenCalls += 1; return 'test-token'; },
          fetchImpl: async () => { upstreamCalls += 1; return Response.json(gatewayResult); },
        });
        const readingResult = await invoke(handle);
        assert.equal(readingResult.status, 503);
        assert.match(readingResult.body.error, /Hosted readings are not enabled/);
        assert.deepEqual((await invoke(handle, { url: '/api/health', method: 'GET' })).body, { mode: 'disabled' });
      }
    }
    assert.equal(tokenCalls, 0);
    assert.equal(upstreamCalls, 0);
    process.env.HOSTED_AI_ENABLED = 'true';
    const enabled = createRequestHandler({ apiKey: '', gatewayApiKey: 'test-key', fetchImpl: async () => {
      upstreamCalls += 1;
      return Response.json(gatewayResult);
    } });
    assert.equal((await invoke(enabled)).status, 200);
    assert.equal(upstreamCalls, 1);
  } finally {
    if (previous === undefined) delete process.env.HOSTED_AI_ENABLED;
    else process.env.HOSTED_AI_ENABLED = previous;
  }
});

test('Vercel and local responses apply the same framing and embedded-content protection', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const headers = config.headers.find((rule) => rule.source === '/(.*)').headers;
  const response = await invoke(handler({ hostedAIEnabled: false }));
  for (const { key, value } of headers) assert.equal(response.headers[key.toLowerCase()], value);
  assert.equal(response.headers['content-security-policy'], "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  assert.equal(response.headers['x-frame-options'], 'DENY');
});

test('serverless handler accepts Vercel parsed JSON without attempting to reread the stream', async () => {
  const result = await invoke(handler());
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { mode: 'demo' });
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal((await invoke(handler(), { body: JSON.stringify(reading) })).status, 200);
  assert.equal((await invoke(handler(), { body: Buffer.from(JSON.stringify(reading)) })).status, 200);
});

test('parsed bodies keep byte limits, invalid JSON handling, and shape validation', async () => {
  for (const [body, status] of [
    [{ ...reading, extra: 'x'.repeat(41_000) }, 413],
    [{ ...reading, extra: '🌸'.repeat(11_000) }, 413],
    ['{malformed', 400],
    [null, 400],
    [{ ...reading, cardIds: [1, 1] }, 400],
  ]) assert.equal((await invoke(handler(), { body })).status, status);
  const circular = {}; circular.self = circular;
  assert.equal((await invoke(handler(), { body: circular })).status, 400);
  const badGetter = new Proxy({ url: '/api/reading', method: 'POST', headers: { 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' } }, {
    get(target, key) { if (key === 'body') throw new SyntaxError('Internal parser details'); return target[key]; },
  });
  let received;
  await handler()(badGetter, { headersSent: false, setHeader() {}, writeHead(status) { received = { status }; }, end(body) { received.body = JSON.parse(body); } });
  assert.equal(received.status, 400);
  assert.doesNotMatch(received.body.error, /Internal parser details/);
});

test('gateway key uses chat completions with trusted cards and the requested conversation', async () => {
  let captured;
  const handle = handler({ gatewayApiKey: 'test-gateway-key', fetchImpl: async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return Response.json(gatewayResult);
  } });
  const result = await invoke(handle, { body: { ...reading, history: [{ role: 'user', content: 'My earlier question' }] } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { mode: 'ai', text: 'A thoughtful, grounded reflection.' });
  assert.equal(captured.url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-gateway-key');
  assert.equal(captured.body.model, 'openai/gpt-4.1-mini');
  assert.equal(captured.body.store, false);
  assert.equal(captured.body.max_tokens, 1_300);
  assert.equal(captured.body.messages[0].role, 'system');
  assert.match(captured.body.messages[0].content, /The Magician/);
  assert.match(captured.body.messages[0].content, /Strength/);
  assert.equal(captured.body.messages[1].content, 'My earlier question');
  assert.equal(JSON.parse(captured.body.messages.at(-1).content).question, reading.question);
  assert.ok(captured.options.signal instanceof AbortSignal);
});

test('general chat sends no invented card context and follows the chosen response language', async () => {
  let captured;
  const result = await invoke(handler({ gatewayApiKey: 'test-gateway-key', fetchImpl: async (_url, options) => {
    captured = JSON.parse(options.body);
    return Response.json(gatewayResult);
  } }), { body: { ...reading, cardIds: [], language: 'vi' } });
  assert.equal(result.status, 200);
  assert.match(captured.messages[0].content, /Respond entirely in Vietnamese/);
  assert.match(captured.messages[0].content, /No cards were drawn\. This is a general conversation/);
  assert.doesNotMatch(captured.messages[0].content, /The Magician|Strength|The Star/);
  assert.equal(captured.max_tokens, 1_300);
});

test('in-depth AI reading receives ten distinct positioned cards and enough output budget', async () => {
  let captured;
  const result = await invoke(handler({ gatewayApiKey: 'test-gateway-key', fetchImpl: async (_url, options) => {
    captured = JSON.parse(options.body);
    return Response.json(gatewayResult);
  } }), { body: { ...reading, cardIds: Array.from({ length: 10 }, (_, index) => index), language: 'ja' } });
  assert.equal(result.status, 200);
  const instruction = captured.messages[0].content;
  assert.match(instruction, /Respond entirely in Japanese/);
  assert.match(instruction, /in-depth Celtic Cross/);
  assert.match(instruction, /1\. Your present situation — The Fool/);
  assert.match(instruction, /2\. The crossing influence — The Magician/);
  assert.match(instruction, /10\. A possible direction — The Hermit/);
  assert.equal(captured.max_tokens, 2_500);
  assert.equal((await invoke(handler(), { body: { ...reading, cardIds: [], language: 'unsupported' } })).status, 400);
});

test('direct OpenAI wins over gateway credentials and avoids resolving an OIDC token', async () => {
  let endpoint;
  let authorization;
  const result = await invoke(handler({
    apiKey: 'test-openai-key', gatewayApiKey: 'test-gateway-key',
    oidcTokenProvider: () => { throw new Error('OIDC must not be called'); },
    fetchImpl: async (url, options) => {
      endpoint = url; authorization = options.headers.Authorization;
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Direct reading.' }] }] });
    },
  }));
  assert.equal(result.status, 200);
  assert.equal(endpoint, 'https://api.openai.com/v1/responses');
  assert.equal(authorization, 'Bearer test-openai-key');
});

test('OIDC is resolved afresh for every reading and a gateway key takes precedence', async () => {
  const authorization = [];
  let tokenCalls = 0;
  const handle = handler({
    isVercel: true,
    oidcTokenProvider: async (request) => { assert.equal(request.method, 'POST'); tokenCalls += 1; return `request-token-${tokenCalls}`; },
    fetchImpl: async (_url, options) => { authorization.push(options.headers.Authorization); return Response.json(gatewayResult); },
  });
  assert.equal((await invoke(handle)).status, 200);
  assert.equal((await invoke(handle)).status, 200);
  assert.equal(tokenCalls, 2);
  assert.deepEqual(authorization, ['Bearer request-token-1', 'Bearer request-token-2']);
  const withKey = handler({ gatewayApiKey: 'test-key', oidcTokenProvider: () => { throw new Error('OIDC must not be called'); }, fetchImpl: async () => Response.json(gatewayResult) });
  assert.equal((await invoke(withKey)).status, 200);
});

test('gateway and OIDC failures remain explicit without returning credentials or provider details', async () => {
  const failures = [
    async () => Response.json({ error: 'secret upstream diagnostics' }, { status: 401 }),
    async () => Response.json({ error: 'secret upstream diagnostics' }, { status: 402 }),
    async () => Response.json({ error: 'secret upstream diagnostics' }, { status: 429 }),
    async () => { throw new Error('secret upstream diagnostics'); },
    async () => new Response('not JSON', { status: 200 }),
    async () => Response.json({ choices: [] }),
    async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: 'Truncated' } }] }),
    async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: null } }] }),
    async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: ' ' } }] }),
  ];
  for (const fetchImpl of failures) {
    const result = await invoke(handler({ gatewayApiKey: 'secret-test-key', fetchImpl }));
    assert.ok(result.status >= 500);
    assert.equal(result.body.mode, undefined);
    assert.doesNotMatch(result.body.error, /secret|diagnostics|not JSON/);
  }
  for (const oidcTokenProvider of [async () => { throw new Error('secret OIDC details'); }, async () => '', async () => null]) {
    const result = await invoke(handler({ oidcTokenProvider }));
    assert.equal(result.status, 503);
    assert.doesNotMatch(result.body.error, /secret|OIDC/);
  }
});

test('health mode reflects configured gateway credentials without making a model request', async () => {
  assert.deepEqual((await invoke(handler({ gatewayApiKey: 'test-key' }), { url: '/api/health', method: 'GET' })).body, { mode: 'ai' });
  let calls = 0;
  const health = handler({ routePath: '/api/health', oidcTokenProvider: async () => { calls += 1; return 'request-token'; } });
  assert.deepEqual((await invoke(health, { method: 'GET' })).body, { mode: 'ai' });
  assert.equal(calls, 1);
  assert.equal((await invoke(health)).status, 405);
});

test('rate limits trust Vercel client addresses only in the Vercel runtime', async () => {
  const headers = (address) => ({ host: 'evara.example', origin: 'https://evara.example', 'content-type': 'application/json', 'x-vercel-forwarded-for': address, 'x-forwarded-for': address });
  const local = handler({ rateLimit: 1 });
  assert.equal((await invoke(local, { headers: headers('203.0.113.1') })).status, 200);
  assert.equal((await invoke(local, { headers: headers('203.0.113.2') })).status, 429);
  const vercel = handler({ rateLimit: 1, isVercel: true });
  assert.equal((await invoke(vercel, { headers: headers('203.0.113.1') })).status, 200);
  assert.equal((await invoke(vercel, { headers: headers('203.0.113.2') })).status, 200);
  assert.equal((await invoke(vercel, { headers: headers('203.0.113.1') })).status, 429);
  const invalid = handler({ rateLimit: 1, isVercel: true });
  assert.equal((await invoke(invalid, { headers: headers('invalid-1') })).status, 200);
  assert.equal((await invoke(invalid, { headers: headers('invalid-2') })).status, 429);
});

test('serverless requests preserve same-origin protection', async () => {
  const result = await invoke(handler(), { headers: { host: 'evara.example', origin: 'https://attacker.example', 'content-type': 'application/json' } });
  assert.equal(result.status, 403);
});

test('thin Vercel entrypoints export callable handlers without listening or requiring local credentials', async () => {
  const keys = ['HOSTED_AI_ENABLED', 'OPENAI_API_KEY', 'AI_GATEWAY_API_KEY', 'AI_GATEWAY_ENABLED', 'VERCEL'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    const { default: readingHandler } = await import('../api/reading.mjs?local-test');
    const { default: healthHandler } = await import('../api/health.mjs?local-test');
    assert.equal((await invoke(readingHandler)).status, 503);
    assert.deepEqual((await invoke(healthHandler, { method: 'GET' })).body, { mode: 'disabled' });
    process.env.VERCEL = '1';
    process.env.AI_GATEWAY_ENABLED = 'false';
    const { default: deployedReading } = await import('../api/reading.mjs?deployed-no-gateway-test');
    const { default: deployedHealth } = await import('../api/health.mjs?deployed-no-gateway-test');
    assert.equal((await invoke(deployedReading)).status, 503);
    assert.deepEqual((await invoke(deployedHealth, { method: 'GET' })).body, { mode: 'disabled' });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
