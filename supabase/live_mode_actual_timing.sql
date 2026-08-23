begin;

-- Refuse legacy state that cannot be mapped without guessing.
do $$
begin
  if exists (select 1 from public.service_item_runs where ended_at is null group by service_id having count(*) > 1) then raise exception 'Live 1B aborted: more than one open run exists for a service'; end if;
  if exists (select 1 from public.live_service_state state left join public.service_item_runs run on run.service_id = state.service_id and run.ended_at is null where state.finished_at is null and run.id is null) then raise exception 'Live 1B aborted: unfinished Live state has no open run'; end if;
  if exists (
    select 1 from public.service_item_runs run join public.service_items item on item.service_id = run.service_id and item.id = run.service_item_id
    where item.type = 'worship' and run.song_id is not null and 1 <> (
      select count(*) from unnest(coalesce(item.song_ids, array[]::text[])) songs(raw_entry)
      where coalesce(case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) end,
        case jsonb_typeof(public.parse_service_song_entry(songs.raw_entry)) when 'string' then public.parse_service_song_entry(songs.raw_entry) #>> '{}'
        when 'object' then coalesce(public.parse_service_song_entry(songs.raw_entry) ->> 'songId', public.parse_service_song_entry(songs.raw_entry) ->> 'song_id', public.parse_service_song_entry(songs.raw_entry) ->> 'id') end) = run.song_id::text
    )
  ) then raise exception 'Live 1B aborted: legacy worship timing has ambiguous occurrence identity'; end if;
end; $$;

alter table public.service_item_runs add column if not exists occurrence_index integer null;
alter table public.live_service_state add column if not exists occurrence_index integer not null default 0;
alter table public.service_item_runs drop constraint if exists service_item_runs_occurrence_index_check;
alter table public.service_item_runs add constraint service_item_runs_occurrence_index_check check (occurrence_index is null or occurrence_index >= 0);
alter table public.live_service_state drop constraint if exists live_service_state_occurrence_index_check;
alter table public.live_service_state add constraint live_service_state_occurrence_index_check check (occurrence_index >= 0);

-- Populate only the discriminator; preserve every existing timing timestamp and row id.
update public.service_item_runs run set occurrence_index = case when item.type = 'worship' then (
  select songs.song_order::integer from unnest(coalesce(item.song_ids, array[]::text[])) with ordinality songs(raw_entry, song_order)
  where coalesce(case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) end,
    case jsonb_typeof(public.parse_service_song_entry(songs.raw_entry)) when 'string' then public.parse_service_song_entry(songs.raw_entry) #>> '{}'
    when 'object' then coalesce(public.parse_service_song_entry(songs.raw_entry) ->> 'songId', public.parse_service_song_entry(songs.raw_entry) ->> 'song_id', public.parse_service_song_entry(songs.raw_entry) ->> 'id') end) = run.song_id::text
) else 0 end
from public.service_items item where item.service_id = run.service_id and item.id = run.service_item_id and run.occurrence_index is null;

update public.live_service_state state set occurrence_index = run.occurrence_index
from public.service_item_runs run where run.service_id = state.service_id and run.ended_at is null and state.finished_at is null;

create or replace function public.resolve_live_service_entries(p_service_id smallint)
returns table(item_id uuid, song_id uuid, occurrence_index integer, occurrence_order bigint)
language sql stable security definer set search_path = pg_catalog, public as $$
  select entries.item_id, entries.song_id, entries.occurrence_index,
    row_number() over (order by entries.item_position, entries.item_created_at, entries.item_id, entries.occurrence_index)
  from public.service_items item cross join lateral (
    select item.id item_id, case when item.type = 'song' then item.song_id end song_id, 0 occurrence_index, item.position item_position, item.created_at item_created_at
    where item.type <> 'worship' and (item.type <> 'song' or item.song_id is not null)
    union all
    select item.id, parsed.song_id::uuid, songs.song_order::integer, item.position, item.created_at
    from unnest(coalesce(item.song_ids, array[]::text[])) with ordinality songs(raw_entry, song_order)
    cross join lateral (select coalesce(case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) end,
      case jsonb_typeof(public.parse_service_song_entry(songs.raw_entry)) when 'string' then public.parse_service_song_entry(songs.raw_entry) #>> '{}'
      when 'object' then coalesce(public.parse_service_song_entry(songs.raw_entry) ->> 'songId', public.parse_service_song_entry(songs.raw_entry) ->> 'song_id', public.parse_service_song_entry(songs.raw_entry) ->> 'id') end) song_id) parsed
    where item.type = 'worship' and parsed.song_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) entries where item.service_id = p_service_id
$$;

