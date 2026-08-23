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
  grid_bpm numeric(8,3),
  grid_beats_per_bar smallint,
  grid_beat_unit smallint,
  grid_offset_seconds numeric(10,3),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint song_keys_musical_grid_check check (num_nonnulls(grid_bpm, grid_beats_per_bar, grid_beat_unit, grid_offset_seconds) = 0 or (num_nonnulls(grid_bpm, grid_beats_per_bar, grid_beat_unit, grid_offset_seconds) = 4 and grid_bpm > 0 and grid_bpm <= 400 and grid_beats_per_bar between 1 and 32 and grid_beat_unit in (1, 2, 4, 8, 16) and grid_offset_seconds >= 0)),
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

create table if not exists public.song_sections (
  id uuid primary key default gen_random_uuid(),
  song_key_id uuid not null references public.song_keys(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  section_type text null check (section_type is null or section_type in ('intro','verse','chorus','bridge','prechorus','instrumental','outro','other')),
  start_seconds numeric(10,3) not null check (start_seconds >= 0),
  bar_number integer,
  beat_number smallint,
  beat_fraction numeric(8,6),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (song_key_id, start_seconds),
  constraint song_sections_musical_position_check check (num_nonnulls(bar_number, beat_number, beat_fraction) = 0 or (num_nonnulls(bar_number, beat_number, beat_fraction) = 3 and bar_number >= 1 and beat_number >= 1 and beat_fraction >= 0 and beat_fraction < 1))
);

create index if not exists song_sections_song_key_time_idx on public.song_sections (song_key_id, start_seconds, sort_order);
alter table public.song_sections enable row level security;
drop policy if exists "Public can read song sections" on public.song_sections;
create policy "Public can read song sections" on public.song_sections for select to public using (true);
drop policy if exists "Authenticated can insert song sections" on public.song_sections;
create policy "Authenticated can insert song sections" on public.song_sections for insert to authenticated with check (true);
drop policy if exists "Authenticated can update song sections" on public.song_sections;
create policy "Authenticated can update song sections" on public.song_sections for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated can delete song sections" on public.song_sections;
create policy "Authenticated can delete song sections" on public.song_sections for delete to authenticated using (true);
revoke all on public.song_sections
from public, anon, authenticated;

grant select on public.song_sections to anon, authenticated;
grant insert, update, delete on public.song_sections to authenticated;

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
  service_time text not null default '19:00',
  song_ids uuid[] not null default '{}',
  leader_notes text null,
  status text not null default 'archived' check (status in ('active', 'planned', 'completed', 'archived')),
  updated_at timestamptz not null default now()
);

insert into public.active_setlist (id, service_name, service_time, status)
values (1, 'Saturday Service', '19:00', 'active')
on conflict (id) do nothing;

create sequence if not exists public.active_setlist_id_seq
as smallint minvalue 1 maxvalue 32767;
alter sequence public.active_setlist_id_seq owned by public.active_setlist.id;
do $$ begin
  lock table public.active_setlist in share row exclusive mode;
  perform setval(
    'public.active_setlist_id_seq'::regclass,
    greatest(
      coalesce(service_max.max_id, sequence_state.last_value),
      sequence_state.last_value
    ),
    case when service_max.max_id is null then sequence_state.is_called else true end
  )
  from public.active_setlist_id_seq sequence_state
  cross join (
    select max(service.id)::bigint as max_id
    from public.active_setlist service
  ) service_max;
end $$;
alter table public.active_setlist alter column id
set default nextval('public.active_setlist_id_seq'::regclass);

create unique index if not exists active_setlist_one_active_idx on public.active_setlist(status) where status = 'active';
create index if not exists active_setlist_hub_status_schedule_idx on public.active_setlist(status, service_date, service_time, id);

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

revoke insert, update, delete on public.active_setlist from anon;
grant select on public.active_setlist to anon, authenticated;
grant insert on public.active_setlist to authenticated;
revoke delete on public.active_setlist from authenticated;
grant update (service_name, service_date, service_time, song_ids, leader_notes, updated_at, status) on public.active_setlist to authenticated;

