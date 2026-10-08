import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cards } from '../src/data/tarot.ts';
import { readingCounts, readingLanguages } from '../src/data/spreads.ts';
import { buildHostedReadingPrompt } from './reading-prompt.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY_BYTES = 40_960;
class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export function validateReadingRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Please send a question and your chosen cards.');
  if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > 1_000) throw new HttpError(400, 'Your question should be between 1 and 1,000 characters.');
  if (typeof input.focus !== 'string' || !input.focus.trim() || input.focus.length > 80) throw new HttpError(400, 'Choose a focus of up to 80 characters.');
  if (!Array.isArray(input.cardIds) || !readingCounts.includes(input.cardIds.length) || input.cardIds.some((id) => !Number.isInteger(id) || !cards.some((card) => card.id === id)) || new Set(input.cardIds).size !== input.cardIds.length) {
    throw new HttpError(400, 'Choose a chat, one-card, three-card, five-card, or ten-card reading with different cards.');
  }
  if (input.language !== undefined && !readingLanguages.includes(input.language)) throw new HttpError(400, 'Choose a supported language.');
  if (input.history !== undefined && (!Array.isArray(input.history) || input.history.length > 8 || input.history.some((message) => !message || typeof message !== 'object' || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 3_500 || !message.content.trim()))) {
    throw new HttpError(400, 'Your conversation could not be read. Please begin a new reading.');
  }
  if (['followUp', 'continuation'].some(key => input[key] !== undefined && typeof input[key] !== 'boolean')) throw new HttpError(400, 'The conversation options could not be read. Please try again.');
  return {
    language: input.language ?? 'en',
    question: input.question.trim(),
    focus: input.focus.trim(),
    selectedCards: input.cardIds.map((id) => cards.find((card) => card.id === id)),
    history: (input.history ?? []).map(({ role, content }) => ({ role, content: content.trim() })),
    followUp: input.followUp ?? false,
    continuation: input.continuation ?? false,
  };
}

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new HttpError(415, 'Please send the reading as JSON.');
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) throw new HttpError(413, 'This conversation is too long. Please shorten your question.');
  // Vercel exposes a lazy, already-parsed body getter that can throw on bad JSON.
  let parsedBody;
  try { parsedBody = request.body; }
  catch { throw new HttpError(400, 'Your reading request could not be read. Please try again.'); }
  if (parsedBody !== undefined) {
    let serialized;
    try {
      serialized = typeof parsedBody === 'string' ? parsedBody : Buffer.isBuffer(parsedBody) ? parsedBody.toString('utf8') : JSON.stringify(parsedBody);
    } catch { throw new HttpError(400, 'Your reading request could not be read. Please try again.'); }
    if (typeof serialized !== 'string') throw new HttpError(400, 'Your reading request could not be read. Please try again.');
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) throw new HttpError(413, 'This conversation is too long. Please shorten your question.');
    try { return JSON.parse(serialized); }
    catch { throw new HttpError(400, 'Your reading request could not be read. Please try again.'); }
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'This conversation is too long. Please shorten your question.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Your reading request could not be read. Please try again.'); }
}

function checkOrigin(request) {
  const origin = request.headers.origin;
  const fetchSite = request.headers['sec-fetch-site'];
  if (fetchSite === 'cross-site') throw new HttpError(403, 'Please request a reading from the Eva Tarot app.');
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== request.headers.host) throw new Error('Origin mismatch');
  } catch { throw new HttpError(403, 'Please request a reading from the Eva Tarot app.'); }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function isWithin(directory, path) {
  const pathFromRoot = relative(directory, path);
  return !pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot);
}

