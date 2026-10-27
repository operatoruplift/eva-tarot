-- Opens VietQR checkout for credit packs and human consultations on a database
-- that already applied the launch migration. Does not change prices.
-- TODO(owner): Confirm the one-question price. The stored amount is 25000 VND
-- and looks truncated or unclear. Do not guess a replacement.

alter table public.eva_orders add column if not exists customer_note text not null default '';
alter table public.eva_orders add column if not exists schedule_note text not null default '';
alter table public.eva_orders add column if not exists booking_status text not null default 'none';
alter table public.eva_orders drop constraint if exists eva_orders_booking_status_check;
alter table public.eva_orders add constraint eva_orders_booking_status_check check (booking_status in ('none','awaiting_payment','paid','scheduled','completed','cancelled'));

alter table public.eva_events drop constraint if exists eva_events_page_check;
alter table public.eva_events add constraint eva_events_page_check check (page is null or page in ('landing','app','pricing','support','terms'));

-- Turn booking on. Refresh only the original launch descriptions so an owner
-- edit in the dashboard is left alone.
update public.eva_products set active = true, updated_at = clock_timestamp()
where kind = 'consultation' and active = false;

update public.eva_products as p set
  description_en = v.description_en,
  description_vi = v.description_vi,
  updated_at = clock_timestamp()
from (values
  ('love-reading', 'A personal consultation; availability is confirmed separately.', 'Phiên tư vấn riêng; lịch hẹn được xác nhận riêng.', 'A human consultation with Eva. Pay by bank transfer, then Eva confirms the booking.', 'Buổi tư vấn trực tiếp với Eva. Chuyển khoản, rồi Eva xác nhận lịch.'),
  ('work-reading', 'A personal consultation about work or study.', 'Phiên tư vấn riêng về học tập hoặc công việc.', 'A human consultation about work or study. Pay by bank transfer, then Eva confirms the booking.', 'Buổi tư vấn trực tiếp về học tập hoặc công việc. Chuyển khoản, rồi Eva xác nhận lịch.'),
  ('life-reading', 'A personal consultation about a situation or choice.', 'Phiên tư vấn riêng về hoàn cảnh hoặc lựa chọn.', 'A human consultation about a situation or choice. Pay by bank transfer, then Eva confirms the booking.', 'Buổi tư vấn trực tiếp về hoàn cảnh hoặc lựa chọn. Chuyển khoản, rồi Eva xác nhận lịch.'),
  ('one-month', 'A personal tarot consultation for the coming month.', 'Phiên tư vấn tarot riêng cho tháng tới.', 'A human tarot consultation for the coming month. Pay by bank transfer, then Eva confirms the booking.', 'Buổi tư vấn tarot trực tiếp cho tháng tới. Chuyển khoản, rồi Eva xác nhận lịch.'),
  ('three-months', 'A personal tarot consultation for the next three months.', 'Phiên tư vấn tarot riêng cho ba tháng tới.', 'A human tarot consultation for the next three months. Pay by bank transfer, then Eva confirms the booking.', 'Buổi tư vấn tarot trực tiếp cho ba tháng tới. Chuyển khoản, rồi Eva xác nhận lịch.'),
  ('six-months', 'A personal tarot consultation for the next six months.', 'Phiên tư vấn tarot riêng cho sáu tháng tới.', 'A human tarot consultation for the next six months. Pay by bank transfer, then Eva confirms the booking.', 'Buổi tư vấn tarot trực tiếp cho sáu tháng tới. Chuyển khoản, rồi Eva xác nhận lịch.'),
  ('mother-baby', 'Manual service, not an AI medical or pregnancy reading.', 'Dịch vụ riêng; không phải tư vấn AI về y tế hoặc thai kỳ.', 'A human consultation. Not an AI medical or pregnancy reading. Pay by bank transfer, then Eva confirms the booking.', 'Buổi tư vấn trực tiếp; không phải tư vấn AI về y tế hoặc thai kỳ. Chuyển khoản, rồi Eva xác nhận lịch.'),
  ('lenormand', 'Manual Lenormand service; not included in the AI tarot deck.', 'Dịch vụ Lenormand riêng; không có trong bộ tarot AI.', 'A human Lenormand consultation; not included in the AI tarot deck. Pay by bank transfer, then Eva confirms the booking.', 'Buổi tư vấn Lenormand trực tiếp; không có trong bộ tarot AI. Chuyển khoản, rồi Eva xác nhận lịch.'),
  ('astrology', 'Manual astrology service; not included in AI tarot.', 'Dịch vụ tử vi riêng; không có trong tarot AI.', 'A human astrology consultation; not included in AI tarot. Pay by bank transfer, then Eva confirms the booking.', 'Buổi tư vấn tử vi trực tiếp; không có trong tarot AI. Chuyển khoản, rồi Eva xác nhận lịch.')
) as v(id, old_en, old_vi, description_en, description_vi)
where p.id = v.id and p.description_en = v.old_en and p.description_vi = v.old_vi;

