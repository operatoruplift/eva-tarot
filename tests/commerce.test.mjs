import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommerceHandler, hashToken, validProduct, validSettings } from '../supabase/functions/commerce/index.ts';
import { createCommerceProxyHandler, createCommerceReadingClient, encryptReadingResponse, decryptReadingResponse } from '../server/commerce-proxy.mjs';
import { createServer } from 'node:http';

const deviceA='a'.repeat(64),deviceB='b'.repeat(64),internalKey='c'.repeat(64);
const orderId='afcc30a4-0872-4e85-9e2f-9463bc35b0fe',walletId='740f82c4-27d8-445d-b047-95c9e7b41a09',requestId='afcc30a4-0872-4e85-9e2f-9463bc35b0fa';
const adminId='afcc30a4-0872-4e85-9e2f-9463bc35b0fb';
const product={id:'one-question',title_en:'One question',title_vi:'1 câu hỏi',description_en:'A reading',description_vi:'Một bài đọc',price_vnd:25000,credits:1,category:'questions',kind:'credits',active:true,sort_order:10};
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret',SUPABASE_PUBLISHABLE_KEY:'public-test'};
const makeRequest=(body,headers={})=>new Request('https://project.supabase.co/functions/v1/commerce',{method:'POST',headers:{origin:'https://evatarot.xyz',apikey:'public-test','content-type':'application/json','x-eva-device':deviceA,...headers},body:JSON.stringify(body)});
function backend({verified=true,allowlisted=true,quota=true,throwDatabase=false}={}) {
 const calls=[]; const wallets=new Map(); const orders=[]; let authCalls=0;
 const fetcher=async (url,init={})=>{
  calls.push({url,init});
  if (url.endsWith('/auth/v1/user')) {authCalls++;return Response.json({id:adminId,email:'owner@example.com',email_confirmed_at:verified?'2026-01-01T00:00:00Z':null,user_metadata:{admin:true}});}
  if (throwDatabase) throw new Error('service-secret database internals');
  const name=new URL(url).pathname.split('/').at(-1),body=init.body?JSON.parse(init.body):{};
  if (name==='commerce_take_quota') return Response.json(quota);
  if (name==='commerce_wallet') {
   if (!wallets.has(body.p_device_hash)) wallets.set(body.p_device_hash,{id:body.p_device_hash===await hashToken(deviceA)?walletId:requestId,credits:0});
   return Response.json(wallets.get(body.p_device_hash));
  }
  if (name==='commerce_create_order') {
   const w=wallets.get(body.p_device_hash)||{id:walletId}; wallets.set(body.p_device_hash,w);
   const previous=orders.find(o=>o.wallet_id===w.id&&o.idempotency_key===body.p_idempotency_key);
   if (previous) return Response.json(previous);
   const o={id:orderId,wallet_id:w.id,idempotency_key:body.p_idempotency_key,amount_vnd:body.p_product_id?product.price_vnd:body.p_amount_vnd,status:'pending',credits:body.p_product_id?product.credits:0};orders.push(o);return Response.json(o);
  }
  if (name==='commerce_transfer_sent') return Response.json(body.p_device_hash===await hashToken(deviceA)?{id:body.p_order_id,status:'transfer_sent'}:null);
  if (name==='commerce_review_payment') return Response.json({id:body.p_order_id,status:body.p_confirm?'confirmed':'rejected'});
  if (name==='commerce_admin_save') return Response.json(body.p_data);
  if (name==='commerce_reserve_reading') return Response.json({required:true,allowed:true,new:true,status:'reserved',credits:0});
  if (['commerce_finish_reading','commerce_refund_reading','commerce_record_reading_event'].includes(name)) return Response.json(true);
  if (name==='commerce_analytics') return Response.json({customers:wallets.size,orders:orders.length,confirmedRevenueVnd:0,daily:[]});
  if (name==='eva_products') return Response.json([product]);
  if (name==='eva_settings') return Response.json([{config:{pricing_mode:'consultations',donations_enabled:true}}]);
  if (name==='eva_admins') return Response.json(allowlisted?[{email:'owner@example.com'}]:[]);
  if (name==='eva_server_credentials') return Response.json(url.includes(await hashToken(internalKey))?[{id:'reading-api'}]:[]);
  if (name==='eva_wallets') return Response.json([...wallets.values()]);
  if (name==='eva_orders') { const id=new URL(url).searchParams.get('wallet_id')?.slice(3); return Response.json(id?orders.filter(o=>o.wallet_id===id):orders); }
  if (name==='eva_events') return new Response(null,{status:204});
  throw new Error(`Unexpected fixture path ${name}`);
 };
 return {handler:createCommerceHandler({get:key=>env[key]},fetcher),calls,wallets,orders,authCalls:()=>authCalls};
}

