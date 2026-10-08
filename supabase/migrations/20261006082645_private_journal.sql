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
