import { isIP } from 'node:net';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export class CommerceError extends Error {
  constructor(status,message,code='commerce_unavailable') { super(message); this.status=status; this.code=code; }
}
const validToken=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validUuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const PUBLIC_ACTIONS=new Set(['catalog','wallet','create_order','create_donation','transfer_sent','record_event','track_event','admin_dashboard','admin_update_product','admin_update_settings','admin_update_customer','admin_confirm_payment','admin_reject_payment']);
const sha256=value=>createHash('sha256').update(value).digest('hex');
function config(options={}) {
  return {
    url:options.supabaseUrl??process.env.SUPABASE_URL??process.env.VITE_SUPABASE_URL,
    key:options.publicKey??process.env.SUPABASE_PUBLISHABLE_KEY??process.env.SUPABASE_ANON_KEY??process.env.VITE_SUPABASE_PUBLISHABLE_KEY??process.env.VITE_SUPABASE_ANON_KEY,
    internalKey:options.internalKey??process.env.EVA_COMMERCE_INTERNAL_KEY,
    pricingMode:options.pricingMode??process.env.EVA_PRICING_MODE,
    fetcher:options.fetchImpl??fetch,
    timeoutMs:options.timeoutMs??20000,
  };
}
async function invoke(configuration,body,headers={},signal) {
  if (!configuration.url||!configuration.key) throw new CommerceError(503,'Payments are not configured yet. Please try again later.');
  let response;
  try {
    response=await configuration.fetcher(`${configuration.url.replace(/\/$/,'')}/functions/v1/commerce`,{method:'POST',headers:{apikey:configuration.key,'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(configuration.timeoutMs)]):AbortSignal.timeout(configuration.timeoutMs)});
  } catch { throw new CommerceError(503,'Payments are temporarily unavailable. Please try again.'); }
  let result; try { result=await response.json(); } catch { throw new CommerceError(503,'Payments are temporarily unavailable. Please try again.'); }
  if (!response.ok) {
    const status=[400,401,403,404,409,413,415,429].includes(response.status)?response.status:503;
    const messages={400:'Check the details and try again.',401:'Open your wallet or sign in again to continue.',403:'This account cannot perform that action.',404:'This order or customer was not found.',409:'This option changed or this request was already used. Refresh and try again.',413:'This request is too large.',415:'Please send JSON.',429:'Please wait a moment before trying again.',503:'Payments are temporarily unavailable. Please try again.'};
    throw new CommerceError(status,messages[status]);
  }
  if (!record(result)) throw new CommerceError(503,'Payments returned an invalid response. Please try again.');
  return result;
}
async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']??'')) throw new CommerceError(415,'Please send JSON.');
  if (Number(request.headers['content-length'])>32768) throw new CommerceError(413,'This request is too large.');
  let body; try { body=request.body; } catch { throw new CommerceError(400,'This request could not be read.'); }
  if (body!==undefined) {
    let serialized; try { serialized=typeof body==='string'?body:Buffer.isBuffer(body)?body.toString('utf8'):JSON.stringify(body); } catch { throw new CommerceError(400,'This request could not be read.'); }
    if (typeof serialized!=='string'||Buffer.byteLength(serialized)>32768) throw new CommerceError(413,'This request is too large.');
    try { return JSON.parse(serialized); } catch { throw new CommerceError(400,'This request could not be read.'); }
  }
  const parts=[]; let length=0;
  for await (const part of request) { length+=part.length; if (length>32768) throw new CommerceError(413,'This request is too large.'); parts.push(part); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new CommerceError(400,'This request could not be read.'); }
}
export function createCommerceProxyHandler(options={}) {
  return async (request,response)=>{
    const send=(status,body,headers={})=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',...headers});response.end(JSON.stringify(body));};
    try {
      if (request.method!=='POST') return send(405,{error:'Method not allowed.'},{Allow:'POST'});
      if (request.headers['sec-fetch-site']==='cross-site') throw new CommerceError(403,'Open Eva Tarot to continue.');
      const origin=request.headers.origin;
      if (origin) { try { const parsed=new URL(origin); if (!['http:','https:'].includes(parsed.protocol)||parsed.host!==request.headers.host) throw new Error(); } catch { throw new CommerceError(403,'Open Eva Tarot to continue.'); } }
      const body=await readBody(request);
      if (!record(body)||!PUBLIC_ACTIONS.has(body.action)) throw new CommerceError(400,'This action is not supported.');
      const headers={};
      // Deliberate allowlist: no browser header can forward the internal secret.
      if (typeof request.headers['x-eva-device']==='string') headers['X-Eva-Device']=request.headers['x-eva-device'];
      if (typeof request.headers.authorization==='string') headers.Authorization=request.headers.authorization;
      const configuration=config(options);
      if (validToken(configuration.internalKey)) {
        headers['X-Eva-Internal']=configuration.internalKey;
        const forwarded=(options.isVercel??process.env.VERCEL==='1')?request.headers['x-vercel-forwarded-for']:undefined;
        const address=typeof forwarded==='string'?forwarded.split(',')[0].trim():request.socket?.remoteAddress;
        if (typeof address==='string'&&isIP(address)) headers['X-Eva-Client-IP']=address;
      }
      return send(200,await invoke(configuration,body,headers));
    } catch (error) { return send(error instanceof CommerceError?error.status:503,{error:error instanceof CommerceError?error.message:'Payments are temporarily unavailable. Please try again.'}); }
  };
}
function encryptionKey(token) { return createHash('sha256').update(`eva-reading-cache-v1:${token}`).digest(); }
export function encryptReadingResponse(response,deviceToken,requestId) {
  if (!validToken(deviceToken)||!validUuid(requestId)) throw new CommerceError(400,'A valid private reading reference is required.');
  const plaintext=JSON.stringify(response);
  if (Buffer.byteLength(plaintext)>60000) throw new CommerceError(503,'This reading is too large to save safely.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(deviceToken),iv);
  cipher.setAAD(Buffer.from(`${requestId}:${sha256(deviceToken)}`));
  const ciphertext=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final(),cipher.getAuthTag()]);
  return {version:1,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function decryptReadingResponse(envelope,deviceToken,requestId) {
  if (!validToken(deviceToken)||!validUuid(requestId)||!record(envelope)||envelope.version!==1||typeof envelope.iv!=='string'||typeof envelope.ciphertext!=='string') throw new CommerceError(409,'This saved response is no longer available. Please begin a new reading.');
  try {
    const bytes=Buffer.from(envelope.ciphertext,'base64'),iv=Buffer.from(envelope.iv,'base64');
    if (iv.length!==12||bytes.length<17||bytes.length>70000) throw new Error();
    const decipher=createDecipheriv('aes-256-gcm',encryptionKey(deviceToken),iv);
    decipher.setAAD(Buffer.from(`${requestId}:${sha256(deviceToken)}`));decipher.setAuthTag(bytes.subarray(-16));
    const result=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString('utf8'));
    if (!record(result)) throw new Error(); return result;
  } catch { throw new CommerceError(409,'This saved response is no longer available. Please begin a new reading.'); }
}
export function createCommerceReadingClient(options={}) {
  const settings=()=>config(options);
  const internal=async (body,deviceToken,signal,clientAddress)=>{
    const configuration=settings();
    if (!validToken(configuration.internalKey)) throw new CommerceError(503,'The reading payment service is not configured. Please try again later.');
    const headers={'X-Eva-Internal':configuration.internalKey};
    if (validToken(deviceToken)) headers['X-Eva-Device']=deviceToken;
    if (typeof clientAddress==='string'&&isIP(clientAddress)) headers['X-Eva-Client-IP']=clientAddress;
    return invoke({...configuration,timeoutMs:8000},body,headers,signal);
  };
  return {
    async reserve({deviceToken,requestId,input,signal,clientAddress}) {
      const configuration=settings();
      if (!configuration.url||!configuration.key) {
        if (['paid','free_trial'].includes(configuration.pricingMode)) throw new CommerceError(503,'The reading payment service is not configured. Please try again later.');
        return {required:false,allowed:true,configured:false};
      }
      const result=validToken(configuration.internalKey)?await internal({action:'catalog'},deviceToken,signal,clientAddress):await invoke({...configuration,timeoutMs:8000},{action:'catalog'},{},signal);
      const mode=result.catalog?.settings?.pricing_mode;
      if (!['paid','free_trial','consultations'].includes(mode)) throw new CommerceError(503,'The reading price could not be checked. Please try again.');
      if (mode==='consultations') return {required:false,allowed:true,configured:true};
      if (!validToken(deviceToken)) throw new CommerceError(401,'Open your wallet on this device to begin a reading.','wallet_required');
      if (!validUuid(requestId)) throw new CommerceError(400,'A private reading reference is required. Please try again.');
      const response=await internal({action:'reading_reserve',requestId,fingerprint:sha256(JSON.stringify(input))},deviceToken,signal,clientAddress);
      const reservation=response.reservation;
      if (!record(reservation)||typeof reservation.required!=='boolean'||typeof reservation.allowed!=='boolean') throw new CommerceError(503,'Your reading credit could not be checked. Please try again.');
      if (reservation.status==='completed'&&reservation.response) reservation.response=decryptReadingResponse(reservation.response,deviceToken,requestId);
      if (reservation.status==='expired') throw new CommerceError(409,'This reading response has expired. Please begin a new reading.','reading_expired');
      if (!reservation.allowed) {
        if (reservation.status==='insufficient_credits') throw new CommerceError(402,'Your wallet needs a reading credit. Choose a package to continue.','credits_required');
        throw new CommerceError(409,reservation.status==='reserved'?'This reading is still being prepared. Please wait before retrying.':'This reading request has already ended. Please start a new reading.',reservation.status==='reserved'?'reading_in_progress':'reading_ended');
      }
      return reservation;
    },
    async finish({deviceToken,requestId,response,signal,clientAddress}) {
      const result=await internal({action:'reading_finish',requestId,response:encryptReadingResponse(response,deviceToken,requestId)},deviceToken,signal,clientAddress);
      if (result.ok!==true) throw new CommerceError(503,'The reading result could not be finalized. Please keep your answer and check your wallet later.');
      return result;
    },
    async recordCompleted({deviceToken,requestId,signal,clientAddress}) {
      if (!validUuid(requestId)) throw new CommerceError(400,'A valid reading reference is required.');
      return internal({action:'reading_record_event',requestId},deviceToken,signal,clientAddress);
    },
    async refund({deviceToken,requestId,signal,clientAddress}) { return internal({action:'reading_refund',requestId},deviceToken,signal,clientAddress); },
  };
}
