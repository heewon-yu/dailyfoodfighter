grant delete on scalping_private.game_sessions, scalping_private.daily_quotas,
  scalping_private.ad_intents, scalping_private.ad_transactions to service_role;

create or replace function public.scalping_maintenance(p_job text) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_now timestamptz := statement_timestamp(); v_kst timestamp := v_now at time zone 'Asia/Seoul';
  v_cutoff date := v_kst::date - case when v_kst::time >= '03:00' then 1 else 2 end;
  v_before bigint; v_deleted integer := 0; v_count integer; v_previous timestamptz;
begin
  if p_job not in ('cleanup', 'keepalive') then raise exception 'Unknown maintenance job'; end if;
  select last_success into v_previous from scalping_private.maintenance_status where job = p_job;
  if p_job = 'cleanup' then
    select count(*) into v_before from scalping_private.game_sessions where kst_day < v_cutoff
      and (ended_at is null or (ended_at at time zone 'Asia/Seoul')::date < v_cutoff);
    delete from scalping_private.game_sessions where session_id in (
      select session_id from scalping_private.game_sessions where kst_day < v_cutoff
      and (ended_at is null or (ended_at at time zone 'Asia/Seoul')::date < v_cutoff)
      and (status <> 'active' or started_at < v_now - interval '24 hours') order by kst_day, session_id limit 500);
    get diagnostics v_deleted = row_count;
    delete from scalping_private.daily_quotas where (user_id, kst_day) in (
      select user_id, kst_day from scalping_private.daily_quotas where kst_day < v_cutoff limit 500);
    get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
    delete from scalping_private.ad_intents where nonce in (
      select nonce from scalping_private.ad_intents where kst_day < v_cutoff and created_at < v_now - interval '24 hours' limit 500);
    get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
    delete from scalping_private.ad_transactions where transaction_id in (
      select transaction_id from scalping_private.ad_transactions where received_at < v_now - interval '7 days' limit 500);
    get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  end if;
  insert into scalping_private.maintenance_status(job, last_success) values (p_job, v_now)
    on conflict (job) do update set last_success = excluded.last_success, consecutive_failures = 0;
  return jsonb_build_object('ok', true, 'job', p_job, 'at', v_now, 'previous', v_previous,
    'expired_sessions_before', v_before, 'deleted', v_deleted,
    'database_bytes', pg_database_size(current_database()));
end;
$$;
