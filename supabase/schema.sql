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

create table if not exists public.active_setlist (
  id smallint primary key default 1 check (id = 1),
  service_name text not null default 'Saturday Service',
  service_time text not null default 'Saturday • 7:00 PM',
  song_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.active_setlist (id, service_name, service_time)
values (1, 'Saturday Service', 'Saturday • 7:00 PM')
on conflict (id) do nothing;

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
using (id = 1)
with check (id = 1);

revoke insert, update, delete on public.active_setlist from anon;
grant select on public.active_setlist to anon, authenticated;
grant update (song_ids, updated_at) on public.active_setlist to authenticated;

create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  position integer not null,
  type text not null check (type in ('text', 'worship')),
  title text not null,
  details text null,
  song_ids text[] null,
  created_at timestamptz not null default now()
);

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
