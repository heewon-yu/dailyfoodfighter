
create schema if not exists scalping_private;
revoke all on schema scalping_private from public, anon, authenticated;

create table scalping_private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (nickname ~ '^[가-힣A-Za-z0-9_]{2,12}$'),
  created_at timestamptz not null default now()
);
create unique index scalping_nickname_unique on scalping_private.profiles(lower(nickname));

create table scalping_private.daily_quotas (
  user_id uuid not null references scalping_private.profiles on delete cascade,
  kst_day date not null,
  free_used smallint not null default 0 check (free_used between 0 and 5),
  bonus_available smallint not null default 0 check (bonus_available between 0 and 100),
  primary key (user_id, kst_day)
);

create table scalping_private.game_sessions (
  session_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references scalping_private.profiles on delete cascade,
  request_id uuid not null,
  kst_day date not null,
  started_at timestamptz not null,
  anchor_at timestamptz not null,
  elapsed_ms integer not null default 0 check (elapsed_ms between 0 and 300000),
  paused boolean not null default false,
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'abandoned', 'completed')),
  game_version text not null,
  market_key uuid not null default gen_random_uuid(),
  server_seed bigint not null check (server_seed between 1 and 4294967295),
  commands jsonb not null default '[]' check (jsonb_typeof(commands) = 'array' and jsonb_array_length(commands) <= 450),
  revision integer not null default 0,
  unique (user_id, request_id)
);
create unique index scalping_one_active on scalping_private.game_sessions(user_id) where status = 'active';
create index scalping_session_cleanup on scalping_private.game_sessions(kst_day, session_id);

