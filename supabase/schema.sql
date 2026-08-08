create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  key text not null,
  bpm integer not null check (bpm > 0),
  duration text not null,
  cover_url text not null,
  audio_url text not null,
  sheet_url text not null,
  video_url text not null,
  lyrics text not null,
  notes text not null,
  favorite boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.songs
add column if not exists favorite boolean not null default false;

alter table public.songs enable row level security;

drop policy if exists "Public can read songs" on public.songs;
create policy "Public can read songs"
on public.songs
for select
to public
using (true);

drop policy if exists "Public can insert songs" on public.songs;
drop policy if exists "Authenticated can insert songs" on public.songs;
create policy "Authenticated can insert songs"
on public.songs
for insert
to authenticated
with check (true);

drop policy if exists "Public can update songs" on public.songs;
drop policy if exists "Authenticated can update songs" on public.songs;
create policy "Authenticated can update songs"
on public.songs
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Public can update favorites" on public.songs;
create policy "Public can update favorites"
on public.songs
for update
to anon
using (true)
with check (true);

drop policy if exists "Public can delete songs" on public.songs;
drop policy if exists "Authenticated can delete songs" on public.songs;
create policy "Authenticated can delete songs"
on public.songs
for delete
to authenticated
using (true);

revoke insert, update, delete on public.songs from anon;
grant select on public.songs to anon, authenticated;
grant update (favorite) on public.songs to anon;
grant insert, update, delete on public.songs to authenticated;

create table if not exists public.song_keys (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  key_name text not null,
  audio_url text null,
  sheet_url text null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (song_id, key_name)
);

create index if not exists song_keys_song_id_idx
on public.song_keys (song_id);

alter table public.song_keys enable row level security;

drop policy if exists "Public can read song keys" on public.song_keys;
create policy "Public can read song keys"
on public.song_keys
for select
to public
using (true);

drop policy if exists "Authenticated can insert song keys" on public.song_keys;
create policy "Authenticated can insert song keys"
on public.song_keys
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update song keys" on public.song_keys;
create policy "Authenticated can update song keys"
on public.song_keys
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete song keys" on public.song_keys;
create policy "Authenticated can delete song keys"
on public.song_keys
for delete
to authenticated
using (true);

revoke insert, update, delete on public.song_keys from anon;
grant select on public.song_keys to anon, authenticated;
grant insert, update, delete on public.song_keys to authenticated;

insert into public.song_keys (song_id, key_name, audio_url, sheet_url, sort_order)
select
  id,
  coalesce(nullif(trim(key), ''), 'Default'),
  nullif(audio_url, ''),
  nullif(sheet_url, ''),
  0
from public.songs
on conflict (song_id, key_name) do nothing;