test('catalog is public but rejects foreign origins and unknown keys',async()=>{
 const b=backend();const response=await b.handler(makeRequest({action:'catalog'})); assert.equal(response.status,200);const value=await response.json();assert.equal(value.catalog.products[0].price_vnd,25000);
 assert.equal(response.headers.get('access-control-allow-origin'),'https://evatarot.xyz');
 assert.equal((await b.handler(makeRequest({action:'catalog'},{origin:'https://evil.example'}))).status,403);
 assert.equal((await b.handler(makeRequest({action:'catalog',service_role:'anything'}))).status,400);
});
test('wallet requires a valid capability and sends only its SHA256 hash to database',async()=>{
 const b=backend();assert.equal((await b.handler(makeRequest({action:'wallet'},{'x-eva-device':'short'}))).status,401);
 assert.equal((await b.handler(makeRequest({action:'wallet'}))).status,200);
 assert.ok(b.calls.every(c=>!c.url.includes(deviceA)&&!String(c.init.body).includes(deviceA)));
 const expected=await hashToken(deviceA);assert.ok(b.calls.some(c=>c.url.endsWith('/rpc/commerce_wallet')&&JSON.parse(c.init.body).p_device_hash===expected));
});
test('unverified contact email cannot select another wallet or grant dashboard access',async()=>{
 const b=backend();await b.handler(makeRequest({action:'create_order',productId:'one-question',idempotencyKey:requestId,contactEmail:'owner@example.com'}));
 const result=await(await b.handler(makeRequest({action:'wallet'},{'x-eva-device':deviceB}))).json();assert.deepEqual(result.orders,[]);
 assert.equal((await b.handler(makeRequest({action:'admin_dashboard',contactEmail:'owner@example.com'}))).status,401);
 assert.equal(b.authCalls(),0);
});
test('checkout cannot set its own price or credits and retries keep one order',async()=>{
 const b=backend();assert.equal((await b.handler(makeRequest({action:'create_order',productId:'one-question',idempotencyKey:requestId,price_vnd:1,credits:100}))).status,400);
 const first=await(await b.handler(makeRequest({action:'create_order',productId:'one-question',idempotencyKey:requestId}))).json();
 const second=await(await b.handler(makeRequest({action:'create_order',productId:'one-question',idempotencyKey:requestId}))).json();
 assert.equal(first.order.id,second.order.id);assert.equal(first.order.amount_vnd,25000);assert.equal(first.order.status,'pending');assert.equal(b.orders.length,1);
});
test('donations are pending voluntary payments with no reading credits',async()=>{
 const b=backend();const value=await(await b.handler(makeRequest({action:'create_donation',amountVnd:50000,idempotencyKey:requestId}))).json();
 assert.equal(value.order.credits,0);assert.equal(value.order.status,'pending');
 assert.equal((await b.handler(makeRequest({action:'create_donation',amountVnd:-1,idempotencyKey:requestId}))).status,400);
});
test('transfer sent is never payment confirmation and cannot touch another wallet order',async()=>{
 const b=backend();const sent=await(await b.handler(makeRequest({action:'transfer_sent',orderId}))).json();assert.equal(sent.order.status,'transfer_sent');
 assert.equal((await b.handler(makeRequest({action:'transfer_sent',orderId},{'x-eva-device':deviceB}))).status,404);
});
test('admin needs a real bearer, confirmed email and server allowlist; user metadata is irrelevant',async()=>{
 const b=backend();assert.equal((await b.handler(makeRequest({action:'admin_dashboard'}))).status,401);
 assert.equal((await backend({verified:false}).handler(makeRequest({action:'admin_dashboard'},{authorization:'Bearer real-auth-token'}))).status,403);
 assert.equal((await backend({allowlisted:false}).handler(makeRequest({action:'admin_dashboard'},{authorization:'Bearer real-auth-token'}))).status,403);
 const response=await b.handler(makeRequest({action:'admin_dashboard'},{authorization:'Bearer real-auth-token'}));assert.equal(response.status,200);
 assert.equal((await response.json()).summary.confirmedRevenueVnd,0);
 assert.ok(b.calls.some(c=>c.url.endsWith('/auth/v1/user')&&c.init.headers.Authorization==='Bearer real-auth-token'));
});
test('admin review uses atomic SQL RPC and guest cannot call it',async()=>{
 const b=backend();assert.equal((await b.handler(makeRequest({action:'admin_confirm_payment',orderId}))).status,401);
 const response=await b.handler(makeRequest({action:'admin_confirm_payment',orderId},{authorization:'Bearer real-auth-token'}));assert.equal(response.status,200);
 const call=b.calls.find(c=>c.url.endsWith('/rpc/commerce_review_payment'));assert.deepEqual(JSON.parse(call.init.body),{p_order_id:orderId,p_confirm:true,p_actor:adminId,p_note:''});
});
test('product and settings validation prevents unsupported data and credit escalation via customer edit',async()=>{
 assert.equal(validProduct(product),true);assert.equal(validProduct({...product,price_vnd:0}),false);assert.equal(validProduct({...product,kind:'consultation',credits:1}),false);
 assert.equal(validSettings({pricing_mode:'paid',announcement_vi:'Xin chào',donation_suggested_vnd:[25000,50000]}),true);
 assert.equal(validSettings({pricing_mode:['paid']}),false);assert.equal(validProduct({...product,category:['questions']}),false);assert.equal(validProduct({...product,kind:['credits']}),false);
 assert.equal(validSettings({service_role:'secret'}),false);assert.equal(validSettings({free_trial_credits:100}),false);assert.equal(validSettings({qr_image:'https://tracker.example/x.png'}),false);
 const b=backend();assert.equal((await b.handler(makeRequest({action:'admin_update_customer',customerId:walletId,displayName:'Linh',notes:'',credits:99},{authorization:'Bearer real-auth-token'}))).status,400);
});
test('private reserve/finish/refund require independent server secret and encrypted result',async()=>{
 const b=backend();const payload={action:'reading_reserve',requestId,fingerprint:'d'.repeat(64)};
 assert.equal((await b.handler(makeRequest(payload))).status,403);
 assert.equal((await b.handler(makeRequest(payload,{'x-eva-internal':'e'.repeat(64)}))).status,403);
 assert.equal((await b.handler(makeRequest(payload,{'x-eva-internal':internalKey}))).status,200);
 assert.equal((await b.handler(makeRequest({action:'reading_finish',requestId,response:{text:'private chat'}},{'x-eva-internal':internalKey}))).status,400);
 const encrypted=encryptReadingResponse({text:'private chat'},deviceA,requestId);
 assert.equal((await b.handler(makeRequest({action:'reading_finish',requestId,response:encrypted},{'x-eva-internal':internalKey}))).status,200);
});
test('quota and database failure do not expose secrets or report successful payment',async()=>{
 assert.equal((await backend({quota:false}).handler(makeRequest({action:'wallet'}))).status,429);
 const failure=await backend({throwDatabase:true}).handler(makeRequest({action:'wallet'}));assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/service-secret|database internals/);
 const unconfigured=createCommerceHandler({get:()=>undefined});assert.equal((await unconfigured(makeRequest({action:'create_order'}))).status,503);
});
test('oversized requests and invalid methods fail before data operations',async()=>{
 const b=backend();assert.equal((await b.handler(makeRequest({action:'catalog',extra:'x'.repeat(100100)}))).status,413);
 assert.equal((await b.handler(new Request('https://project.supabase.co/functions/v1/commerce'))).status,405);assert.equal(b.calls.length,0);
});
test('encrypted reading cache is authenticated to private token and request id',()=>{
 const value={text:'Sensitive relationship context',mode:'ai'};const encrypted=encryptReadingResponse(value,deviceA,requestId);
 assert.doesNotMatch(JSON.stringify(encrypted),/Sensitive|relationship/);assert.deepEqual(decryptReadingResponse(encrypted,deviceA,requestId),value);
 assert.throws(()=>decryptReadingResponse(encrypted,deviceB,requestId));assert.throws(()=>decryptReadingResponse(encrypted,deviceA,orderId));
 assert.throws(()=>decryptReadingResponse({...encrypted,ciphertext:encrypted.ciphertext.slice(0,-4)+'AAAA'},deviceA,requestId));
});
test('reading client fails closed when a paid backend is unconfigured',async()=>{
 const client=createCommerceReadingClient({supabaseUrl:'',publicKey:'',pricingMode:'paid'});
 await assert.rejects(client.reserve({deviceToken:deviceA,requestId,input:{question:'test'}}),error=>error.status===503);
 const legacy=createCommerceReadingClient({supabaseUrl:'',publicKey:'',pricingMode:'consultations'});assert.equal((await legacy.reserve({})).required,false);
});
test('reading retries decrypt only completed cached results and bind full validated context',async()=>{
 const calls=[],input={question:'My real situation',cardIds:[1],language:'vi'},answer={text:'A grounded response'};
 const encrypted=encryptReadingResponse(answer,deviceA,requestId);
 const fetchImpl=async(url,init)=>{const body=JSON.parse(init.body);calls.push({body,headers:init.headers});return Response.json(body.action==='catalog'?{catalog:{settings:{pricing_mode:'paid'}}}:{reservation:{required:true,allowed:true,status:'completed',response:encrypted}});};
 const client=createCommerceReadingClient({supabaseUrl:env.SUPABASE_URL,publicKey:'public-test',internalKey,fetchImpl});
 const result=await client.reserve({deviceToken:deviceA,requestId,input});assert.deepEqual(result.response,answer);
 assert.equal(calls[1].headers['X-Eva-Internal'],internalKey);assert.equal(calls[1].body.fingerprint,await hashToken(JSON.stringify(input)));
});
test('public server proxy does not forward browser internal secret or cross-site requests',async()=>{
 const calls=[];const handler=createCommerceProxyHandler({supabaseUrl:env.SUPABASE_URL,publicKey:'public-test',fetchImpl:async(url,init)=>{calls.push(init);return Response.json({catalog:{products:[],settings:{}}});}});
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const good=await fetch(base+'/api/commerce',{method:'POST',headers:{'content-type':'application/json',origin:base,'x-eva-device':deviceA,'x-eva-internal':internalKey,authorization:'Bearer actual-admin-token'},body:JSON.stringify({action:'catalog'})});assert.equal(good.status,200);
  assert.equal(calls[0].headers['X-Eva-Internal'],undefined);assert.equal(calls[0].headers.Authorization,'Bearer actual-admin-token');
  const denied=await fetch(base+'/api/commerce',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:JSON.stringify({action:'catalog'})});assert.equal(denied.status,403);
  const internal=await fetch(base+'/api/commerce',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reading_refund',requestId})});assert.equal(internal.status,400);assert.equal(calls.length,1);
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('anonymous analytics only accepts small aggregate event fields and no reusable visitor ID',async()=>{
 const b=backend();const response=await b.handler(makeRequest({action:'track_event',name:'page_view',page:'landing'},{'x-eva-device':''}));assert.equal(response.status,200);
 const event=JSON.parse(b.calls.find(c=>c.url.endsWith('/eva_events')).init.body);assert.deepEqual(Object.keys(event).sort(),['event','page','visitor_hash']);assert.match(event.visitor_hash,/^[a-f0-9]{64}$/);
 assert.equal((await b.handler(makeRequest({action:'track_event',name:'reading_completed',page:'landing'}))).status,400);
 assert.equal((await b.handler(makeRequest({action:'track_event',name:'page_view',page:'landing',question:'private chat'}))).status,400);
});

test('Edge trusts a forwarded client IP only after checking the independent server credential',async()=>{
 const b=backend();
 await b.handler(makeRequest({action:'catalog'},{'x-eva-internal':internalKey,'x-eva-client-ip':'203.0.113.10','x-forwarded-for':'198.51.100.1'}));
 let quota=b.calls.filter(c=>c.url.endsWith('/rpc/commerce_take_quota')).at(-1);
 assert.equal(JSON.parse(quota.init.body).p_ip_hash,await hashToken('service-secret:commerce-ip:203.0.113.10'));
 assert.equal(JSON.parse(quota.init.body).p_is_server,false);
 await b.handler(makeRequest({action:'catalog'},{'x-eva-internal':'e'.repeat(64),'x-eva-client-ip':'203.0.113.99','x-forwarded-for':'198.51.100.1'}));
 quota=b.calls.filter(c=>c.url.endsWith('/rpc/commerce_take_quota')).at(-1);
 assert.equal(JSON.parse(quota.init.body).p_ip_hash,await hashToken('service-secret:commerce-ip:198.51.100.1'));
});
test('proxy attests only platform-derived client address and never browser-supplied internal headers',async()=>{
 const calls=[];const handler=createCommerceProxyHandler({supabaseUrl:env.SUPABASE_URL,publicKey:'public-test',internalKey,isVercel:true,fetchImpl:async(url,init)=>{calls.push(init);return Response.json({catalog:{products:[],settings:{}}});}});
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  await fetch(base+'/api/commerce',{method:'POST',headers:{'content-type':'application/json','x-eva-internal':'f'.repeat(64),'x-eva-client-ip':'203.0.113.99','x-vercel-forwarded-for':'203.0.113.20'},body:JSON.stringify({action:'catalog'})});
  assert.equal(calls[0].headers['X-Eva-Internal'],internalKey);assert.equal(calls[0].headers['X-Eva-Client-IP'],'203.0.113.20');
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('successful free-reading analytics use a server-only event and cannot be faked publicly',async()=>{
 const b=backend();const payload={action:'reading_record_event',requestId};
 assert.equal((await b.handler(makeRequest(payload,{'x-eva-device':''}))).status,403);
 assert.equal((await b.handler(makeRequest(payload,{'x-eva-device':'','x-eva-internal':internalKey}))).status,200);
 const event=b.calls.find(c=>c.url.endsWith('/rpc/commerce_record_reading_event'));assert.equal(JSON.parse(event.init.body).p_request_id,requestId);
});