create table scalping_private.ad_intents (
  nonce uuid primary key default gen_random_uuid(),
  user_id uuid not null references scalping_private.profiles on delete cascade,
  session_id uuid references scalping_private.game_sessions on delete cascade,
  kst_day date not null,
  feature text not null check (feature in ('credit', 'emergency', 'stop', 'extra')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  check ((feature = 'extra') = (session_id is null))
);
create index scalping_ad_intents_user on scalping_private.ad_intents(user_id, created_at);
create table scalping_private.ad_transactions (
  transaction_id text primary key,
  received_at timestamptz not null default now()
);
create index scalping_ad_dedup_cleanup on scalping_private.ad_transactions(received_at);
create table scalping_private.verified_scores (
  session_id uuid primary key references scalping_private.game_sessions on delete cascade,
  user_id uuid not null references scalping_private.profiles on delete cascade,
  kst_day date not null,
  final_equity bigint not null,
  profit bigint generated always as (final_equity - 100000000) stored,
  rate numeric generated always as ((final_equity - 100000000)::numeric / 1000000) stored,
  verified_at timestamptz not null default now()
);
create index scalping_daily_score on scalping_private.verified_scores(kst_day, user_id, final_equity desc, verified_at, session_id);
create table scalping_private.maintenance_status (
  job text primary key,
  last_success timestamptz not null,
  consecutive_failures integer not null default 0
);

create table scalping_private.maintenance_credentials (
  singleton boolean primary key default true check (singleton),
  token_sha256 bytea not null check (octet_length(token_sha256) = 32)
);
alter table scalping_private.maintenance_credentials enable row level security;

alter table scalping_private.profiles enable row level security;
alter table scalping_private.daily_quotas enable row level security;
alter table scalping_private.game_sessions enable row level security;
alter table scalping_private.ad_intents enable row level security;
alter table scalping_private.ad_transactions enable row level security;
alter table scalping_private.verified_scores enable row level security;
alter table scalping_private.maintenance_status enable row level security;
grant usage on schema scalping_private to service_role;
grant select, insert, update on all tables in schema scalping_private to service_role;

create function public.scalping_profile(p_user uuid, p_name text default null) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_profile scalping_private.profiles; v_day date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
begin
  if p_name is not null then
    insert into scalping_private.profiles(user_id, nickname) values (p_user, p_name)
    on conflict (user_id) do update set nickname = excluded.nickname;
  end if;
  select * into v_profile from scalping_private.profiles where user_id = p_user;
  return jsonb_build_object('nickname', v_profile.nickname, 'day', v_day,
    'free', coalesce((select 5 - free_used from scalping_private.daily_quotas where user_id = p_user and kst_day = v_day), 5),
    'bonus', coalesce((select bonus_available from scalping_private.daily_quotas where user_id = p_user and kst_day = v_day), 0));
end;
$$;

create function public.scalping_start(p_user uuid, p_request uuid, p_version text, p_seed bigint, p_restart boolean, p_current uuid default null)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_session scalping_private.game_sessions; v_quota scalping_private.daily_quotas;
  v_now timestamptz; v_day date;
begin
  perform 1 from scalping_private.profiles where user_id = p_user for update;
  if not found then return jsonb_build_object('error', 'nickname_required'); end if;
  v_now := clock_timestamp(); v_day := (v_now at time zone 'Asia/Seoul')::date;
  select * into v_session from scalping_private.game_sessions where user_id = p_user and request_id = p_request;
  if found then return to_jsonb(v_session); end if;
  if not p_restart then
    select * into v_session from scalping_private.game_sessions where user_id = p_user and status = 'active'
      and started_at >= v_now - interval '24 hours';
    if found then return to_jsonb(v_session); end if;
  elsif p_current is not null then
    select * into v_session from scalping_private.game_sessions where user_id = p_user order by started_at desc limit 1;
    if found and v_session.session_id <> p_current then
      if v_session.status = 'active' then return to_jsonb(v_session); end if;
      return jsonb_build_object('error', 'inactive_session');
    end if;
  end if;
  insert into scalping_private.daily_quotas(user_id, kst_day) values (p_user, v_day) on conflict do nothing;
  select * into v_quota from scalping_private.daily_quotas where user_id = p_user and kst_day = v_day for update;
  if v_quota.free_used = 5 and v_quota.bonus_available = 0 then
    return jsonb_build_object('error', 'quota_exhausted');
  end if;
  update scalping_private.game_sessions set status = 'abandoned', ended_at = v_now, revision = revision + 1
    where user_id = p_user and status = 'active';
  update scalping_private.daily_quotas set
    free_used = least(5, free_used + 1),
    bonus_available = bonus_available - case when free_used = 5 then 1 else 0 end
    where user_id = p_user and kst_day = v_day;
  insert into scalping_private.game_sessions(user_id, request_id, kst_day, started_at, anchor_at, game_version, server_seed)
    values (p_user, p_request, v_day, v_now, v_now, p_version, p_seed) returning * into v_session;
  return to_jsonb(v_session);
end;
$$;

create function public.scalping_session(p_user uuid, p_id uuid) returns jsonb
language sql security invoker set search_path = ''
as $$
  select to_jsonb(s) || jsonb_build_object(
    'server_ms', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    'score', (select to_jsonb(v) - 'user_id' - 'session_id' from scalping_private.verified_scores v where v.session_id = s.session_id))
  from scalping_private.game_sessions s where s.user_id = p_user
    and ((p_id is not null and s.session_id = p_id) or (p_id is null and s.status = 'active'))
$$;

create function public.scalping_commit(p_user uuid, p_id uuid, p_revision integer, p_command jsonb,
  p_elapsed integer, p_paused boolean, p_at timestamptz, p_score bigint default null)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_session scalping_private.game_sessions;
begin
  update scalping_private.game_sessions set
    commands = case when p_command is null then commands else commands || jsonb_build_array(p_command) end,
    revision = revision + 1, elapsed_ms = p_elapsed, paused = p_paused, anchor_at = p_at,
    status = case when p_score is null then status else 'completed' end,
    ended_at = case when p_score is null then ended_at else p_at end
  where user_id = p_user and session_id = p_id and status = 'active' and revision = p_revision
    and p_at >= anchor_at and p_elapsed >= elapsed_ms
  returning * into v_session;
  if not found then return false; end if;
  if p_score is not null then
    insert into scalping_private.verified_scores(session_id, user_id, kst_day, final_equity, verified_at)
      values (p_id, p_user, (p_at at time zone 'Asia/Seoul')::date, p_score, p_at);
  end if;
  return true;
end;
$$;

create function public.scalping_ad_intent(p_user uuid, p_id uuid, p_feature text) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_now timestamptz := statement_timestamp(); v_day date := (v_now at time zone 'Asia/Seoul')::date; v_nonce uuid;
begin
  perform 1 from scalping_private.profiles where user_id = p_user for update;
  if not found then return null; end if;
  if p_feature = 'extra' then
    if p_id is not null or not exists (select 1 from scalping_private.daily_quotas
      where user_id = p_user and kst_day = v_day and free_used = 5 and bonus_available = 0) then return null; end if;
  elsif not exists (select 1 from scalping_private.game_sessions
      where session_id = p_id and user_id = p_user and status = 'active') then return null;
  end if;
  if (select count(*) from scalping_private.ad_intents where user_id = p_user and created_at > v_now - interval '5 minutes') >= 12
    then return null; end if;
  insert into scalping_private.ad_intents(user_id, session_id, kst_day, feature)
    values (p_user, p_id, v_day, p_feature) returning nonce into v_nonce;
  return v_nonce;
end;
$$;

create function public.scalping_ad_status(p_user uuid, p_nonce uuid) returns jsonb
language sql security invoker set search_path = ''
as $$
  select to_jsonb(a) - 'user_id' from scalping_private.ad_intents a where user_id = p_user and nonce = p_nonce
$$;

create function public.scalping_verify_ad(p_nonce uuid, p_feature text, p_transaction text, p_rewarded_at timestamptz)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_intent scalping_private.ad_intents;
begin
  select * into v_intent from scalping_private.ad_intents where nonce = p_nonce and feature = p_feature for update;
  if not found or p_rewarded_at < v_intent.created_at - interval '1 minute'
    or p_rewarded_at > v_intent.created_at + interval '15 minutes'
    or p_rewarded_at > statement_timestamp() + interval '1 minute'
    or statement_timestamp() > v_intent.created_at + interval '24 hours' then return false; end if;
  if v_intent.verified_at is not null then return true; end if;
  insert into scalping_private.ad_transactions(transaction_id) values (p_transaction) on conflict do nothing;
  if not found then return true; end if;
  update scalping_private.ad_intents set verified_at = statement_timestamp() where nonce = p_nonce;
  if p_feature = 'extra' then
    update scalping_private.daily_quotas set bonus_available = least(100, bonus_available + 1)
      where user_id = v_intent.user_id and kst_day = v_intent.kst_day and free_used = 5;
  end if;
  return true;
end;
$$;

create function public.scalping_rankings() returns jsonb
language sql security invoker set search_path = ''
as $$
  with today as (select (statement_timestamp() at time zone 'Asia/Seoul')::date as day),
  best as (
    select distinct on (s.user_id) s.session_id, s.user_id, s.profit, s.rate, s.verified_at
    from scalping_private.verified_scores s join today on today.day = s.kst_day
    order by s.user_id, s.final_equity desc, s.verified_at, s.session_id
  ), leaders as (
    select p.nickname, b.profit, b.rate, row_number() over (order by b.profit desc, b.verified_at, b.session_id) as rank
    from best b join scalping_private.profiles p using (user_id)
    order by b.profit desc, b.verified_at, b.session_id limit 5
  )
  select jsonb_build_object('day', today.day,
    'profits', coalesce((select jsonb_agg(jsonb_build_object('rank', rank, 'nickname', nickname, 'value', profit) order by rank) from leaders), '[]'),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('rank', rank, 'nickname', nickname, 'value', rate) order by rank) from leaders), '[]'))
  from today
