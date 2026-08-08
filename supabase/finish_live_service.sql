alter table public.live_service_state
add column if not exists finished_at timestamptz null;

create or replace function public.set_live_service_item(
  p_service_id smallint,
  p_item_id uuid,
  p_song_id uuid default null
)
returns public.live_service_state
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state public.live_service_state%rowtype;
  result public.live_service_state%rowtype;
  transition_at timestamptz := now();
  planned_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.active_setlist where id = p_service_id
  ) then
    raise exception 'Service not found';
  end if;

  perform pg_advisory_xact_lock(71831, p_service_id::integer);

  select * into current_state
  from public.live_service_state
  where service_id = p_service_id
  for update;

  if found and current_state.finished_at is not null then
    return current_state;
  end if;

  planned_seconds := public.resolve_service_run_planned_seconds(
    p_service_id,
    p_item_id,
    p_song_id
  );

  if found
    and current_state.current_item_id = p_item_id
    and current_state.current_song_id is not distinct from p_song_id then
    return current_state;
  end if;

  update public.service_item_runs
  set ended_at = transition_at
  where service_id = p_service_id
    and ended_at is null;

  insert into public.live_service_state (
    service_id,
    current_item_id,
    current_song_id,
    started_at,
    updated_at,
    finished_at
  )
  values (
    p_service_id,
    p_item_id,
    p_song_id,
    transition_at,
    transition_at,
    null
  )
  on conflict (service_id) do update
  set current_item_id = excluded.current_item_id,
      current_song_id = excluded.current_song_id,
      started_at = transition_at,
      updated_at = transition_at,
      finished_at = null
  returning * into result;

  insert into public.service_item_runs (
    service_id,
    service_item_id,
    song_id,
    started_at,
    planned_duration_seconds
  )
  values (
    p_service_id,
    p_item_id,
    p_song_id,
    transition_at,
    planned_seconds
  );

  return result;
end;
$$;

revoke all on function public.set_live_service_item(smallint, uuid, uuid)
from public, anon;
grant execute on function public.set_live_service_item(smallint, uuid, uuid)
to authenticated;

create or replace function public.finish_live_service(p_service_id smallint)
returns public.live_service_state
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state public.live_service_state%rowtype;
  result public.live_service_state%rowtype;
  transition_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.active_setlist where id = p_service_id
  ) then
    raise exception 'Service not found';
  end if;

  perform pg_advisory_xact_lock(71831, p_service_id::integer);

  select * into current_state
  from public.live_service_state
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Live service has not started';
  end if;

  if current_state.finished_at is not null then
    return current_state;
  end if;

  update public.service_item_runs
  set ended_at = transition_at
  where service_id = p_service_id
    and ended_at is null;

  update public.live_service_state
  set finished_at = transition_at,
      updated_at = transition_at
  where service_id = p_service_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.finish_live_service(smallint)
from public, anon;
grant execute on function public.finish_live_service(smallint)
to authenticated;
