// verify_jwt=false: public/device requests and real Supabase Auth admin tokens
// are authenticated here. A publishable key alone never authorizes admin work.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
type Environment = { get(name: string): string | undefined };
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keys = (value: JsonRecord, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const shortText = (value: unknown, max: number, min = 0): value is string => typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const email = (value: unknown): value is string => shortText(value,254,3) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const integer = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && Number(value)>=min && Number(value)<=max;
const PROD_ORIGINS = ['https://evatarot.vercel.app','https://evara-omega.vercel.app','https://evatarot.xyz','https://www.evatarot.xyz'];
const LOCAL_ORIGINS = ['http://localhost:5173','http://localhost:3001','http://127.0.0.1:3001','http://127.0.0.1:3004'];
export const PRODUCT_FIELDS = ['id','title_en','title_vi','description_en','description_vi','price_vnd','credits','category','kind','active','sort_order'];
export const SETTINGS_FIELDS = ['pricing_mode','free_trial_credits','donations_enabled','bank_name','account_name','account_number','bank_bin','qr_image','qr_payload','support_email','hero_title_en','hero_title_vi','hero_description_en','hero_description_vi','announcement_en','announcement_vi','donation_suggested_vnd'];
export function validProduct(value: unknown): value is JsonRecord {
  return record(value) && keys(value,PRODUCT_FIELDS) && typeof value.id==='string' && /^[a-z0-9-]{1,64}$/.test(value.id)
    && shortText(value.title_en,100,1) && shortText(value.title_vi,100,1) && shortText(value.description_en,1000) && shortText(value.description_vi,1000)
    && integer(value.price_vnd,1000,10000000) && integer(value.credits,0,100) && typeof value.category==='string' && ['questions','love','work','life','packages','other'].includes(value.category)
    && typeof value.kind==='string' && ['credits','consultation'].includes(value.kind) && typeof value.active==='boolean' && integer(value.sort_order,0,10000)
    && (value.kind==='credits' ? Number(value.credits)>0 : value.credits===0);
}
export function validSettings(value: unknown): value is JsonRecord {
  if (!record(value) || !keys(value,SETTINGS_FIELDS) || !Object.keys(value).length) return false;
  return Object.entries(value).every(([key,val]) => {
    if (key==='pricing_mode') return typeof val==='string' && ['consultations','paid','free_trial'].includes(val);
    if (key==='free_trial_credits') return integer(val,0,10);
    if (key==='donations_enabled') return typeof val==='boolean';
    if (key==='donation_suggested_vnd') return Array.isArray(val) && val.length<=5 && val.every(amount=>integer(amount,1000,10000000));
    if (key==='account_number') return typeof val==='string' && /^\d{6,19}$/.test(val);
    if (key==='bank_bin') return typeof val==='string' && /^\d{6}$/.test(val);
    if (key==='support_email') return val==='' || email(val);
    if (key==='qr_payload') return typeof val==='string' && /^000201[0-9A-Za-z .-]{30,500}$/.test(val);
    if (key==='qr_image') return typeof val==='string' && /^\/[a-zA-Z0-9/_-]+\.(?:png|jpg|jpeg|webp|svg)$/.test(val);
    return shortText(val,key.startsWith('hero_description')?600:key.startsWith('hero_title')?150:key.startsWith('announcement_')?500:100);
  });
}
export async function hashToken(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function namedKeys(raw: string | undefined): string[] {
  try { const value: unknown=JSON.parse(raw||'{}'); return record(value)?Object.values(value).filter((key): key is string=>typeof key==='string'):[]; } catch { return []; }
}
class ApiError extends Error { status: number; constructor(status: number,message: string) { super(message); this.status=status; } }
async function readJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')) throw new ApiError(415,'Please send JSON.');
  if (Number(request.headers.get('content-length'))>100000) throw new ApiError(413,'This request is too large.');
  const reader=request.body?.getReader(); if (!reader) throw new ApiError(400,'Please send a request.');
  const parts: Uint8Array[]=[]; let total=0;
  try { while (true) { const {done,value}=await reader.read(); if (done) break; total+=value.byteLength; if (total>100000) { await reader.cancel(); throw new ApiError(413,'This request is too large.'); } parts.push(value); } }
  finally { reader.releaseLock(); }
  const bytes=new Uint8Array(total); let offset=0; for (const part of parts) { bytes.set(part,offset); offset+=part.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { throw new ApiError(400,'The request could not be read.'); }
}
function encryptedEnvelope(value: unknown): boolean {
  return record(value) && keys(value,['version','iv','ciphertext']) && value.version===1 && typeof value.iv==='string' && /^[A-Za-z0-9+/]{16}$/.test(value.iv)
    && typeof value.ciphertext==='string' && value.ciphertext.length>=24 && value.ciphertext.length<=90000 && /^[A-Za-z0-9+/]+={0,2}$/.test(value.ciphertext);
}
export function createCommerceHandler(environment: Environment,fetcher: typeof fetch=fetch) {
 return async (request: Request): Promise<Response> => {
  const origin=request.headers.get('origin');
  const allowed=new Set([...PROD_ORIGINS,...LOCAL_ORIGINS,...(environment.get('EVARA_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean)]);
  const cors: Record<string,string>={'Cache-Control':'no-store, private','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  if (origin && allowed.has(origin)) Object.assign(cors,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type, x-eva-device','Access-Control-Max-Age':'600'});
  const json=(body: unknown,status=200,extra: Record<string,string>={})=>Response.json(body,{status,headers:{...cors,...extra}});
  if (origin && !allowed.has(origin)) return json({error:'This site cannot access Eva Tarot payments.'},403);
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method!=='POST') return json({error:'Method not allowed.'},405,{Allow:'POST, OPTIONS'});
  if (new URL(request.url).search) return json({error:'Query parameters are not supported.'},400);
  const base=environment.get('SUPABASE_URL');
  const serviceKey=namedKeys(environment.get('SUPABASE_SECRET_KEYS'))[0]||environment.get('SUPABASE_SECRET_KEY')||environment.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKeys=[...namedKeys(environment.get('SUPABASE_PUBLISHABLE_KEYS')),environment.get('SUPABASE_PUBLISHABLE_KEY'),environment.get('SUPABASE_ANON_KEY')].filter(Boolean);
  if (!base || !serviceKey || !publicKeys.length) return json({error:'Payments are not configured yet. No payment has been recorded.'},503);
  if (!publicKeys.includes(request.headers.get('apikey')||'')) return json({error:'The app cannot connect to payments.'},401);
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),15000);
  try {
   const body=await readJson(request);
   if (!record(body) || typeof body.action!=='string') throw new ApiError(400,'Choose an action.');
   const headers: Record<string,string>={apikey:serviceKey,'Content-Type':'application/json'};
   if (serviceKey.startsWith('eyJ')) headers.Authorization=`Bearer ${serviceKey}`;
   const database=async (path: string,init: RequestInit={}) => {
    const response=await fetcher(`${base}/rest/v1/${path}`,{...init,signal:controller.signal,headers:{...headers,...init.headers}});
    if (!response.ok) {
      let error: unknown; try { error=await response.json(); } catch { /* opaque response */ }
      if (record(error) && error.code==='22023') throw new ApiError(409,'This request conflicts with an existing order, or the option is no longer available. Please refresh and try again.');
      if (record(error) && error.message==='Too many pending orders') throw new ApiError(429,'Please finish an existing payment before creating another order.');
      throw new ApiError(503,'Payments are temporarily unavailable. Please try again.');
    }
    if (response.status===204) return null;
    return response.json();
   };
   const rpc=(name: string,args: JsonRecord={})=>database(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)});
   const internalSecret=request.headers.get('x-eva-internal')||'';
   let trustedServer=false;
   if (/^[a-f0-9]{64}$/.test(internalSecret)) {
     const secretHash=await hashToken(internalSecret);
     const trusted=await database(`eva_server_credentials?id=eq.reading-api&secret_hash=eq.${secretHash}&select=id&limit=1`);
     trustedServer=Array.isArray(trusted)&&trusted.length===1;
   }
   const rawDevice=request.headers.get('x-eva-device')||'';
   const deviceHash=/^[a-f0-9]{64}$/.test(rawDevice)?await hashToken(rawDevice):null;
   const assertedIp=trustedServer?request.headers.get('x-eva-client-ip'):null;
   const clientIp=assertedIp&&/^[a-fA-F0-9:.]{3,64}$/.test(assertedIp)?assertedIp:(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,128);
   const ipHash=await hashToken(`${serviceKey}:commerce-ip:${clientIp}`);
   if (await rpc('commerce_take_quota',{p_ip_hash:ipHash,p_device_hash:deviceHash,p_is_server:trustedServer&&!assertedIp})!==true) return json({error:'Please wait a moment before trying again.'},429,{'Retry-After':'60'});
   const assertKeys=(allowedFields: string[])=>{if (!keys(body,['action',...allowedFields])) throw new ApiError(400,'This request contains unsupported fields.');};
   const requireDevice=()=>{if (!deviceHash) throw new ApiError(401,'Open your private wallet on this device to continue.'); return deviceHash;};
   const catalog=async (admin=false)=>{
    const [products,settings]=await Promise.all([database(`eva_products?select=*&${admin?'':'active=eq.true&'}order=sort_order.asc,id.asc`),database('eva_settings?id=eq.true&select=config&limit=1')]);
    if (!Array.isArray(products)||!Array.isArray(settings)||!record(settings[0])||!record(settings[0].config)) throw new ApiError(503,'The price list is unavailable. Please try again.');
    return {products,settings:settings[0].config};
   };
   if (body.action==='catalog') { assertKeys([]); return json({catalog:await catalog()}); }
   if (body.action==='track_event') {
    assertKeys(['name','page']);
    if (!['page_view','start_chat','pricing_view'].includes(String(body.name)) || !['landing','app','pricing','support'].includes(String(body.page))) throw new ApiError(400,'Unsupported event.');
    // Anonymous events receive no reusable identifier, cookie or device profile.
    const visitorHash=deviceHash||await hashToken(crypto.randomUUID());
    await database('eva_events',{method:'POST',body:JSON.stringify({event:body.name,page:body.page,visitor_hash:visitorHash}),headers:{Prefer:'return=minimal'}});
    return json({ok:true});
   }
   if (body.action==='record_event') {
    assertKeys(['event']); requireDevice();
    if (!['landing_view','pricing_view','checkout_started'].includes(String(body.event))) throw new ApiError(400,'Unsupported event.');
    await database('eva_events',{method:'POST',body:JSON.stringify({event:body.event,visitor_hash:deviceHash}),headers:{Prefer:'return=minimal'}});
    return json({ok:true});
   }
   if (body.action==='wallet') {
    assertKeys([]); const hash=requireDevice(); const wallet=await rpc('commerce_wallet',{p_device_hash:hash});
    if (!record(wallet)||!uuid(wallet.id)) throw new ApiError(503,'Your wallet could not be loaded.');
    const orders=await database(`eva_orders?wallet_id=eq.${wallet.id}&select=id,product_id,product_snapshot,kind,amount_vnd,credits,status,transfer_reference,contact_email,payment_note,created_at,transfer_sent_at,confirmed_at&order=created_at.desc&limit=100`);
    return json({wallet,orders});
   }
   if (body.action==='create_order'||body.action==='create_donation') {
    assertKeys(body.action==='create_order'?['productId','idempotencyKey','contactEmail']:['amountVnd','idempotencyKey','contactEmail']);
    const hash=requireDevice();
    if (!uuid(body.idempotencyKey) || (body.contactEmail!==undefined && body.contactEmail!=='' && !email(body.contactEmail))) throw new ApiError(400,'Use a valid order reference and email address.');
    if (body.action==='create_order' && (typeof body.productId!=='string'|| !/^[a-z0-9-]{1,64}$/.test(body.productId))) throw new ApiError(400,'Choose a reading option.');
    if (body.action==='create_donation'&&!integer(body.amountVnd,1000,10000000)) throw new ApiError(400,'Choose a donation between 1,000 and 10,000,000 VND.');
    const order=await rpc('commerce_create_order',{p_device_hash:hash,p_product_id:body.action==='create_order'?body.productId:null,p_amount_vnd:body.action==='create_donation'?body.amountVnd:null,p_idempotency_key:body.idempotencyKey,p_contact_email:body.contactEmail?String(body.contactEmail).toLowerCase():null});
    return json({order});
   }
   if (body.action==='transfer_sent') {
    assertKeys(['orderId']); const hash=requireDevice(); if (!uuid(body.orderId)) throw new ApiError(400,'Choose a valid order.');
    const order=await rpc('commerce_transfer_sent',{p_device_hash:hash,p_order_id:body.orderId});
    if (!order) throw new ApiError(404,'This order was not found in your wallet.');
    return json({order});
   }
   if (['reading_reserve','reading_finish','reading_refund','reading_record_event'].includes(body.action)) {
    // A root-server secret is independent of publishable keys and user JWTs.
    // Only its SHA-256 hash exists in the database; it never reaches the app.
    if (!trustedServer) throw new ApiError(403,'Server authorization is required.');
    if (!uuid(body.requestId)) throw new ApiError(400,'A valid reading request reference is required.');
    if (body.action==='reading_record_event') {
      assertKeys(['requestId']);
      const visitorHash=deviceHash||await hashToken(`${serviceKey}:completed:${body.requestId}`);
      return json({ok:await rpc('commerce_record_reading_event',{p_request_id:body.requestId,p_visitor_hash:visitorHash})});
    }
    const hash=requireDevice();
    if (body.action==='reading_reserve') {
      assertKeys(['requestId','fingerprint']); if (typeof body.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(body.fingerprint)) throw new ApiError(400,'A valid reading fingerprint is required.');
      return json({reservation:await rpc('commerce_reserve_reading',{p_device_hash:hash,p_request_id:body.requestId,p_fingerprint:body.fingerprint,p_cost:1})});
    }
    if (body.action==='reading_finish') {
      assertKeys(['requestId','response']); if (!encryptedEnvelope(body.response)) throw new ApiError(400,'An encrypted reading result is required.');
      return json({ok:await rpc('commerce_finish_reading',{p_request_id:body.requestId,p_device_hash:hash,p_response:body.response})});
    }
    assertKeys(['requestId']); return json({ok:await rpc('commerce_refund_reading',{p_request_id:body.requestId,p_device_hash:hash})});
   }
   if (!body.action.startsWith('admin_')) throw new ApiError(400,'This action is not supported.');
   const authorization=request.headers.get('authorization')||'';
   if (!/^Bearer [^\s]{10,8192}$/.test(authorization)) throw new ApiError(401,'Sign in to the owner dashboard.');
   const authResponse=await fetcher(`${base}/auth/v1/user`,{headers:{apikey:publicKeys[0]!,Authorization:authorization},signal:controller.signal});
   if (!authResponse.ok) throw new ApiError(401,'Your sign-in has expired. Please sign in again.');
   const user: unknown=await authResponse.json();
   if (!record(user)||!uuid(user.id)||!email(user.email)||!user.email_confirmed_at) throw new ApiError(403,'A verified owner account is required.');
   const verifiedEmail=String(user.email).toLowerCase();
   const owners=await database(`eva_admins?email=eq.${encodeURIComponent(verifiedEmail)}&select=email&limit=1`);
   if (!Array.isArray(owners)||owners.length!==1) throw new ApiError(403,'This account does not have dashboard access.');
   if (body.action==='admin_dashboard') {
    assertKeys([]);
    const [summary,customers,orders,currentCatalog]=await Promise.all([rpc('commerce_analytics'),database('eva_wallets?select=id,credits,contact_email,display_name,admin_notes,created_at,last_seen_at&order=last_seen_at.desc&limit=200'),database('eva_orders?select=*&order=created_at.desc&limit=200'),catalog(true)]);
    return json({summary,customers,orders,catalog:currentCatalog,admin:{email:verifiedEmail}});
   }
   if (body.action==='admin_confirm_payment'||body.action==='admin_reject_payment') {
    assertKeys(['orderId','note']); if (!uuid(body.orderId)||(body.note!==undefined&&!shortText(body.note,500))) throw new ApiError(400,'Choose an order and a short payment note.');
    const order=await rpc('commerce_review_payment',{p_order_id:body.orderId,p_confirm:body.action==='admin_confirm_payment',p_actor:user.id,p_note:body.note||''});
    if (!order) throw new ApiError(404,'This order was not found.');
    return json({order});
   }
   if (body.action==='admin_update_product') {
    assertKeys(['product']); if (!validProduct(body.product)) throw new ApiError(400,'Check the price, credits, and product details.');
    const product=await rpc('commerce_admin_save',{p_action:'product',p_data:body.product,p_actor:user.id});
    return json({product});
   }
   if (body.action==='admin_update_settings') {
    assertKeys(['settings']); if (!validSettings(body.settings)) throw new ApiError(400,'Check the payment and website settings.');
    const settings=await rpc('commerce_admin_save',{p_action:'settings',p_data:body.settings,p_actor:user.id});
    return json({settings});
   }
   if (body.action==='admin_update_customer') {
    assertKeys(['customerId','displayName','notes']); if (!uuid(body.customerId)||!shortText(body.displayName,80)||!shortText(body.notes,2000)) throw new ApiError(400,'Check the customer name and notes.');
    const customer=await rpc('commerce_admin_save',{p_action:'customer',p_data:{customerId:body.customerId,displayName:body.displayName,notes:body.notes},p_actor:user.id});
    if (!customer) throw new ApiError(404,'This customer was not found.');
    return json({customer});
   }
   throw new ApiError(400,'This dashboard action is not supported.');
  } catch (error) {
   return json({error:error instanceof ApiError?error.message:'Payments are temporarily unavailable. Please try again.'},error instanceof ApiError?error.status:503);
  } finally { clearTimeout(timeout); }
 };
}
if (typeof Deno!=='undefined') Deno.serve(createCommerceHandler(Deno.env));