create or replace function public.resolve_next_live_service_entry(p_service_id smallint, p_item_id uuid, p_song_id uuid, p_occurrence_index integer)
returns table(item_id uuid, song_id uuid, occurrence_index integer)
language sql stable security definer set search_path = pg_catalog, public as $$
  with entries as (select * from public.resolve_live_service_entries(p_service_id)), current_entry as (
    select occurrence_order from entries where item_id = p_item_id and song_id is not distinct from p_song_id and occurrence_index = p_occurrence_index)
  select next_entry.item_id, next_entry.song_id, next_entry.occurrence_index from entries next_entry, current_entry where next_entry.occurrence_order = current_entry.occurrence_order + 1
$$;

create or replace function public.resolve_previous_live_service_entry(p_service_id smallint, p_item_id uuid, p_song_id uuid, p_occurrence_index integer)
returns table(item_id uuid, song_id uuid, occurrence_index integer)
language sql stable security definer set search_path = pg_catalog, public as $$
  with entries as (select * from public.resolve_live_service_entries(p_service_id)), current_entry as (
    select occurrence_order from entries where item_id = p_item_id and song_id is not distinct from p_song_id and occurrence_index = p_occurrence_index)
  select previous_entry.item_id, previous_entry.song_id, previous_entry.occurrence_index from entries previous_entry, current_entry where previous_entry.occurrence_order = current_entry.occurrence_order - 1
$$;

create or replace function public.start_live_service(p_service_id smallint)
returns public.live_service_state language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_status text; current_state public.live_service_state%rowtype; first_entry record; result public.live_service_state%rowtype; transition_at timestamptz := now(); planned_seconds integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(71830, 1); perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select status into target_status from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status <> 'active' then raise exception 'Only the active service can start Live'; end if;
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if found then if current_state.finished_at is not null then raise exception 'Live service is finished'; end if; return current_state; end if;
  if exists (select 1 from public.live_service_state where finished_at is null and service_id <> p_service_id) then raise exception 'Another service is already Live'; end if;
  if exists (select 1 from public.service_item_runs where service_id = p_service_id and ended_at is null) then raise exception 'Cannot start Live while an open run exists'; end if;
  select * into first_entry from public.resolve_live_service_entries(p_service_id) order by occurrence_order limit 1;
  if not found then raise exception 'Service has no operational items'; end if;
  planned_seconds := public.resolve_service_run_planned_seconds(p_service_id, first_entry.item_id, first_entry.song_id);
  insert into public.live_service_state(service_id, current_item_id, current_song_id, occurrence_index, started_at, updated_at, finished_at)
  values(p_service_id, first_entry.item_id, first_entry.song_id, first_entry.occurrence_index, transition_at, transition_at, null) returning * into result;
  insert into public.service_item_runs(service_id, service_item_id, song_id, occurrence_index, started_at, planned_duration_seconds)
  values(p_service_id, first_entry.item_id, first_entry.song_id, first_entry.occurrence_index, transition_at, planned_seconds);
  return result;
end; $$;

drop function if exists public.advance_service_live(smallint, uuid, uuid);
create or replace function public.advance_service_live(p_service_id smallint, p_current_service_item_id uuid, p_current_song_id uuid, p_current_occurrence_index integer)
returns public.live_service_state language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_status text; current_state public.live_service_state%rowtype; current_run public.service_item_runs%rowtype; next_entry record; has_next boolean; planned_seconds integer; transition_at timestamptz := now(); result public.live_service_state%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(71830, 1); perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select status into target_status from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status <> 'active' then raise exception 'Only the active service can advance Live'; end if;
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if not found then raise exception 'Live service has not started'; end if;
  if current_state.finished_at is not null then raise exception 'Live service is already complete'; end if;
  if current_state.current_item_id is distinct from p_current_service_item_id or current_state.current_song_id is distinct from p_current_song_id or current_state.occurrence_index <> p_current_occurrence_index then raise exception 'Live occurrence changed; refresh before advancing'; end if;
  select * into current_run from public.service_item_runs where service_id = p_service_id and ended_at is null for update;
  if not found then raise exception 'Current Live occurrence has no open timing'; end if;
  if current_run.service_item_id is distinct from p_current_service_item_id or current_run.song_id is distinct from p_current_song_id or current_run.occurrence_index is distinct from p_current_occurrence_index then raise exception 'Open timing does not match the current Live occurrence'; end if;
  select * into next_entry from public.resolve_next_live_service_entry(p_service_id, p_current_service_item_id, p_current_song_id, p_current_occurrence_index); has_next := found;
  update public.service_item_runs set ended_at = transition_at where id = current_run.id;
  if has_next then
    planned_seconds := public.resolve_service_run_planned_seconds(p_service_id, next_entry.item_id, next_entry.song_id);
    insert into public.service_item_runs(service_id, service_item_id, song_id, occurrence_index, started_at, planned_duration_seconds) values(p_service_id, next_entry.item_id, next_entry.song_id, next_entry.occurrence_index, transition_at, planned_seconds);
    update public.live_service_state set current_item_id = next_entry.item_id, current_song_id = next_entry.song_id, occurrence_index = next_entry.occurrence_index, started_at = transition_at, updated_at = transition_at where service_id = p_service_id returning * into result;
  else update public.live_service_state set finished_at = transition_at, updated_at = transition_at where service_id = p_service_id returning * into result;
  end if;
  return result;