drop function if exists public.commerce_create_order(text,text,integer,uuid,text);
create or replace function public.commerce_create_order(p_device_hash text,p_product_id text,p_amount_vnd integer,p_idempotency_key uuid,p_contact_email text default null,p_customer_note text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.eva_wallets; p public.eva_products; o public.eva_orders; cfg jsonb; v_note text:=coalesce(p_customer_note,'');
begin
 if length(v_note)>500 then raise exception using errcode='22023',message='Invalid booking note'; end if;
 perform public.commerce_wallet(p_device_hash);
 select * into w from public.eva_wallets where device_hash=p_device_hash for update;
 select * into o from public.eva_orders where wallet_id=w.id and idempotency_key=p_idempotency_key;
 if found then
   if o.product_id is distinct from p_product_id or (p_product_id is null and o.amount_vnd is distinct from p_amount_vnd) or o.customer_note is distinct from v_note then raise exception using errcode='22023',message='Idempotency key already used'; end if;
   return to_jsonb(o)-'idempotency_key';
 end if;
 if (select count(*) from public.eva_orders where wallet_id=w.id and status in ('pending','transfer_sent') and created_at>clock_timestamp()-interval '1 day')>=10 then raise exception using errcode='P0001',message='Too many pending orders'; end if;
 if p_product_id is null then
   select config into cfg from public.eva_settings where id=true;
   if coalesce((cfg->>'donations_enabled')::boolean,false) is not true or p_amount_vnd is null or p_amount_vnd not between 1000 and 10000000 then raise exception using errcode='22023',message='Donation is unavailable'; end if;
   insert into public.eva_orders(wallet_id,idempotency_key,product_snapshot,kind,amount_vnd,credits,contact_email,customer_note,booking_status)
   values(w.id,p_idempotency_key,'{"title_en":"Voluntary donation","title_vi":"Ủng hộ tự nguyện"}','donation',p_amount_vnd,0,p_contact_email,'','none') returning * into o;
 else
   select * into p from public.eva_products where id=p_product_id and active=true for share;
   if not found then raise exception using errcode='22023',message='This option is unavailable'; end if;
   select config into cfg from public.eva_settings where id=true;
   if p.kind='credits' and cfg->>'pricing_mode'='consultations' then raise exception using errcode='22023',message='AI readings are currently free'; end if;
   insert into public.eva_orders(wallet_id,idempotency_key,product_id,product_snapshot,kind,amount_vnd,credits,contact_email,customer_note,booking_status)
   values(w.id,p_idempotency_key,p.id,to_jsonb(p),p.kind,p.price_vnd,p.credits,p_contact_email,v_note,case when p.kind='consultation' then 'awaiting_payment' else 'none' end) returning * into o;
 end if;
 if p_contact_email is not null then update public.eva_wallets set contact_email=p_contact_email where id=w.id; end if;
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
   insert into public.eva_credit_ledger(wallet_id,order_id,delta,reason) values(o.wallet_id,o.id,o.credits,'purchase');
   update public.eva_wallets set credits=credits+o.credits where id=o.wallet_id;
 end if;
 update public.eva_orders set status=case when p_confirm then 'confirmed' else 'rejected' end,
 confirmed_at=case when p_confirm then clock_timestamp() else null end,reviewed_by=p_actor,payment_note=left(coalesce(p_note,''),500),
 booking_status=case when o.kind='consultation' and p_confirm then 'paid' when o.kind='consultation' and not p_confirm then 'cancelled' else o.booking_status end
 where id=o.id returning * into o;
 insert into public.eva_admin_audit(actor_id,action,record_id) values(p_actor,case when p_confirm then 'confirm_payment' else 'reject_payment' end,o.id::text);
 return to_jsonb(o)-'idempotency_key';
end $$;

create or replace function public.commerce_confirm_transfer(p_reference text,p_amount_vnd integer,p_external_id text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.eva_orders;
begin
 if p_reference is null or p_reference !~ '^EVA[A-F0-9]{12}$' or p_amount_vnd is null or p_amount_vnd not between 1000 and 10000000 then raise exception using errcode='22023',message='Invalid transfer confirmation'; end if;
 select * into o from public.eva_orders where transfer_reference=p_reference for update;
 if not found then return null; end if;
 if o.amount_vnd is distinct from p_amount_vnd then raise exception using errcode='22023',message='Transfer amount does not match the order'; end if;
 if o.status='confirmed' then return to_jsonb(o)-'idempotency_key'; end if;
 if o.status='rejected' then raise exception using errcode='22023',message='Rejected payment requires a new order'; end if;
 if o.credits>0 and o.kind='credits' then
   insert into public.eva_credit_ledger(wallet_id,order_id,delta,reason) values(o.wallet_id,o.id,o.credits,'purchase');
   update public.eva_wallets set credits=credits+o.credits where id=o.wallet_id;
 end if;
 update public.eva_orders set status='confirmed',confirmed_at=clock_timestamp(),payment_note=left('webhook:'||coalesce(p_external_id,''),500),
   booking_status=case when o.kind='consultation' then 'paid' else o.booking_status end
 where id=o.id returning * into o;
 insert into public.eva_admin_audit(actor_id,action,record_id) values('00000000-0000-4000-8000-0000000000a1','webhook_confirm',o.id::text);
 return to_jsonb(o)-'idempotency_key';
end $$;

create or replace function public.commerce_update_booking(p_order_id uuid,p_actor uuid,p_booking_status text,p_schedule_note text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.eva_orders;
begin
 if p_actor is null or p_booking_status not in ('paid','scheduled','completed','cancelled') or p_schedule_note is null or length(p_schedule_note)>500 then raise exception using errcode='22023',message='Invalid booking update'; end if;
 select * into o from public.eva_orders where id=p_order_id for update;
 if not found then return null; end if;
 if o.kind<>'consultation' then raise exception using errcode='22023',message='Not a consultation booking'; end if;
 if o.status<>'confirmed' then raise exception using errcode='22023',message='Confirm the transfer before updating this booking'; end if;
 update public.eva_orders set booking_status=p_booking_status,schedule_note=p_schedule_note where id=o.id returning * into o;
 insert into public.eva_admin_audit(actor_id,action,record_id) values(p_actor,'update_booking',o.id::text);
 return to_jsonb(o)-'idempotency_key';
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('commerce_create_order','commerce_review_payment','commerce_confirm_transfer','commerce_update_booking') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

notify pgrst, 'reload schema';
