// verify_jwt=false: every operation verifies a real, confirmed Supabase user.
// This vault recovers existing private device connections; it grants no credits
// and does not revoke those connections on devices that already possess them.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
type Environment = { get(name: string): string | undefined };
type JsonRecord = Record<string, unknown>;
export type AccountCapabilities = { commerceToken: string; backupToken: string };
export type VaultEnvelope = { version: 1; iv: string; ciphertext: string };
const record = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keys = (value: JsonRecord, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const token = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const validCapabilities = (value: unknown): value is AccountCapabilities => record(value) && keys(value, ['commerceToken', 'backupToken']) && token(value.commerceToken) && token(value.backupToken);
const email = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const PROD_ORIGINS = ['https://evatarot.xyz', 'https://www.evatarot.xyz', 'https://evatarot.vercel.app', 'https://evara-omega.vercel.app'];
const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:3001', 'http://127.0.0.1:3004'];
const MAX_BODY_BYTES = 2048;
class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

export async function hashCapability(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
function base64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function unbase64(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
async function vaultKey(key: string): Promise<CryptoKey> {
  if (!token(key)) throw new Error('Invalid vault key');
  return crypto.subtle.importKey('raw', Uint8Array.from(key.match(/.{2}/g)!, byte => parseInt(byte, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function aad(userId: string): Uint8Array<ArrayBuffer> {
  if (!uuid(userId)) throw new Error('Invalid vault owner');
  return new TextEncoder().encode(`eva-account-v1:${userId.toLowerCase()}`);
}
export async function encryptCapabilities(capabilities: AccountCapabilities, userId: string, key: string): Promise<VaultEnvelope> {
  if (!validCapabilities(capabilities)) throw new Error('Invalid private connections');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(userId), tagLength: 128 }, await vaultKey(key), new TextEncoder().encode(JSON.stringify(capabilities)));
  return { version: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
}
export async function decryptCapabilities(envelope: unknown, userId: string, key: string): Promise<AccountCapabilities> {
  if (!record(envelope) || !keys(envelope, ['version', 'iv', 'ciphertext']) || envelope.version !== 1
      || typeof envelope.iv !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(envelope.iv)
      || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length < 24 || envelope.ciphertext.length > 1024
      || envelope.ciphertext.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.ciphertext)) throw new Error('Invalid recovery envelope');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(envelope.iv), additionalData: aad(userId), tagLength: 128 }, await vaultKey(key), unbase64(envelope.ciphertext));
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  if (!validCapabilities(value)) throw new Error('Invalid recovered connections');
  return value;
}
function namedKeys(raw: string | undefined): string[] {
  try { const value: unknown = JSON.parse(raw || '{}'); return record(value) ? Object.values(value).filter((key): key is string => typeof key === 'string') : []; }
  catch { return []; }
}
async function readJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new ApiError(415, 'Please send JSON.');
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new ApiError(413, 'This account request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Choose an account action.');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new ApiError(413, 'This account request is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, 'This account request could not be read.'); }
}

export function createCustomerAccountHandler(environment: Environment, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const allowed = new Set([...PROD_ORIGINS, ...LOCAL_ORIGINS, ...(environment.get('EVARA_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean)]);
    const cors: Record<string, string> = { 'Cache-Control': 'no-store, private', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'Pragma': 'no-cache' };
    if (origin && allowed.has(origin)) Object.assign(cors, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type', 'Access-Control-Max-Age': '600' });
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...cors, ...extra } });
    if (origin && !allowed.has(origin)) return json({ error: 'Open Eva Tarot to manage your account.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST, OPTIONS' });
    if (new URL(request.url).search) return json({ error: 'Account requests do not accept query parameters.' }, 400);
    if (environment.get('EVA_ACCOUNT_ENABLED') !== 'true') return json({ error: 'Email account recovery is being prepared. Your existing device connections are unchanged.' }, 503);
    const base = environment.get('SUPABASE_URL')?.replace(/\/$/, '');
    const serviceKey = namedKeys(environment.get('SUPABASE_SECRET_KEYS'))[0] || environment.get('SUPABASE_SECRET_KEY') || environment.get('SUPABASE_SERVICE_ROLE_KEY');
    const publicKeys = [...namedKeys(environment.get('SUPABASE_PUBLISHABLE_KEYS')), environment.get('SUPABASE_PUBLISHABLE_KEY'), environment.get('SUPABASE_ANON_KEY')].filter((value): value is string => Boolean(value));
    const key = environment.get('EVA_ACCOUNT_VAULT_KEY');
    if (!base || !serviceKey || !publicKeys.length || !token(key)) return json({ error: 'Account recovery is not configured yet. Your data stays on this device.' }, 503);
    if (!publicKeys.includes(request.headers.get('apikey') || '')) return json({ error: 'This app cannot connect to account recovery.' }, 401);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const body = await readJson(request);
      if (!record(body) || typeof body.action !== 'string' || !['status', 'link', 'restore'].includes(body.action) || !keys(body, body.action === 'link' ? ['action', 'commerceToken', 'backupToken'] : ['action'])) throw new ApiError(400, 'Choose a supported account action.');
      if (body.action === 'link' && (!token(body.commerceToken) || !token(body.backupToken))) throw new ApiError(400, 'Your private device connections could not be read.');
      const authorization = request.headers.get('authorization') || '';
      if (!/^Bearer [^\s]{10,8192}$/.test(authorization)) throw new ApiError(401, 'Sign in with your verified email to continue.');
      const headers: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json' };
      if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`;
      const database = async (path: string, init: RequestInit = {}) => {
        const response = await fetcher(`${base}/rest/v1/${path}`, { ...init, signal: controller.signal, headers: { ...headers, ...init.headers } });
        if (!response.ok) {
          const failure: unknown = await response.json().catch(() => null);
          if (record(failure) && ['22023', '23505'].includes(String(failure.code))) throw new ApiError(409, 'This account or device already has a saved connection. Restore that connection instead of replacing it.');
          throw new ApiError(503, 'Account recovery is temporarily unavailable. Your current device is unchanged.');
        }
        return response.json();
      };
      const rpc = (name: string, args: JsonRecord) => database(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
      const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 128);
      const ipHash = await hashCapability(`${key}:account-ip:${ip}`);
      if (await rpc('customer_account_take_quota', { p_ip_hash: ipHash, p_user_id: null }) !== true) return json({ error: 'Please wait a minute before trying account recovery again.' }, 429, { 'Retry-After': '60' });
      const authResponse = await fetcher(`${base}/auth/v1/user`, { headers: { apikey: publicKeys[0], Authorization: authorization }, signal: controller.signal });
      if (!authResponse.ok) {
        if ([401, 403].includes(authResponse.status)) throw new ApiError(401, 'Your sign-in has expired. Sign in again to continue.');
        throw new ApiError(503, 'Email verification is temporarily unavailable. Your current device is unchanged.');
      }
      const user: unknown = await authResponse.json();
      if (!record(user) || !uuid(user.id) || !email(user.email) || typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at)) || user.is_anonymous !== false) throw new ApiError(403, 'Verify your email before saving or restoring an account.');
      const userId = user.id.toLowerCase(); const verifiedEmail = user.email.toLowerCase();
      if (await rpc('customer_account_take_quota', { p_ip_hash: ipHash, p_user_id: userId }) !== true) return json({ error: 'Please wait a minute before trying account recovery again.' }, 429, { 'Retry-After': '60' });
      if (body.action === 'link') {
        const capabilities = { commerceToken: body.commerceToken as string, backupToken: body.backupToken as string };
        const envelope = await encryptCapabilities(capabilities, userId, key);
        const result = await rpc('customer_account_link', { p_user_id: userId, p_commerce_hash: await hashCapability(capabilities.commerceToken), p_backup_hash: await hashCapability(capabilities.backupToken), p_envelope: envelope });
        if (!record(result) || !['linked', 'already_linked'].includes(String(result.status)) || typeof result.updated_at !== 'string') throw new ApiError(503, 'The account connection could not be confirmed. Your device connections are unchanged.');
        return json({ linked: true, email: verifiedEmail, updatedAt: result.updated_at });
      }
      const select = body.action === 'status' ? 'updated_at' : 'envelope,commerce_hash,backup_hash,updated_at';
      const rows = await database(`eva_customer_accounts?user_id=eq.${userId}&select=${select}&limit=1`);
      if (!Array.isArray(rows) || rows.length > 1 || (rows.length && (!record(rows[0]) || typeof rows[0].updated_at !== 'string'))) throw new ApiError(503, 'Your saved account connection could not be read.');
      const row = rows[0] as JsonRecord | undefined;
      if (!row) return json({ linked: false, email: verifiedEmail, updatedAt: null });
      if (body.action === 'status') return json({ linked: true, email: verifiedEmail, updatedAt: row.updated_at });
      const capabilities = await decryptCapabilities(row.envelope, userId, key);
      if (await hashCapability(capabilities.commerceToken) !== row.commerce_hash || await hashCapability(capabilities.backupToken) !== row.backup_hash) throw new Error('Recovery connection integrity failed');
      return json({ linked: true, email: verifiedEmail, updatedAt: row.updated_at, ...capabilities });
    } catch (cause) {
      return json({ error: cause instanceof ApiError ? cause.message : 'Account recovery is temporarily unavailable. Your current device is unchanged.' }, cause instanceof ApiError ? cause.status : 503);
    } finally { clearTimeout(timeout); }
  };
}
if (typeof Deno !== 'undefined') Deno.serve(createCustomerAccountHandler(Deno.env));
