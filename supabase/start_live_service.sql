create or replace function public.resolve_first_live_service_entry(p_service_id smallint)
returns table(item_id uuid, song_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_item public.service_items%rowtype;
  target_song_id uuid;
begin
  for target_item in
    select * from public.service_items
    where service_id = p_service_id
    order by position, created_at, id
  loop
    if target_item.type <> 'worship' then
      item_id := target_item.id;
      song_id := null;
      return next;
      return;
    end if;

    select candidate.song_id::uuid into target_song_id
    from unnest(coalesce(target_item.song_ids, array[]::text[])) with ordinality as songs(raw_entry, song_order)
    cross join lateral (select public.parse_service_song_entry(songs.raw_entry) as parsed_entry) as parsed
    cross join lateral (
      select coalesce(
        case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) else null end,
        case jsonb_typeof(parsed.parsed_entry)
          when 'string' then parsed.parsed_entry #>> '{}'
          when 'object' then coalesce(parsed.parsed_entry ->> 'songId', parsed.parsed_entry ->> 'song_id', parsed.parsed_entry ->> 'id')
          else null end
      ) as song_id
    ) as candidate
    where candidate.song_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    order by songs.song_order
    limit 1;

    if found then
      item_id := target_item.id;
      song_id := target_song_id;
      return next;
      return;
    end if;
  end loop;
end;
$$;

revoke all on function public.resolve_first_live_service_entry(smallint)
from public, anon, authenticated;

create or replace function public.start_live_service(p_service_id smallint)
returns public.live_service_state
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state public.live_service_state%rowtype;
  first_item_id uuid;
  first_song_id uuid;
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

  if found then
    if current_state.finished_at is not null then
      raise exception 'Live service is finished; use reopen_live_service';
    end if;
    return current_state;
  end if;

  if exists (
    select 1 from public.service_item_runs
    where service_id = p_service_id
      and ended_at is null
  ) then
    raise exception 'Cannot start live service while an open service item run exists';
  end if;

  select resolved.item_id, resolved.song_id
  into first_item_id, first_song_id
  from public.resolve_first_live_service_entry(p_service_id) as resolved;

  if not found then
    raise exception 'Service has no operational items';
  end if;

  planned_seconds := public.resolve_service_run_planned_seconds(
    p_service_id,
    first_item_id,
    first_song_id
  );

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
    first_item_id,
    first_song_id,
    transition_at,
    transition_at,
    null
  )
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
    first_item_id,
    first_song_id,
    transition_at,
    planned_seconds
  );

  return result;
end;
$$;

revoke all on function public.start_live_service(smallint)
from public, anon;
grant execute on function public.start_live_service(smallint)
to authenticated;

-- Keep explicit reopen behavior aligned with the same operational-entry resolver.
create or replace function public.reopen_live_service(p_service_id smallint)
returns public.live_service_state
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state public.live_service_state%rowtype;
  first_item_id uuid;
  first_song_id uuid;
  result public.live_service_state%rowtype;
  transition_at timestamptz := now();
  planned_seconds integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.active_setlist where id = p_service_id) then raise exception 'Service not found'; end if;
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if not found then raise exception 'Live service has not started'; end if;
  if current_state.finished_at is null then return current_state; end if;
  if exists (select 1 from public.service_item_runs where service_id = p_service_id and ended_at is null) then raise exception 'Cannot reopen live service while an open service item run exists'; end if;
  select resolved.item_id, resolved.song_id into first_item_id, first_song_id from public.resolve_first_live_service_entry(p_service_id) as resolved;
  if not found then raise exception 'Service has no operational items'; end if;
  planned_seconds := public.resolve_service_run_planned_seconds(p_service_id, first_item_id, first_song_id);
  update public.live_service_state set current_item_id = first_item_id, current_song_id = first_song_id, started_at = transition_at, updated_at = transition_at, finished_at = null where service_id = p_service_id returning * into result;
  insert into public.service_item_runs (service_id, service_item_id, song_id, started_at, planned_duration_seconds) values (p_service_id, first_item_id, first_song_id, transition_at, planned_seconds);
  return result;
end;
$$;

revoke all on function public.reopen_live_service(smallint)
from public, anon;
grant execute on function public.reopen_live_service(smallint)
to authenticated;
