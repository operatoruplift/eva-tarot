// The only credential granting access to a document is a random 256-bit device
// capability. The database stores its SHA-256 hash, never the capability itself.
// Deploy with verify_jwt=false: this handler performs capability authentication.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };

export const MAX_DOCUMENT_BYTES = 1_048_576;
export const PRODUCTION_ORIGINS: string[] = ['https://evara-omega.vercel.app', 'https://evatarot.vercel.app'];
const localOrigins = ['http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:5173'];
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));

export function validDocument(value: unknown): boolean {
  if (!record(value) || !keys(value, ['profile', 'sessions', 'practiceDays', 'dayNotes', 'language']) || !record(value.profile) || !keys(value.profile, ['name', 'onboarded', 'avatar'])
      || (value.profile.avatar !== undefined && (!text(value.profile.avatar, 200_000) || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value.profile.avatar as string)))
      || !text(value.profile.name, 32) || typeof value.profile.onboarded !== 'boolean' || !Array.isArray(value.sessions)) return false;
  const day = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (value.practiceDays !== undefined && (!Array.isArray(value.practiceDays) || !value.practiceDays.every(day))) return false;
  if (value.dayNotes !== undefined && (!record(value.dayNotes) || !Object.entries(value.dayNotes).every(([date, note]) => day(date) && text(note, 20_000)))) return false;
  if (value.language !== undefined && (typeof value.language !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(value.language))) return false;
  const ids = new Set<string>();
  return value.sessions.every((session) => {
    if (!record(session) || !keys(session, ['id', 'title', 'focus', 'date', 'messages', 'saved', 'note', 'daily', 'drawCount', 'revisedFrom'])
        || !text(session.id, 80) || !session.id || ids.has(session.id as string) || !text(session.title, 1000) || !text(session.focus, 100)
        || !text(session.date, 40) || !Number.isFinite(Date.parse(session.date as string)) || typeof session.saved !== 'boolean' || !text(session.note, 1200)
        || (session.daily !== undefined && typeof session.daily !== 'boolean') || (session.drawCount !== undefined && ![0, 1, 3, 5, 10].includes(session.drawCount as number))
        || (session.revisedFrom !== undefined && !text(session.revisedFrom, 80))
        || !Array.isArray(session.messages)) return false;
    ids.add(session.id as string);
    const messageIds = new Set<string>();
    return session.messages.every((message) => {
      if (!record(message) || !keys(message, ['id', 'role', 'text', 'cards', 'mode', 'createdAt']) || !text(message.id, 80) || !message.id || messageIds.has(message.id as string)
          || !['user', 'assistant'].includes(message.role as string) || !text(message.text, 20_000)
          || (message.mode !== undefined && !['demo', 'ai', 'guided', 'local'].includes(message.mode as string))
          || (message.createdAt !== undefined && (typeof message.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(message.createdAt) || !day(message.createdAt.slice(0, 10)) || !Number.isFinite(Date.parse(message.createdAt))))) return false;
      messageIds.add(message.id as string);
      return message.cards === undefined || (Array.isArray(message.cards) && message.cards.length <= 10 && message.cards.every((card) => (
        record(card) && keys(card, ['id', 'name', 'roman', 'keywords', 'meaning', 'reflection', 'image', 'number', 'suit', 'rank'])
          && Number.isInteger(card.id) && Number(card.id) >= 0 && Number(card.id) <= 77 && text(card.name, 100) && text(card.roman, 10)
          && Array.isArray(card.keywords) && card.keywords.length <= 8 && card.keywords.every((keyword) => text(keyword, 100))
          && text(card.meaning, 5000) && text(card.reflection, 2000) && typeof card.image === 'string' && /^\/cards\/[a-z0-9-]+\.jpg$/.test(card.image)
      )));
    });
  });
}

