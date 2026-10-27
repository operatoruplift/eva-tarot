import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CommerceError, confirmRemoteTransfer } from './commerce-proxy.mjs';
import { getSharedLocalCommerce, localCommerceEnabled } from './local-commerce.mjs';

const REFERENCE = /EVA[A-F0-9]{12}/;
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function paymentWebhookConfig(env = process.env) {
  const provider = String(env.PAYMENT_WEBHOOK_PROVIDER || '').trim().toLowerCase();
  const sepayKey = String(env.SEPAY_WEBHOOK_API_KEY || '').trim();
  const payos = {
    clientId: String(env.PAYOS_CLIENT_ID || '').trim(),
    apiKey: String(env.PAYOS_API_KEY || '').trim(),
    checksumKey: String(env.PAYOS_CHECKSUM_KEY || '').trim(),
  };
  const sepayReady = sepayKey.length >= 8;
  const payosReady = payos.checksumKey.length >= 8;
  const configured = provider === 'sepay' ? sepayReady : provider === 'payos' ? payosReady : (provider === '' && (sepayReady || payosReady));
  return { provider, sepayKey, payos, sepayReady, payosReady, configured };
}

/** payOS signs the data object with HMAC-SHA256 over sorted key=value pairs. */
export function payosSignature(data, checksumKey) {
  const raw = Object.keys(data).filter(key => key !== 'signature').sort()
    .map(key => `${key}=${data[key] === undefined || data[key] === null ? '' : data[key]}`).join('&');
  return createHmac('sha256', checksumKey).update(raw).digest('hex');
}

function sameSecret(provided, expected) {
  const left = createHash('sha256').update(String(provided)).digest();
  const right = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(left, right);
}

export function findTransferReference(...parts) {
  const match = parts.filter(part => part !== undefined && part !== null).join(' ').toUpperCase().match(REFERENCE);
  return match ? match[0] : '';
}

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const value = headers[name] ?? headers[name.toLowerCase()] ?? '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function ignored(reason) { return { ok: true, ignored: true, status: 200, body: { ok: true, ignored: true, reason } }; }
function rejected(status, error) { return { ok: false, status, body: { error } }; }

/**
 * Verifies a SePay or payOS bank-transfer callback. Missing keys never confirm a payment.
 * Returns a match only when the signature checks out and the memo is one of our orders.
 */
export function interpretPaymentWebhook(env, headers, body) {
  const config = paymentWebhookConfig(env);
  if (!config.configured) return rejected(501, 'Automatic payment confirmation is not configured. Confirm transfers in the owner dashboard.');
  if (!record(body)) return rejected(400, 'The payment notification could not be read.');
  const authorization = header(headers, 'authorization');
  const apikey = authorization.match(/^Apikey\s+(\S+)$/i)?.[1] || '';
  const useSepay = config.provider === 'sepay' || (config.provider === '' && config.sepayReady && (apikey || !body.signature && !record(body.data)));
  const usePayos = config.provider === 'payos' || (config.provider === '' && !useSepay && config.payosReady);
  if (config.provider === 'sepay' && !config.sepayReady) return rejected(501, 'Automatic payment confirmation is not configured. Confirm transfers in the owner dashboard.');
  if (config.provider === 'payos' && !config.payosReady) return rejected(501, 'Automatic payment confirmation is not configured. Confirm transfers in the owner dashboard.');
  if (useSepay) {
    if (!config.sepayReady) return rejected(501, 'Automatic payment confirmation is not configured. Confirm transfers in the owner dashboard.');
    if (!apikey || !sameSecret(apikey, config.sepayKey)) return rejected(401, 'The payment notification could not be verified.');
    if (String(body.transferType || '').toLowerCase() === 'out') return ignored('outgoing transfer');
    const amountVnd = Number(body.transferAmount);
    if (!Number.isSafeInteger(amountVnd) || amountVnd < 1) return rejected(400, 'The transfer amount could not be read.');
    const reference = findTransferReference(body.content, body.code, body.description);
    if (!reference) return ignored('no Eva transfer memo');
    const externalId = String(body.id ?? body.referenceCode ?? '').slice(0, 120);
    return { ok: true, provider: 'sepay', reference, amountVnd, externalId };
  }
  if (usePayos) {
    const data = record(body.data) ? body.data : null;
    const signature = typeof body.signature === 'string' ? body.signature : typeof data?.signature === 'string' ? data.signature : '';
    if (!data || !/^[a-f0-9]{64}$/i.test(signature)) return rejected(401, 'The payment notification could not be verified.');
    const expected = payosSignature(data, config.payos.checksumKey);
    if (!sameSecret(signature.toLowerCase(), expected.toLowerCase())) return rejected(401, 'The payment notification could not be verified.');
    if (body.code !== undefined && String(body.code) !== '00') return ignored('payment not successful');
    const amountVnd = Number(data.amount);
    if (!Number.isSafeInteger(amountVnd) || amountVnd < 1) return rejected(400, 'The transfer amount could not be read.');
    const reference = findTransferReference(data.description, data.code, body.description);
    if (!reference) return ignored('no Eva transfer memo');
    const externalId = String(data.reference || data.paymentLinkId || data.orderCode || '').slice(0, 120);
    return { ok: true, provider: 'payos', reference, amountVnd, externalId };
  }
  return rejected(501, 'Automatic payment confirmation is not configured. Confirm transfers in the owner dashboard.');
}

function remoteConfigured(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(header(request.headers, 'content-type'))) {
    const error = new Error('Please send JSON.'); error.status = 415; throw error;
  }
  if (Number(header(request.headers, 'content-length')) > 32768) {
    const error = new Error('This request is too large.'); error.status = 413; throw error;
  }
  if (request.body !== undefined && request.body !== null && typeof request.body !== 'string' && !Buffer.isBuffer(request.body)) {
    return request.body;
  }
  const parts = [];
  let length = 0;
  for await (const part of request) {
    length += part.length;
    if (length > 32768) { const error = new Error('This request is too large.'); error.status = 413; throw error; }
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { const error = new Error('The payment notification could not be read.'); error.status = 400; throw error; }
}

export function createPaymentWebhookHandler(options = {}) {
  const env = options.env ?? process.env;
  return async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(body));
    };
    try {
      if (request.method !== 'POST') return send(405, { error: 'Method not allowed.' });
      const payload = await readJson(request);
      const interpreted = interpretPaymentWebhook(env, request.headers, payload);
      if (!interpreted.ok || interpreted.ignored) return send(interpreted.status, interpreted.body);
      const confirm = options.confirm ?? (async payment => {
        if (localCommerceEnabled(env) && !remoteConfigured(env)) return getSharedLocalCommerce(env).confirmByReference(payment);
        if (!remoteConfigured(env)) return { status: 503, body: { error: 'Payments are not configured yet. No payment has been recorded.' } };
        const order = await confirmRemoteTransfer(payment, { ...options, env });
        return { status: 200, body: { ok: true, order: order.order ?? order } };
      });
      const result = await confirm(interpreted);
      return send(result.status, result.body);
    } catch (error) {
      const status = error instanceof CommerceError ? error.status : error?.status || 503;
      const message = error instanceof CommerceError || error?.status ? error.message : 'Payments are temporarily unavailable. Please try again.';
      return send(status, { error: message });
    }
  };
}