insert into storage.buckets (id, name, public)
values ('songs', 'songs', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can read song files" on storage.objects;
create policy "Public can read song files"
on storage.objects
for select
to public
using (bucket_id = 'songs');

drop policy if exists "Public can upload song files" on storage.objects;
drop policy if exists "Authenticated can upload song files" on storage.objects;
create policy "Authenticated can upload song files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'songs');

drop policy if exists "Public can update song files" on storage.objects;
drop policy if exists "Authenticated can update song files" on storage.objects;
create policy "Authenticated can update song files"
on storage.objects
for update
to authenticated
using (bucket_id = 'songs')
with check (bucket_id = 'songs');

drop policy if exists "Public can delete song files" on storage.objects;
drop policy if exists "Authenticated can delete song files" on storage.objects;
create policy "Authenticated can delete song files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'songs');

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  instrument text null,
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create index if not exists team_members_active_sort_name_idx on public.team_members(active, sort_order, name);
alter table public.team_members enable row level security;
create policy "Public can read team members" on public.team_members for select to anon, authenticated using (true);
create policy "Authenticated can insert team members" on public.team_members for insert to authenticated with check (true);
create policy "Authenticated can update team members" on public.team_members for update to authenticated using (true) with check (true);
create policy "Authenticated can delete team members" on public.team_members for delete to authenticated using (true);
grant select on public.team_members to anon, authenticated;
grant insert, update, delete on public.team_members to authenticated;

create table if not exists public.current_service_team (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid null references public.team_members(id) on delete set null,
  person_name text not null check (char_length(trim(person_name)) > 0),
  role_name text not null check (char_length(trim(role_name)) > 0),
  microphone_name text null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create index if not exists current_service_team_sort_order_idx on public.current_service_team(sort_order);
alter table public.current_service_team enable row level security;
create policy "Public can read current service team" on public.current_service_team for select to anon, authenticated using (true);
create policy "Authenticated can insert current service team" on public.current_service_team for insert to authenticated with check (true);
create policy "Authenticated can update current service team" on public.current_service_team for update to authenticated using (true) with check (true);
create policy "Authenticated can delete current service team" on public.current_service_team for delete to authenticated using (true);
grant select on public.current_service_team to anon, authenticated;
grant insert, update, delete on public.current_service_team to authenticated;

create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  church_name text not null default 'Silverdale Gracia',
  ministry_name text not null default 'Gracia Worship',
  logo_url text null,
  service_day text not null default 'Sábado',
  service_time text not null default '7:00 PM',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;
alter table public.app_settings enable row level security;
drop policy if exists "Public can read app settings" on public.app_settings;
create policy "Public can read app settings" on public.app_settings for select to anon, authenticated using (id = 1);
drop policy if exists "Authenticated can update app settings" on public.app_settings;
create policy "Authenticated can update app settings" on public.app_settings for update to authenticated using (id = 1) with check (id = 1);
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant update (church_name, ministry_name, logo_url, service_day, service_time, updated_at) on public.app_settings to authenticated;

create table if not exists public.active_setlist (
  id smallint primary key default 1,
  service_name text not null default 'Saturday Service',
  service_date date null,
  service_time text not null default 'Saturday • 7:00 PM',
  song_ids uuid[] not null default '{}',
  leader_notes text null,
  status text not null default 'archived' check (status in ('active', 'archived')),
  updated_at timestamptz not null default now()
);

insert into public.active_setlist (id, service_name, service_time, status)
values (1, 'Saturday Service', 'Saturday • 7:00 PM', 'active')
on conflict (id) do nothing;

create unique index if not exists active_setlist_one_active_idx on public.active_setlist(status) where status = 'active';

alter table public.active_setlist enable row level security;

drop policy if exists "Public can read active setlist" on public.active_setlist;
create policy "Public can read active setlist"
on public.active_setlist
for select
to public
using (true);

drop policy if exists "Authenticated can update active setlist" on public.active_setlist;
create policy "Authenticated can update active setlist"
on public.active_setlist
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can insert services" on public.active_setlist;
create policy "Authenticated can insert services"
on public.active_setlist
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can delete archived services" on public.active_setlist;
create policy "Authenticated can delete archived services" on public.active_setlist for delete to authenticated using (status = 'archived');

revoke insert, update, delete on public.active_setlist from anon;
grant select on public.active_setlist to anon, authenticated;
grant insert on public.active_setlist to authenticated;
grant delete on public.active_setlist to authenticated;
grant update (service_name, service_date, service_time, song_ids, leader_notes, updated_at, status) on public.active_setlist to authenticated;

create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  service_id smallint not null default 1 references public.active_setlist(id) on delete cascade,
  position integer not null,
  type text not null check (type in ('text', 'worship')),
  title text not null,
  details text null,
  planned_duration_seconds integer null check (planned_duration_seconds is null or planned_duration_seconds > 0),
  song_ids text[] null,
  created_at timestamptz not null default now()
);

create index if not exists service_items_service_id_position_idx
on public.service_items(service_id, position);

alter table public.service_items
add column if not exists details text null;

alter table public.service_items
add column if not exists planned_duration_seconds integer null;

alter table public.service_items
drop constraint if exists service_items_planned_duration_seconds_check;

alter table public.service_items
add constraint service_items_planned_duration_seconds_check
check (planned_duration_seconds is null or planned_duration_seconds > 0);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_items' and column_name = 'planned_duration_minutes'
  ) then
    execute 'update public.service_items set planned_duration_seconds = planned_duration_minutes * 60 where planned_duration_minutes is not null and planned_duration_seconds is null';
    execute 'alter table public.service_items drop column planned_duration_minutes';
  end if;
end; $$;

alter table public.service_items enable row level security;

drop policy if exists "Public can read service items" on public.service_items;
create policy "Public can read service items"
on public.service_items
for select
to public
using (true);

drop policy if exists "Authenticated can insert service items" on public.service_items;
create policy "Authenticated can insert service items"
on public.service_items
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update service items" on public.service_items;
create policy "Authenticated can update service items"
on public.service_items
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete service items" on public.service_items;
create policy "Authenticated can delete service items"
on public.service_items
for delete
to authenticated
using (true);