async function serveStatic(request, response, pathname, distPath) {
  if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'This method is not supported.');
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'This address could not be read.'); }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some((part) => part === '..' || part.startsWith('.'))) throw new HttpError(404, 'This page was not found.');
  let target = resolve(distPath, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (!isWithin(distPath, target)) throw new HttpError(404, 'This page was not found.');
  try {
    if (!(await stat(target)).isFile()) throw new Error('Not a file');
  } catch {
    if (extname(decoded)) throw new HttpError(404, 'This file was not found.');
    target = resolve(distPath, 'index.html');
  }
  try {
    const [actualRoot, actualTarget] = await Promise.all([realpath(distPath), realpath(target)]);
    if (!isWithin(actualRoot, actualTarget)) throw new HttpError(404, 'This file was not found.');
    const body = await readFile(actualTarget);
    const isDocument = target.endsWith('.html') || target.endsWith('/sw.js') || target.endsWith('/service-worker.js');
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(target)] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': isDocument ? 'no-cache' : target.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(404, 'The app is not built yet. Run npm run build, then npm start.');
  }
}

function clientAddress(request, isVercel) {
  if (isVercel) {
    // Vercel replaces this header. Never trust generic forwarded headers locally.
    const forwarded = request.headers['x-vercel-forwarded-for'];
    const address = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
    if (isIP(address)) return address;
  }
  return request.socket?.remoteAddress ?? 'unknown';
}

async function getProvider({ apiKey, gatewayApiKey, oidcTokenProvider }, request) {
  if (apiKey) return { kind: 'openai', token: apiKey };
  if (gatewayApiKey) return { kind: 'gateway', token: gatewayApiKey };
  if (!oidcTokenProvider) return null;
  let timeout;
  try {
    const token = await Promise.race([
      Promise.resolve().then(() => oidcTokenProvider(request)),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Token timeout')), 3_000); }),
    ]);
    if (typeof token !== 'string' || !token.trim()) throw new Error('No token');
    return { kind: 'gateway', token: token.trim() };
  } catch {
    throw new HttpError(503, 'Online AI is not connected right now. Your conversation is saved; please try again later.', 'AI_CONFIGURATION');
  } finally {
    clearTimeout(timeout);
  }
}

function extractText(result, providerKind) {
  if (providerKind === 'gateway') {
    const choice = result?.choices?.[0];
    return choice?.finish_reason === 'stop' && typeof choice.message?.content === 'string' ? choice.message.content.trim() : '';
  }
  if (result?.status !== 'completed' || !Array.isArray(result.output)) return '';
  return result.output.flatMap((item) => item?.type === 'message' && Array.isArray(item.content) ? item.content.filter((part) => part?.type === 'output_text' && typeof part.text === 'string').map((part) => part.text) : []).join('\n\n').trim();
}

