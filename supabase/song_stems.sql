create table if not exists public.song_stems (
  id uuid primary key default gen_random_uuid(),
  song_key_id uuid not null references public.song_keys(id) on delete cascade,
  name text not null,
  storage_path text not null,
  sort_order integer not null default 0,
  mime_type text null,
  file_size_bytes bigint null,
  created_at timestamptz not null default now(),
  unique (song_key_id, name),
  check (sort_order >= 0),
  check (file_size_bytes is null or file_size_bytes > 0)
);

create index if not exists song_stems_song_key_id_idx
on public.song_stems (song_key_id);

alter table public.song_stems enable row level security;

drop policy if exists "Public can read song stems" on public.song_stems;
create policy "Public can read song stems"
on public.song_stems
for select
to public
using (true);

drop policy if exists "Authenticated can insert song stems" on public.song_stems;
create policy "Authenticated can insert song stems"
on public.song_stems
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update song stems" on public.song_stems;
create policy "Authenticated can update song stems"
on public.song_stems
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete song stems" on public.song_stems;
create policy "Authenticated can delete song stems"
on public.song_stems
for delete
to authenticated
using (true);

revoke insert, update, delete on public.song_stems from anon;
grant select on public.song_stems to anon, authenticated;
grant insert, update, delete on public.song_stems to authenticated;