revoke insert, update, delete on public.service_items from anon;
grant select on public.service_items to anon, authenticated;
grant insert, update, delete on public.service_items to authenticated;

create or replace function public.prepare_next_service()
returns smallint language plpgsql security invoker set search_path = public as $$
declare current_service public.active_setlist%rowtype; new_id smallint; next_date date; anchor_date date;
begin
  lock table public.active_setlist in share row exclusive mode;
  select * into current_service from public.active_setlist where status = 'active' for update;
  if not found then raise exception 'Active service not found'; end if;
  anchor_date := coalesce(current_service.service_date, current_date);
  next_date := anchor_date + case when (6 - extract(dow from anchor_date)::integer + 7) % 7 = 0 then 7 else (6 - extract(dow from anchor_date)::integer + 7) % 7 end;
  select (coalesce(max(id), 0) + 1)::smallint into new_id from public.active_setlist;
  update public.active_setlist set status = 'archived', updated_at = now() where id = current_service.id;
  insert into public.active_setlist (id, service_name, service_date, service_time, song_ids, leader_notes, status, updated_at)
  values (new_id, current_service.service_name, next_date, current_service.service_time, current_service.song_ids, null, 'active', now());
  insert into public.service_items (service_id, position, type, title, details, planned_duration_seconds, song_ids)
  select new_id, position, type, title, details, planned_duration_seconds, song_ids from public.service_items where service_id = current_service.id order by position;
  return new_id;
end; $$;

create or replace function public.restore_archived_service(target_service_id smallint)
returns void language plpgsql security invoker set search_path = public as $$
begin
  lock table public.active_setlist in share row exclusive mode;
  if not exists (select 1 from public.active_setlist where id = target_service_id and status = 'archived') then raise exception 'Archived service not found'; end if;
  update public.active_setlist set status = 'archived', updated_at = now() where status = 'active';
  update public.active_setlist set status = 'active', updated_at = now() where id = target_service_id;
end; $$;

grant execute on function public.prepare_next_service() to authenticated;
grant execute on function public.restore_archived_service(smallint) to authenticated;

-- En Vivo state. Keep this block aligned with supabase/live_service_state.sql.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.service_items'::regclass and conname = 'service_items_service_id_id_key') then
    alter table public.service_items add constraint service_items_service_id_id_key unique (service_id, id);
  end if;
end; $$;

