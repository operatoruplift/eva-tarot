-- Recovery escrows only existing private capabilities. It never creates a
-- wallet, grants a trial, changes a balance, merges orders or stores chat text.
create table public.eva_customer_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  commerce_hash text not null unique references public.eva_wallets(device_hash),
  backup_hash text not null unique check (backup_hash ~ '^[a-f0-9]{64}$'),
  envelope jsonb not null check (
    jsonb_typeof(envelope) = 'object'
    and envelope ?& array['version','iv','ciphertext']
    and envelope - array['version','iv','ciphertext'] = '{}'::jsonb
    and jsonb_typeof(envelope->'version') = 'number'
    and jsonb_typeof(envelope->'iv') = 'string'
    and jsonb_typeof(envelope->'ciphertext') = 'string'
    and envelope->>'version' = '1'
    and envelope->>'iv' ~ '^[A-Za-z0-9+/]{16}$'
    and envelope->>'ciphertext' ~ '^[A-Za-z0-9+/]+={0,2}$'
    and length(envelope->>'ciphertext') between 24 and 1024
    and length(envelope->>'ciphertext') % 4 = 0
    and octet_length(envelope::text) <= 2048
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.eva_customer_accounts enable row level security;
revoke all on table public.eva_customer_accounts from public, anon, authenticated;
grant select, insert on table public.eva_customer_accounts to service_role;

create table public.eva_account_quota (
  bucket text primary key,
  hits integer not null check (hits > 0),
  expires_at timestamptz not null
);
create index eva_account_quota_expiry on public.eva_account_quota(expires_at);
alter table public.eva_account_quota enable row level security;
revoke all on table public.eva_account_quota from public, anon, authenticated;
grant select, insert, update, delete on table public.eva_account_quota to service_role;

create function public.customer_account_take_quota(p_ip_hash text, p_user_id uuid default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket text; v_limit integer; v_hits integer; v_expiry timestamptz;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid account quota'; end if;
  delete from public.eva_account_quota where expires_at < v_now;
  -- The IP stage precedes Auth and any per-user allocation. A rejected source
  -- cannot create rows by rotating forged JWTs or user identifiers.
  for v_bucket, v_limit, v_expiry in
    select q.bucket, q.quota, q.expiry from (values
      (1, 'im:' || p_ip_hash || ':' || floor(extract(epoch from v_now)/60)::text, 30, v_now + interval '2 minutes'),
      (2, 'id:' || p_ip_hash || ':' || floor(extract(epoch from v_now)/86400)::text, 300, v_now + interval '2 days'),
      (3, 'um:' || p_user_id::text || ':' || floor(extract(epoch from v_now)/60)::text, 15, v_now + interval '2 minutes'),
      (4, 'ud:' || p_user_id::text || ':' || floor(extract(epoch from v_now)/86400)::text, 100, v_now + interval '2 days')
    ) as q(position,bucket,quota,expiry)
    where (p_user_id is null and q.position <= 2) or (p_user_id is not null and q.position > 2)
    order by q.position
  loop
    insert into public.eva_account_quota(bucket,hits,expires_at) values(v_bucket,1,v_expiry)
    on conflict(bucket) do update set hits = least(public.eva_account_quota.hits+1,1000000)
    returning hits into v_hits;
    if v_hits > v_limit then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.customer_account_take_quota(text,uuid) from public, anon, authenticated;
grant execute on function public.customer_account_take_quota(text,uuid) to service_role;

create function public.customer_account_link(p_user_id uuid,p_commerce_hash text,p_backup_hash text,p_envelope jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.eva_customer_accounts;
begin
  if p_user_id is null or p_commerce_hash is null or p_backup_hash is null
    or p_commerce_hash !~ '^[a-f0-9]{64}$' or p_backup_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='Invalid recovery connection';
  end if;
  -- Prove possession of an existing wallet without invoking commerce_wallet:
  -- recovering an account must never allocate a second trial credit.
  perform 1 from public.eva_wallets where device_hash=p_commerce_hash for key share;
  if not found then raise exception using errcode='22023',message='Existing wallet required'; end if;
  begin
    insert into public.eva_customer_accounts(user_id,commerce_hash,backup_hash,envelope)
      values(p_user_id,p_commerce_hash,p_backup_hash,p_envelope)
      returning * into v_row;
    return jsonb_build_object('status','linked','updated_at',v_row.updated_at);
  exception when unique_violation then
    -- Concurrent duplicate submissions are idempotent. A different connection
    -- or another account claiming either capability can never replace a row.
    select * into v_row from public.eva_customer_accounts where user_id=p_user_id;
    if found and v_row.commerce_hash=p_commerce_hash and v_row.backup_hash=p_backup_hash then
      return jsonb_build_object('status','already_linked','updated_at',v_row.updated_at);
    end if;
    raise exception using errcode='22023',message='Recovery connection already linked';
  end;
end;
$$;
revoke all on function public.customer_account_link(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.customer_account_link(uuid,text,text,jsonb) to service_role;