create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  service_id smallint not null default 1 references public.active_setlist(id) on delete cascade,
  position integer not null,
  type text not null check (type in ('text', 'worship', 'song')),
  title text not null,
  details text null,
  planned_duration_seconds integer null check (planned_duration_seconds is null or planned_duration_seconds > 0),
  song_ids text[] null,
  song_id uuid null references public.songs(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.service_items add column if not exists song_id uuid null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.service_items'::regclass and conname = 'service_items_song_id_fkey') then
    alter table public.service_items add constraint service_items_song_id_fkey foreign key (song_id) references public.songs(id) on delete restrict;
  end if;
end $$;
alter table public.service_items drop constraint if exists service_items_type_check;
alter table public.service_items add constraint service_items_type_check check (type in ('text', 'worship', 'song'));
alter table public.service_items drop constraint if exists service_items_song_shape_check;
alter table public.service_items add constraint service_items_song_shape_check check (
  (type = 'song' and song_id is not null and song_ids is null)
  or (type = 'worship' and song_id is null)
  or (type = 'text' and song_id is null and song_ids is null)
) not valid;
create index if not exists service_items_song_id_idx on public.service_items(song_id) where song_id is not null;

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

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.service_items'::regclass and conname = 'service_items_service_id_id_key') then
    alter table public.service_items add constraint service_items_service_id_id_key unique (service_id, id);
  end if;
end; $$;

create table if not exists public.service_song_settings (
  service_id smallint not null,
  service_item_id uuid not null,
  song_id uuid not null references public.songs(id) on delete restrict,
  key_override text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_song_settings_pkey primary key (service_item_id, song_id),
  constraint service_song_settings_item_fkey foreign key (service_id, service_item_id) references public.service_items(service_id, id) on delete cascade,
  constraint service_song_settings_key_not_blank check (btrim(key_override) <> '')
);
create index if not exists service_song_settings_service_id_idx on public.service_song_settings(service_id);
alter table public.service_song_settings enable row level security;
drop policy if exists "Public can read service song settings" on public.service_song_settings;
create policy "Public can read service song settings" on public.service_song_settings for select to public using (true);
revoke all on public.service_song_settings from public, anon, authenticated;
grant select on public.service_song_settings to anon, authenticated;

create or replace function public.set_service_song_key_override(p_service_id smallint, p_service_item_id uuid, p_song_id uuid, p_key_override text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_status text; target_item public.service_items%rowtype; normalized_key text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_id is null or p_service_item_id is null or p_song_id is null then raise exception 'Service, service item, and song are required'; end if;
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select status into target_status from public.active_setlist where id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status not in ('active', 'planned') then raise exception 'Only active or planned services can be edited'; end if;
  select * into target_item from public.service_items where service_id = p_service_id and id = p_service_item_id for update;
  if not found then raise exception 'Service item not found in service'; end if;
  if not ((target_item.type = 'song' and target_item.song_id = p_song_id) or (target_item.type = 'worship' and exists (
    select 1 from unnest(coalesce(target_item.song_ids, '{}'::text[])) stored(value)
    where stored.value = p_song_id::text or stored.value ~ ('"(songId|song_id|id)"[[:space:]]*:[[:space:]]*"' || p_song_id::text || '"')
  ))) then raise exception 'Song does not belong to this service occurrence'; end if;
  if not exists (select 1 from public.songs where id = p_song_id) then raise exception 'Song not found'; end if;
  if p_key_override is null then delete from public.service_song_settings where service_item_id = p_service_item_id and song_id = p_song_id; return; end if;
  normalized_key := btrim(p_key_override);
  if normalized_key = '' then raise exception 'Key cannot be empty'; end if;
  insert into public.service_song_settings(service_id, service_item_id, song_id, key_override) values (p_service_id, p_service_item_id, p_song_id, normalized_key)
  on conflict (service_item_id, song_id) do update set key_override = excluded.key_override, updated_at = now();
end; $$;
revoke all on function public.set_service_song_key_override(smallint, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_service_song_key_override(smallint, uuid, uuid, text) to authenticated;

create table if not exists public.service_item_notes (
  service_id smallint not null,
  service_item_id uuid primary key,
  notes text not null check (btrim(notes) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_item_notes_item_fkey foreign key (service_id, service_item_id) references public.service_items(service_id, id) on delete cascade
);
create index if not exists service_item_notes_service_id_idx on public.service_item_notes(service_id);
alter table public.service_item_notes enable row level security;
drop policy if exists "Authenticated can read service item notes" on public.service_item_notes;
drop policy if exists "Public can read service item notes" on public.service_item_notes;
create policy "Public can read service item notes" on public.service_item_notes for select to public using (true);
drop policy if exists "Authenticated can insert editable service item notes" on public.service_item_notes;
create policy "Authenticated can insert editable service item notes" on public.service_item_notes for insert to authenticated with check (exists (select 1 from public.active_setlist service where service.id = service_item_notes.service_id and service.status in ('active', 'planned')));
drop policy if exists "Authenticated can update editable service item notes" on public.service_item_notes;
create policy "Authenticated can update editable service item notes" on public.service_item_notes for update to authenticated using (exists (select 1 from public.active_setlist service where service.id = service_item_notes.service_id and service.status in ('active', 'planned'))) with check (exists (select 1 from public.active_setlist service where service.id = service_item_notes.service_id and service.status in ('active', 'planned')));
drop policy if exists "Authenticated can delete editable service item notes" on public.service_item_notes;
create policy "Authenticated can delete editable service item notes" on public.service_item_notes for delete to authenticated using (exists (select 1 from public.active_setlist service where service.id = service_item_notes.service_id and service.status in ('active', 'planned')));
revoke all on public.service_item_notes from public, anon, authenticated;
grant select on public.service_item_notes to anon, authenticated;
grant insert, update, delete on public.service_item_notes to authenticated;

create or replace function public.prepare_next_service()
returns smallint language plpgsql security definer set search_path = pg_catalog, public as $$
declare current_service public.active_setlist%rowtype; new_id smallint; new_item_id uuid; next_date date; anchor_date date; source_item record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  lock table public.active_setlist in share row exclusive mode;
  select * into current_service from public.active_setlist where status = 'active' for update;
  if not found then raise exception 'Active service not found'; end if;
  anchor_date := coalesce(current_service.service_date, current_date);
  next_date := anchor_date + case when (6 - extract(dow from anchor_date)::integer + 7) % 7 = 0 then 7 else (6 - extract(dow from anchor_date)::integer + 7) % 7 end;
  select (coalesce(max(id), 0) + 1)::smallint into new_id from public.active_setlist;
  update public.active_setlist set status = 'archived', updated_at = now() where id = current_service.id;
  insert into public.active_setlist (id, service_name, service_date, service_time, song_ids, leader_notes, status, updated_at)
  values (new_id, current_service.service_name, next_date, current_service.service_time, current_service.song_ids, null, 'active', now());
  for source_item in select * from public.service_items where service_id = current_service.id order by position, created_at, id loop
    new_item_id := gen_random_uuid();
    insert into public.service_items(id, service_id, position, type, title, details, planned_duration_seconds, song_ids, song_id)
    values (new_item_id, new_id, source_item.position, source_item.type, source_item.title, source_item.details, source_item.planned_duration_seconds, source_item.song_ids, source_item.song_id);
    insert into public.service_song_settings(service_id, service_item_id, song_id, key_override)
    select new_id, new_item_id, song_id, key_override from public.service_song_settings
    where service_id = current_service.id
      and service_item_id = source_item.id;
    insert into public.service_item_notes(service_id, service_item_id, notes)
    select new_id, new_item_id, notes from public.service_item_notes
    where service_id = current_service.id and service_item_id = source_item.id;
  end loop;
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
    if target_item.type = 'song' then
      if target_item.song_id is not null then item_id := target_item.id; song_id := target_item.song_id; return next; return; end if;
    elsif target_item.type <> 'worship' then item_id := target_item.id; song_id := null; return next; return;
    end if;
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
  if target_item.type = 'song' then
    if new.current_song_id is null or new.current_song_id is distinct from target_item.song_id then
      raise exception 'The live song does not match the selected song item';
    end if;
  elsif target_item.type = 'worship' then
    if new.current_song_id is null or not exists (
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
  elsif new.current_song_id is not null then
    raise exception 'A non-song service item cannot select a song';
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
  if target_item.type = 'song' then
    if p_song_id is null or p_song_id is distinct from target_item.song_id then raise exception 'The run song does not match the selected song item'; end if;
    if target_item.planned_duration_seconds is not null then return target_item.planned_duration_seconds; end if;
    select duration into library_duration from public.songs where id = target_item.song_id;
    if not found then raise exception 'Song not found'; end if;
    if trim(library_duration) ~ '^[0-9]+:[0-5][0-9]$' then return split_part(trim(library_duration), ':', 1)::integer * 60 + split_part(trim(library_duration), ':', 2)::integer; end if;
    return null;
  end if;
  if target_item.type <> 'worship' then
    if p_song_id is not null then raise exception 'A non-song service item cannot select a song'; end if;
    return target_item.planned_duration_seconds;
  end if;
  if p_song_id is null then raise exception 'A worship block requires a song'; end if;
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

-- Phase 6A lifecycle primitives. Keep this canonical block aligned with
-- supabase/planned_services_phase6a.sql.

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

create or replace function public.archive_completed_service(p_service_id smallint)
returns smallint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_service_id is null then
    raise exception 'Service is required';
  end if;

  -- Lifecycle mutations serialize on the Phase 6A global lock. A per-service
  -- lock is unnecessary because no Live row is mutated by this operation.
  perform pg_advisory_xact_lock(71830, 1);

  select status into target_status
  from public.active_setlist
  where id = p_service_id
  for update;

  if not found then
    raise exception 'Service not found';
  end if;
  if target_status <> 'completed' then
    raise exception 'Only a completed service can be archived';
  end if;
  if exists (
    select 1 from public.live_service_state
    where service_id = p_service_id and finished_at is null
  ) then
    raise exception 'Cannot archive a service with unfinished Live state';
  end if;
  if exists (
    select 1 from public.service_item_runs
    where service_id = p_service_id and ended_at is null
  ) then
    raise exception 'Cannot archive a service with an open run';
  end if;

  update public.active_setlist
  set status = 'archived', updated_at = now()
  where id = p_service_id;

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
revoke all on function public.archive_completed_service(smallint) from public, anon;

grant execute on function public.start_live_service(smallint) to authenticated;
grant execute on function public.set_live_service_item(smallint, uuid, uuid) to authenticated;
grant execute on function public.finish_live_service(smallint) to authenticated;
grant execute on function public.reopen_live_service(smallint) to authenticated;
grant execute on function public.activate_service_plan(smallint) to authenticated;
grant execute on function public.complete_live_service_and_advance(smallint) to authenticated;
grant execute on function public.reopen_completed_live_service(smallint) to authenticated;
grant execute on function public.restore_archived_service_plan(smallint) to authenticated;
grant execute on function public.archive_completed_service(smallint) to authenticated;


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

-- Service-scoped team foundation. The legacy current_service_team tables remain
-- available during the phased application transition.
create table if not exists public.service_team_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id smallint not null references public.active_setlist(id) on delete cascade,
  team_member_id uuid null references public.team_members(id) on delete set null,
  person_name text not null check (char_length(trim(person_name)) > 0),
  role_name text not null check (char_length(trim(role_name)) > 0),
  microphone_name text null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_team_assignments_service_id_id_key unique (service_id, id)
);

create index if not exists service_team_assignments_service_sort_created_idx
on public.service_team_assignments(service_id, sort_order, created_at);
create index if not exists service_team_assignments_service_member_idx
on public.service_team_assignments(service_id, team_member_id)
where team_member_id is not null;

create table if not exists public.service_team_assignment_resources (
  id uuid primary key default gen_random_uuid(),
  service_id smallint not null,
  assignment_id uuid not null,
  resource_id uuid not null references public.resources(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint service_team_assignment_resources_assignment_fkey
    foreign key (service_id, assignment_id)
    references public.service_team_assignments(service_id, id) on delete cascade,
  constraint service_team_assignment_resources_assignment_resource_key
    unique (assignment_id, resource_id),
  constraint service_team_assignment_resources_service_resource_key
    unique (service_id, resource_id)
);

create index if not exists service_team_assignment_resources_service_assignment_idx
on public.service_team_assignment_resources(service_id, assignment_id);

alter table public.service_team_assignments enable row level security;
drop policy if exists "Public can read service team assignments" on public.service_team_assignments;
create policy "Public can read service team assignments" on public.service_team_assignments
for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert service team assignments" on public.service_team_assignments;
create policy "Authenticated can insert service team assignments" on public.service_team_assignments
for insert to authenticated with check (true);
drop policy if exists "Authenticated can update service team assignments" on public.service_team_assignments;
create policy "Authenticated can update service team assignments" on public.service_team_assignments
for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated can delete service team assignments" on public.service_team_assignments;
create policy "Authenticated can delete service team assignments" on public.service_team_assignments
for delete to authenticated using (true);
revoke all on public.service_team_assignments from anon, authenticated;
grant select on public.service_team_assignments to anon, authenticated;
grant insert, update, delete on public.service_team_assignments to authenticated;

alter table public.service_team_assignment_resources enable row level security;
drop policy if exists "Public can read service team assignment resources" on public.service_team_assignment_resources;
create policy "Public can read service team assignment resources" on public.service_team_assignment_resources
for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert service team assignment resources" on public.service_team_assignment_resources;
create policy "Authenticated can insert service team assignment resources" on public.service_team_assignment_resources
for insert to authenticated with check (true);
drop policy if exists "Authenticated can update service team assignment resources" on public.service_team_assignment_resources;
create policy "Authenticated can update service team assignment resources" on public.service_team_assignment_resources
for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated can delete service team assignment resources" on public.service_team_assignment_resources;
create policy "Authenticated can delete service team assignment resources" on public.service_team_assignment_resources
for delete to authenticated using (true);
revoke all on public.service_team_assignment_resources from anon, authenticated;
grant select on public.service_team_assignment_resources to anon, authenticated;
grant insert, update, delete on public.service_team_assignment_resources to authenticated;

create or replace function public.set_service_team_assignment_resources(
  p_assignment_id uuid,
  p_resource_ids uuid[]
)
returns void language plpgsql security definer set search_path = public as $$
declare target_service_id smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select assignment.service_id into target_service_id
  from public.service_team_assignments assignment
  where assignment.id = p_assignment_id for update;
  if not found then raise exception 'Service team assignment not found'; end if;

  if cardinality(coalesce(p_resource_ids, '{}'::uuid[])) <> (
    select count(distinct requested.resource_id)
    from unnest(coalesce(p_resource_ids, '{}'::uuid[])) requested(resource_id)
  ) then raise exception 'Duplicate resource IDs are not allowed'; end if;

  if exists (
    select 1 from unnest(coalesce(p_resource_ids, '{}'::uuid[])) requested(resource_id)
    left join public.resources resource on resource.id = requested.resource_id
    where resource.id is null or resource.active is not true
  ) then raise exception 'Every resource must exist and be active'; end if;

  delete from public.service_team_assignment_resources where assignment_id = p_assignment_id;
  insert into public.service_team_assignment_resources(service_id, assignment_id, resource_id)
  select target_service_id, p_assignment_id, requested.resource_id
  from unnest(coalesce(p_resource_ids, '{}'::uuid[])) requested(resource_id);
end; $$;

revoke all on function public.set_service_team_assignment_resources(uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.set_service_team_assignment_resources(uuid, uuid[])
to authenticated;

create or replace function public.create_service_plan(
  p_service_name text,
  p_service_date date,
  p_service_time text
)
returns smallint language plpgsql security definer
set search_path = pg_catalog, public as $$
declare new_service_id smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_name is null or btrim(p_service_name) = '' then raise exception 'Service name is required'; end if;
  if p_service_date is null then raise exception 'Service date is required'; end if;
  if p_service_time is null or p_service_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Service time must use HH:MM in 24-hour format'; end if;

  lock table public.active_setlist in share row exclusive mode;
  perform setval(
    'public.active_setlist_id_seq'::regclass,
    greatest(
      coalesce(service_max.max_id, sequence_state.last_value),
      sequence_state.last_value
    ),
    case when service_max.max_id is null then sequence_state.is_called else true end
  )
  from public.active_setlist_id_seq sequence_state
  cross join (
    select max(service.id)::bigint as max_id
    from public.active_setlist service
  ) service_max;
  insert into public.active_setlist(service_name, service_date, service_time, song_ids, leader_notes, status, updated_at)
  values (btrim(p_service_name), p_service_date, p_service_time, '{}'::uuid[], null, 'planned', now())
  returning id into new_service_id;
  return new_service_id;
end; $$;

create or replace function public.duplicate_service_plan(
  p_source_service_id smallint,
  p_service_name text,
  p_service_date date,
  p_service_time text,
  p_copy_order boolean default true,
  p_copy_team boolean default false
)
returns smallint language plpgsql security definer
set search_path = pg_catalog, public as $$
declare new_service_id smallint; new_assignment_id uuid; new_item_id uuid; source_assignment record; source_item record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_source_service_id is null then raise exception 'Source service is required'; end if;
  if p_service_name is null or btrim(p_service_name) = '' then raise exception 'Service name is required'; end if;
  if p_service_date is null then raise exception 'Service date is required'; end if;
  if p_service_time is null or p_service_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Service time must use HH:MM in 24-hour format'; end if;

  lock table public.active_setlist in share row exclusive mode;
  if not exists (select 1 from public.active_setlist source_service where source_service.id = p_source_service_id) then raise exception 'Source service not found'; end if;
  perform setval(
    'public.active_setlist_id_seq'::regclass,
    greatest(
      coalesce(service_max.max_id, sequence_state.last_value),
      sequence_state.last_value
    ),
    case when service_max.max_id is null then sequence_state.is_called else true end
  )
  from public.active_setlist_id_seq sequence_state
  cross join (
    select max(service.id)::bigint as max_id
    from public.active_setlist service
  ) service_max;
  insert into public.active_setlist(service_name, service_date, service_time, song_ids, leader_notes, status, updated_at)
  values (btrim(p_service_name), p_service_date, p_service_time, '{}'::uuid[], null, 'planned', now())
  returning id into new_service_id;

  if coalesce(p_copy_order, true) then
    for source_item in select * from public.service_items where service_id = p_source_service_id order by position, created_at, id loop
      new_item_id := gen_random_uuid();
      insert into public.service_items(id, service_id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at)
      values (new_item_id, new_service_id, source_item.position, source_item.type, source_item.title, source_item.details, source_item.planned_duration_seconds, source_item.song_ids, source_item.song_id, now());
      insert into public.service_song_settings(service_id, service_item_id, song_id, key_override)
      select new_service_id, new_item_id, setting.song_id, setting.key_override from public.service_song_settings setting
      where setting.service_id = p_source_service_id
        and setting.service_item_id = source_item.id;
      insert into public.service_item_notes(service_id, service_item_id, notes)
      select new_service_id, new_item_id, note.notes from public.service_item_notes note
      where note.service_id = p_source_service_id and note.service_item_id = source_item.id;
    end loop;
  end if;

  if coalesce(p_copy_team, false) then
    for source_assignment in
      select assignment.* from public.service_team_assignments assignment
      where assignment.service_id = p_source_service_id
      order by assignment.sort_order, assignment.created_at, assignment.id
    loop
      insert into public.service_team_assignments(
        id, service_id, team_member_id, person_name, role_name, microphone_name, sort_order, created_at, updated_at
      ) values (
        gen_random_uuid(), new_service_id, source_assignment.team_member_id, source_assignment.person_name,
        source_assignment.role_name, source_assignment.microphone_name, source_assignment.sort_order, now(), now()
      ) returning id into new_assignment_id;

      insert into public.service_team_assignment_resources(id, service_id, assignment_id, resource_id, created_at)
      select gen_random_uuid(), new_service_id, new_assignment_id, source_link.resource_id, now()
      from public.service_team_assignment_resources source_link
      where source_link.service_id = p_source_service_id and source_link.assignment_id = source_assignment.id
      order by source_link.created_at, source_link.id;
    end loop;
  end if;
  return new_service_id;
end; $$;

create or replace function public.delete_planned_service(p_service_id smallint)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare target_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_id is null then raise exception 'Service ID is required'; end if;
  perform pg_advisory_xact_lock(71831, p_service_id::integer);
  select service.status into target_status from public.active_setlist service
  where service.id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status <> 'planned' then raise exception 'Only planned services can be deleted'; end if;
  if exists (select 1 from public.live_service_state live_state where live_state.service_id = p_service_id) then raise exception 'Cannot delete a service with Live history'; end if;
  if exists (select 1 from public.service_item_runs service_run where service_run.service_id = p_service_id) then raise exception 'Cannot delete a service with run history'; end if;
  delete from public.active_setlist service where service.id = p_service_id;
end; $$;

revoke all on function public.create_service_plan(text, date, text) from public, anon, authenticated;
grant execute on function public.create_service_plan(text, date, text) to authenticated;
revoke all on function public.duplicate_service_plan(smallint, text, date, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.duplicate_service_plan(smallint, text, date, text, boolean, boolean) to authenticated;
revoke all on function public.delete_planned_service(smallint) from public, anon, authenticated;
grant execute on function public.delete_planned_service(smallint) to authenticated;

-- Service-occurrence Playback mixer persistence.
+
create table public.service_playback_stem_settings (
  service_id smallint not null,
  service_item_id uuid not null,
  song_id uuid not null references public.songs(id) on delete restrict,
  stem_id uuid not null references public.song_stems(id) on delete cascade,
  volume numeric(5,4) not null,
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_playback_stem_settings_pkey primary key (service_item_id, song_id, stem_id),
  constraint service_playback_stem_settings_item_fkey foreign key (service_id, service_item_id)
    references public.service_items(service_id, id) on delete cascade,
  constraint service_playback_stem_settings_volume_check check (volume >= 0 and volume <= 1)
);

create index service_playback_stem_settings_service_occurrence_idx
on public.service_playback_stem_settings(service_id, service_item_id, song_id);

alter table public.service_playback_stem_settings enable row level security;
create policy "Public can read service playback stem settings"
on public.service_playback_stem_settings for select to public using (true);
revoke all on public.service_playback_stem_settings from public, anon, authenticated;
grant select on public.service_playback_stem_settings to anon, authenticated;

create or replace function public.set_service_playback_stem_setting(
  p_service_id smallint,
  p_service_item_id uuid,
  p_song_id uuid,
  p_stem_id uuid,
  p_volume numeric,
  p_muted boolean
)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare target_status text; target_item public.service_items%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_id is null or p_service_item_id is null or p_song_id is null or p_stem_id is null then
    raise exception 'Service, service item, song, and stem are required';
  end if;
  if p_volume is null or p_volume < 0 or p_volume > 1 then raise exception 'Volume must be between 0 and 1'; end if;
  if p_muted is null then raise exception 'Muted is required'; end if;

  perform pg_advisory_xact_lock(71832, p_service_id::integer);
  select service.status into target_status from public.active_setlist service
  where service.id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status not in ('active', 'planned') then raise exception 'Only active or planned services can be edited'; end if;

  select item.* into target_item from public.service_items item
  where item.service_id = p_service_id and item.id = p_service_item_id for update;
  if not found then raise exception 'Service item not found in service'; end if;
  if not (
    (target_item.type = 'song' and target_item.song_id = p_song_id)
    or (target_item.type = 'worship' and exists (
      select 1 from unnest(coalesce(target_item.song_ids, '{}'::text[])) stored(value)
      where stored.value = p_song_id::text
         or stored.value ~ ('"(songId|song_id|id)"[[:space:]]*:[[:space:]]*"' || p_song_id::text || '"')
    ))
  ) then raise exception 'Song does not belong to this service occurrence'; end if;
  if not exists (
    select 1 from public.song_stems stem
    join public.song_keys song_key on song_key.id = stem.song_key_id
    where stem.id = p_stem_id and song_key.song_id = p_song_id
  ) then raise exception 'Stem does not belong to song'; end if;

  insert into public.service_playback_stem_settings(service_id, service_item_id, song_id, stem_id, volume, muted)
  values (p_service_id, p_service_item_id, p_song_id, p_stem_id, p_volume, p_muted)
  on conflict (service_item_id, song_id, stem_id) do update
  set volume = excluded.volume, muted = excluded.muted, updated_at = now();
end; $$;

revoke all on function public.set_service_playback_stem_setting(smallint, uuid, uuid, uuid, numeric, boolean)
from public, anon, authenticated;
grant execute on function public.set_service_playback_stem_setting(smallint, uuid, uuid, uuid, numeric, boolean)
to authenticated;

create or replace function public.prepare_next_service()
returns smallint language plpgsql security definer set search_path = pg_catalog, public as $$
declare current_service public.active_setlist%rowtype; new_id smallint; new_item_id uuid; next_date date; anchor_date date; source_item record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  lock table public.active_setlist in share row exclusive mode;
  select * into current_service from public.active_setlist where status = 'active' for update;
  if not found then raise exception 'Active service not found'; end if;
  anchor_date := coalesce(current_service.service_date, current_date);
  next_date := anchor_date + case when (6 - extract(dow from anchor_date)::integer + 7) % 7 = 0 then 7 else (6 - extract(dow from anchor_date)::integer + 7) % 7 end;
  select (coalesce(max(id), 0) + 1)::smallint into new_id from public.active_setlist;
  update public.active_setlist set status = 'archived', updated_at = now() where id = current_service.id;
  insert into public.active_setlist(id, service_name, service_date, service_time, song_ids, leader_notes, status, updated_at)
  values (new_id, current_service.service_name, next_date, current_service.service_time, current_service.song_ids, null, 'active', now());
  for source_item in select * from public.service_items where service_id = current_service.id order by position, created_at, id loop
    new_item_id := gen_random_uuid();
    insert into public.service_items(id, service_id, position, type, title, details, planned_duration_seconds, song_ids, song_id)
    values (new_item_id, new_id, source_item.position, source_item.type, source_item.title, source_item.details, source_item.planned_duration_seconds, source_item.song_ids, source_item.song_id);
    insert into public.service_song_settings(service_id, service_item_id, song_id, key_override)
    select new_id, new_item_id, song_id, key_override from public.service_song_settings where service_id = current_service.id and service_item_id = source_item.id;
    insert into public.service_item_notes(service_id, service_item_id, notes)
    select new_id, new_item_id, notes from public.service_item_notes where service_id = current_service.id and service_item_id = source_item.id;
    insert into public.service_playback_stem_settings(service_id, service_item_id, song_id, stem_id, volume, muted)
    select new_id, new_item_id, song_id, stem_id, volume, muted from public.service_playback_stem_settings
    where service_id = current_service.id and service_item_id = source_item.id;
  end loop;
  return new_id;
end; $$;

create or replace function public.duplicate_service_plan(
  p_source_service_id smallint, p_service_name text, p_service_date date, p_service_time text,
  p_copy_order boolean default true, p_copy_team boolean default false
)
returns smallint language plpgsql security definer set search_path = pg_catalog, public as $$
declare new_service_id smallint; new_assignment_id uuid; new_item_id uuid; source_assignment record; source_item record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_source_service_id is null then raise exception 'Source service is required'; end if;
  if p_service_name is null or btrim(p_service_name) = '' then raise exception 'Service name is required'; end if;
  if p_service_date is null then raise exception 'Service date is required'; end if;
  if p_service_time is null or p_service_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Service time must use HH:MM in 24-hour format'; end if;
  lock table public.active_setlist in share row exclusive mode;
  if not exists (select 1 from public.active_setlist where id = p_source_service_id) then raise exception 'Source service not found'; end if;
  perform setval('public.active_setlist_id_seq'::regclass, greatest(coalesce(service_max.max_id, sequence_state.last_value), sequence_state.last_value), case when service_max.max_id is null then sequence_state.is_called else true end)
  from public.active_setlist_id_seq sequence_state cross join (select max(id)::bigint max_id from public.active_setlist) service_max;
  insert into public.active_setlist(service_name, service_date, service_time, song_ids, leader_notes, status, updated_at)
  values (btrim(p_service_name), p_service_date, p_service_time, '{}'::uuid[], null, 'planned', now()) returning id into new_service_id;
  if coalesce(p_copy_order, true) then
    for source_item in select * from public.service_items where service_id = p_source_service_id order by position, created_at, id loop
      new_item_id := gen_random_uuid();
      insert into public.service_items(id, service_id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at)
      values (new_item_id, new_service_id, source_item.position, source_item.type, source_item.title, source_item.details, source_item.planned_duration_seconds, source_item.song_ids, source_item.song_id, now());
      insert into public.service_song_settings(service_id, service_item_id, song_id, key_override)
      select new_service_id, new_item_id, song_id, key_override from public.service_song_settings where service_id = p_source_service_id and service_item_id = source_item.id;
      insert into public.service_item_notes(service_id, service_item_id, notes)
      select new_service_id, new_item_id, notes from public.service_item_notes where service_id = p_source_service_id and service_item_id = source_item.id;
      insert into public.service_playback_stem_settings(service_id, service_item_id, song_id, stem_id, volume, muted)
      select new_service_id, new_item_id, song_id, stem_id, volume, muted from public.service_playback_stem_settings
      where service_id = p_source_service_id and service_item_id = source_item.id;
    end loop;
  end if;
  if coalesce(p_copy_team, false) then
    for source_assignment in select * from public.service_team_assignments where service_id = p_source_service_id order by sort_order, created_at, id loop
      insert into public.service_team_assignments(id, service_id, team_member_id, person_name, role_name, microphone_name, sort_order, created_at, updated_at)
      values (gen_random_uuid(), new_service_id, source_assignment.team_member_id, source_assignment.person_name, source_assignment.role_name, source_assignment.microphone_name, source_assignment.sort_order, now(), now()) returning id into new_assignment_id;
      insert into public.service_team_assignment_resources(id, service_id, assignment_id, resource_id, created_at)
      select gen_random_uuid(), new_service_id, new_assignment_id, resource_id, now() from public.service_team_assignment_resources
      where service_id = p_source_service_id and assignment_id = source_assignment.id order by created_at, id;
    end loop;
  end if;
  return new_service_id;
end; $$;
