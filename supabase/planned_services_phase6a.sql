begin;

-- Phase 6A lifecycle lock order:
--   1. Global lifecycle lock: (71830, 1)
--   2. Per-service Live lock: (71831, service_id)
-- Every function that can change active-service or Live state follows this order.

do $$
begin
  if (select count(*) from public.live_service_state where finished_at is null) > 1 then
    raise exception 'Phase 6A aborted: more than one unfinished Live service exists';
  end if;
end;
$$;

create unique index if not exists live_service_state_one_unfinished_idx
on public.live_service_state ((true))
where finished_at is null;

create or replace function public.normalize_service_time_minutes(p_service_time text)
returns integer
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case
    when btrim(p_service_time) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then split_part(btrim(p_service_time), ':', 1)::integer * 60
         + split_part(btrim(p_service_time), ':', 2)::integer
    else null
  end
$$;

revoke all on function public.normalize_service_time_minutes(text)
from public, anon, authenticated;

create or replace function public.start_live_service(p_service_id smallint)
returns public.live_service_state
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_service public.active_setlist%rowtype;
  current_state public.live_service_state%rowtype;
  first_item_id uuid;
  first_song_id uuid;
  result public.live_service_state%rowtype;
  transition_at timestamptz := now();
  planned_seconds integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_id is null then raise exception 'Service is required'; end if;

  perform pg_advisory_xact_lock(71830, 1);
  perform pg_advisory_xact_lock(71831, p_service_id::integer);

  select * into target_service
  from public.active_setlist
  where id = p_service_id
  for update;
  if not found then raise exception 'Service not found'; end if;
  if target_service.status <> 'active' then raise exception 'Only the active service can start Live'; end if;

  select * into current_state
  from public.live_service_state
  where service_id = p_service_id
  for update;
  if found then
    if current_state.finished_at is not null then raise exception 'Live service is finished; use reopen_live_service'; end if;
    return current_state;
  end if;

  if exists (select 1 from public.live_service_state where finished_at is null and service_id <> p_service_id) then
    raise exception 'Another service is already Live';
  end if;
  if exists (select 1 from public.service_item_runs where service_id = p_service_id and ended_at is null) then
    raise exception 'Cannot start live service while an open service item run exists';
  end if;

  select resolved.item_id, resolved.song_id into first_item_id, first_song_id
  from public.resolve_first_live_service_entry(p_service_id) as resolved;
  if not found then raise exception 'Service has no operational items'; end if;
  planned_seconds := public.resolve_service_run_planned_seconds(p_service_id, first_item_id, first_song_id);

  insert into public.live_service_state (service_id, current_item_id, current_song_id, started_at, updated_at, finished_at)
  values (p_service_id, first_item_id, first_song_id, transition_at, transition_at, null)
  returning * into result;
  insert into public.service_item_runs (service_id, service_item_id, song_id, started_at, planned_duration_seconds)
  values (p_service_id, first_item_id, first_song_id, transition_at, planned_seconds);
  return result;
end;
$$;

create or replace function public.set_live_service_item(p_service_id smallint, p_item_id uuid, p_song_id uuid default null)
returns public.live_service_state
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_status text;
  current_state public.live_service_state%rowtype;
  result public.live_service_state%rowtype;
  transition_at timestamptz := now();
  planned_seconds integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(71830, 1);
  perform pg_advisory_xact_lock(71831, p_service_id::integer);

  select status into target_status from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status <> 'active' then raise exception 'Only the active service can change Live items'; end if;

  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if not found then raise exception 'Live service has not started'; end if;
  if current_state.finished_at is not null then return current_state; end if;
  if exists (select 1 from public.live_service_state where finished_at is null and service_id <> p_service_id) then
    raise exception 'Another service is already Live';
  end if;

  planned_seconds := public.resolve_service_run_planned_seconds(p_service_id, p_item_id, p_song_id);
  if current_state.current_item_id = p_item_id and current_state.current_song_id is not distinct from p_song_id then return current_state; end if;
  update public.service_item_runs set ended_at = transition_at where service_id = p_service_id and ended_at is null;
  update public.live_service_state
  set current_item_id = p_item_id, current_song_id = p_song_id, started_at = transition_at, updated_at = transition_at
  where service_id = p_service_id returning * into result;
  insert into public.service_item_runs (service_id, service_item_id, song_id, started_at, planned_duration_seconds)
  values (p_service_id, p_item_id, p_song_id, transition_at, planned_seconds);
  return result;
end;
$$;

create or replace function public.finish_live_service(p_service_id smallint)
returns public.live_service_state
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_status text;
  current_state public.live_service_state%rowtype;
  result public.live_service_state%rowtype;
  transition_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(71830, 1);
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select status into target_status from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status <> 'active' then raise exception 'Only the active service can finish Live'; end if;
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if not found then raise exception 'Live service has not started'; end if;
  if current_state.finished_at is not null then return current_state; end if;
  update public.service_item_runs set ended_at = transition_at where service_id = p_service_id and ended_at is null;
  update public.live_service_state set finished_at = transition_at, updated_at = transition_at
  where service_id = p_service_id returning * into result;
  return result;