export function createRequestHandler({
  hostedAIEnabled = process.env.HOSTED_AI_ENABLED === 'true',
  apiKey = process.env.OPENAI_API_KEY?.trim() ?? '',
  model = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
  gatewayApiKey = process.env.AI_GATEWAY_API_KEY?.trim() ?? '',
  gatewayModel = process.env.AI_GATEWAY_MODEL?.trim() || 'openai/gpt-4.1-mini',
  oidcTokenProvider,
  isVercel = process.env.VERCEL === '1',
  routePath,
  fetchImpl = globalThis.fetch,
  distPath = resolve(projectRoot, 'dist'),
  rateLimit = 30,
  rateWindowMs = 10 * 60_000,
} = {}) {
  // This limit is instance-local; it is shared by requests in one warm function.
  const requestsByAddress = new Map();
  return async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    try {
      const pathname = routePath ?? new URL(request.url ?? '/', 'http://localhost').pathname;
      if (pathname === '/api/health') {
        if (request.method !== 'GET') throw new HttpError(405, 'This method is not supported.');
        if (hostedAIEnabled !== true) return sendJson(response, 200, { mode: 'disabled' });
        const provider = await getProvider({ apiKey, gatewayApiKey, oidcTokenProvider }, request);
        return sendJson(response, 200, { mode: provider ? 'ai' : 'unavailable' });
      }
      if (pathname !== '/api/reading') {
        if (pathname.startsWith('/api/')) throw new HttpError(404, 'This API route was not found.');
        return await serveStatic(request, response, pathname, distPath);
      }
      if (request.method !== 'POST') throw new HttpError(405, 'Please submit your question using the reading form.');
      checkOrigin(request);
      if (hostedAIEnabled !== true) throw new HttpError(503, 'Online AI is not enabled yet. Your conversation is saved; please try again later.', 'AI_DISABLED');
      const now = Date.now();
      for (const [address, entry] of requestsByAddress) if (entry.resetAt <= now) requestsByAddress.delete(address);
      const address = clientAddress(request, isVercel);
      const usage = requestsByAddress.get(address) ?? { count: 0, resetAt: now + rateWindowMs };
      if (usage.count >= rateLimit || (!requestsByAddress.has(address) && requestsByAddress.size >= 10_000)) {
        return sendJson(response, 429, { error: 'You have made several readings recently. Please take a little pause and try again shortly.' }, { 'Retry-After': String(Math.max(1, Math.ceil((usage.resetAt - now) / 1_000))) });
      }
      usage.count += 1;
      requestsByAddress.set(address, usage);
      const input = validateReadingRequest(await readJson(request));
      const provider = await getProvider({ apiKey, gatewayApiKey, oidcTokenProvider }, request);
      if (!provider) throw new HttpError(503, 'Online AI is not connected right now. Your conversation is saved; please try again later.', 'AI_CONFIGURATION');

      const { instructions, messages, maxTokens } = buildHostedReadingPrompt(input);
      const isGateway = provider.kind === 'gateway';
      const body = isGateway ? {
        model: gatewayModel,
        store: false,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: instructions }, ...messages],
      } : {
        model,
        store: false,
        max_output_tokens: maxTokens,
        instructions,
        input: messages,
      };
      let upstream;
      const signal = AbortSignal.timeout(75_000);
      try {
        upstream = await fetchImpl(isGateway ? 'https://ai-gateway.vercel.sh/v1/chat/completions' : 'https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: `Bearer ${provider.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
      } catch {
        throw new HttpError(503, signal.aborted ? 'Online AI took too long to respond. Your conversation is saved; please try again.' : 'Online AI could not connect just now. Your conversation is saved; please try again in a moment.', signal.aborted ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE');
      }
      if (!upstream.ok) {
        // Classify known provider conditions without exposing response text,
        // credentials, account IDs, request IDs or internal diagnostics.
        let providerCode;
        try { const problem = await upstream.json(); providerCode = problem?.error?.code ?? problem?.error?.type; } catch { /* A non-JSON provider failure stays generic. */ }
        if (upstream.status === 402 || ['insufficient_quota', 'billing_error', 'billing_hard_limit_reached'].includes(providerCode)) throw new HttpError(503, 'Online AI is temporarily unavailable because its service credits need attention. Your conversation is saved; please try again later.', 'AI_BILLING');
        if ([401, 403, 404].includes(upstream.status)) throw new HttpError(503, 'Online AI is not connected right now. Your conversation is saved; please try again later.', 'AI_CONFIGURATION');
        throw new HttpError(503, 'Online AI is busy or temporarily unavailable. Your conversation is saved; please try again in a moment.', 'AI_UNAVAILABLE');
      }
      let result;
      try { result = await upstream.json(); }
      catch { throw new HttpError(502, 'The AI service returned an unexpected response. Your conversation is saved; please try again.', 'AI_UNAVAILABLE'); }
      const text = extractText(result, provider.kind);
      if (!text) throw new HttpError(502, 'Your AI reading was incomplete. Your conversation is saved; please try again in a moment.', 'AI_INCOMPLETE');
      return sendJson(response, 200, { mode: 'ai', text });
    } catch (error) {
      if (!response.headersSent) sendJson(response, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Something interrupted your reading. Please try again.', ...(error instanceof HttpError && error.code ? { code: error.code } : {}) });
      else response.end();
    }
  };
}

export function createApp(options = {}) {
  const server = createServer(createRequestHandler(options));
  server.requestTimeout = 90_000;
  server.headersTimeout = 15_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port number.');
  const server = createApp();
  server.on('error', (error) => { console.error(`Eva Tarot could not start: ${error.message}`); process.exitCode = 1; });
  server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Eva Tarot is ready at http://localhost:${port} (${process.env.HOSTED_AI_ENABLED !== 'true' ? 'hosted AI disabled' : process.env.OPENAI_API_KEY?.trim() || process.env.AI_GATEWAY_API_KEY?.trim() ? 'hosted AI' : 'guided demo'} mode).`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
}
