// Opt-in integration coverage against an isolated local PostgreSQL instance.
// Never run destructive fixtures on a hosted or production database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const execute=promisify(execFile),database=process.env.EVA_COMMERCE_TEST_DATABASE_URL;
const sql=async(query)=>{const {stdout}=await execute('psql',[database,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',query],{maxBuffer:1024*1024});return stdout.trim();};
const json=async(query)=>JSON.parse(await sql(`select coalesce(to_jsonb(q.value),'null'::jsonb) from (${query}) q(value)`));
const actor='7e52fe18-2b13-4bf8-a50e-78533550393a';
const hash=()=>randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
const order=async(device,product='one-question',id=randomUUID())=>json(`select public.commerce_create_order('${device}','${product}',null,'${id}','unverified@example.com')`);

test('commerce database invariants use real row locks, grants, and transactions',{skip:!database},async(t)=>{
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(database).hostname),'Integration fixtures require an isolated LOCAL database');
 const schema=await readFile(new URL('../supabase/commerce-schema.sql',import.meta.url),'utf8');
 // psql -f applies the same file that will be deployed, rather than a test rewrite.
 await execute('psql',[database,'-X','-q','-v','ON_ERROR_STOP=1','-f',new URL('../supabase/commerce-schema.sql',import.meta.url).pathname]);
 assert.ok(schema.length>1000);
 await sql(`update public.eva_settings set config=config||'{"pricing_mode":"paid","free_trial_credits":0}'::jsonb where id=true`);
 await t.test('RLS and grants deny direct customer data and every commerce RPC to browser roles',async()=>{
  const privileges=await json(`select jsonb_build_object('tables',(select bool_and(c.relrowsecurity and not has_table_privilege('anon',c.oid,'select') and not has_table_privilege('authenticated',c.oid,'insert')) from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relname like 'eva_%' and c.relkind='r'),'functions',(select bool_and(not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute') and has_function_privilege('service_role',p.oid,'execute')) from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname like 'commerce_%'))`);
  assert.deepEqual(privileges,{tables:true,functions:true});
 });
 await t.test('idempotent checkout snapshots authoritative prices and rejects inactive or invented products',async()=>{
  const device=hash(),key=randomUUID(),first=await order(device,'one-question',key);
  assert.equal(first.amount_vnd,25000);assert.equal(first.credits,1);assert.equal(first.status,'pending');
  await sql(`update public.eva_products set price_vnd=26000 where id='one-question'`);
  try {const retried=await order(device,'one-question',key);assert.equal(retried.id,first.id);assert.equal(retried.amount_vnd,25000);assert.equal(retried.product_snapshot.price_vnd,25000);}
  finally {await sql(`update public.eva_products set price_vnd=25000 where id='one-question'`);}
  await assert.rejects(order(device,'missing-product'));
  await sql(`update public.eva_products set active=false where id='astrology'`);
  try { await assert.rejects(order(device,'astrology')); }
  finally { await sql(`update public.eva_products set active=true where id='astrology'`); }
 });
 await t.test('concurrent admin confirmations credit the same order exactly once',async()=>{
  const device=hash(),created=await order(device,'five-questions');
  const query=`select public.commerce_review_payment('${created.id}',true,'${actor}','Verified against bank statement')`;
  const results=await Promise.all([json(query),json(query),json(query),json(query)]);assert.ok(results.every(result=>result.status==='confirmed'));
  const wallet=await json(`select public.commerce_wallet('${device}')`);assert.equal(wallet.credits,5);
  assert.equal(Number(await sql(`select count(*) from public.eva_credit_ledger where order_id='${created.id}'`)),1);
 });
 await t.test('another device cannot mark a payment and transfer sent itself grants no credits',async()=>{
  const device=hash(),created=await order(device);
  assert.equal(await json(`select public.commerce_transfer_sent('${hash()}','${created.id}')`),null);
  const sent=await json(`select public.commerce_transfer_sent('${device}','${created.id}')`);assert.equal(sent.status,'transfer_sent');
  assert.equal((await json(`select public.commerce_wallet('${device}')`)).credits,0);
 });
 await t.test('donation confirmation never grants credits',async()=>{
  const device=hash();const created=await json(`select public.commerce_create_order('${device}',null,50000,'${randomUUID()}',null)`);
  assert.equal(created.kind,'donation');await json(`select public.commerce_review_payment('${created.id}',true,'${actor}','')`);
  assert.equal((await json(`select public.commerce_wallet('${device}')`)).credits,0);
 });
 await t.test('concurrent reserve/refund cannot double-debit or create free credits',async()=>{
  const device=hash(),created=await order(device,'three-questions'),request=randomUUID(),fingerprint=hash();
  await json(`select public.commerce_review_payment('${created.id}',true,'${actor}','')`);
  const reserve=`select public.commerce_reserve_reading('${device}','${request}','${fingerprint}',1)`;
  const results=await Promise.all([json(reserve),json(reserve)]);assert.equal(results.filter(result=>result.new).length,1);
  assert.equal((await json(`select public.commerce_wallet('${device}')`)).credits,2);
  const refunds=await Promise.all([json(`select public.commerce_refund_reading('${request}','${device}')`),json(`select public.commerce_refund_reading('${request}','${device}')`)]);
  assert.equal(refunds.filter(Boolean).length,1);assert.equal((await json(`select public.commerce_wallet('${device}')`)).credits,3);
  assert.equal(await json(`select public.commerce_refund_reading('${randomUUID()}','${device}')`),false);
 });
 await t.test('completed responses expire and cannot be refunded or rebound to changed user context',async()=>{
  const device=hash(),created=await order(device),request=randomUUID(),fingerprint=hash();
  await json(`select public.commerce_review_payment('${created.id}',true,'${actor}','')`);
  await json(`select public.commerce_reserve_reading('${device}','${request}','${fingerprint}',1)`);
  assert.equal(await json(`select public.commerce_finish_reading('${request}','${device}','{"version":1,"iv":"AAAAAAAAAAAAAAAA","ciphertext":"ZW5jcnlwdGVkIGZpeHR1cmU="}')`),true);
  assert.equal(await json(`select public.commerce_refund_reading('${request}','${device}')`),false);
  await assert.rejects(json(`select public.commerce_reserve_reading('${device}','${request}','${hash()}',1)`));
  await sql(`update public.eva_reading_reservations set response_expires_at=now()-interval '1 second' where id='${request}'`);
  const retry=await json(`select public.commerce_reserve_reading('${device}','${request}','${fingerprint}',1)`);assert.equal(retry.status,'expired');assert.equal(retry.response,null);
 });
 await t.test('a killed server charge recovers after five minutes once only',async()=>{
  const device=hash(),created=await order(device),request=randomUUID();await json(`select public.commerce_review_payment('${created.id}',true,'${actor}','')`);
  await json(`select public.commerce_reserve_reading('${device}','${request}','${hash()}',1)`);
  await sql(`update public.eva_reading_reservations set created_at=now()-interval '6 minutes' where id='${request}'`);
  assert.equal((await json(`select public.commerce_wallet('${device}')`)).credits,1);assert.equal((await json(`select public.commerce_wallet('${device}')`)).credits,1);
 });
 await t.test('consultations mode still blocks AI credit sales and human consultations can be booked',async()=>{
  await sql(`update public.eva_settings set config=config||'{"pricing_mode":"consultations"}'::jsonb where id=true`);
  await assert.rejects(order(hash()));
  const booked=await order(hash(),'astrology');
  assert.equal(booked.kind,'consultation');assert.equal(booked.credits,0);assert.equal(booked.status,'pending');assert.equal(booked.booking_status,'awaiting_payment');assert.equal(booked.amount_vnd,600000);
  const rows=await json(`select jsonb_agg(jsonb_build_object('id',id,'active',active)) from public.eva_products where id in ('mother-baby','lenormand','astrology')`);assert.ok(rows.every(row=>row.active===true));
  await sql(`update public.eva_settings set config=config||'{"pricing_mode":"paid"}'::jsonb where id=true`);
 });
 await t.test('free successful-reading events are idempotent and included in aggregate analytics',async()=>{
  const request=randomUUID(),visitor=hash();const before=await json('select public.commerce_analytics()');
  await Promise.all([json(`select public.commerce_record_reading_event('${request}','${visitor}')`),json(`select public.commerce_record_reading_event('${request}','${visitor}')`)]);
  const after=await json('select public.commerce_analytics()');assert.equal(after.completedReadings,before.completedReadings+1);
 });
 await t.test('CMS settings merge updates atomically and write an audit record',async()=>{
  const [a,b]=await Promise.all([json(`select public.commerce_admin_save('settings','{"hero_title_en":"A grounded reading"}','${actor}')`),json(`select public.commerce_admin_save('settings','{"announcement_vi":"Xin chào"}','${actor}')`)]);assert.ok(a&&b);
  const config=await json('select config from public.eva_settings where id=true');assert.equal(config.hero_title_en,'A grounded reading');assert.equal(config.announcement_vi,'Xin chào');
  assert.ok(Number(await sql(`select count(*) from public.eva_admin_audit where actor_id='${actor}' and action='update_settings'`))>=2);
 });
});