end;
$$;

create or replace function public.reopen_live_service(p_service_id smallint)
returns public.live_service_state
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_status text;
  current_state public.live_service_state%rowtype;
  first_item_id uuid;
  first_song_id uuid;
  result public.live_service_state%rowtype;
  transition_at timestamptz := now();
  planned_seconds integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(71830, 1);
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select status into target_status from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status <> 'active' then raise exception 'Legacy reopen is allowed only for the active service'; end if;
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if not found then raise exception 'Live service has not started'; end if;
  if current_state.finished_at is null then return current_state; end if;
  if exists (select 1 from public.live_service_state where finished_at is null) then raise exception 'Another service is already Live'; end if;
  if exists (select 1 from public.service_item_runs where ended_at is null) then raise exception 'Cannot reopen while an open service item run exists'; end if;
  select resolved.item_id, resolved.song_id into first_item_id, first_song_id
  from public.resolve_first_live_service_entry(p_service_id) as resolved;
  if not found then raise exception 'Service has no operational items'; end if;
  planned_seconds := public.resolve_service_run_planned_seconds(p_service_id, first_item_id, first_song_id);
  update public.live_service_state
  set current_item_id = first_item_id, current_song_id = first_song_id, started_at = transition_at, updated_at = transition_at, finished_at = null
  where service_id = p_service_id returning * into result;
  insert into public.service_item_runs (service_id, service_item_id, song_id, started_at, planned_duration_seconds)
  values (p_service_id, first_item_id, first_song_id, transition_at, planned_seconds);
  return result;
end;
$$;

create or replace function public.activate_service_plan(p_service_id smallint)
returns smallint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_service public.active_setlist%rowtype;
  current_active public.active_setlist%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_id is null then raise exception 'Service is required'; end if;
  perform pg_advisory_xact_lock(71830, 1);
  select * into target_service from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_service.status <> 'planned' then raise exception 'Only a planned service can be activated'; end if;
  if exists (select 1 from public.live_service_state where finished_at is null) then raise exception 'Cannot activate a service while Live is unfinished'; end if;
  if exists (select 1 from public.live_service_state where service_id = p_service_id)
     or exists (select 1 from public.service_item_runs where service_id = p_service_id) then
    raise exception 'A planned service with Live history cannot be activated; use the lifecycle-aware reopen operation';
  end if;
  select * into current_active from public.active_setlist where status = 'active' for update;
  if found then
    if exists (select 1 from public.live_service_state where service_id = current_active.id)
       or exists (select 1 from public.service_item_runs where service_id = current_active.id) then
      raise exception 'Current active service has Live history and cannot be replaced';
    end if;
    update public.active_setlist set status = 'planned', updated_at = now() where id = current_active.id;
  end if;
  update public.active_setlist set status = 'active', updated_at = now() where id = p_service_id;
  return p_service_id;
end;
$$;