create table if not exists public.live_service_state (
  service_id smallint primary key references public.active_setlist(id) on delete cascade,
  current_item_id uuid not null,
  current_song_id uuid null references public.songs(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint live_service_state_item_belongs_to_service_fkey foreign key (service_id, current_item_id) references public.service_items(service_id, id) on delete cascade
);

alter table public.live_service_state add column if not exists finished_at timestamptz null;

create or replace function public.parse_service_song_entry(p_entry text)
returns jsonb language plpgsql immutable set search_path = public as $$
begin
  if p_entry is null or btrim(p_entry) = '' then return null; end if;
  return p_entry::jsonb;
exception when others then return null;
end; $$;

revoke all on function public.parse_service_song_entry(text) from public, anon, authenticated;

create or replace function public.resolve_first_live_service_entry(p_service_id smallint)
returns table(item_id uuid, song_id uuid) language plpgsql stable security definer set search_path = public as $$
declare target_item public.service_items%rowtype; target_song_id uuid;
begin
  for target_item in select * from public.service_items where service_id = p_service_id order by position, created_at, id loop
    if target_item.type <> 'worship' then item_id := target_item.id; song_id := null; return next; return; end if;
    select candidate.song_id::uuid into target_song_id
    from unnest(coalesce(target_item.song_ids, array[]::text[])) with ordinality as songs(raw_entry, song_order)
    cross join lateral (select public.parse_service_song_entry(songs.raw_entry) as parsed_entry) as parsed
    cross join lateral (select coalesce(case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) else null end, case jsonb_typeof(parsed.parsed_entry) when 'string' then parsed.parsed_entry #>> '{}' when 'object' then coalesce(parsed.parsed_entry ->> 'songId', parsed.parsed_entry ->> 'song_id', parsed.parsed_entry ->> 'id') else null end) as song_id) as candidate
    where candidate.song_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' order by songs.song_order limit 1;
    if found then item_id := target_item.id; song_id := target_song_id; return next; return; end if;
  end loop;
end; $$;

revoke all on function public.resolve_first_live_service_entry(smallint) from public, anon, authenticated;

create or replace function public.validate_live_service_state()
returns trigger language plpgsql set search_path = public as $$
declare target_item public.service_items%rowtype;
begin
  select * into target_item from public.service_items where id = new.current_item_id and service_id = new.service_id;
  if not found then raise exception 'The live item does not belong to the selected service'; end if;
  if new.current_song_id is not null then
    if target_item.type <> 'worship' or not exists (
      select 1
      from unnest(coalesce(target_item.song_ids, array[]::text[])) as songs(raw_entry)
      cross join lateral (select public.parse_service_song_entry(songs.raw_entry) as parsed_entry) as parsed
      where coalesce(
        case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) else null end,
        case jsonb_typeof(parsed.parsed_entry)
          when 'string' then parsed.parsed_entry #>> '{}'
          when 'object' then coalesce(parsed.parsed_entry ->> 'songId', parsed.parsed_entry ->> 'song_id', parsed.parsed_entry ->> 'id')
          else null end
      ) = new.current_song_id::text
    ) then raise exception 'The live song does not belong to the selected worship block'; end if;
  end if;
  if tg_op = 'INSERT' then
    new.started_at := now();
  elsif old.current_item_id is distinct from new.current_item_id or old.current_song_id is distinct from new.current_song_id then
    new.started_at := now();
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists validate_live_service_state_trigger on public.live_service_state;
create trigger validate_live_service_state_trigger before insert or update on public.live_service_state for each row execute function public.validate_live_service_state();

alter table public.live_service_state enable row level security;
drop policy if exists "Public can read live service state" on public.live_service_state;
create policy "Public can read live service state" on public.live_service_state for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert live service state" on public.live_service_state;
drop policy if exists "Authenticated can update live service state" on public.live_service_state;
revoke all on public.live_service_state from anon, authenticated;
grant select on public.live_service_state to anon, authenticated;

create or replace function public.set_live_service_item(p_service_id smallint, p_item_id uuid, p_song_id uuid default null)
returns public.live_service_state language plpgsql security definer set search_path = public as $$
declare current_state public.live_service_state%rowtype; result public.live_service_state%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.active_setlist where id = p_service_id) then raise exception 'Service not found'; end if;
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if found and current_state.finished_at is not null then return current_state; end if;
  if not exists (select 1 from public.service_items where id = p_item_id and service_id = p_service_id) then raise exception 'The item does not belong to the selected service'; end if;
  insert into public.live_service_state (service_id, current_item_id, current_song_id, started_at, updated_at, finished_at)
  values (p_service_id, p_item_id, p_song_id, now(), now(), null)
  on conflict (service_id) do update set current_item_id = excluded.current_item_id, current_song_id = excluded.current_song_id, started_at = now(), updated_at = now(), finished_at = null
  returning * into result;
  return result;
end; $$;

revoke all on function public.set_live_service_item(smallint, uuid, uuid) from public, anon;
grant execute on function public.set_live_service_item(smallint, uuid, uuid) to authenticated;

create or replace function public.start_live_service(p_service_id smallint)
returns public.live_service_state language plpgsql security definer set search_path = public as $$
declare current_state public.live_service_state%rowtype; first_item_id uuid; first_song_id uuid; result public.live_service_state%rowtype; transition_at timestamptz := now(); planned_seconds integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.active_setlist where id = p_service_id) then raise exception 'Service not found'; end if;
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if found then
    if current_state.finished_at is not null then raise exception 'Live service is finished; use reopen_live_service'; end if;
    return current_state;
  end if;
  if exists (select 1 from public.service_item_runs where service_id = p_service_id and ended_at is null) then raise exception 'Cannot start live service while an open service item run exists'; end if;
  select resolved.item_id, resolved.song_id into first_item_id, first_song_id from public.resolve_first_live_service_entry(p_service_id) as resolved;
  if not found then raise exception 'Service has no operational items'; end if;
  planned_seconds := public.resolve_service_run_planned_seconds(p_service_id, first_item_id, first_song_id);
  insert into public.live_service_state (service_id, current_item_id, current_song_id, started_at, updated_at, finished_at) values (p_service_id, first_item_id, first_song_id, transition_at, transition_at, null) returning * into result;
  insert into public.service_item_runs (service_id, service_item_id, song_id, started_at, planned_duration_seconds) values (p_service_id, first_item_id, first_song_id, transition_at, planned_seconds);
  return result;
end; $$;

revoke all on function public.start_live_service(smallint) from public, anon;
grant execute on function public.start_live_service(smallint) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_service_state') then
    alter publication supabase_realtime add table public.live_service_state;
  end if;
