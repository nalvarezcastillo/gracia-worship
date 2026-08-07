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
  song_ids jsonb null check (song_ids is null or jsonb_typeof(song_ids) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists service_items_service_id_position_idx
on public.service_items(service_id, position);

alter table public.service_items
add column if not exists details text null;

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
  insert into public.service_items (service_id, position, type, title, details, song_ids)
  select new_id, position, type, title, details, song_ids from public.service_items where service_id = current_service.id order by position;
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