end; $$;

create or replace function public.undo_last_live_advance(p_service_id smallint)
returns public.live_service_state language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_status text; current_state public.live_service_state%rowtype; current_run public.service_item_runs%rowtype; previous_run public.service_item_runs%rowtype; expected_previous record; candidate_count integer; result public.live_service_state%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(71830, 1); perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select status into target_status from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status <> 'active' then raise exception 'Only the active service can correct Live'; end if;
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if not found then raise exception 'Live service has not started'; end if;
  if current_state.finished_at is null then
    select * into current_run from public.service_item_runs where service_id = p_service_id and ended_at is null for update;
    if not found then raise exception 'Current Live occurrence has no open timing'; end if;
    if current_run.service_item_id is distinct from current_state.current_item_id or current_run.song_id is distinct from current_state.current_song_id or current_run.occurrence_index is distinct from current_state.occurrence_index then raise exception 'Open timing does not match Live state'; end if;
    select count(*) into candidate_count from public.service_item_runs where service_id = p_service_id and ended_at = current_run.started_at;
    if candidate_count <> 1 then raise exception 'No unambiguous Live advance can be undone'; end if;
    select * into previous_run from public.service_item_runs where service_id = p_service_id and ended_at = current_run.started_at for update;
    select * into expected_previous from public.resolve_previous_live_service_entry(p_service_id, current_run.service_item_id, current_run.song_id, current_run.occurrence_index);
    if not found or previous_run.service_item_id is distinct from expected_previous.item_id or previous_run.song_id is distinct from expected_previous.song_id or previous_run.occurrence_index is distinct from expected_previous.occurrence_index then raise exception 'No unambiguous Live advance can be undone'; end if;
    delete from public.service_item_runs where id = current_run.id;
  else
    select count(*) into candidate_count from public.service_item_runs where service_id = p_service_id and ended_at = current_state.finished_at;
    if candidate_count <> 1 then raise exception 'No unambiguous Live advance can be undone'; end if;
    select * into previous_run from public.service_item_runs where service_id = p_service_id and ended_at = current_state.finished_at for update;
    if previous_run.service_item_id is distinct from current_state.current_item_id or previous_run.song_id is distinct from current_state.current_song_id or previous_run.occurrence_index is distinct from current_state.occurrence_index then raise exception 'No unambiguous Live advance can be undone'; end if;
  end if;
  update public.service_item_runs set ended_at = null where id = previous_run.id;
  update public.live_service_state set current_item_id = previous_run.service_item_id, current_song_id = previous_run.song_id, occurrence_index = previous_run.occurrence_index, started_at = previous_run.started_at, finished_at = null, updated_at = now() where service_id = p_service_id returning * into result;
  return result;
end; $$;

revoke all on function public.resolve_live_service_entries(smallint) from public, anon, authenticated;
revoke all on function public.resolve_next_live_service_entry(smallint, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.resolve_previous_live_service_entry(smallint, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.advance_service_live(smallint, uuid, uuid, integer) from public, anon;
revoke all on function public.undo_last_live_advance(smallint) from public, anon;
grant execute on function public.start_live_service(smallint) to authenticated;
grant execute on function public.advance_service_live(smallint, uuid, uuid, integer) to authenticated;
grant execute on function public.undo_last_live_advance(smallint) to authenticated;
notify pgrst, 'reload schema';
commit;

-- PRE-APPLY VERIFICATION (all should return zero rows):
-- select service_id, count(*) from public.service_item_runs where ended_at is null group by service_id having count(*) > 1;
-- select state.service_id from public.live_service_state state left join public.service_item_runs run on run.service_id = state.service_id and run.ended_at is null where state.finished_at is null and run.id is null;
-- The legacy-identity query in the opening DO block must also return no rows.
-- POST-APPLY VERIFICATION:
-- select table_name, column_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ('service_item_runs', 'live_service_state') and column_name = 'occurrence_index' order by table_name;
-- select to_regprocedure('public.advance_service_live(smallint,uuid,uuid,integer)'), to_regprocedure('public.undo_last_live_advance(smallint)'), to_regprocedure('public.resolve_live_service_entries(smallint)');
-- select routine_name, security_type from information_schema.routines where routine_schema = 'public' and routine_name in ('start_live_service', 'advance_service_live', 'undo_last_live_advance');
-- select has_function_privilege('authenticated', 'public.advance_service_live(smallint,uuid,uuid,integer)', 'EXECUTE'), has_function_privilege('anon', 'public.advance_service_live(smallint,uuid,uuid,integer)', 'EXECUTE');
-- select indexdef from pg_indexes where schemaname = 'public' and indexname = 'service_item_runs_one_open_per_service_idx';
-- select * from public.resolve_live_service_entries(:service_id) order by occurrence_order;