end; $$;

create table if not exists public.service_item_runs (
  id uuid primary key default gen_random_uuid(),
  service_id smallint not null references public.active_setlist(id) on delete cascade,
  service_item_id uuid not null,
  song_id uuid null references public.songs(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz null,
  planned_duration_seconds integer null,
  created_at timestamptz not null default now(),
  constraint service_item_runs_item_belongs_to_service_fkey foreign key (service_id, service_item_id) references public.service_items(service_id, id) on delete no action deferrable initially deferred,
  constraint service_item_runs_valid_dates_check check (ended_at is null or ended_at >= started_at),
  constraint service_item_runs_planned_duration_check check (planned_duration_seconds is null or planned_duration_seconds > 0)
);

create unique index if not exists service_item_runs_one_open_per_service_idx on public.service_item_runs(service_id) where ended_at is null;
create index if not exists service_item_runs_service_started_idx on public.service_item_runs(service_id, started_at, created_at);
create index if not exists service_item_runs_service_item_idx on public.service_item_runs(service_item_id);
create index if not exists service_item_runs_song_idx on public.service_item_runs(song_id) where song_id is not null;

create or replace function public.resolve_service_run_planned_seconds(p_service_id smallint, p_item_id uuid, p_song_id uuid default null)
returns integer language plpgsql stable security definer set search_path = public as $$
declare target_item public.service_items%rowtype; parsed_song_entry jsonb; raw_seconds text; raw_minutes text; library_duration text;
begin
  select * into target_item from public.service_items where id = p_item_id and service_id = p_service_id;
  if not found then raise exception 'The item does not belong to the selected service'; end if;
  if p_song_id is null then return target_item.planned_duration_seconds; end if;
  if target_item.type <> 'worship' then raise exception 'A song can only be selected inside a worship block'; end if;
  select parsed.parsed_entry into parsed_song_entry
  from unnest(coalesce(target_item.song_ids, array[]::text[])) as songs(raw_entry)
  cross join lateral (select public.parse_service_song_entry(songs.raw_entry) as parsed_entry) as parsed
  where coalesce(
    case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) else null end,
    case jsonb_typeof(parsed.parsed_entry)
      when 'string' then parsed.parsed_entry #>> '{}'
      when 'object' then coalesce(parsed.parsed_entry ->> 'songId', parsed.parsed_entry ->> 'song_id', parsed.parsed_entry ->> 'id')
      else null end
  ) = p_song_id::text limit 1;
  if not found then raise exception 'The song does not belong to the selected worship block'; end if;
  if jsonb_typeof(parsed_song_entry) = 'object' then
    raw_seconds := coalesce(parsed_song_entry ->> 'plannedDurationSeconds', parsed_song_entry ->> 'planned_duration_seconds');
    if raw_seconds ~ '^[1-9][0-9]*$' then return raw_seconds::integer; end if;
    raw_minutes := coalesce(parsed_song_entry ->> 'plannedDurationMinutes', parsed_song_entry ->> 'planned_duration_minutes');
    if raw_minutes ~ '^[1-9][0-9]*$' then return raw_minutes::integer * 60; end if;
  end if;
  select duration into library_duration from public.songs where id = p_song_id;
  if not found then raise exception 'Song not found'; end if;
  if trim(library_duration) ~ '^[0-9]+:[0-5][0-9]$' then return split_part(trim(library_duration), ':', 1)::integer * 60 + split_part(trim(library_duration), ':', 2)::integer; end if;
  return null;
end; $$;

revoke all on function public.resolve_service_run_planned_seconds(smallint, uuid, uuid) from public, anon, authenticated;

create or replace function public.validate_service_item_run()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.resolve_service_run_planned_seconds(new.service_id, new.service_item_id, new.song_id);
  return new;
end; $$;

drop trigger if exists validate_service_item_run_trigger on public.service_item_runs;
create trigger validate_service_item_run_trigger before insert or update of service_id, service_item_id, song_id on public.service_item_runs for each row execute function public.validate_service_item_run();

alter table public.service_item_runs enable row level security;
drop policy if exists "Public can read service item runs" on public.service_item_runs;
create policy "Public can read service item runs" on public.service_item_runs for select to anon, authenticated using (true);
revoke all on public.service_item_runs from anon, authenticated;
grant select on public.service_item_runs to anon, authenticated;