create or replace function public.complete_live_service_and_advance(p_service_id smallint)
returns table(completed_service_id smallint, promotion_status text, promoted_service_id smallint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_service public.active_setlist%rowtype;
  current_state public.live_service_state%rowtype;
  transition_at timestamptz := now();
  target_minutes integer;
  earliest_date date;
  earliest_minutes integer;
  earliest_count integer;
  next_id smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_id is null then raise exception 'Service is required'; end if;
  perform pg_advisory_xact_lock(71830, 1);
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select * into target_service from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_service.status <> 'active' then raise exception 'Only the active service can be completed'; end if;
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if not found then raise exception 'Live service has not started'; end if;
  if exists (
    select 1 from public.live_service_state
    where finished_at is null and service_id <> p_service_id
  ) then
    raise exception 'Another service is already Live';
  end if;

  update public.service_item_runs set ended_at = transition_at where service_id = p_service_id and ended_at is null;
  if current_state.finished_at is null then
    update public.live_service_state set finished_at = transition_at, updated_at = transition_at where service_id = p_service_id;
  end if;
  update public.active_setlist set status = 'completed', updated_at = transition_at where id = p_service_id;

  target_minutes := public.normalize_service_time_minutes(target_service.service_time);
  if target_service.service_date is null or target_minutes is null then
    return query select p_service_id, 'malformed_completed_schedule'::text, null::smallint;
    return;
  end if;

  select candidate.service_date, candidate.normalized_minutes
  into earliest_date, earliest_minutes
  from (
    select service.id, service.service_date, public.normalize_service_time_minutes(service.service_time) as normalized_minutes
    from public.active_setlist service
    where service.status = 'planned'
      and service.service_date is not null
      and public.normalize_service_time_minutes(service.service_time) is not null
      and (service.service_date, public.normalize_service_time_minutes(service.service_time), service.id)
          > (target_service.service_date, target_minutes, target_service.id)
  ) candidate
  order by candidate.service_date, candidate.normalized_minutes, candidate.id
  limit 1;

  if not found then
    return query select p_service_id, 'none'::text, null::smallint;
    return;
  end if;
  select count(*)::integer, min(service.id)
  into earliest_count, next_id
  from public.active_setlist service
  where service.status = 'planned'
    and service.service_date = earliest_date
    and public.normalize_service_time_minutes(service.service_time) = earliest_minutes
    and (service.service_date, public.normalize_service_time_minutes(service.service_time), service.id)
        > (target_service.service_date, target_minutes, target_service.id);
  if earliest_count > 1 then
    return query select p_service_id, 'ambiguous'::text, null::smallint;
    return;
  end if;
  update public.active_setlist set status = 'active', updated_at = transition_at where id = next_id;
  return query select p_service_id, 'promoted'::text, next_id;
end;
$$;

create or replace function public.reopen_completed_live_service(p_service_id smallint)
returns public.live_service_state
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_service public.active_setlist%rowtype;
  current_active public.active_setlist%rowtype;
  current_state public.live_service_state%rowtype;
  first_item_id uuid;
  first_song_id uuid;
  result public.live_service_state%rowtype;
  transition_at timestamptz := now();
  planned_seconds integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_id is null then raise exception 'Service is required'; end if;
  perform pg_advisory_xact_lock(71830, 1);
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select * into target_service from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_service.status <> 'completed' then raise exception 'Only a completed service can be reopened'; end if;
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if not found or current_state.finished_at is null then raise exception 'Completed service has no finished Live state'; end if;
  if exists (select 1 from public.live_service_state where finished_at is null) then raise exception 'Another service is already Live'; end if;
  if exists (select 1 from public.service_item_runs where ended_at is null) then raise exception 'Cannot reopen while an open service item run exists'; end if;
  select * into current_active from public.active_setlist where status = 'active' for update;
  if found then
    if exists (select 1 from public.live_service_state where service_id = current_active.id)
       or exists (select 1 from public.service_item_runs where service_id = current_active.id) then
      raise exception 'Current active service has Live history and cannot be demoted';
    end if;
    update public.active_setlist set status = 'planned', updated_at = transition_at where id = current_active.id;
  end if;
  select resolved.item_id, resolved.song_id into first_item_id, first_song_id
  from public.resolve_first_live_service_entry(p_service_id) as resolved;
  if not found then raise exception 'Service has no operational items'; end if;
  planned_seconds := public.resolve_service_run_planned_seconds(p_service_id, first_item_id, first_song_id);
  update public.active_setlist set status = 'active', updated_at = transition_at where id = p_service_id;
  update public.live_service_state
  set current_item_id = first_item_id, current_song_id = first_song_id, started_at = transition_at, updated_at = transition_at, finished_at = null
  where service_id = p_service_id returning * into result;
  insert into public.service_item_runs (service_id, service_item_id, song_id, started_at, planned_duration_seconds)
  values (p_service_id, first_item_id, first_song_id, transition_at, planned_seconds);
  return result;
end;
$$;

create or replace function public.restore_archived_service_plan(p_service_id smallint)
returns smallint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_id is null then raise exception 'Service is required'; end if;
  perform pg_advisory_xact_lock(71830, 1);
  select status into target_status from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status <> 'archived' then raise exception 'Only an archived service can be restored as planned'; end if;
  update public.active_setlist set status = 'planned', updated_at = now() where id = p_service_id;
  return p_service_id;
end;
$$;

revoke all on function public.start_live_service(smallint) from public, anon;
revoke all on function public.set_live_service_item(smallint, uuid, uuid) from public, anon;
revoke all on function public.finish_live_service(smallint) from public, anon;
revoke all on function public.reopen_live_service(smallint) from public, anon;
revoke all on function public.activate_service_plan(smallint) from public, anon;
revoke all on function public.complete_live_service_and_advance(smallint) from public, anon;
revoke all on function public.reopen_completed_live_service(smallint) from public, anon;
revoke all on function public.restore_archived_service_plan(smallint) from public, anon;

grant execute on function public.start_live_service(smallint) to authenticated;
grant execute on function public.set_live_service_item(smallint, uuid, uuid) to authenticated;
grant execute on function public.finish_live_service(smallint) to authenticated;
grant execute on function public.reopen_live_service(smallint) to authenticated;
grant execute on function public.activate_service_plan(smallint) to authenticated;
grant execute on function public.complete_live_service_and_advance(smallint) to authenticated;
grant execute on function public.reopen_completed_live_service(smallint) to authenticated;
grant execute on function public.restore_archived_service_plan(smallint) to authenticated;

notify pgrst, 'reload schema';

commit;
