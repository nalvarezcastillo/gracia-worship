create table if not exists public.service_item_runs (
  id uuid primary key default gen_random_uuid(),
  service_id smallint not null
    references public.active_setlist(id) on delete cascade,
  service_item_id uuid not null,
  song_id uuid null
    references public.songs(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz null,
  planned_duration_seconds integer null,
  created_at timestamptz not null default now(),
  constraint service_item_runs_item_belongs_to_service_fkey
    foreign key (service_id, service_item_id)
    references public.service_items(service_id, id)
    on delete no action deferrable initially deferred,
  constraint service_item_runs_valid_dates_check
    check (ended_at is null or ended_at >= started_at),
  constraint service_item_runs_planned_duration_check
    check (planned_duration_seconds is null or planned_duration_seconds > 0)
);

create unique index if not exists service_item_runs_one_open_per_service_idx
on public.service_item_runs(service_id)
where ended_at is null;

create index if not exists service_item_runs_service_started_idx
on public.service_item_runs(service_id, started_at, created_at);

create index if not exists service_item_runs_service_item_idx
on public.service_item_runs(service_item_id);

create index if not exists service_item_runs_song_idx
on public.service_item_runs(song_id)
where song_id is not null;

create or replace function public.resolve_service_run_planned_seconds(
  p_service_id smallint,
  p_item_id uuid,
  p_song_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_item public.service_items%rowtype;
  song_entry jsonb;
  raw_seconds text;
  raw_minutes text;
  library_duration text;
begin
  select * into target_item
  from public.service_items
  where id = p_item_id
    and service_id = p_service_id;

  if not found then
    raise exception 'The item does not belong to the selected service';
  end if;

  if p_song_id is null then
    return target_item.planned_duration_seconds;
  end if;

  if target_item.type <> 'worship' then
    raise exception 'A song can only be selected inside a worship block';
  end if;

  select entry into song_entry
  from jsonb_array_elements(coalesce(target_item.song_ids, '[]'::jsonb)) as entry
  where case jsonb_typeof(entry)
    when 'string' then entry #>> '{}'
    when 'object' then coalesce(entry ->> 'songId', entry ->> 'song_id', entry ->> 'id')
    else null
  end = p_song_id::text
  limit 1;

  if song_entry is null then
    raise exception 'The song does not belong to the selected worship block';
  end if;

  if jsonb_typeof(song_entry) = 'object' then
    raw_seconds := coalesce(song_entry ->> 'plannedDurationSeconds', song_entry ->> 'planned_duration_seconds');
    if raw_seconds ~ '^[1-9][0-9]*$' then
      return raw_seconds::integer;
    end if;

    raw_minutes := coalesce(song_entry ->> 'plannedDurationMinutes', song_entry ->> 'planned_duration_minutes');
    if raw_minutes ~ '^[1-9][0-9]*$' then
      return raw_minutes::integer * 60;
    end if;
  end if;

  select duration into library_duration
  from public.songs
  where id = p_song_id;

  if not found then
    raise exception 'Song not found';
  end if;

  if trim(library_duration) ~ '^[0-9]+:[0-5][0-9]$' then
    return split_part(trim(library_duration), ':', 1)::integer * 60
      + split_part(trim(library_duration), ':', 2)::integer;
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_service_run_planned_seconds(smallint, uuid, uuid)
from public, anon, authenticated;

create or replace function public.validate_service_item_run()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.resolve_service_run_planned_seconds(
    new.service_id,
    new.service_item_id,
    new.song_id
  );
  return new;
end;
$$;

drop trigger if exists validate_service_item_run_trigger
on public.service_item_runs;

create trigger validate_service_item_run_trigger
before insert or update of service_id, service_item_id, song_id
on public.service_item_runs
for each row execute function public.validate_service_item_run();

alter table public.service_item_runs enable row level security;

drop policy if exists "Public can read service item runs"
on public.service_item_runs;
create policy "Public can read service item runs"
on public.service_item_runs
for select
to anon, authenticated
using (true);

revoke all on public.service_item_runs from anon, authenticated;
grant select on public.service_item_runs to anon, authenticated;

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

  planned_seconds := public.resolve_service_run_planned_seconds(
    p_service_id,
    p_item_id,
    p_song_id
  );

  perform pg_advisory_xact_lock(71831, p_service_id::integer);

  select * into current_state
  from public.live_service_state
  where service_id = p_service_id
  for update;

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
    updated_at
  )
  values (
    p_service_id,
    p_item_id,
    p_song_id,
    transition_at,
    transition_at
  )
  on conflict (service_id) do update
  set current_item_id = excluded.current_item_id,
      current_song_id = excluded.current_song_id,
      started_at = transition_at,
      updated_at = transition_at
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
