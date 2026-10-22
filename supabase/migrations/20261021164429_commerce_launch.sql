-- Commerce is mediated by the capability/auth checked commerce Edge Function.
-- No browser role can query customer, order, payment or credit data directly.
create table if not exists public.eva_admins (
  email text primary key check (email = lower(email) and length(email) <= 254),
  created_at timestamptz not null default now()
);
create table if not exists public.eva_products (
  id text primary key check (id ~ '^[a-z0-9-]{1,64}$'),
  title_en text not null check (length(title_en) between 1 and 100),
  title_vi text not null check (length(title_vi) between 1 and 100),
  description_en text not null default '' check (length(description_en) <= 1000),
  description_vi text not null default '' check (length(description_vi) <= 1000),
  price_vnd integer not null check (price_vnd between 1000 and 10000000),
  credits integer not null default 0 check (credits between 0 and 100),
  category text not null check (category in ('questions','love','work','life','packages','other')),
  kind text not null check (kind in ('credits','consultation')),
  active boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  updated_at timestamptz not null default now(),
  check ((kind = 'credits' and credits > 0) or (kind = 'consultation' and credits = 0))
);
create table if not exists public.eva_settings (
  id boolean primary key default true check (id),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 20000),
  updated_at timestamptz not null default now()
);
create table if not exists public.eva_wallets (
  id uuid primary key default gen_random_uuid(),
  device_hash text not null unique check (device_hash ~ '^[a-f0-9]{64}$'),
  credits integer not null default 0 check (credits >= 0),
  contact_email text check (length(contact_email) <= 254),
  display_name text not null default '' check (length(display_name) <= 80),
  admin_notes text not null default '' check (length(admin_notes) <= 2000),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists public.eva_orders (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.eva_wallets(id),
  idempotency_key uuid not null,
  product_id text references public.eva_products(id),
  product_snapshot jsonb not null check (jsonb_typeof(product_snapshot) = 'object'),
  kind text not null check (kind in ('credits','consultation','donation')),
  amount_vnd integer not null check (amount_vnd between 1000 and 10000000),
  credits integer not null default 0 check (credits between 0 and 100),
  status text not null default 'pending' check (status in ('pending','transfer_sent','confirmed','rejected')),
  transfer_reference text not null unique default ('EVA' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  contact_email text check (length(contact_email) <= 254),
  payment_note text not null default '' check (length(payment_note) <= 500),
  created_at timestamptz not null default now(),
  transfer_sent_at timestamptz,
  confirmed_at timestamptz,
  reviewed_by uuid,
  unique(wallet_id,idempotency_key)
);
create index if not exists eva_orders_product on public.eva_orders(product_id);
create index if not exists eva_orders_wallet_created on public.eva_orders(wallet_id,created_at desc);
create index if not exists eva_orders_confirmed_at on public.eva_orders(confirmed_at desc) where status='confirmed';
create index if not exists eva_wallets_last_seen on public.eva_wallets(last_seen_at desc);
create index if not exists eva_orders_status_created on public.eva_orders(status,created_at desc);
create table if not exists public.eva_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.eva_wallets(id),
  order_id uuid unique references public.eva_orders(id),
  reading_id uuid,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('purchase','reading','refund','trial')),
  created_at timestamptz not null default now()
);
create index if not exists eva_credit_ledger_wallet on public.eva_credit_ledger(wallet_id);
create unique index if not exists eva_credit_ledger_reading_once on public.eva_credit_ledger(reading_id,reason) where reading_id is not null;
create unique index if not exists eva_credit_ledger_trial_once on public.eva_credit_ledger(wallet_id) where reason = 'trial';
create table if not exists public.eva_reading_reservations (
  id uuid primary key,
  wallet_id uuid not null references public.eva_wallets(id),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  cost integer not null check (cost between 1 and 10),
  status text not null default 'reserved' check (status in ('reserved','completed','refunded')),
  -- AES-GCM envelope; the server derives the key from the private device token.
  response jsonb check (response is null or octet_length(response::text) <= 100000),
  response_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists eva_reading_reservations_wallet on public.eva_reading_reservations(wallet_id,status,created_at);
create index if not exists eva_reading_reservations_expiry on public.eva_reading_reservations(response_expires_at) where response is not null;
create table if not exists public.eva_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in ('landing_view','page_view','start_chat','pricing_view','checkout_started','reading_completed')),
  reading_id uuid unique,
  page text check (page in ('landing','app','pricing','support')),
  visitor_hash text not null check (visitor_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.eva_events add column if not exists page text check (page in ('landing','app','pricing','support'));
alter table public.eva_events drop constraint if exists eva_events_event_check;
alter table public.eva_events add constraint eva_events_event_check check (event in ('landing_view','page_view','start_chat','pricing_view','checkout_started','reading_completed'));
create index if not exists eva_events_created on public.eva_events(created_at desc);
create table if not exists public.eva_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  record_id text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.eva_commerce_quota (
  bucket text primary key,
  hits integer not null check (hits > 0),
  expires_at timestamptz not null
);
create table if not exists public.eva_server_credentials (
  id text primary key check (id='reading-api'),
  secret_hash text not null check (secret_hash ~ '^[a-f0-9]{64}$')
);
create index if not exists eva_commerce_quota_expiry on public.eva_commerce_quota(expires_at);

-- Explicit grants remain necessary even where a project's default privileges differ.
do $$ declare t text; begin
  foreach t in array array['eva_admins','eva_products','eva_settings','eva_wallets','eva_orders','eva_credit_ledger','eva_reading_reservations','eva_events','eva_admin_audit','eva_commerce_quota','eva_server_credentials'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select,insert,update,delete on table public.%I to service_role', t);
  end loop;
end $$;

insert into public.eva_settings(id,config) values (true,'{"pricing_mode":"consultations","free_trial_credits":0,"donations_enabled":true,"bank_name":"Techcombank","account_name":"","account_number":"6886439999","bank_bin":"970407","qr_image":"/payments/donation-qr.svg","qr_payload":"00020101021138540010A00000072701240006970407011068864399990208QRIBFTTA53037045802VN8300840063047F8B","support_email":"","announcement_en":"","announcement_vi":"","donation_suggested_vnd":[25000,50000,100000],"hero_title_en":"A little clarity, one conversation at a time.","hero_title_vi":"Một cuộc trò chuyện, thêm một chút rõ ràng.","hero_description_en":"Explore what is on your mind with tarot readings that speak to your real life.","hero_description_vi":"Cùng những lá bài nhìn lại điều bạn đang băn khoăn, bằng lời giải dễ hiểu và gần gũi."}'::jsonb)
on conflict(id) do nothing;

insert into public.eva_products(id,title_en,title_vi,description_en,description_vi,price_vnd,credits,category,kind,active,sort_order) values
 ('one-question','One question','1 câu hỏi','One credit for one completed AI reply, with any card count. Follow-up questions use another credit.','Một lượt cho một câu trả lời AI hoàn tất, với bất kỳ số lá bài nào. Mỗi lần hỏi tiếp dùng thêm một lượt.',25000,1,'questions','credits',true,10),
 ('three-questions','Three questions','3 câu hỏi','Three completed AI replies. Each follow-up reply uses one credit.','Ba câu trả lời AI hoàn tất. Mỗi câu trả lời cho lần hỏi tiếp dùng một lượt.',60000,3,'questions','credits',true,20),
 ('five-questions','Five questions','5 câu hỏi','Five completed AI replies. Each follow-up reply uses one credit.','Năm câu trả lời AI hoàn tất. Mỗi câu trả lời cho lần hỏi tiếp dùng một lượt.',95000,5,'questions','credits',true,30),
 ('love-reading','Relationship consultation','Tình cảm','A personal consultation; availability is confirmed separately.','Phiên tư vấn riêng; lịch hẹn được xác nhận riêng.',70000,0,'love','consultation',false,40),
 ('work-reading','Work or study consultation','Học tập – công việc','A personal consultation about work or study.','Phiên tư vấn riêng về học tập hoặc công việc.',70000,0,'work','consultation',false,50),
 ('life-reading','Life or choices consultation','Cuộc sống và lựa chọn','A personal consultation about a situation or choice.','Phiên tư vấn riêng về hoàn cảnh hoặc lựa chọn.',70000,0,'life','consultation',false,60),
 ('one-month','One-month overview','Tổng quan 1 tháng','A personal tarot consultation for the coming month.','Phiên tư vấn tarot riêng cho tháng tới.',100000,0,'packages','consultation',false,70),
 ('three-months','Three-month overview','Tổng quan 3 tháng','A personal tarot consultation for the next three months.','Phiên tư vấn tarot riêng cho ba tháng tới.',250000,0,'packages','consultation',false,80),
 ('six-months','Six-month overview','Tổng quan 6 tháng','A personal tarot consultation for the next six months.','Phiên tư vấn tarot riêng cho sáu tháng tới.',450000,0,'packages','consultation',false,90),
 ('mother-baby','Mother and baby consultation','Mẹ và bé','Manual service, not an AI medical or pregnancy reading.','Dịch vụ riêng; không phải tư vấn AI về y tế hoặc thai kỳ.',150000,0,'other','consultation',false,100),
 ('lenormand','Lenormand · three questions','Lenormand · 3 câu hỏi','Manual Lenormand service; not included in the AI tarot deck.','Dịch vụ Lenormand riêng; không có trong bộ tarot AI.',100000,0,'other','consultation',false,110),
 ('astrology','Lifetime astrology consultation','Tử vi trọn đời','Manual astrology service; not included in AI tarot.','Dịch vụ tử vi riêng; không có trong tarot AI.',600000,0,'other','consultation',false,120)
on conflict(id) do nothing;

drop function if exists public.commerce_take_quota(text,text);
create or replace function public.commerce_take_quota(p_ip_hash text,p_device_hash text default null,p_is_server boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_bucket text; v_limit integer; v_hits integer; v_now timestamptz:=clock_timestamp();
begin
 if p_ip_hash !~ '^[a-f0-9]{64}$' or p_ip_hash is null or (p_device_hash is not null and p_device_hash !~ '^[a-f0-9]{64}$') then raise exception 'Invalid quota'; end if;
 delete from public.eva_commerce_quota where expires_at<v_now;
 for v_bucket,v_limit in select q.bucket,q.quota from (values
  (1,(case when p_is_server then 'sm:' else 'ipm:' end)||p_ip_hash||':'||floor(extract(epoch from v_now)/60)::text,case when p_is_server then 600 else 90 end),
  (2,(case when p_is_server then 'sd:' else 'ipd:' end)||p_ip_hash||':'||floor(extract(epoch from v_now)/86400)::text,case when p_is_server then 20000 else 3000 end),
  (3,(case when p_is_server and p_device_hash is null then 'serverm:' else 'devm:' end)||coalesce(p_device_hash,p_ip_hash)||':'||floor(extract(epoch from v_now)/60)::text,case when p_is_server and p_device_hash is null then 600 else 60 end)
 ) q(position,bucket,quota) order by q.position loop
   insert into public.eva_commerce_quota(bucket,hits,expires_at) values(v_bucket,1,v_now+interval '2 days')
   on conflict(bucket) do update set hits=least(public.eva_commerce_quota.hits+1,1000000) returning hits into v_hits;
   if v_hits>v_limit then return false; end if;
 end loop;
 return true;
end $$;

create or replace function public.commerce_wallet(p_device_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.eva_wallets; trial integer; cfg jsonb; stale public.eva_reading_reservations;
begin
 if p_device_hash is null or p_device_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid wallet'; end if;
 insert into public.eva_wallets(device_hash) values(p_device_hash) on conflict(device_hash) do nothing;
 select * into w from public.eva_wallets where device_hash=p_device_hash for update;
 -- A killed server invocation must not leave a paid reader charged forever.
 -- Provider calls are capped at 90 seconds; five minutes cannot race a live call.
 for stale in select * from public.eva_reading_reservations where wallet_id=w.id and status='reserved' and created_at<clock_timestamp()-interval '5 minutes' for update loop
   insert into public.eva_credit_ledger(wallet_id,reading_id,delta,reason) values(w.id,stale.id,stale.cost,'refund') on conflict do nothing;
   if found then update public.eva_wallets set credits=credits+stale.cost where id=w.id returning * into w; end if;
   update public.eva_reading_reservations set status='refunded',updated_at=clock_timestamp() where id=stale.id;
 end loop;
 select config into cfg from public.eva_settings where id=true;
 if cfg->>'pricing_mode'='free_trial' then
   trial:=greatest(0,least(10,coalesce((cfg->>'free_trial_credits')::integer,0)));
   if trial>0 and not exists(select 1 from public.eva_credit_ledger where wallet_id=w.id and reason='trial') then
     insert into public.eva_credit_ledger(wallet_id,delta,reason) values(w.id,trial,'trial');
     update public.eva_wallets set credits=credits+trial where id=w.id returning * into w;
   end if;
 end if;
 update public.eva_wallets set last_seen_at=clock_timestamp() where id=w.id;
 return jsonb_build_object('id',w.id,'credits',w.credits,'createdAt',w.created_at);
end $$;

create or replace function public.commerce_create_order(p_device_hash text,p_product_id text,p_amount_vnd integer,p_idempotency_key uuid,p_contact_email text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.eva_wallets; p public.eva_products; o public.eva_orders; cfg jsonb;
begin
 perform public.commerce_wallet(p_device_hash);
 select * into w from public.eva_wallets where device_hash=p_device_hash for update;
 select * into o from public.eva_orders where wallet_id=w.id and idempotency_key=p_idempotency_key;
 if found then
   if o.product_id is distinct from p_product_id or (p_product_id is null and o.amount_vnd is distinct from p_amount_vnd) then raise exception using errcode='22023',message='Idempotency key already used'; end if;
   return to_jsonb(o)-'idempotency_key';
 end if;
 if (select count(*) from public.eva_orders where wallet_id=w.id and status in ('pending','transfer_sent') and created_at>clock_timestamp()-interval '1 day')>=10 then raise exception using errcode='P0001',message='Too many pending orders'; end if;
 if p_product_id is null then
   select config into cfg from public.eva_settings where id=true;
   if coalesce((cfg->>'donations_enabled')::boolean,false) is not true or p_amount_vnd is null or p_amount_vnd not between 1000 and 10000000 then raise exception using errcode='22023',message='Donation is unavailable'; end if;
   insert into public.eva_orders(wallet_id,idempotency_key,product_snapshot,kind,amount_vnd,credits,contact_email)
   values(w.id,p_idempotency_key,'{"title_en":"Voluntary donation","title_vi":"Ủng hộ tự nguyện"}','donation',p_amount_vnd,0,p_contact_email) returning * into o;
 else
   select * into p from public.eva_products where id=p_product_id and active=true for share;
   if not found then raise exception using errcode='22023',message='This option is unavailable'; end if;
   select config into cfg from public.eva_settings where id=true;
   if p.kind='credits' and cfg->>'pricing_mode'='consultations' then raise exception using errcode='22023',message='AI readings are currently free'; end if;
   insert into public.eva_orders(wallet_id,idempotency_key,product_id,product_snapshot,kind,amount_vnd,credits,contact_email)
   values(w.id,p_idempotency_key,p.id,to_jsonb(p),p.kind,p.price_vnd,p.credits,p_contact_email) returning * into o;
 end if;
 -- Contact details are unverified labels only, never credentials or account links.
 if p_contact_email is not null then update public.eva_wallets set contact_email=p_contact_email where id=w.id; end if;
 return to_jsonb(o)-'idempotency_key';
end $$;

create or replace function public.commerce_transfer_sent(p_device_hash text,p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.eva_orders;
begin
 select o1.* into o from public.eva_orders o1 join public.eva_wallets w on w.id=o1.wallet_id where o1.id=p_order_id and w.device_hash=p_device_hash for update of o1;
 if not found then return null; end if;
 if o.status='pending' then update public.eva_orders set status='transfer_sent',transfer_sent_at=clock_timestamp() where id=o.id returning * into o; end if;
 return to_jsonb(o)-'idempotency_key';
end $$;

create or replace function public.commerce_review_payment(p_order_id uuid,p_confirm boolean,p_actor uuid,p_note text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.eva_orders;
begin
 select * into o from public.eva_orders where id=p_order_id for update;
 if not found then return null; end if;
 if o.status='confirmed' then
   if not p_confirm then raise exception using errcode='22023',message='Confirmed payments cannot be rejected'; end if;
   return to_jsonb(o)-'idempotency_key';
 end if;
 if o.status='rejected' then
   if p_confirm then raise exception using errcode='22023',message='Rejected payment requires a new order'; end if;
   return to_jsonb(o)-'idempotency_key';
 end if;
 if p_confirm and o.credits>0 and o.kind='credits' then
   -- The order row lock serializes reviews, and unique order_id is a second
   -- invariant: a retry/concurrent admin can never credit this payment twice.
   insert into public.eva_credit_ledger(wallet_id,order_id,delta,reason) values(o.wallet_id,o.id,o.credits,'purchase');
   update public.eva_wallets set credits=credits+o.credits where id=o.wallet_id;
 end if;
 update public.eva_orders set status=case when p_confirm then 'confirmed' else 'rejected' end,
 confirmed_at=case when p_confirm then clock_timestamp() else null end,reviewed_by=p_actor,payment_note=left(coalesce(p_note,''),500)
 where id=o.id returning * into o;
 insert into public.eva_admin_audit(actor_id,action,record_id) values(p_actor,case when p_confirm then 'confirm_payment' else 'reject_payment' end,o.id::text);
 return to_jsonb(o)-'idempotency_key';
end $$;

create or replace function public.commerce_reserve_reading(p_device_hash text,p_request_id uuid,p_fingerprint text,p_cost integer default 1)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.eva_wallets; r public.eva_reading_reservations; cfg jsonb;
begin
 update public.eva_reading_reservations set response=null where response_expires_at<clock_timestamp() and response is not null;
 select config into cfg from public.eva_settings where id=true;
 if cfg is null then raise exception 'Commerce settings unavailable'; end if;
 if cfg->>'pricing_mode'='consultations' then return jsonb_build_object('required',false,'allowed',true); end if;
 if p_cost<>1 or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_request_id is null then raise exception 'Invalid reading reservation'; end if;
 perform public.commerce_wallet(p_device_hash);
 select * into w from public.eva_wallets where device_hash=p_device_hash for update;
 select * into r from public.eva_reading_reservations where id=p_request_id;
 if found then
   if r.wallet_id<>w.id or r.fingerprint<>p_fingerprint then raise exception using errcode='22023',message='Reading request already used'; end if;
   return jsonb_build_object('required',true,'allowed',r.status='completed','new',false,'status',case when r.status='completed' and r.response is null then 'expired' else r.status end,'credits',w.credits,'reservationId',r.id,'response',r.response);
 end if;
 if w.credits<p_cost then return jsonb_build_object('required',true,'allowed',false,'status','insufficient_credits','credits',w.credits); end if;
 insert into public.eva_reading_reservations(id,wallet_id,fingerprint,cost) values(p_request_id,w.id,p_fingerprint,p_cost);
 insert into public.eva_credit_ledger(wallet_id,reading_id,delta,reason) values(w.id,p_request_id,-p_cost,'reading');
 update public.eva_wallets set credits=credits-p_cost where id=w.id returning * into w;
 return jsonb_build_object('required',true,'allowed',true,'new',true,'status','reserved','credits',w.credits,'reservationId',p_request_id);
end $$;

create or replace function public.commerce_finish_reading(p_request_id uuid,p_device_hash text,p_response jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.eva_reading_reservations; w public.eva_wallets;
begin
 select * into w from public.eva_wallets where device_hash=p_device_hash for update;
 if not found then return false; end if;
 select * into r from public.eva_reading_reservations where id=p_request_id and wallet_id=w.id for update;
 if not found then return false; end if;
 if r.status='completed' then return true; end if;
 if r.status<>'reserved' or p_response is null or jsonb_typeof(p_response)<>'object' or octet_length(p_response::text)>100000 then return false; end if;
 update public.eva_reading_reservations set status='completed',response=p_response,response_expires_at=clock_timestamp()+interval '15 minutes',updated_at=clock_timestamp() where id=r.id;
 insert into public.eva_events(event,visitor_hash,reading_id) values('reading_completed',p_device_hash,p_request_id) on conflict(reading_id) do nothing;
 return true;
end $$;

create or replace function public.commerce_refund_reading(p_request_id uuid,p_device_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.eva_reading_reservations; w public.eva_wallets;
begin
 select * into w from public.eva_wallets where device_hash=p_device_hash for update;
 if not found then return false; end if;
 select * into r from public.eva_reading_reservations where id=p_request_id and wallet_id=w.id for update;
 if not found or r.status<>'reserved' then return false; end if;
 insert into public.eva_credit_ledger(wallet_id,reading_id,delta,reason) values(w.id,r.id,r.cost,'refund');
 update public.eva_wallets set credits=credits+r.cost where id=w.id;
 update public.eva_reading_reservations set status='refunded',updated_at=clock_timestamp() where id=r.id;
 return true;
end $$;

create or replace function public.commerce_record_reading_event(p_request_id uuid,p_visitor_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_request_id is null or p_visitor_hash is null or p_visitor_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid completed reading event'; end if;
 insert into public.eva_events(event,visitor_hash,reading_id) values('reading_completed',p_visitor_hash,p_request_id) on conflict(reading_id) do nothing;
 return true;
end $$;

create or replace function public.commerce_analytics()
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
 'customers',(select count(*) from public.eva_wallets),
 'orders',(select count(*) from public.eva_orders),
 'pendingPayments',(select count(*) from public.eva_orders where status in ('pending','transfer_sent')),
 'confirmedRevenueVnd',(select coalesce(sum(amount_vnd),0) from public.eva_orders where status='confirmed' and kind<>'donation'),
 'confirmedDonationsVnd',(select coalesce(sum(amount_vnd),0) from public.eva_orders where status='confirmed' and kind='donation'),
 'completedReadings',(select count(*) from public.eva_events where event='reading_completed'),
 'visitors30d',(select count(distinct e.visitor_hash) from public.eva_events e join public.eva_wallets w on w.device_hash=e.visitor_hash where e.created_at>now()-interval '30 days' and e.event in ('page_view','landing_view')),
 'pageViews30d',(select count(*) from public.eva_events where created_at>now()-interval '30 days' and event in ('page_view','landing_view')),
 'landingViews30d',(select count(*) from public.eva_events where created_at>now()-interval '30 days' and ((event='page_view' and page='landing') or event='landing_view')),
 'pricingViews30d',(select count(*) from public.eva_events where created_at>now()-interval '30 days' and event='pricing_view'),
 'chatStarts30d',(select count(*) from public.eva_events where created_at>now()-interval '30 days' and event='start_chat'),
 'daily',(select coalesce(jsonb_agg(to_jsonb(d) order by d.day),'[]') from (
   select day::date::text as day,
    (select count(*) from public.eva_events e where e.created_at>=day and e.created_at<day+interval '1 day' and e.event in ('page_view','landing_view')) as visits,
    (select count(*) from public.eva_events e where e.created_at>=day and e.created_at<day+interval '1 day' and e.event='reading_completed') as readings,
    (select coalesce(sum(o.amount_vnd),0) from public.eva_orders o where o.confirmed_at>=day and o.confirmed_at<day+interval '1 day' and o.status='confirmed') as revenue_vnd
   from generate_series(date_trunc('day',now())-interval '29 days',date_trunc('day',now()),interval '1 day') day
 ) d));
$$;

create or replace function public.commerce_admin_save(p_action text,p_data jsonb,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; p public.eva_products;
begin
 if p_actor is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid dashboard update'; end if;
 if p_action='product' then
   p:=jsonb_populate_record(null::public.eva_products,p_data);
   insert into public.eva_products(id,title_en,title_vi,description_en,description_vi,price_vnd,credits,category,kind,active,sort_order)
   values(p.id,p.title_en,p.title_vi,p.description_en,p.description_vi,p.price_vnd,p.credits,p.category,p.kind,p.active,p.sort_order)
   on conflict(id) do update set title_en=excluded.title_en,title_vi=excluded.title_vi,description_en=excluded.description_en,description_vi=excluded.description_vi,
     price_vnd=excluded.price_vnd,credits=excluded.credits,category=excluded.category,kind=excluded.kind,active=excluded.active,sort_order=excluded.sort_order,updated_at=clock_timestamp()
   returning to_jsonb(eva_products.*) into result;
 elsif p_action='settings' then
   update public.eva_settings set config=config||p_data,updated_at=clock_timestamp() where id=true returning config into result;
 elsif p_action='customer' then
   update public.eva_wallets set display_name=p_data->>'displayName',admin_notes=p_data->>'notes' where id=(p_data->>'customerId')::uuid
   returning to_jsonb(eva_wallets.*)-'device_hash' into result;
 else raise exception 'Unsupported dashboard update'; end if;
 if result is null then return null; end if;
 insert into public.eva_admin_audit(actor_id,action,record_id) values(p_actor,'update_'||p_action,coalesce(p_data->>'id',p_data->>'customerId','site'));
 return result;
end $$;

-- Function execute is never inherited from PUBLIC, even on older projects.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'commerce_%' loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- Make the new RPCs immediately visible to the Data API.
notify pgrst, 'reload schema';

-- Apply through a CLI-generated migration. Client keys never receive table or
-- RPC access; the capability-authenticated Edge Function is the sole data API.
create table if not exists public.journal_documents (
  owner_hash text primary key check (owner_hash ~ '^[a-f0-9]{64}$'),
  document jsonb not null check (
    jsonb_typeof(document) = 'object'
    and document ?& array['profile', 'sessions']
    and jsonb_typeof(document -> 'profile') = 'object'
    and jsonb_typeof(document -> 'sessions') = 'array'
    and octet_length(document::text) <= 1100000
  ),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.journal_documents enable row level security;
revoke all on table public.journal_documents from public, anon, authenticated;
grant select, insert, update on table public.journal_documents to service_role;

create table if not exists public.journal_rate_limits (
  bucket text primary key,
  hits integer not null check (hits > 0),
  expires_at timestamptz not null
);
create index if not exists journal_rate_limits_expiry on public.journal_rate_limits (expires_at);
alter table public.journal_rate_limits enable row level security;
revoke all on table public.journal_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.journal_rate_limits to service_role;

create or replace function public.journal_take_quota(p_device_hash text, p_ip_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket text;
  v_limit integer;
  v_hits integer;
  v_expiry timestamptz;
begin
  if p_device_hash is null or p_ip_hash is null or p_device_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid quota key';
  end if;
  -- Bound token-rotation abuse before allocating any per-device buckets.
  -- Explicit ordering is essential: rejected IPs never create fresh device rows.
  delete from public.journal_rate_limits where expires_at < v_now;
  for v_bucket, v_limit, v_expiry in
    select q.bucket, q.quota, q.expiry from (values
      (1, 'im:' || p_ip_hash || ':' || floor(extract(epoch from v_now) / 60)::text, 90, v_now + interval '2 minutes'),
      (2, 'id:' || p_ip_hash || ':' || floor(extract(epoch from v_now) / 86400)::text, 3000, v_now + interval '2 days'),
      (3, 'dm:' || p_device_hash || ':' || floor(extract(epoch from v_now) / 60)::text, 45, v_now + interval '2 minutes'),
      (4, 'dd:' || p_device_hash || ':' || floor(extract(epoch from v_now) / 86400)::text, 1200, v_now + interval '2 days')
    ) as q(position, bucket, quota, expiry) order by q.position
  loop
    insert into public.journal_rate_limits (bucket, hits, expires_at) values (v_bucket, 1, v_expiry)
    on conflict (bucket) do update set hits = least(public.journal_rate_limits.hits + 1, 1000000)
    returning hits into v_hits;
    if v_hits > v_limit then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.journal_take_quota(text, text) from public, anon, authenticated;
grant execute on function public.journal_take_quota(text, text) to service_role;

create or replace function public.journal_write(p_owner_hash text, p_document jsonb, p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if p_owner_hash is null or p_expected_revision is null or p_owner_hash !~ '^[a-f0-9]{64}$' or p_expected_revision < 0 then raise exception 'Invalid write'; end if;
  if p_expected_revision = 0 then
    insert into public.journal_documents (owner_hash, document) values (p_owner_hash, p_document)
    on conflict (owner_hash) do nothing
    returning jsonb_build_object('revision', revision, 'updated_at', updated_at) into v_result;
  else
    update public.journal_documents set document = p_document, revision = revision + 1, updated_at = clock_timestamp()
    where owner_hash = p_owner_hash and revision = p_expected_revision
    returning jsonb_build_object('revision', revision, 'updated_at', updated_at) into v_result;
  end if;
  -- NULL signals an optimistic-concurrency conflict; stale tabs cannot overwrite.
  return v_result;
end;
$$;
revoke all on function public.journal_write(text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.journal_write(text, jsonb, bigint) to service_role;

-- Approved launch policy: one trial reply, then paid AI packages.
update public.eva_settings set config=config || '{"pricing_mode":"free_trial","free_trial_credits":1}'::jsonb where id=true;
-- Provision owner allowlist separately from versioned public source.
