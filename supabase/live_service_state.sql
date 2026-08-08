-- Verified existing key types:
-- active_setlist.id = smallint
-- service_items.id = uuid
-- service_items.service_id = smallint

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_items'::regclass
      and conname = 'service_items_service_id_id_key'
  ) then
    alter table public.service_items
      add constraint service_items_service_id_id_key unique (service_id, id);
  end if;
end;
$$;

create table if not exists public.live_service_state (
  service_id smallint primary key
    references public.active_setlist(id) on delete cascade,
  current_item_id uuid not null,
  current_song_id uuid null
    references public.songs(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint live_service_state_item_belongs_to_service_fkey
    foreign key (service_id, current_item_id)
    references public.service_items(service_id, id) on delete cascade
);

alter table public.live_service_state
add column if not exists finished_at timestamptz null;

create or replace function public.parse_service_song_entry(p_entry text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_entry is null or btrim(p_entry) = '' then
    return null;
  end if;
  return p_entry::jsonb;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.parse_service_song_entry(text)
from public, anon, authenticated;

create or replace function public.validate_live_service_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_item public.service_items%rowtype;
begin
  select * into target_item
  from public.service_items
  where id = new.current_item_id
    and service_id = new.service_id;

  if not found then
    raise exception 'The live item does not belong to the selected service';
  end if;

  if new.current_song_id is not null then
    if target_item.type <> 'worship' or not exists (
      select 1
      from unnest(coalesce(target_item.song_ids, array[]::text[])) as songs(raw_entry)
      cross join lateral (
        select public.parse_service_song_entry(songs.raw_entry) as parsed_entry
      ) as parsed
      where coalesce(
        case
          when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then btrim(songs.raw_entry)
          else null
        end,
        case jsonb_typeof(parsed.parsed_entry)
        when 'string' then parsed.parsed_entry #>> '{}'
        when 'object' then coalesce(
          parsed.parsed_entry ->> 'songId',
          parsed.parsed_entry ->> 'song_id',
          parsed.parsed_entry ->> 'id'
        )
        else null
        end
      ) = new.current_song_id::text
    ) then
      raise exception 'The live song does not belong to the selected worship block';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.started_at := now();
  elsif old.current_item_id is distinct from new.current_item_id
    or old.current_song_id is distinct from new.current_song_id then
    new.started_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_live_service_state_trigger
on public.live_service_state;

create trigger validate_live_service_state_trigger
before insert or update on public.live_service_state
for each row execute function public.validate_live_service_state();

alter table public.live_service_state enable row level security;

drop policy if exists "Public can read live service state"
on public.live_service_state;
create policy "Public can read live service state"
on public.live_service_state
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated can insert live service state"
on public.live_service_state;

drop policy if exists "Authenticated can update live service state"
on public.live_service_state;

revoke all on public.live_service_state from anon, authenticated;
grant select on public.live_service_state to anon, authenticated;

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

  if not exists (
    select 1
    from public.service_items
    where id = p_item_id and service_id = p_service_id
  ) then
    raise exception 'The item does not belong to the selected service';
  end if;

  insert into public.live_service_state (
    service_id,
    current_item_id,
    current_song_id,
    started_at,
    updated_at,
    finished_at
  )
  values (p_service_id, p_item_id, p_song_id, now(), now(), null)
  on conflict (service_id) do update
  set current_item_id = excluded.current_item_id,
      current_song_id = excluded.current_song_id,
      started_at = now(),
      updated_at = now(),
      finished_at = null
  returning * into result;

  return result;
end;
$$;

revoke all on function public.set_live_service_item(smallint, uuid, uuid)
from public, anon;
grant execute on function public.set_live_service_item(smallint, uuid, uuid)
to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_service_state'
  ) then
    alter publication supabase_realtime add table public.live_service_state;
  end if;
end;
$$;