create or replace function public.set_live_service_item(p_service_id smallint, p_item_id uuid, p_song_id uuid default null)
returns public.live_service_state language plpgsql security definer set search_path = public as $$
declare current_state public.live_service_state%rowtype; result public.live_service_state%rowtype; transition_at timestamptz := now(); planned_seconds integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.active_setlist where id = p_service_id) then raise exception 'Service not found'; end if;
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if found and current_state.finished_at is not null then return current_state; end if;
  planned_seconds := public.resolve_service_run_planned_seconds(p_service_id, p_item_id, p_song_id);
  if found and current_state.current_item_id = p_item_id and current_state.current_song_id is not distinct from p_song_id then return current_state; end if;
  update public.service_item_runs set ended_at = transition_at where service_id = p_service_id and ended_at is null;
  insert into public.live_service_state (service_id, current_item_id, current_song_id, started_at, updated_at, finished_at)
  values (p_service_id, p_item_id, p_song_id, transition_at, transition_at, null)
  on conflict (service_id) do update set current_item_id = excluded.current_item_id, current_song_id = excluded.current_song_id, started_at = transition_at, updated_at = transition_at, finished_at = null
  returning * into result;
  insert into public.service_item_runs (service_id, service_item_id, song_id, started_at, planned_duration_seconds)
  values (p_service_id, p_item_id, p_song_id, transition_at, planned_seconds);
  return result;
end; $$;

revoke all on function public.set_live_service_item(smallint, uuid, uuid) from public, anon;
grant execute on function public.set_live_service_item(smallint, uuid, uuid) to authenticated;

create or replace function public.finish_live_service(p_service_id smallint)
returns public.live_service_state language plpgsql security definer set search_path = public as $$
declare current_state public.live_service_state%rowtype; result public.live_service_state%rowtype; transition_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.active_setlist where id = p_service_id) then raise exception 'Service not found'; end if;
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select * into current_state from public.live_service_state where service_id = p_service_id for update;
  if not found then raise exception 'Live service has not started'; end if;
  if current_state.finished_at is not null then return current_state; end if;
  update public.service_item_runs set ended_at = transition_at where service_id = p_service_id and ended_at is null;
  update public.live_service_state set finished_at = transition_at, updated_at = transition_at where service_id = p_service_id returning * into result;
  return result;
end; $$;

revoke all on function public.finish_live_service(smallint) from public, anon;
grant execute on function public.finish_live_service(smallint) to authenticated;

create or replace function public.reopen_live_service(p_service_id smallint)
returns public.live_service_state language plpgsql security definer set search_path = public as $$
declare current_state public.live_service_state%rowtype; first_item_id uuid; first_song_id uuid; result public.live_service_state%rowtype; transition_at timestamptz := now(); planned_seconds integer;
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
end; $$;

revoke all on function public.reopen_live_service(smallint) from public, anon;
grant execute on function public.reopen_live_service(smallint) to authenticated;

create table if not exists public.microphone_assignments (
  id uuid primary key default gen_random_uuid(),
  leader_name text not null check (char_length(trim(leader_name)) > 0),
  microphone_name text not null check (char_length(trim(microphone_name)) > 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

-- Normalize older versions of this table that used person_name.
alter table public.microphone_assignments
add column if not exists leader_name text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'microphone_assignments'
      and column_name = 'person_name'
  ) then
    execute 'update public.microphone_assignments
             set leader_name = person_name
             where leader_name is null and person_name is not null';
  end if;
end
$$;

alter table public.microphone_assignments
alter column leader_name set not null;

alter table public.microphone_assignments
drop column if exists person_name,
drop column if exists updated_at;

create index if not exists microphone_assignments_position_idx
on public.microphone_assignments (position, created_at);

alter table public.microphone_assignments enable row level security;

drop policy if exists "Public can read microphone assignments" on public.microphone_assignments;
create policy "Public can read microphone assignments"
on public.microphone_assignments
for select
to public
using (true);

drop policy if exists "Authenticated can insert microphone assignments" on public.microphone_assignments;
create policy "Authenticated can insert microphone assignments"
on public.microphone_assignments
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update microphone assignments" on public.microphone_assignments;
create policy "Authenticated can update microphone assignments"
on public.microphone_assignments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete microphone assignments" on public.microphone_assignments;
create policy "Authenticated can delete microphone assignments"
on public.microphone_assignments
for delete
to authenticated
using (true);

revoke insert, update, delete on public.microphone_assignments from anon;
grant select on public.microphone_assignments to anon, authenticated;
grant insert, update, delete on public.microphone_assignments to authenticated;