export async function hashKey(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function readBoundedJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length') || 0) > MAX_DOCUMENT_BYTES + 1024) throw new RangeError('Too large');
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('Missing document');
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_DOCUMENT_BYTES + 1024) { await reader.cancel(); throw new RangeError('Too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function namedKeys(raw: string | undefined): string[] {
  try { const parsed: unknown = JSON.parse(raw || '{}'); return record(parsed) ? Object.values(parsed).filter((key): key is string => typeof key === 'string') : []; }
  catch { return []; }
}
type Environment = { get(name: string): string | undefined };
export function createJournalHandler(environment: Environment, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const allowed = (environment.get('EVARA_ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean);
    const origins = new Set([...PRODUCTION_ORIGINS, ...allowed, ...localOrigins]);
    const cors: Record<string, string> = { 'Cache-Control': 'no-store, private', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    if (origin && origins.has(origin)) Object.assign(cors, {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'apikey, content-type, x-evara-device', 'Access-Control-Max-Age': '600',
    });
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...cors, ...extra } });
    if (origin && !origins.has(origin)) return json({ error: 'This site cannot access private backup.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, PUT, OPTIONS' });
    if (new URL(request.url).search) return json({ error: 'Journal requests do not accept query parameters.' }, 400);

    const token = request.headers.get('x-evara-device') || '';
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'A valid private device connection is required.' }, 401);
    const url = environment.get('SUPABASE_URL');
    const serviceKey = namedKeys(environment.get('SUPABASE_SECRET_KEYS'))[0] || environment.get('SUPABASE_SECRET_KEY') || environment.get('SUPABASE_SERVICE_ROLE_KEY');
    const publicKeys = [...namedKeys(environment.get('SUPABASE_PUBLISHABLE_KEYS')), environment.get('SUPABASE_PUBLISHABLE_KEY'), environment.get('SUPABASE_ANON_KEY')].filter(Boolean);
    if (!url || !serviceKey || !publicKeys.length) return json({ error: 'Private backup is not configured yet. Your journal stays on this device.' }, 503);
    if (!publicKeys.includes(request.headers.get('apikey') || '')) return json({ error: 'This app cannot connect to private backup.' }, 401);

    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const ownerHash = await hashKey(token);
      // Supabase's gateway supplies X-Forwarded-For. Salt it before storage so
      // the rate-limit table contains no raw IP addresses or reusable IP hashes.
      const clientIp = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 128);
      const ipHash = await hashKey(`${serviceKey}:journal-ip:${clientIp}`);
      const headers: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json' };
      if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`;
      const database = async (path: string, init: RequestInit = {}) => {
        const response = await fetcher(`${url}/rest/v1/${path}`, { ...init, signal: controller.signal, headers: { ...headers, ...init.headers } });
        if (!response.ok) throw new Error('Database request failed');
        return response.json();
      };
      const permitted = await database('rpc/journal_take_quota', { method: 'POST', body: JSON.stringify({ p_device_hash: ownerHash, p_ip_hash: ipHash }) });
      if (permitted !== true) return json({ error: 'Private backup is taking a short break. Your changes are safe on this device; try again in a minute.' }, 429, { 'Retry-After': '60' });
      if (request.method === 'GET') {
        const rows = await database(`journal_documents?owner_hash=eq.${ownerHash}&select=document,revision,updated_at&limit=1`);
        if (!Array.isArray(rows)) throw new Error('Invalid database response');
        const row = rows[0];
        return json(row ? { document: row.document, revision: row.revision, updatedAt: row.updated_at } : { document: null, revision: 0, updatedAt: null });
      }
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'The backup must use JSON.' }, 415);
      let body: unknown;
      try { body = await readBoundedJson(request); }
      catch (cause) { return json({ error: cause instanceof RangeError ? 'This journal exceeds the 1 MB backup limit. Export it to keep a copy.' : 'The backup document could not be read.' }, cause instanceof RangeError ? 413 : 400); }
      if (!record(body) || !keys(body, ['document', 'expectedRevision']) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || !validDocument(body.document)) return json({ error: 'The journal contains an unsupported entry. Your local journal is unchanged.' }, 400);
      if (new TextEncoder().encode(JSON.stringify(body.document)).byteLength > MAX_DOCUMENT_BYTES) return json({ error: 'This journal exceeds the 1 MB backup limit. Export it to keep a copy.' }, 413);
      const result = await database('rpc/journal_write', { method: 'POST', body: JSON.stringify({ p_owner_hash: ownerHash, p_document: body.document, p_expected_revision: body.expectedRevision }) });
      if (result === null) return json({ error: 'Another tab updated your backup. Your changes are still saved on this device. Choose which version to keep before continuing.' }, 409);
      if (!record(result) || !Number.isSafeInteger(result.revision)) throw new Error('Invalid database response');
      return json({ document: body.document, revision: result.revision, updatedAt: result.updated_at });
    } catch {
      return json({ error: 'Private backup is temporarily unavailable. Your journal is still saved on this device. Please try again.' }, 503);
    } finally { clearTimeout(timeout); }
  };
}
if (typeof Deno !== 'undefined') Deno.serve(createJournalHandler(Deno.env));