$$;

create function public.scalping_maintenance(p_job text) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_now timestamptz := statement_timestamp(); v_previous timestamptz;
begin
  if p_job <> 'keepalive' then raise exception 'Retention migration is required'; end if;
  select last_success into v_previous from scalping_private.maintenance_status where job = p_job;
  insert into scalping_private.maintenance_status(job, last_success) values (p_job, v_now)
    on conflict (job) do update set last_success = excluded.last_success, consecutive_failures = 0;
  return jsonb_build_object('ok', true, 'job', p_job, 'at', v_now, 'previous', v_previous,
    'deleted', 0, 'database_bytes', pg_database_size(current_database()));
end;
$$;

create function public.scalping_maintenance_allowed(p_token text) returns boolean
language sql security invoker set search_path = ''
as $$
  select exists (select 1 from scalping_private.maintenance_credentials
    where token_sha256 = sha256(convert_to(p_token, 'UTF8')) and length(p_token) = 64)
$$;

revoke all on function public.scalping_profile(uuid,text), public.scalping_start(uuid,uuid,text,bigint,boolean,uuid),
  public.scalping_session(uuid,uuid), public.scalping_commit(uuid,uuid,integer,jsonb,integer,boolean,timestamptz,bigint),
  public.scalping_ad_intent(uuid,uuid,text), public.scalping_ad_status(uuid,uuid),
  public.scalping_verify_ad(uuid,text,text,timestamptz), public.scalping_rankings(), public.scalping_maintenance(text), public.scalping_maintenance_allowed(text)
  from public, anon, authenticated;
grant execute on function public.scalping_profile(uuid,text), public.scalping_start(uuid,uuid,text,bigint,boolean,uuid),
  public.scalping_session(uuid,uuid), public.scalping_commit(uuid,uuid,integer,jsonb,integer,boolean,timestamptz,bigint),
  public.scalping_ad_intent(uuid,uuid,text), public.scalping_ad_status(uuid,uuid),
  public.scalping_verify_ad(uuid,text,text,timestamptz), public.scalping_rankings(), public.scalping_maintenance(text), public.scalping_maintenance_allowed(text)
  to service_role;
